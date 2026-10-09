import 'dart:async';
import 'dart:convert';
import 'dart:io' show Directory, File;
import 'dart:math' as math;

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:camera/camera.dart' show XFile;
import 'package:flutter/foundation.dart';
import 'package:record/record.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'bitacora_sos.dart';
import 'copia_evidencia.dart';
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

/// Un fragmento de evidencia (video o audio) que falta subir. Se guarda en el teléfono por si la
/// app se cierra.
class _Fragmento {
  const _Fragmento({
    required this.emergencia,
    required this.ruta,
    required this.nombre,
    required this.duracion,
    this.tipo = 'video',
    this.contentType = 'video/mp4',
    this.sha256,
  });

  factory _Fragmento.desdeJson(String s) {
    final m = jsonDecode(s) as Map<String, dynamic>;
    return _Fragmento(
      emergencia: m['emergencia'] as String,
      ruta: m['ruta'] as String,
      nombre: m['nombre'] as String,
      duracion: (m['duracion'] as num).toInt(),
      tipo: m['tipo'] as String? ?? 'video',
      contentType: m['contentType'] as String? ?? 'video/mp4',
      sha256: m['sha256'] as String?,
    );
  }

  final String emergencia;
  final String ruta;
  final String nombre;
  final int duracion;
  final String tipo;
  final String contentType;

  /// Huella del archivo al terminar de grabarlo (el servidor la registra con la hora).
  final String? sha256;

  String aJson() => jsonEncode({
    'emergencia': emergencia,
    'ruta': ruta,
    'nombre': nombre,
    'duracion': duracion,
    'tipo': tipo,
    'contentType': contentType,
    'sha256': sha256,
  });
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

  /// Fragmentos de evidencia (video o audio) que ya llegaron al servidor.
  int enviados = 0;

  /// Fragmentos de esta emergencia copiados al teléfono (Descargas/ALERTA CERCA).
  int copias = 0;

  /// Lo que pasa en la emergencia (horas, ubicaciones, huellas): con esto se arma la constancia
  /// para la denuncia. Solo vive en el teléfono; sigue aquí después del cierre por si llega tarde
  /// el último fragmento.
  BitacoraSos? bitacora;
  DateTime? _pidioAyudaEn;
  DateTime? _bitacoraGuardada;
  var _escribiendoConstancia = false;
  var _constanciaPendiente = false;

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

  /// El teléfono tiene huella o PIN: se puede proteger el "cancelar" (se revisa al reanudar).
  bool puedeAutenticar = false;

  // Audio: graba cuando la cámara NO está grabando (pantalla apagada, en la bolsa). Así nunca
  // se pelean el micrófono, y el audio sigue aunque no se vea nada.
  AudioRecorder? _grabadoraAudio;
  Timer? _corteAudio;
  DateTime? _inicioAudio;
  var _camaraActiva = false;
  var _audioActivo = false;
  final _cola = <_Fragmento>[];
  int? _bateria;
  DateTime? _bateriaLeida;
  late final _escucha = EscuchaSacudidas(() => iniciarCuenta(OrigenEmergencia.movimiento));
  var _enPrimerPlano = true;

  bool get abierta => etapa == EtapaSos.enviando || etapa == EtapaSos.activa;
  bool get visible => etapa != EtapaSos.inactiva;
  String? get id => estado?.id;
  int get pendientes => _cola.length;

  /// Cancelar o terminar el SOS pide huella o PIN (para que un ladrón no lo quite).
  bool get pinActivado => !simulacro && (prefs.getBool(Claves.sosPinCancelar) ?? true) && puedeAutenticar;

  /// La cámara está grabando video (con su propio audio): el grabador de audio se pausa.
  set camaraActiva(bool v) {
    if (_camaraActiva == v) return;
    _camaraActiva = v;
    _evaluarAudio();
  }

  // ─── Configuración ─────────────────────────────────────────────────────────
  /// Guardar una copia de la evidencia en el teléfono (Descargas/ALERTA CERCA), para una denuncia.
  bool get copiaActivada => prefs.getBool(Claves.sosCopiaTelefono) ?? true;

  Future<void> configurarCopia(bool si) async {
    await prefs.setBool(Claves.sosCopiaTelefono, si);
    notifyListeners();
  }

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
    _evaluarAudio();
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

  /// Detiene el SOS (cancela la cuenta o lo termina). Si la protección con PIN está activada,
  /// pide huella o PIN ANTES: así un ladrón no lo puede quitar. La cuenta regresiva NO se pausa
  /// mientras se autentica, para que un forcejeo no la congele. Devuelve false si no se confirmó.
  Future<bool> intentarDetener(CierreEmergencia cierre) async {
    if (pinActivado) {
      final ok = await Autenticacion.confirmar(
        cierre == CierreEmergencia.aSalvo
            ? 'Confirma que eres tú para avisar que estás a salvo'
            : 'Confirma que eres tú para cancelar el SOS',
      );
      if (!ok) return false;
    }
    // La cuenta pudo haber disparado el SOS mientras se autenticaba: se actúa según el estado real
    if (etapa == EtapaSos.cuentaRegresiva) {
      cancelarCuenta();
    } else if (abierta) {
      await terminar(cierre);
    }
    return true;
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
    _pidioAyudaEn = DateTime.now();
    copias = 0;
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
      bitacora = BitacoraSos(id: r.id, inicio: _pidioAyudaEn ?? DateTime.now(), origen: origen)
        ..lat = p.lat
        ..lon = p.lon
        ..precisionM = p.precision
        ..anotar('Pidió ayuda (${origen.texto})', _pidioAyudaEn)
        ..anotar('La alerta llegó a los validadores');
      _guardarBitacora(ya: true);
      await prefs.setString(Claves.sosId, r.id);
      _seguir();
      _evaluarAudio();
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
      _anotarSenal(id, p?.lat, p?.lon, antes: estado, ahora: r);
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

  /// Bitácora de la constancia: última ubicación, cuántas señales y lo que hicieron los validadores.
  void _anotarSenal(
    String id,
    double? lat,
    double? lon, {
    EstadoMiEmergencia? antes,
    required EstadoMiEmergencia ahora,
  }) {
    final b = bitacora;
    if (b == null || b.id != id) return;
    b.senales++;
    if (lat != null && lon != null) {
      b
        ..ultimaLat = lat
        ..ultimaLon = lon
        ..ultimaEn = DateTime.now();
    }
    var cambio = false;
    if (ahora.atendidaPor != null && antes?.atendidaPor == null) {
      b.anotar('${ahora.atendidaPor} tomó el caso');
      cambio = true;
    }
    if (ahora.policiaAvisada && !(antes?.policiaAvisada ?? false)) {
      b.anotar('Avisaron al 911');
      cambio = true;
    }
    _guardarBitacora(ya: cambio);
  }

  /// La ubicación cambia cada 5 s: se escribe como mucho cada 30 s (los hechos, al momento).
  void _guardarBitacora({bool ya = false}) {
    final b = bitacora;
    if (b == null) return;
    final ahora = DateTime.now();
    if (!ya && _bitacoraGuardada != null && ahora.difference(_bitacoraGuardada!) < const Duration(seconds: 30)) return;
    _bitacoraGuardada = ahora;
    Bitacoras.guardar(b);
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
    final b = bitacora;
    if (b != null && b.id == id) {
      b
        ..tipo = tipo
        ..anotar('Indicó: ${tipo.enPrimeraPersona}');
      _guardarBitacora(ya: true);
    }
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
    await _detenerAudio();
    final b = bitacora;
    if (r != null && b != null && b.id == r.id && b.fin == null) {
      b
        ..fin = DateTime.now()
        ..cierre = _textoCierre(r)
        ..anotar(b.cierre!);
      _guardarBitacora(ya: true);
      unawaited(_escribirConstancia(b));
    }
    cerrada = r;
    estado = null;
    etapa = simulacro || r == null ? EtapaSos.inactiva : EtapaSos.terminada;
    simulacro = false;
    await prefs.remove(Claves.sosId);
    if (etapa == EtapaSos.inactiva) await Proteccion.sobrePantallaBloqueada(false);
    notifyListeners();
    _procesarCola(); // los últimos fragmentos tienen 15 min para terminar de subir
  }

  static String _textoCierre(EstadoMiEmergencia r) => switch (r.cierre) {
    CierreEmergencia.aSalvo => 'La persona indicó que está a salvo',
    CierreEmergencia.localizada => 'La cerró ${r.atendidaPor ?? 'un validador'}: la localizaron',
    CierreEmergencia.falsaAlarma => 'Se cerró como falsa alarma',
    null => 'Se cerró',
  };

  /// Al cerrar (y si después llega un fragmento) la constancia queda junto a la evidencia. Una a la
  /// vez: si el último fragmento llega mientras se escribe, se vuelve a escribir al terminar (en el
  /// mismo archivo, sin dejar una "constancia (1)").
  Future<void> _escribirConstancia(BitacoraSos b) async {
    if (!CopiaEvidencia.disponible || b.archivos.every((a) => a.uri == null)) return;
    if (_escribiendoConstancia) {
      _constanciaPendiente = true;
      return;
    }
    _escribiendoConstancia = true;
    try {
      do {
        _constanciaPendiente = false;
        final r = await CopiaEvidencia.guardarTexto(
          constanciaSos(carpeta: b.carpeta, bitacora: b, ahora: DateTime.now()),
          carpeta: b.carpeta,
          reemplazar: b.constanciaUri,
        );
        if (r != null) {
          b.constanciaUri = r.uri;
          _guardarBitacora(ya: true);
        }
      } while (_constanciaPendiente);
    } finally {
      _escribiendoConstancia = false;
    }
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
        final id = encontrada.id;
        bitacora =
            (await Bitacoras.leer(id) ?? BitacoraSos(id: id, inicio: DateTime.now(), origen: origen, retomada: true))
              ..anotar('La app se volvió a abrir y retomó la emergencia');
        _guardarBitacora(ya: true);
        estado = encontrada;
        etapa = EtapaSos.activa;
        await prefs.setString(Claves.sosId, encontrada.id);
        _seguir();
        notifyListeners();
      } else if (encontrada == null || !encontrada.estado.abierta) {
        await prefs.remove(Claves.sosId);
      }
    }
    puedeAutenticar = await Autenticacion.disponible();
    await _actualizarEscucha();
    _evaluarAudio();
    _procesarCola();
  }

  // ─── Evidencia ─────────────────────────────────────────────────────────────
  /// Un fragmento de evidencia terminado (video o audio): se le saca la huella, se copia al
  /// teléfono (para una denuncia) y se sube en cuanto se pueda; si no hay señal, se reintenta.
  Future<void> agregarFragmento(
    String ruta,
    Duration duracion, {
    String tipo = 'video',
    String extension = 'mp4',
    String contentType = 'video/mp4',
  }) async {
    final id = this.id ?? cerrada?.id;
    if (id == null || simulacro || id == 'simulacro') {
      _borrar(ruta);
      return;
    }
    final inicio = DateTime.now().subtract(duracion);
    final segundos = math.max(1, duracion.inSeconds);
    // Huella del archivo tal como se grabó (en otro hilo: son varios MB). Va al servidor con el
    // fragmento y a la bitácora: así se comprueba después que la copia del teléfono no se editó.
    ({String sha256, int bytes})? huella;
    try {
      huella = await compute(huellaArchivo, ruta);
    } catch (e) {
      debugPrint('Huella del SOS: $e');
    }
    // La copia va ANTES de subirlo: al subirse, el archivo temporal se borra
    final b = bitacora?.id == id ? bitacora : null;
    if (b != null) {
      final nombre = '${DateFormat('HH.mm.ss').format(inicio)} $tipo.$extension';
      final copia = copiaActivada && CopiaEvidencia.disponible
          ? await CopiaEvidencia.guardar(ruta, carpeta: b.carpeta, nombre: nombre, mime: contentType)
          : null;
      if (copia != null) copias++;
      if (huella != null) {
        b.archivos.add(
          ArchivoSos(
            nombre: copia?.nombre ?? nombre,
            tipo: tipo,
            inicio: inicio,
            duracionS: segundos,
            bytes: huella.bytes,
            sha256: huella.sha256,
            uri: copia?.uri,
          ),
        );
        _guardarBitacora(ya: true);
        // El último fragmento llega después del cierre: la constancia se rehace con él
        if (b.fin != null) unawaited(_escribirConstancia(b));
      }
    }
    _cola.add(
      _Fragmento(
        emergencia: id,
        ruta: ruta,
        nombre: '${DateTime.now().millisecondsSinceEpoch}.$extension',
        duracion: segundos,
        tipo: tipo,
        contentType: contentType,
        sha256: huella?.sha256,
      ),
    );
    await _guardarCola();
    notifyListeners();
    _procesarCola();
  }

  // ─── Audio en tiempo casi real ──────────────────────────────────────────────
  // Graba segmentos de ~6 s y los sube al terminar cada uno; sigue con la pantalla apagada
  // gracias al servicio de micrófono. Solo cuando la cámara no está grabando (para no pelear
  // el micrófono) y nunca en la web, en el simulacro ni fuera de una emergencia.
  void _evaluarAudio() {
    final debe = etapa == EtapaSos.activa && !simulacro && !_camaraActiva && !kIsWeb;
    if (debe && !_audioActivo) {
      _iniciarAudio();
    } else if (!debe && _audioActivo) {
      _detenerAudio();
    }
  }

  Future<void> _iniciarAudio() async {
    if (_audioActivo) return;
    _audioActivo = true;
    try {
      _grabadoraAudio ??= AudioRecorder();
      if (!await _grabadoraAudio!.hasPermission()) {
        _audioActivo = false;
        return;
      }
      await Proteccion.iniciarMicrofono();
      await _grabarSegmentoAudio();
    } catch (e) {
      debugPrint('Audio del SOS: $e');
      _audioActivo = false;
    }
  }

  Future<void> _grabarSegmentoAudio() async {
    if (!_audioActivo || etapa != EtapaSos.activa || _camaraActiva) return;
    final ruta = '${Directory.systemTemp.path}/sos_audio_${DateTime.now().millisecondsSinceEpoch}.m4a';
    try {
      await _grabadoraAudio!.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100, numChannels: 1),
        path: ruta,
      );
      _inicioAudio = DateTime.now();
      _corteAudio?.cancel();
      _corteAudio = Timer(const Duration(seconds: 6), _cortarAudio);
    } catch (e) {
      debugPrint('Audio del SOS: $e');
      _audioActivo = false;
    }
  }

  Future<void> _cortarAudio() async {
    _corteAudio?.cancel();
    if (_grabadoraAudio == null) return;
    try {
      final ruta = await _grabadoraAudio!.stop();
      if (ruta != null) {
        await agregarFragmento(
          ruta,
          DateTime.now().difference(_inicioAudio ?? DateTime.now()),
          tipo: 'audio',
          extension: 'm4a',
          contentType: 'audio/mp4',
        );
      }
    } catch (e) {
      debugPrint('Audio del SOS: $e');
    }
    if (_audioActivo && etapa == EtapaSos.activa && !_camaraActiva) await _grabarSegmentoAudio();
  }

  Future<void> _detenerAudio() async {
    if (!_audioActivo && _grabadoraAudio == null) return;
    _audioActivo = false;
    _corteAudio?.cancel();
    try {
      if (await (_grabadoraAudio?.isRecording() ?? Future.value(false))) {
        final ruta = await _grabadoraAudio!.stop();
        if (ruta != null) {
          await agregarFragmento(
            ruta,
            DateTime.now().difference(_inicioAudio ?? DateTime.now()),
            tipo: 'audio',
            extension: 'm4a',
            contentType: 'audio/mp4',
          );
        }
      }
    } catch (e) {
      debugPrint('Audio del SOS: $e');
    }
    await Proteccion.detenerMicrofono();
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
          await servicio.subirEvidencia(
            f.emergencia,
            f.nombre,
            bytes,
            tipo: f.tipo,
            contentType: f.contentType,
            duracionS: f.duracion,
            sha256: f.sha256,
          );
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
    _corteAudio?.cancel();
    _gps?.cancel();
    _grabadoraAudio?.dispose();
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
