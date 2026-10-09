import 'dart:async';
import 'dart:convert';
import 'dart:io' show File;
import 'dart:math' as math;

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:camera/camera.dart' show XFile;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'preferencias.dart';
import 'proteccion.dart';
import 'ubicacion.dart';

/// Etapas del SOS en el teléfono de quien pide ayuda.
enum EtapaSos {
  inactiva,

  /// Unos segundos para cancelar (vibra cada segundo).
  cuentaRegresiva,

  /// Pidiendo ayuda al servidor (si no hay conexión, se reintenta solo).
  enviando,

  /// Abierta: la ubicación se comparte en vivo y el video se sube por fragmentos.
  activa,

  /// Se cerró (la persona o un validador): se muestra cómo terminó.
  terminada,
}

/// Un fragmento de video que falta subir. Se guarda en el teléfono por si la app se cierra.
class _Fragmento {
  const _Fragmento({required this.emergencia, required this.ruta, required this.nombre, required this.duracion});

  factory _Fragmento.desdeJson(String s) {
    final m = jsonDecode(s) as Map<String, dynamic>;
    return _Fragmento(
      emergencia: m['emergencia'] as String,
      ruta: m['ruta'] as String,
      nombre: m['nombre'] as String,
      duracion: (m['duracion'] as num).toInt(),
    );
  }

  final String emergencia;
  final String ruta;
  final String nombre;
  final int duracion;

  String aJson() => jsonEncode({'emergencia': emergencia, 'ruta': ruta, 'nombre': nombre, 'duracion': duracion});
}

/// MODO EMERGENCIA (SOS) de quien está en peligro: cuenta regresiva, aviso a los validadores,
/// ubicación en vivo (también con la pantalla apagada), evidencia en video y cierre.
/// Los disparos: botón SOS, sacudida fuerte (app abierta o modo protección) y atajo del ícono.
class ControlEmergencia extends ChangeNotifier {
  ControlEmergencia({required this.servicio, required this.prefs, this.segundosCuenta = 5});

  final ServicioAlertas servicio;
  final SharedPreferences prefs;
  final int segundosCuenta;

  EtapaSos etapa = EtapaSos.inactiva;
  OrigenEmergencia origen = OrigenEmergencia.boton;

  /// Simulacro: se ve y se siente igual, pero no se avisa a nadie ni se graba.
  bool simulacro = false;
  int restantes = 0;
  EstadoMiEmergencia? estado;

  /// Cómo terminó la última (para la pantalla final).
  EstadoMiEmergencia? cerrada;
  String? error;
  DateTime? ultimaSenal;
  double? precisionM;

  /// Fragmentos de video que ya llegaron al servidor.
  int enviados = 0;

  Timer? _cuenta;
  Timer? _reintento;
  Timer? _latido;
  Timer? _reintentoCola;
  StreamSubscription<Position>? _gps;
  ({double lat, double lon, double? precision, double? velocidad})? _posicion;
  DateTime? _ultimoEnvio;
  var _enviandoSenal = false;
  var _subiendo = false;

  /// "Estoy a salvo" tocado mientras la alerta todavía iba en camino al servidor.
  CierreEmergencia? _cierreSinEnviar;
  final _cola = <_Fragmento>[];
  int? _bateria;
  DateTime? _bateriaLeida;
  late final _escucha = EscuchaSacudidas(() => iniciarCuenta(OrigenEmergencia.movimiento));
  var _enPrimerPlano = true;

  bool get abierta => etapa == EtapaSos.enviando || etapa == EtapaSos.activa;
  bool get visible => etapa != EtapaSos.inactiva;
  String? get id => estado?.id;
  int get pendientes => _cola.length;

  // ─── Configuración ─────────────────────────────────────────────────────────
  /// Sacudida fuerte con la app abierta.
  bool get sacudidaActivada => prefs.getBool(Claves.sosSacudida) ?? false;

  Future<void> configurarSacudida(bool si) async {
    await prefs.setBool(Claves.sosSacudida, si);
    _actualizarEscucha();
    notifyListeners();
  }

  /// Modo protección (Android): sacudida con la app cerrada, con notificación fija.
  Future<bool> proteccionActiva() => Proteccion.proteccionActiva();

  Future<void> configurarProteccion(bool si) async {
    if (si) {
      await Proteccion.activarProteccion();
    } else {
      await Proteccion.desactivarProteccion();
    }
    _actualizarEscucha();
    notifyListeners();
  }

  /// Con la app abierta se escucha la sacudida aquí, salvo que el modo protección ya la escuche.
  Future<void> _actualizarEscucha() async {
    final nativo = await Proteccion.proteccionActiva();
    if (sacudidaActivada && _enPrimerPlano && !nativo) {
      _escucha.iniciar();
    } else {
      _escucha.detener();
    }
  }

  void alCambiarCicloDeVida(AppLifecycleState s) {
    _enPrimerPlano = s == AppLifecycleState.resumed;
    _actualizarEscucha();
    if (_enPrimerPlano) _procesarCola();
  }

  // ─── Cuenta regresiva ──────────────────────────────────────────────────────
  void iniciarCuenta(OrigenEmergencia o, {bool simulacro = false}) {
    if (etapa == EtapaSos.cuentaRegresiva || abierta) return; // ya hay una cuenta o una emergencia
    _cuenta?.cancel();
    origen = o;
    this.simulacro = simulacro;
    restantes = segundosCuenta;
    error = null;
    cerrada = null;
    _cierreSinEnviar = null;
    etapa = EtapaSos.cuentaRegresiva;
    Proteccion.vibrar(450);
    _cuenta = Timer.periodic(const Duration(seconds: 1), (_) {
      restantes--;
      if (restantes <= 0) {
        _cuenta?.cancel();
        activar();
      } else {
        Proteccion.vibrar(250);
        notifyListeners();
      }
    });
    notifyListeners();
  }

  void cancelarCuenta() {
    if (etapa != EtapaSos.cuentaRegresiva) return;
    _cuenta?.cancel();
    etapa = EtapaSos.inactiva;
    simulacro = false;
    Proteccion.sobrePantallaBloqueada(false);
    notifyListeners();
  }

  // ─── Pedir ayuda ───────────────────────────────────────────────────────────
  Future<void> activar() async {
    _cuenta?.cancel();
    if (abierta) return;
    Proteccion.vibrar(800);
    if (simulacro) {
      estado = const EstadoMiEmergencia(id: 'simulacro');
      etapa = EtapaSos.activa;
      notifyListeners();
      return;
    }
    etapa = EtapaSos.enviando;
    notifyListeners();
    await _intentarIniciar();
  }

  Future<void> _intentarIniciar() async {
    if (etapa != EtapaSos.enviando) return;
    final p = await _posicionRapida();
    try {
      // Sin sesión (p. ej. la app arrancó sin internet): se crea una anónima; pedir ayuda no exige cuenta
      if (servicio.perfil.value == null) await servicio.iniciarSesionAnonima();
      final r = await servicio.iniciarEmergencia(
        lat: p.lat,
        lon: p.lon,
        precisionM: p.precision,
        origen: origen,
        bateria: await _nivelBateria(),
      );
      if (etapa != EtapaSos.enviando) {
        // La persona lo terminó mientras se enviaba: que no quede abierta en el servidor
        final cierre = _cierreSinEnviar ?? CierreEmergencia.falsaAlarma;
        try {
          await servicio.terminarEmergencia(r.id, cierre);
        } on ErrorServicio {
          // Sin conexión justo ahora: se cierra al volver a abrir la app (reanudar)
          await prefs.setString(Claves.sosCierrePendiente, '${r.id}|${cierre.clave}');
        }
        return;
      }
      estado = r;
      precisionM = p.precision;
      ultimaSenal = DateTime.now();
      error = null;
      etapa = EtapaSos.activa;
      await prefs.setString(Claves.sosId, r.id);
      _seguir();
      _procesarCola();
    } on ErrorServicio catch (e) {
      error = e.mensaje;
      // Sin conexión: se reintenta solo. Mientras tanto, la persona puede llamar al 911.
      if (e.sinConexion) {
        _reintento?.cancel();
        _reintento = Timer(const Duration(seconds: 5), _intentarIniciar);
      }
    }
    notifyListeners();
  }

  /// Ubicación para pedir ayuda YA: la última conocida si es reciente; si no, una nueva (máx. 4 s).
  /// Después, el GPS en vivo la va afinando.
  Future<({double lat, double lon, double? precision})> _posicionRapida() async {
    final demo = puntosDemo.where((x) => x.clave == prefs.getString(Claves.puntoDemo)).firstOrNull;
    if (demo != null) return (lat: demo.lat, lon: demo.lon, precision: 10.0);
    try {
      // Sin abrir el diálogo de permiso: la alerta sale YA; el permiso se pide después (en _seguir)
      final permiso = await Geolocator.checkPermission().timeout(const Duration(seconds: 2));
      if (permiso == LocationPermission.whileInUse || permiso == LocationPermission.always) {
        final ultima = kIsWeb ? null : await Geolocator.getLastKnownPosition();
        if (ultima != null && DateTime.now().difference(ultima.timestamp) < const Duration(minutes: 2)) {
          _posicion = (lat: ultima.latitude, lon: ultima.longitude, precision: ultima.accuracy, velocidad: null);
          return (lat: ultima.latitude, lon: ultima.longitude, precision: ultima.accuracy);
        }
        final p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 4)),
        );
        _posicion = (lat: p.latitude, lon: p.longitude, precision: p.accuracy, velocidad: _velocidad(p));
        return (lat: p.latitude, lon: p.longitude, precision: p.accuracy);
      }
    } catch (_) {
      // sin GPS a tiempo: se usa lo último que se sabe
    }
    final lat = prefs.getDouble(Claves.miLat);
    final lon = prefs.getDouble(Claves.miLon);
    if (lat != null && lon != null) return (lat: lat, lon: lon, precision: 1000.0);
    // Ninguna ubicación: el centro de la ciudad con un margen enorme (el validador ve "± 20 km")
    return (lat: Config.latInicial, lon: Config.lonInicial, precision: 20000.0);
  }

  static double? _velocidad(Position p) => p.speed >= 0 && p.speed.isFinite ? p.speed : null;

  Future<void> _seguir() async {
    await _gps?.cancel();
    _gps = null;
    _latido?.cancel();
    // Aunque no haya GPS o la persona no se mueva: cada 10 s "sigo aquí" + batería
    _latido = Timer.periodic(const Duration(seconds: 10), (_) => _enviarSenal(latido: true));
    if (puntosDemo.any((x) => x.clave == prefs.getString(Claves.puntoDemo))) return;
    try {
      // Si nunca dio permiso, se pide ahora: la alerta ya salió con la última ubicación conocida
      if (!await Ubicacion.pedirPermiso() || etapa != EtapaSos.activa) return;
      _gps = Geolocator.getPositionStream(locationSettings: _ajustesGps()).listen((p) {
        _posicion = (lat: p.latitude, lon: p.longitude, precision: p.accuracy, velocidad: _velocidad(p));
        _enviarSenal();
      }, onError: (Object e) => debugPrint('GPS del SOS: $e'));
    } catch (e) {
      debugPrint('GPS del SOS: $e');
    }
  }

  LocationSettings _ajustesGps() {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        intervalDuration: const Duration(seconds: 5),
        // Servicio en primer plano: sigue mandando la ubicación con la pantalla apagada
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'SOS activo · ALERTA CERCA',
          notificationText: 'Compartiendo tu ubicación en vivo con Protección Civil. Toca para abrir.',
          notificationChannelName: 'SOS activo',
          notificationIcon: AndroidResource(name: 'ic_notificacion'),
          enableWakeLock: true,
          setOngoing: true,
          color: Colores.rojo,
        ),
      );
    }
    return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5);
  }

  Future<void> _enviarSenal({bool latido = false}) async {
    final id = this.id;
    if (id == null || simulacro || etapa != EtapaSos.activa || _enviandoSenal) return;
    final ahora = DateTime.now();
    // Máximo una señal cada 5 s; el latido no hace falta si el GPS acaba de mandar
    final minimo = Duration(seconds: latido ? 8 : 5);
    if (_ultimoEnvio != null && ahora.difference(_ultimoEnvio!) < minimo) return;
    _enviandoSenal = true;
    _ultimoEnvio = ahora;
    final demo = puntosDemo.where((x) => x.clave == prefs.getString(Claves.puntoDemo)).firstOrNull;
    final p = demo != null ? (lat: demo.lat, lon: demo.lon, precision: 10.0, velocidad: null) : _posicion;
    try {
      final r = await servicio.senalEmergencia(
        id,
        lat: p?.lat,
        lon: p?.lon,
        precisionM: p?.precision,
        velocidadMs: p?.velocidad,
        bateria: await _nivelBateria(),
      );
      ultimaSenal = DateTime.now();
      if (p?.precision != null) precisionM = p!.precision;
      error = null;
      if (etapa != EtapaSos.activa) return;
      estado = r;
      // Un validador la cerró (p. ej. ya la localizaron)
      if (!r.estado.abierta) await _terminarLocal(r);
    } on ErrorServicio catch (e) {
      error = e.mensaje;
    } finally {
      _enviandoSenal = false;
      notifyListeners();
    }
  }

  Future<int?> _nivelBateria() async {
    if (_bateriaLeida != null && DateTime.now().difference(_bateriaLeida!) < const Duration(minutes: 1)) {
      return _bateria;
    }
    try {
      // Nunca se espera a la batería para pedir ayuda
      _bateria = await Battery().batteryLevel.timeout(const Duration(milliseconds: 800));
    } catch (_) {
      _bateria = null;
    }
    _bateriaLeida = DateTime.now();
    return _bateria;
  }

  /// "Me asaltan", "Me llevan", "Me siguen": un toque, y los validadores lo saben.
  Future<void> indicarTipo(TipoEmergencia tipo) async {
    final id = this.id;
    if (id == null) return;
    final antes = estado!;
    estado = EstadoMiEmergencia(
      id: id,
      estado: antes.estado,
      tipo: tipo,
      atendidaPor: antes.atendidaPor,
      policiaAvisada: antes.policiaAvisada,
    );
    notifyListeners();
    if (simulacro) return;
    try {
      estado = await servicio.tipoEmergencia(id, tipo);
    } on ErrorServicio catch (e) {
      error = e.mensaje;
    }
    notifyListeners();
  }

  /// Texto para mandar por WhatsApp o SMS a alguien de confianza.
  String textoParaCompartir() {
    final demo = puntosDemo.where((x) => x.clave == prefs.getString(Claves.puntoDemo)).firstOrNull;
    final lat = demo?.lat ?? _posicion?.lat ?? prefs.getDouble(Claves.miLat) ?? Config.latInicial;
    final lon = demo?.lon ?? _posicion?.lon ?? prefs.getDouble(Claves.miLon) ?? Config.lonInicial;
    return 'Necesito ayuda. Mi ubicación ahora: ${enlaceMapa(lat, lon)} '
        '(ALERTA CERCA · SOS). Si no te contesto, llama al 911.';
  }

  // ─── Terminar ──────────────────────────────────────────────────────────────
  /// "Estoy a salvo" o "Fue sin querer".
  Future<void> terminar(CierreEmergencia cierre) async {
    _cuenta?.cancel();
    _reintento?.cancel();
    final id = this.id;
    if (simulacro || id == null) {
      // Simulacro, o todavía no llega al servidor (si llega después, se cierra con este motivo)
      if (etapa == EtapaSos.enviando) _cierreSinEnviar = cierre;
      await _terminarLocal(null);
      return;
    }
    try {
      await _terminarLocal(await servicio.terminarEmergencia(id, cierre));
    } on ErrorServicio catch (e) {
      // Sin conexión: se deja de compartir la ubicación y el cierre se manda al volver la conexión
      error = e.mensaje;
      await prefs.setString(Claves.sosCierrePendiente, '$id|${cierre.clave}');
      await _terminarLocal(EstadoMiEmergencia(id: id, estado: EstadoEmergencia.cerrada, cierre: cierre));
    }
  }

  Future<void> _terminarLocal(EstadoMiEmergencia? r) async {
    await _gps?.cancel();
    _gps = null;
    _latido?.cancel();
    _reintento?.cancel();
    cerrada = r;
    estado = null;
    etapa = simulacro || r == null ? EtapaSos.inactiva : EtapaSos.terminada;
    simulacro = false;
    await prefs.remove(Claves.sosId);
    if (etapa == EtapaSos.inactiva) await Proteccion.sobrePantallaBloqueada(false);
    notifyListeners();
    _procesarCola(); // los últimos fragmentos tienen 15 min para terminar de subir
  }

  /// Cierra la pantalla final ("Tu emergencia se cerró…").
  void descartarResumen() {
    if (etapa != EtapaSos.terminada) return;
    etapa = EtapaSos.inactiva;
    Proteccion.sobrePantallaBloqueada(false);
    notifyListeners();
  }

  /// Al abrir la app: manda un cierre que no alcanzó a llegar, retoma una emergencia abierta (la app
  /// se cerró o el teléfono se reinició) y sube la evidencia pendiente.
  Future<void> reanudar() async {
    _cargarCola();
    final pendiente = prefs.getString(Claves.sosCierrePendiente);
    if (pendiente != null) {
      final partes = pendiente.split('|');
      try {
        await servicio.terminarEmergencia(partes.first, CierreEmergencia.desde(partes.last) ?? CierreEmergencia.aSalvo);
        await prefs.remove(Claves.sosCierrePendiente);
      } on ErrorServicio catch (e) {
        if (!e.sinConexion) await prefs.remove(Claves.sosCierrePendiente);
      }
    }
    if (!abierta) {
      final guardada = prefs.getString(Claves.sosId);
      EstadoMiEmergencia? encontrada;
      if (guardada != null) {
        try {
          encontrada = await servicio.senalEmergencia(guardada);
        } on ErrorServicio catch (e) {
          // Sin conexión: se retoma igual (las señales se reintentan); si el servidor no la conoce, se olvida
          encontrada = e.sinConexion ? EstadoMiEmergencia(id: guardada) : null;
        }
      } else {
        encontrada = await servicio.miEmergenciaAbierta();
      }
      if (encontrada != null && encontrada.estado.abierta && !abierta) {
        _cuenta?.cancel();
        estado = encontrada;
        etapa = EtapaSos.activa;
        await prefs.setString(Claves.sosId, encontrada.id);
        _seguir();
        notifyListeners();
      } else if (encontrada == null || !encontrada.estado.abierta) {
        await prefs.remove(Claves.sosId);
      }
    }
    await _actualizarEscucha();
    _procesarCola();
  }

  // ─── Evidencia ─────────────────────────────────────────────────────────────
  /// Un fragmento de video terminado: se sube en cuanto se pueda (y se reintenta si no hay señal).
  Future<void> agregarFragmento(String ruta, Duration duracion) async {
    final id = this.id ?? cerrada?.id;
    if (id == null || simulacro || id == 'simulacro') {
      _borrar(ruta);
      return;
    }
    _cola.add(
      _Fragmento(
        emergencia: id,
        ruta: ruta,
        nombre: '${DateTime.now().millisecondsSinceEpoch}.mp4',
        duracion: math.max(1, duracion.inSeconds),
      ),
    );
    await _guardarCola();
    notifyListeners();
    _procesarCola();
  }

  Future<void> _procesarCola() async {
    if (_subiendo || _cola.isEmpty) return;
    _subiendo = true;
    try {
      while (_cola.isNotEmpty) {
        final f = _cola.first;
        Uint8List bytes;
        try {
          bytes = await XFile(f.ruta).readAsBytes();
        } catch (_) {
          _cola.removeAt(0); // el sistema limpió el archivo: no hay nada que subir
          continue;
        }
        try {
          await servicio.subirEvidencia(f.emergencia, f.nombre, bytes, duracionS: f.duracion);
          enviados++;
          _cola.removeAt(0);
          _borrar(f.ruta);
        } on ErrorServicio catch (e) {
          if (e.sinConexion) {
            // Sin señal: se reintenta en 20 s (el video sigue guardado en el teléfono)
            _reintentoCola?.cancel();
            _reintentoCola = Timer(const Duration(seconds: 20), _procesarCola);
            break;
          }
          debugPrint('Evidencia rechazada (${e.mensaje}): se queda solo en el teléfono');
          _cola.removeAt(0);
        }
        await _guardarCola();
        notifyListeners();
      }
    } finally {
      _subiendo = false;
      await _guardarCola();
    }
  }

  void _cargarCola() {
    if (_cola.isNotEmpty) return;
    for (final s in prefs.getStringList(Claves.sosCola) ?? const <String>[]) {
      try {
        _cola.add(_Fragmento.desdeJson(s));
      } catch (_) {}
    }
  }

  Future<void> _guardarCola() => prefs.setStringList(Claves.sosCola, _cola.map((f) => f.aJson()).toList());

  void _borrar(String ruta) {
    if (kIsWeb) return;
    File(ruta).delete().then((_) {}, onError: (Object _) {});
  }

  @override
  void dispose() {
    _cuenta?.cancel();
    _reintento?.cancel();
    _latido?.cancel();
    _reintentoCola?.cancel();
    _gps?.cancel();
    _escucha.detener();
    super.dispose();
  }
}

/// Acceso al SOS desde cualquier pantalla.
class AlcanceSos extends InheritedNotifier<ControlEmergencia> {
  const AlcanceSos({super.key, required ControlEmergencia control, required super.child}) : super(notifier: control);

  static ControlEmergencia of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AlcanceSos>()!.notifier!;

  static ControlEmergencia leer(BuildContext context) => context.getInheritedWidgetOfExactType<AlcanceSos>()!.notifier!;
}
