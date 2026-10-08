import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'notificaciones.dart';
import 'preferencias.dart';
import 'ubicacion.dart';

/// Estado de la app: sesión, ubicación (celda), mis zonas y alertas cercanas.
class EstadoApp extends ChangeNotifier with WidgetsBindingObserver {
  EstadoApp({required this.servicio, required this.firebaseListo});

  final ServicioAlertas servicio;

  /// Firebase configurado: hay notificaciones push aunque la app esté cerrada.
  final bool firebaseListo;

  late SharedPreferences prefs;
  String? tokenPush;
  List<Alerta> alertas = const [];
  List<ZonaLocal> zonas = const [];
  bool iniciado = false;
  bool cargando = false;

  /// Ya se intentó leer la ubicación y registrar el teléfono al menos una vez.
  bool ubicacionRevisada = false;
  String? error;
  final _suscripciones = <StreamSubscription<Object?>>[];
  StreamSubscription<({double lat, double lon})>? _seguimiento;
  Timer? _espera;

  Perfil? get perfil => servicio.perfil.value;
  ServicioDemo? get demo => servicio is ServicioDemo ? servicio as ServicioDemo : null;
  bool get bienvenidaVista => prefs.getBool(Claves.bienvenidaVista) ?? false;
  String? get puntoDemo => prefs.getString(Claves.puntoDemo);
  String? get miCelda => prefs.getString(Claves.miCelda);
  bool get herramientasDemo => servicio.esDemo || kDebugMode || Config.herramientasDemo;

  /// Última vez que el servidor registró este teléfono para recibir push (null = nunca).
  DateTime? get registradoEn => DateTime.tryParse(prefs.getString(Claves.registradoEn) ?? '');

  /// ¿Le pueden llegar alertas a este teléfono aunque la app esté cerrada?
  /// (Sin Firebase, como en la web, solo se avisa con la app abierta: no hay nada que revisar.)
  bool get listoParaRecibir =>
      servicio.esDemo || !firebaseListo || (tokenPush != null && miCelda != null && registradoEn != null);

  ({double lat, double lon})? get miPosicion {
    final lat = prefs.getDouble(Claves.miLat);
    final lon = prefs.getDouble(Claves.miLon);
    return lat == null || lon == null ? null : (lat: lat, lon: lon);
  }

  /// Distancia de una alerta a mí o a mi zona más cercana (calculada en el teléfono).
  ({double metros, String? zona})? distanciaA(Alerta a) => distanciaMasCercana(prefs, a.lat, a.lon);

  /// Activas primero, luego por nivel y por distancia.
  List<Alerta> get alertasOrdenadas {
    final lista = [...alertas];
    lista.sort((a, b) {
      if (a.estado.abierta != b.estado.abierta) return a.estado.abierta ? -1 : 1;
      if (a.nivel != b.nivel) return b.nivel.compareTo(a.nivel);
      return (distanciaA(a)?.metros ?? 0).compareTo(distanciaA(b)?.metros ?? 0);
    });
    return lista;
  }

  Future<void> iniciar() async {
    prefs = await SharedPreferences.getInstance();
    zonas = (prefs.getStringList(Claves.zonas) ?? const <String>[]).map(ZonaLocal.desdeJson).toList();
    servicio.perfil.addListener(notifyListeners);
    try {
      await Notificaciones.inicializar();
    } catch (e) {
      debugPrint('Notificaciones locales no disponibles: $e');
    }
    try {
      await servicio.iniciarSesionAnonima();
    } on ErrorServicio catch (e) {
      error = e.mensaje;
    }

    if (demo != null) {
      // En la demo, sin GPS de por medio, el teléfono arranca en el punto A (300 m del suceso)
      if (puntoDemo == null && miPosicion == null) await prefs.setString(Claves.puntoDemo, 'A');
      _suscripciones.add(demo!.avisos.where((a) => a.dispositivo == 'yo').listen((a) => procesarAlerta(a.datos)));
    }
    if (firebaseListo) await _configurarPush();
    _suscripciones
      ..add(servicio.cambiosEnAlertas().listen(_alCambiarAlerta))
      ..add(Notificaciones.recibidaEnPrimerPlano.stream.listen((_) => programarRecarga()));

    iniciado = true;
    notifyListeners();
    if (bienvenidaVista) await actualizarUbicacion(forzar: true);
    _seguirUbicacion();
  }

  Future<void> _configurarPush() async {
    final fm = FirebaseMessaging.instance;
    FirebaseMessaging.onMessage.listen((m) => procesarAlerta(m.data));
    FirebaseMessaging.onMessageOpenedApp.listen((m) {
      final id = m.data['alerta_id'] as String?;
      if (id != null) Notificaciones.alTocar.add(id);
    });
    final inicial = await fm.getInitialMessage();
    Notificaciones.pendiente ??= inicial?.data['alerta_id'] as String?;
    try {
      tokenPush = await fm.getToken();
    } catch (e) {
      debugPrint('Sin token de FCM: $e');
    }
    fm.onTokenRefresh.listen((t) {
      tokenPush = t;
      actualizarUbicacion(forzar: true);
    });
  }

  /// Sin push (web o Firebase sin configurar): con la app abierta se avisa igual que
  /// haría el servidor, usando Realtime y la distancia calculada en el teléfono.
  void _alCambiarAlerta(Alerta a) {
    programarRecarga();
    if (servicio.esDemo || firebaseListo) return;
    final notificadas = (prefs.getStringList(Claves.notificadas) ?? const <String>[]).toSet();
    if (a.estado.activa && a.radioActualM > 0 && !notificadas.contains(a.id)) {
      final cercana = distanciaA(a);
      if (cercana != null && cercana.metros <= a.radioActualM + 700) {
        notificadas.add(a.id);
        procesarAlerta(datosPush(a, 'nueva', radioM: a.radioActualM));
      }
    } else if ((a.estado == EstadoAlerta.resuelta || a.estado == EstadoAlerta.descartada) && notificadas.remove(a.id)) {
      procesarAlerta(datosPush(a, 'cierre'));
    }
    prefs.setStringList(Claves.notificadas, notificadas.take(200).toList());
  }

  void _seguirUbicacion() {
    if (servicio.esDemo && puntoDemo != null) return;
    _seguimiento?.cancel();
    try {
      _seguimiento = Ubicacion.seguir().listen((_) => actualizarUbicacion(), onError: (_) {});
    } catch (_) {
      // sin permiso todavía
    }
  }

  void programarRecarga() {
    _espera?.cancel();
    _espera = Timer(const Duration(milliseconds: 500), cargarAlertas);
  }

  Future<void> actualizarUbicacion({bool forzar = false}) async {
    try {
      await Ubicacion.actualizarMiCelda(servicio: servicio, token: tokenPush, forzar: forzar);
    } on ErrorServicio catch (e) {
      error = e.mensaje;
    } catch (e) {
      debugPrint('No se pudo actualizar la celda: $e');
    }
    ubicacionRevisada = true;
    await cargarAlertas();
  }

  Future<void> cargarAlertas() async {
    final celda = miCelda ?? geohash(Config.latInicial, Config.lonInicial);
    cargando = true;
    notifyListeners();
    try {
      alertas = await servicio.alertasCercanas(celda);
      error = null;
    } on ErrorServicio catch (e) {
      error = e.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Future<void> terminarBienvenida() async {
    await prefs.setBool(Claves.bienvenidaVista, true);
    notifyListeners();
    await actualizarUbicacion(forzar: true);
    _seguirUbicacion();
  }

  /// Modo demo: "estoy en el punto A/B/C/D" (null = usar el GPS real).
  Future<void> usarPuntoDemo(String? clave) async {
    if (clave == null) {
      await prefs.remove(Claves.puntoDemo);
    } else {
      await prefs.setString(Claves.puntoDemo, clave);
    }
    await actualizarUbicacion(forzar: true);
    _seguirUbicacion();
  }

  // ─── Mis zonas (máximo 3) ──────────────────────────────────────────────────
  Future<void> agregarZona(String nombre, double lat, double lon) async {
    // Al servidor solo viaja la celda; el punto exacto se queda en el teléfono
    final z = await servicio.guardarZona(nombre, geohash(lat, lon));
    zonas = [...zonas, ZonaLocal(id: z.id, nombre: nombre, lat: lat, lon: lon)];
    await _guardarZonas();
  }

  Future<void> borrarZona(ZonaLocal z) async {
    await servicio.borrarZona(z.id);
    zonas = zonas.where((x) => x.id != z.id).toList();
    await _guardarZonas();
  }

  Future<void> _guardarZonas() async {
    await prefs.setStringList(Claves.zonas, zonas.map((z) => z.aJson()).toList());
    notifyListeners();
    programarRecarga();
  }

  // ─── Cuenta ────────────────────────────────────────────────────────────────
  Future<void> iniciarSesionValidador(String correo, String contrasena) async {
    await servicio.iniciarSesionCorreo(correo, contrasena);
    await actualizarUbicacion(forzar: true);
  }

  Future<void> cerrarSesion() async {
    await servicio.cerrarSesion();
    await servicio.iniciarSesionAnonima();
    await actualizarUbicacion(forzar: true);
  }

  /// Derecho de cancelación: borra la cuenta en el servidor y todo lo guardado aquí.
  Future<void> borrarCuenta() async {
    await servicio.borrarMiCuenta();
    await prefs.clear();
    zonas = const [];
    alertas = const [];
    await servicio.iniciarSesionAnonima();
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && iniciado && bienvenidaVista) actualizarUbicacion();
  }

  @override
  void dispose() {
    for (final s in _suscripciones) {
      s.cancel();
    }
    _seguimiento?.cancel();
    _espera?.cancel();
    servicio.perfil.removeListener(notifyListeners);
    super.dispose();
  }
}

/// Acceso al estado desde cualquier pantalla.
class AlcanceApp extends InheritedNotifier<EstadoApp> {
  const AlcanceApp({super.key, required EstadoApp estado, required super.child}) : super(notifier: estado);

  static EstadoApp of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AlcanceApp>()!.notifier!;

  static EstadoApp leer(BuildContext context) => context.getInheritedWidgetOfExactType<AlcanceApp>()!.notifier!;
}
