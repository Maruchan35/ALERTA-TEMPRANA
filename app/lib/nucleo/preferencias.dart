import 'dart:convert';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lo que se guarda SOLO en el teléfono. La ubicación exacta y el punto exacto de cada
/// zona nunca salen de aquí: al servidor solo viajan celdas de ~1 km.
abstract final class Claves {
  static const bienvenidaVista = 'bienvenida_vista';
  static const miLat = 'mi_lat';
  static const miLon = 'mi_lon';
  static const miCelda = 'mi_celda';
  static const puntoDemo = 'demo_punto';
  static const zonas = 'zonas_locales';
  static const notificadas = 'alertas_notificadas';
  static const segundoPlano = 'segundo_plano';

  /// Última vez que el servidor registró este teléfono (con su token de push).
  static const registradoEn = 'registrado_en';

  /// Celda con la que quedó registrado (la real, o la de respaldo si no hay ubicación).
  static const celdaRegistrada = 'celda_registrada';

  /// El último registro se hizo sin ubicación (permiso negado o GPS apagado).
  static const sinUbicacion = 'sin_ubicacion';
}

/// Una zona guardada: el servidor conoce su celda; el teléfono, su punto exacto.
class ZonaLocal {
  const ZonaLocal({required this.id, required this.nombre, required this.lat, required this.lon});

  factory ZonaLocal.desdeJson(String s) {
    final m = jsonDecode(s) as Map<String, dynamic>;
    return ZonaLocal(
      id: m['id'] as String,
      nombre: m['nombre'] as String,
      lat: (m['lat'] as num).toDouble(),
      lon: (m['lon'] as num).toDouble(),
    );
  }

  final String id;
  final String nombre;
  final double lat;
  final double lon;

  String get celda => geohash(lat, lon);

  String aJson() => jsonEncode({'id': id, 'nombre': nombre, 'lat': lat, 'lon': lon});
}

/// Puntos desde los que se mide la distancia a una alerta: mi ubicación y mis zonas.
/// Funciona también en el proceso de segundo plano (no depende de la interfaz).
List<({double lat, double lon, String? zona})> puntosLocales(SharedPreferences prefs) {
  final lat = prefs.getDouble(Claves.miLat);
  final lon = prefs.getDouble(Claves.miLon);
  return [
    if (lat != null && lon != null) (lat: lat, lon: lon, zona: null),
    for (final z in (prefs.getStringList(Claves.zonas) ?? const <String>[]).map(ZonaLocal.desdeJson))
      (lat: z.lat, lon: z.lon, zona: z.nombre),
  ];
}

/// Distancia de la alerta al punto propio más cercano (mi ubicación o una zona).
({double metros, String? zona})? distanciaMasCercana(SharedPreferences prefs, double lat, double lon) {
  ({double metros, String? zona})? mejor;
  for (final p in puntosLocales(prefs)) {
    final m = distanciaMetros(p.lat, p.lon, lat, lon);
    if (mejor == null || m < mejor.metros) mejor = (metros: m, zona: p.zona);
  }
  return mejor;
}
