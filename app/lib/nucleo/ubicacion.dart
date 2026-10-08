import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'preferencias.dart';

enum PermisoUbicacion { concedido, siempre, denegado, denegadoParaSiempre, servicioApagado }

/// Ubicación del teléfono. La posición exacta se guarda SOLO en el teléfono (para calcular
/// la distancia exacta); al servidor solo se envía la celda de ~1 km y solo cuando cambia.
abstract final class Ubicacion {
  static Future<PermisoUbicacion> estado() async {
    if (!kIsWeb && !await Geolocator.isLocationServiceEnabled()) return PermisoUbicacion.servicioApagado;
    return switch (await Geolocator.checkPermission()) {
      LocationPermission.always => PermisoUbicacion.siempre,
      LocationPermission.whileInUse => PermisoUbicacion.concedido,
      LocationPermission.deniedForever => PermisoUbicacion.denegadoParaSiempre,
      _ => PermisoUbicacion.denegado,
    };
  }

  /// Pide permiso "mientras se usa la app". Devuelve true si se concedió.
  static Future<bool> pedirPermiso() async {
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    return p == LocationPermission.whileInUse || p == LocationPermission.always;
  }

  /// "Todo el tiempo" (opcional): solo para la actualización en segundo plano.
  static Future<bool> pedirPermisoSiempre() async {
    final p = await Geolocator.requestPermission();
    return p == LocationPermission.always;
  }

  static Future<void> abrirAjustes() => Geolocator.openAppSettings();

  /// Posición actual: la simulada (modo demo) o la real con precisión media
  /// (wifi y antenas: suficiente para celdas de 1 km y gasta mucha menos batería).
  static Future<({double lat, double lon})?> posicionActual(SharedPreferences prefs) async {
    final demo = prefs.getString(Claves.puntoDemo);
    if (demo != null) {
      final p = puntosDemo.where((x) => x.clave == demo).firstOrNull;
      if (p != null) return (lat: p.lat, lon: p.lon);
    }
    try {
      final permiso = await estado();
      if (permiso != PermisoUbicacion.concedido && permiso != PermisoUbicacion.siempre) return _ultima(prefs);
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 15)),
      );
      return (lat: pos.latitude, lon: pos.longitude);
    } catch (_) {
      if (!kIsWeb) {
        final ultima = await Geolocator.getLastKnownPosition();
        if (ultima != null) return (lat: ultima.latitude, lon: ultima.longitude);
      }
      return _ultima(prefs);
    }
  }

  static ({double lat, double lon})? _ultima(SharedPreferences prefs) {
    final lat = prefs.getDouble(Claves.miLat);
    final lon = prefs.getDouble(Claves.miLon);
    return lat == null || lon == null ? null : (lat: lat, lon: lon);
  }

  /// Sin ubicación (permiso negado o GPS apagado) el teléfono igual se registra, con la celda de
  /// su primera zona o la del centro de la ciudad: así de todos modos le llegan las alertas de ahí
  /// y las de mayor radio (verificadas). En cuanto haya ubicación, se cambia por la real.
  static String celdaSinUbicacion(SharedPreferences prefs) {
    final zonas = prefs.getStringList(Claves.zonas) ?? const <String>[];
    if (zonas.isNotEmpty) return ZonaLocal.desdeJson(zonas.first).celda;
    return geohash(Config.latInicial, Config.lonInicial, 6);
  }

  /// Lee la posición, la guarda SOLO en el teléfono y registra la celda en el servidor si cambió
  /// (o si se fuerza, por ejemplo al abrir la app o cuando cambia el token de push).
  static Future<String?> actualizarMiCelda({
    required ServicioAlertas servicio,
    required String? token,
    bool forzar = false,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final pos = await posicionActual(prefs);
    final String celda;
    if (pos != null) {
      await prefs.setDouble(Claves.miLat, pos.lat);
      await prefs.setDouble(Claves.miLon, pos.lon);
      celda = geohash(pos.lat, pos.lon, 6);
      await prefs.setString(Claves.miCelda, celda);
    } else {
      celda = celdaSinUbicacion(prefs);
    }
    await prefs.setBool(Claves.sinUbicacion, pos == null);
    // La celda registrada no cambió: no se envía nada
    if (!forzar && prefs.getString(Claves.celdaRegistrada) == celda) return celda;
    // Sin token de push no hay a dónde mandar alertas: la app las consulta abierta (Realtime)
    if (token != null || servicio.esDemo) {
      await servicio.registrarDispositivo(
        token: token ?? 'demo',
        plataforma: kIsWeb ? 'web' : (defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android'),
        celda: celda,
      );
      if (token != null) {
        await prefs.setString(Claves.celdaRegistrada, celda);
        await prefs.setString(Claves.registradoEn, DateTime.now().toIso8601String());
      }
    }
    return celda;
  }

  /// Con la app abierta: avisa cuando la persona se mueve ~300 m.
  static Stream<({double lat, double lon})> seguir() => Geolocator.getPositionStream(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, distanceFilter: 300),
  ).map((p) => (lat: p.latitude, lon: p.longitude));
}
