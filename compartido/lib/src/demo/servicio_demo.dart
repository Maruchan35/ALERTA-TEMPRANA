import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../catalogo.dart';
import '../distancia.dart';
import '../geohash.dart';
import '../mensajes.dart';
import '../modelos.dart';
import '../radio.dart';
import '../servicio.dart';

/// Un punto de la demo (paso 5.3 de la propuesta).
class PuntoDemo {
  const PuntoDemo(this.clave, this.etiqueta, this.lat, this.lon);

  final String clave;
  final String etiqueta;
  final double lat;
  final double lon;

  String get celda => geohash(lat, lon);
}

/// Donde ocurre el suceso de la demo: centro de Lázaro Cárdenas (aprox.).
const sucesoDemo = PuntoDemo('suceso', 'Centro de Lázaro Cárdenas', 17.9581, -102.1942);

/// Los cuatro teléfonos de la demo.
const puntosDemo = [
  PuntoDemo('A', 'A · 300 m', 17.9608, -102.1942),
  PuntoDemo('B', 'B · 2.6 km', 17.9815, -102.1942),
  PuntoDemo('C', 'C · 6 km', 18.0121, -102.1942),
  PuntoDemo('D', 'D · Zihuatanejo', 17.6417, -101.5517),
];

/// Aviso entregado a un teléfono simulado. `datos` tiene exactamente el formato del push
/// real de FCM, así la app lo procesa con el mismo código.
class AvisoDemo {
  const AvisoDemo({required this.dispositivo, required this.datos, required this.cuando});

  final String dispositivo;
  final Map<String, String> datos;
  final DateTime cuando;

  String get tipo => datos['tipo']!;
}

/// `app`: una persona usando la app (con validador y vecinos simulados).
/// `panel`: el panel de validadores con los 4 teléfonos de la demo.
enum EscenarioDemo { app, panel }

class _Registro {
  _Registro(this.alerta, {required this.creadaPor, this.autorReputacion = 0});

  Alerta alerta;
  final String? creadaPor;
  final int autorReputacion;
  final votos = <String, String>{}; // usuario → tipo
  final entregas = <String>{}; // dispositivos que ya la recibieron
  final bitacora = <EntradaBitacora>[];
  DateTime? autoValidarEn;
  final votosSimulados = <DateTime>[];
  String? folio;
  bool consentimiento = false;
}

class _Avisador extends ChangeNotifier {
  void avisar() => notifyListeners();
}

const _yo = 'usuario-demo';
const _validador = 'validador-demo';
const _institucionDemo = 'Protección Civil (demo)';

/// Motor en memoria que reproduce las reglas del backend (004_funciones.sql, 007_colmena.sql
/// y la Edge Function `notificar`): estados de confianza, radio dinámico en anillos con el
/// margen de celda, duplicados, límite de reportes, votos y colmena, cierre y expiración.
class ServicioDemo implements ServicioAlertas {
  ServicioDemo({
    this.escenario = EscenarioDemo.app,
    this.factorTiempo = 30,
    DateTime Function()? reloj,
    bool iniciarReloj = true,
    bool sembrar = true,
  }) : _ahora = reloj ?? DateTime.now {
    if (sembrar) _sembrar();
    if (iniciarReloj) _timer = Timer.periodic(const Duration(seconds: 1), (_) => avanzar());
  }

  final EscenarioDemo escenario;

  /// Como en `config.factor_tiempo` de la demo: 30 → 1 minuto real = 30 minutos.
  final double factorTiempo;
  final DateTime Function() _ahora;
  Timer? _timer;

  final _registros = <String, _Registro>{};
  final _fotos = <String, Uint8List>{};
  final _zonas = <Zona>[];
  final _perfil = ValueNotifier<Perfil?>(null);
  final _avisos = StreamController<AvisoDemo>.broadcast();
  final _cambios = StreamController<Alerta>.broadcast();
  final _panel = StreamController<List<Alerta>>.broadcast();
  String? _celdaYo;
  var _secuencia = 0;

  /// Número al que se "envió" el último código por WhatsApp (simulado).
  String? _whatsappPara;

  /// Avisos que reciben los teléfonos simulados (A, B, C, D y "yo").
  Stream<AvisoDemo> get avisos => _avisos.stream;

  /// Notifica cada cambio (para refrescar el simulador del panel).
  Listenable get cambio => _cambio;
  final _cambio = _Avisador();

  @override
  bool get esDemo => true;

  @override
  ValueListenable<Perfil?> get perfil => _perfil;

  DateTime get ahora => _ahora();

  bool get _soyValidador => _perfil.value?.rol.esValidador ?? false;

  String _nuevoId() {
    _secuencia++;
    final r = math.Random().nextInt(0xffffff).toRadixString(16).padLeft(6, '0');
    return '00000000-0000-4000-8000-${_secuencia.toString().padLeft(6, '0')}$r';
  }

  // ─── Datos iniciales para que el mapa no se vea vacío ─────────────────────
  void _sembrar() {
    final t = ahora;
    Alerta base(
      String cat,
      String titulo,
      double lat,
      double lon, {
      required EstadoAlerta estado,
      required Duration hace,
      String? descripcion,
      String? referencia,
      int? manual,
    }) {
      final c = categoriaPorClave(cat);
      final creada = t.subtract(hace);
      return Alerta(
        id: _nuevoId(),
        categoria: cat,
        nombre: c.nombre,
        nombreCorto: c.nombreCorto,
        nivel: c.nivel,
        estado: estado,
        titulo: titulo,
        descripcion: descripcion,
        referencia: referencia,
        lat: lat,
        lon: lon,
        radioActualM: 0,
        radioManualM: manual,
        creadaEn: creada,
        publicadaEn: estado == EstadoAlerta.pendiente ? null : creada,
        verificadaEn: estado == EstadoAlerta.verificada ? creada.add(const Duration(minutes: 3)) : null,
        expiraEn: creada.add(c.vigencia),
        validadaPor: estado == EstadoAlerta.verificada ? _institucionDemo : null,
        instrucciones: c.instrucciones,
      );
    }

    void agregar(Alerta a, {String autor = 'ciudadano-1', int reputacion = 0, int votos = 0}) {
      final r = _Registro(a, creadaPor: autor, autorReputacion: reputacion);
      for (var i = 0; i < votos; i++) {
        r.votos['vecino-semilla-$i'] = 'confirmo';
      }
      r.bitacora.add(EntradaBitacora(accion: 'reportar', creadaEn: a.creadaEn, usuarioId: autor));
      if (a.estado == EstadoAlerta.verificada) {
        r.bitacora.add(EntradaBitacora(accion: 'verificar', creadaEn: a.verificadaEn!, usuarioId: _validador));
      }
      _registros[a.id] = r;
      // Las alertas de fondo ya se habían enviado antes de abrir la demo
      final radio = _radio(r);
      r.alerta = r.alerta.copiar(radioActualM: radio, nConfirmo: votos);
      if (radio > 0) r.entregas.addAll(_destinos(r, radio));
    }

    agregar(
      base(
        'accidente',
        'Choque entre dos autos en Av. Lázaro Cárdenas',
        17.9662,
        -102.2003,
        estado: EstadoAlerta.verificada,
        hace: const Duration(minutes: 25),
        descripcion: 'Hay tránsito lento en ambos sentidos.',
        referencia: 'Frente a la gasolinera',
      ),
      votos: 2,
    );
    agregar(
      base(
        'robo_vehiculo',
        'Nissan Versa gris, placas DEMO-123',
        17.9720,
        -102.2150,
        estado: EstadoAlerta.verificada,
        hace: const Duration(minutes: 40),
        descripcion: 'Se dirigía hacia la autopista Siglo XXI. Datos ficticios para la demostración.',
        manual: 3000,
      ),
    );

    if (escenario == EscenarioDemo.app) {
      agregar(
        base(
          'incendio',
          'Humo en una bodega de la colonia Centro',
          17.9546,
          -102.1898,
          estado: EstadoAlerta.noConfirmada,
          hace: const Duration(minutes: 6),
          descripcion: 'Se ve humo negro saliendo del techo.',
        ),
        votos: 1,
      );
    } else {
      final menor = base(
        'menor_desaparecido',
        'Niño de 8 años, playera roja y short azul',
        sucesoDemo.lat,
        sucesoDemo.lon,
        estado: EstadoAlerta.pendiente,
        hace: const Duration(minutes: 1),
        descripcion: 'Mide 1.20 m. Visto por última vez frente al mercado municipal. Datos ficticios.',
        referencia: 'Mercado municipal, Col. Centro',
      );
      agregar(menor, autor: 'ciudadano-reporta', reputacion: 3);
      _registros[menor.id]!
        ..folio = '911-2026-04817'
        ..consentimiento = true;
      agregar(
        base(
          'incendio',
          'Humo en una bodega de la colonia Centro',
          17.9546,
          -102.1898,
          estado: EstadoAlerta.noConfirmada,
          hace: const Duration(minutes: 4),
        ),
        votos: 2,
      );
      agregar(
        base(
          'accidente',
          'Motocicleta derrapada en el puente',
          17.9490,
          -102.2050,
          estado: EstadoAlerta.corroborada,
          hace: const Duration(minutes: 12),
        ),
        votos: 3,
      );
    }
  }

  // ─── Reloj: radio dinámico, validador simulado, vecinos y expiración ──────
  /// Un "tic" del sistema (como pg_cron cada 15 s, aquí cada segundo).
  void avanzar() {
    final t = ahora;
    var hubo = false;
    for (final r in _registros.values.toList()) {
      final a = r.alerta;
      if (a.estado.abierta && a.expiraEn.isBefore(t)) {
        r.alerta = a.copiar(estado: EstadoAlerta.expirada, cerradaEn: t);
        r.bitacora.add(EntradaBitacora(accion: 'expirar', creadaEn: t));
        _notificarCambio(r);
        hubo = true;
        continue;
      }
      if (r.autoValidarEn != null && !t.isBefore(r.autoValidarEn!) && a.estado != EstadoAlerta.verificada) {
        r.autoValidarEn = null;
        if (a.estado.abierta) {
          _aplicarValidacion(r, AccionValidador.verificar, usuario: _validador, institucion: _institucionDemo);
          hubo = true;
        }
      }
      // Colmena: nadie lo revisó a tiempo → se publica como NO CONFIRMADO (publicar_pendientes)
      final espera = Duration(minutes: reglasColmena.minutosEsperaValidador);
      if (r.alerta.estado == EstadoAlerta.pendiente &&
          r.alerta.publicadaEn == null &&
          r.autorReputacion >= -2 &&
          !t.isBefore(r.alerta.creadaEn.add(espera))) {
        r.alerta = r.alerta.copiar(estado: EstadoAlerta.noConfirmada, publicadaEn: t);
        r.bitacora.add(
          EntradaBitacora(
            accion: 'publicar_auto',
            creadaEn: t,
            detalle: {'minutos_sin_revision': reglasColmena.minutosEsperaValidador},
          ),
        );
        _alCambiarEstado(r, EstadoAlerta.pendiente);
        hubo = true;
      }
      while (r.votosSimulados.isNotEmpty && !t.isBefore(r.votosSimulados.first)) {
        r.votosSimulados.removeAt(0);
        if (r.alerta.estado.activa) {
          r.votos['vecino-sim-${r.votos.length}'] = 'confirmo';
          _revisarVotos(r);
          hubo = true;
        }
      }
      if (r.alerta.estado.activa) {
        final radio = _radio(r);
        if (radio > r.alerta.radioActualM) {
          r.alerta = r.alerta.copiar(radioActualM: radio);
          _entregarAnillo(r, radio);
          _notificarCambio(r);
          hubo = true;
        }
      }
    }
    if (hubo) _emitirPanel();
  }

  int _radio(_Registro r) => radioPermitido(
    categoria: categoriaPorClave(r.alerta.categoria),
    estado: r.alerta.estado,
    publicadaEn: r.alerta.publicadaEn,
    ahora: ahora,
    radioManualM: r.alerta.radioManualM,
    factorTiempo: factorTiempo,
    nConfirmo: r.votos.values.where((v) => v == 'confirmo').length,
  );

  /// Celdas de cada teléfono simulado (y de "mis zonas" para el mío).
  Map<String, List<String>> get _celdasPorDispositivo => {
    if (escenario == EscenarioDemo.panel)
      for (final p in puntosDemo) p.clave: [p.celda],
    if (_celdaYo != null) 'yo': [_celdaYo!, ..._zonas.map((z) => z.celda)],
  };

  /// Igual que `dispositivos_objetivo()`: celda (o zona) a menos de radio + 700 m.
  Set<String> _destinos(_Registro r, int radio) {
    final resultado = <String>{};
    _celdasPorDispositivo.forEach((dispositivo, celdas) {
      for (final c in celdas) {
        final (lat, lon) = centroDeGeohash(c);
        if (distanciaMetros(lat, lon, r.alerta.lat, r.alerta.lon) <= radio + 700) {
          resultado.add(dispositivo);
          break;
        }
      }
    });
    return resultado;
  }

  void _entregarAnillo(_Registro r, int radio) {
    final nuevos = _destinos(r, radio).difference(r.entregas);
    r.entregas.addAll(nuevos);
    _avisar(r, 'nueva', nuevos, radioM: radio);
  }

  void _avisar(_Registro r, String tipo, Iterable<String> destinos, {int? radioM}) {
    final datos = datosPush(r.alerta, tipo, radioM: radioM, institucion: r.alerta.validadaPor);
    for (final d in destinos) {
      _avisos.add(AvisoDemo(dispositivo: d, datos: datos, cuando: ahora));
    }
  }

  /// Lo que hacen el trigger `al_cambiar_estado` + la Edge Function `notificar`.
  void _alCambiarEstado(_Registro r, EstadoAlerta? anterior) {
    final a = r.alerta;
    switch (a.estado) {
      case EstadoAlerta.resuelta || EstadoAlerta.descartada:
        _avisar(r, 'cierre', r.entregas);
      case EstadoAlerta.pendiente:
        _avisar(r, 'validacion', const ['validador']);
      case EstadoAlerta.expirada:
        break;
      default:
        if ((a.estado == EstadoAlerta.corroborada || a.estado == EstadoAlerta.verificada) &&
            (anterior == EstadoAlerta.noConfirmada || anterior == EstadoAlerta.corroborada)) {
          _avisar(r, 'actualizacion', r.entregas);
        }
        final radio = _radio(r);
        if (radio > a.radioActualM) r.alerta = a.copiar(radioActualM: radio);
        if (radio > 0) _entregarAnillo(r, radio);
    }
    _notificarCambio(r);
    _emitirPanel();
  }

  void _notificarCambio(_Registro r) {
    if (!_cambios.isClosed) _cambios.add(_vista(r));
    _cambio.avisar();
  }

  void _emitirPanel() {
    if (!_panel.isClosed && _panel.hasListener) _panel.add(_listaPanel());
  }

  /// La alerta como la ve la persona que pregunta (conteos, su voto, foto, etc.).
  Alerta _vista(_Registro r, {bool panel = false}) {
    final a = r.alerta;
    final yo = _perfil.value?.id;
    final mostrarFoto =
        fotoPublica(a.estado, dePersonas: categoriaPorClave(a.categoria).esDePersonas) ||
        r.creadaPor == yo ||
        _soyValidador;
    int conteo(String tipo) => r.votos.values.where((v) => v == tipo).length;
    return Alerta(
      id: a.id,
      categoria: a.categoria,
      nombre: a.nombre,
      nombreCorto: a.nombreCorto,
      nivel: a.nivel,
      estado: a.estado,
      titulo: a.titulo,
      descripcion: a.descripcion,
      referencia: a.referencia,
      fotoPath: mostrarFoto ? a.fotoPath : null,
      lat: a.lat,
      lon: a.lon,
      radioActualM: a.radioActualM,
      creadaEn: a.creadaEn,
      publicadaEn: a.publicadaEn,
      verificadaEn: a.verificadaEn,
      cerradaEn: a.cerradaEn,
      expiraEn: a.expiraEn,
      motivoCierre: a.motivoCierre,
      validadaPor: a.validadaPor,
      instrucciones: a.instrucciones,
      nConfirmo: conteo('confirmo'),
      nYaNoEsta: conteo('ya_no_esta'),
      nPareceFalsa: conteo('parece_falsa'),
      miConfirmacion: yo == null ? null : r.votos[yo],
      esMia: yo != null && r.creadaPor == yo,
      folio911: panel ? r.folio : null,
      consentimiento: r.consentimiento,
      radioManualM: a.radioManualM,
      autorReputacion: panel ? r.autorReputacion : null,
      autorRol: panel ? (r.creadaPor == _validador ? 'validador' : 'ciudadano') : null,
      nEntregas: panel ? r.entregas.length : null,
      nTelegram: panel ? 0 : null,
    );
  }

  bool _visible(_Registro r) {
    final e = r.alerta.estado;
    if (e.activa) return true;
    if (e == EstadoAlerta.resuelta) {
      return r.alerta.cerradaEn != null && ahora.difference(r.alerta.cerradaEn!) < const Duration(hours: 24);
    }
    if (e == EstadoAlerta.pendiente) return r.creadaPor == _perfil.value?.id || _soyValidador;
    return false;
  }

  List<Alerta> _listaPanel() {
    final lista = _registros.values.map((r) => _vista(r, panel: true)).toList()
      ..sort((a, b) => b.creadaEn.compareTo(a.creadaEn));
    return lista;
  }

  _Registro _registro(String id) {
    final r = _registros[id];
    if (r == null) throw const ErrorServicio('La alerta no existe');
    return r;
  }

  // ─── Sesión ────────────────────────────────────────────────────────────────
  @override
  Future<void> iniciarSesionAnonima() async {
    if (escenario == EscenarioDemo.panel) return;
    _perfil.value ??= const Perfil(id: _yo, rol: Rol.ciudadano, esAnonimo: true);
  }

  @override
  Future<Perfil?> recargarPerfil() async => _perfil.value;

  @override
  Future<void> enviarCodigo(String telefono) async {
    if (!RegExp(r'^\d{10}$').hasMatch(telefono)) throw const ErrorServicio('Escribe tu número a 10 dígitos.');
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _whatsappPara = telefono;
  }

  @override
  Future<EstadoWhatsapp> estadoWhatsapp() async => const EstadoWhatsapp();

  @override
  Future<MensajeWhatsapp?> whatsappSimulado(String telefono) async => telefono != _whatsappPara
      ? null
      : MensajeWhatsapp(
          texto: 'ALERTA CERCA: tu código de verificación es 123456. No lo compartas con nadie.',
          codigo: '123456',
          enviadoEn: ahora,
        );

  @override
  Future<void> verificarCodigo(String telefono, String codigo) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (codigo != '123456') throw const ErrorServicio('El código es incorrecto. En la demostración es 123456.');
    final p = _perfil.value;
    _perfil.value = Perfil(
      id: p?.id ?? _yo,
      rol: p?.rol ?? Rol.ciudadano,
      esAnonimo: false,
      reputacion: p?.reputacion ?? 0,
      telefono: '52$telefono',
    );
  }

  @override
  Future<void> iniciarSesionCorreo(String correo, String contrasena) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (!correo.contains('@') || contrasena.isEmpty) throw const ErrorServicio('Escribe un correo y una contraseña.');
    _perfil.value = Perfil(
      id: _validador,
      rol: Rol.validador,
      esAnonimo: false,
      nombre: 'Validador 1',
      institucion: _institucionDemo,
      correo: correo,
    );
    _emitirPanel();
  }

  @override
  Future<void> cerrarSesion() async => _perfil.value = null;

  @override
  Future<void> borrarMiCuenta() async {
    _zonas.clear();
    _celdaYo = null;
    _perfil.value = null;
  }

  // ─── Dispositivo y alertas ─────────────────────────────────────────────────
  @override
  Future<void> registrarDispositivo({required String token, required String plataforma, required String celda}) async {
    if (!esCeldaValida(celda)) throw const ErrorServicio('Celda inválida');
    _celdaYo = celda;
  }

  @override
  Future<List<Alerta>> alertasCercanas(String celda, {int radioM = 25000}) async {
    final (lat, lon) = centroDeGeohash(celda);
    final lista =
        _registros.values
            .where(_visible)
            .where((r) => distanciaMetros(lat, lon, r.alerta.lat, r.alerta.lon) <= radioM)
            .map(_vista)
            .toList()
          ..sort((a, b) => b.nivel != a.nivel ? b.nivel.compareTo(a.nivel) : b.creadaEn.compareTo(a.creadaEn));
    return lista;
  }

  @override
  Future<Alerta?> obtenerAlerta(String id) async {
    final r = _registros[id];
    if (r == null) return null;
    if (r.alerta.estado == EstadoAlerta.pendiente && !(r.creadaPor == _perfil.value?.id || _soyValidador)) {
      return null;
    }
    return _vista(r, panel: _soyValidador);
  }

  @override
  Future<ImageProvider?> imagenFoto(String path) async {
    final bytes = _fotos[path];
    return bytes == null ? null : MemoryImage(bytes);
  }

  @override
  Future<String> subirFoto(Uint8List jpeg) async {
    final ruta = '${_perfil.value?.id ?? _yo}/${ahora.millisecondsSinceEpoch}.jpg';
    _fotos[ruta] = jpeg;
    return ruta;
  }

  @override
  Future<ResultadoReporte> crearReporte(NuevoReporte n) async {
    final p = _perfil.value;
    if (p == null || p.esAnonimo) throw const ErrorServicio('Verifica tu número de teléfono para poder reportar');
    final cat = categoriaPorClave(n.categoria);
    final inst = p.rol.esValidador;
    if (cat.soloInstitucion && !inst) throw const ErrorServicio('Esta categoría solo la pueden emitir instituciones');
    final titulo = n.titulo.trim();
    if (titulo.length < 5 || titulo.length > 80) {
      throw const ErrorServicio('El título debe tener entre 5 y 80 caracteres');
    }
    if (cat.requiereValidacion && n.fotoPath != null && !n.consentimiento) {
      throw const ErrorServicio(
        'Para publicar la foto de una persona se necesita el consentimiento de su familiar o tutor',
      );
    }
    final t = ahora;
    if (!inst) {
      // Duplicado antes del límite: sumarse a un reporte que ya existe nunca se bloquea
      for (final r in _registros.values) {
        final a = r.alerta;
        if (a.categoria == n.categoria &&
            a.estado.abierta &&
            t.difference(a.creadaEn) < const Duration(minutes: 30) &&
            distanciaMetros(a.lat, a.lon, n.lat, n.lon) < 500) {
          if (r.creadaPor != p.id) {
            r.votos[p.id] = 'confirmo';
            _revisarVotos(r);
          }
          return ResultadoReporte(duplicadaDe: a.id, estado: r.alerta.estado);
        }
      }
      final recientes = _registros.values
          .where((r) => r.creadaPor == p.id && t.difference(r.alerta.creadaEn) < const Duration(hours: 1))
          .length;
      final limite = reglasColmena.reportesPorHora;
      if (recientes >= limite) {
        throw ErrorServicio('Alcanzaste el límite de reportes ($limite por hora). Intenta más tarde');
      }
    }
    final estado = inst
        ? EstadoAlerta.verificada
        : (cat.requiereValidacion || p.reputacion < -2)
        ? EstadoAlerta.pendiente
        : EstadoAlerta.noConfirmada;
    final alerta = Alerta(
      id: _nuevoId(),
      categoria: cat.clave,
      nombre: cat.nombre,
      nombreCorto: cat.nombreCorto,
      nivel: cat.nivel,
      estado: estado,
      titulo: titulo,
      descripcion: n.descripcion?.trim().isEmpty ?? true ? null : n.descripcion!.trim(),
      referencia: n.referencia?.trim().isEmpty ?? true ? null : n.referencia!.trim(),
      fotoPath: n.fotoPath,
      lat: n.lat,
      lon: n.lon,
      radioActualM: 0,
      creadaEn: t,
      publicadaEn: estado == EstadoAlerta.pendiente ? null : t,
      verificadaEn: inst ? t : null,
      expiraEn: t.add(cat.vigencia),
      validadaPor: inst ? (p.institucion ?? p.nombre ?? 'Validador') : null,
      instrucciones: cat.instrucciones,
    );
    final r = _Registro(alerta, creadaPor: p.id, autorReputacion: p.reputacion)
      ..folio = n.folio911
      ..consentimiento = n.consentimiento;
    r.bitacora.add(EntradaBitacora(accion: inst ? 'emitir_oficial' : 'reportar', creadaEn: t, usuarioId: p.id));
    if (escenario == EscenarioDemo.app) {
      // Validador simulado: revisa los reportes en revisión a los 8 segundos
      if (estado == EstadoAlerta.pendiente) r.autoValidarEn = t.add(const Duration(seconds: 8));
      // Vecinos simulados: 3 confirman los reportes no confirmados (de 15 a 25 s)
      if (estado == EstadoAlerta.noConfirmada) {
        r.votosSimulados.addAll([15, 20, 25].map((s) => t.add(Duration(seconds: s))));
      }
    }
    _registros[alerta.id] = r;
    _alCambiarEstado(r, null);
    return ResultadoReporte(alertaId: alerta.id, estado: estado);
  }

  void _revisarVotos(_Registro r) {
    final si = r.votos.values.where((v) => v == 'confirmo').length;
    final falsa = r.votos.values.where((v) => v == 'parece_falsa').length;
    final antes = r.alerta.estado;
    if (antes == EstadoAlerta.pendiente && r.alerta.publicadaEn == null && si >= 1) {
      // Colmena: un segundo testigo publica el reporte en revisión
      final nuevo = si >= reglasColmena.confirmacionesCorroborar ? EstadoAlerta.corroborada : EstadoAlerta.noConfirmada;
      r.alerta = r.alerta.copiar(estado: nuevo, publicadaEn: ahora);
      r.bitacora.add(EntradaBitacora(accion: 'publicar_colmena', creadaEn: ahora, detalle: {'confirmaciones': si}));
      _alCambiarEstado(r, antes);
    } else if (si >= reglasColmena.confirmacionesCorroborar && antes == EstadoAlerta.noConfirmada) {
      r.alerta = r.alerta.copiar(estado: EstadoAlerta.corroborada);
      r.bitacora.add(EntradaBitacora(accion: 'corroborar_auto', creadaEn: ahora, detalle: {'confirmaciones': si}));
      _alCambiarEstado(r, antes);
    } else if (falsa >= 3 && (antes == EstadoAlerta.noConfirmada || antes == EstadoAlerta.corroborada)) {
      r.alerta = r.alerta.copiar(estado: EstadoAlerta.pendiente);
      r.bitacora.add(EntradaBitacora(accion: 'revision_por_votos', creadaEn: ahora, detalle: {'parece_falsa': falsa}));
      _alCambiarEstado(r, antes);
    } else {
      _notificarCambio(r);
      _emitirPanel();
    }
  }

  @override
  Future<void> confirmar(String alertaId, TipoConfirmacion tipo) async {
    final p = _perfil.value;
    if (p == null || p.esAnonimo) throw const ErrorServicio('Verifica tu número para confirmar alertas');
    final r = _registro(alertaId);
    if (!r.alerta.estado.activa) throw const ErrorServicio('Esta alerta ya no está activa');
    if (r.creadaPor == p.id) throw const ErrorServicio('No puedes confirmar tu propio reporte');
    r.votos[p.id] = tipo.clave;
    _revisarVotos(r);
  }

  @override
  Future<void> validar(String alertaId, AccionValidador accion, {String? motivo, int? radioM}) async {
    final p = _perfil.value;
    final r = _registro(alertaId);
    if (p == null || (!p.rol.esValidador && !(accion == AccionValidador.resolver && r.creadaPor == p.id))) {
      throw const ErrorServicio('No autorizado');
    }
    _aplicarValidacion(
      r,
      accion,
      usuario: p.id,
      institucion: p.institucion ?? p.nombre ?? 'Validador',
      motivo: motivo,
      radioM: radioM,
    );
  }

  void _aplicarValidacion(
    _Registro r,
    AccionValidador accion, {
    required String usuario,
    String? institucion,
    String? motivo,
    int? radioM,
  }) {
    final a = r.alerta;
    final t = ahora;
    final m = motivo?.trim().isEmpty ?? true ? null : motivo!.trim();
    if (!a.estado.abierta) throw ErrorServicio('La alerta ya está cerrada (${a.estado.clave})');
    switch (accion) {
      case AccionValidador.verificar:
        if (a.estado == EstadoAlerta.verificada) throw const ErrorServicio('La alerta ya está verificada');
        r.alerta = a.copiar(
          estado: EstadoAlerta.verificada,
          verificadaEn: t,
          publicadaEn: a.publicadaEn ?? t,
          validadaPor: institucion,
        );
      case AccionValidador.descartar:
        if (m == null) throw const ErrorServicio('Indica el motivo del descarte');
        r.alerta = a.copiar(estado: EstadoAlerta.descartada, cerradaEn: t, motivoCierre: m);
      case AccionValidador.resolver:
        r.alerta = a.copiar(estado: EstadoAlerta.resuelta, cerradaEn: t, motivoCierre: m ?? 'El caso fue resuelto');
      case AccionValidador.ajustarRadio:
        if (radioM == null || radioM < 100 || radioM > 100000) {
          throw const ErrorServicio('Radio inválido: debe estar entre 100 m y 100 km');
        }
        r.alerta = a.copiar(radioManualM: radioM);
    }
    r.bitacora.add(
      EntradaBitacora(accion: accion.clave, creadaEn: t, usuarioId: usuario, detalle: {'motivo': m, 'radio_m': radioM}),
    );
    if (accion == AccionValidador.ajustarRadio) {
      final radio = _radio(r);
      if (radio > r.alerta.radioActualM) r.alerta = r.alerta.copiar(radioActualM: radio);
      _entregarAnillo(r, radio);
      _notificarCambio(r);
      _emitirPanel();
    } else {
      _alCambiarEstado(r, a.estado);
    }
  }

  // ─── Mis zonas ─────────────────────────────────────────────────────────────
  @override
  Future<List<Zona>> misZonas() async => List.unmodifiable(_zonas);

  @override
  Future<Zona> guardarZona(String nombre, String celda) async {
    if (_zonas.length >= 3) throw const ErrorServicio('Puedes guardar como máximo 3 zonas');
    if (_zonas.any((z) => z.nombre == nombre)) throw const ErrorServicio('Ya tienes una zona con ese nombre');
    final z = Zona(id: _nuevoId(), nombre: nombre, celda: celda);
    _zonas.add(z);
    return z;
  }

  @override
  Future<void> borrarZona(String id) async => _zonas.removeWhere((z) => z.id == id);

  // ─── Panel ─────────────────────────────────────────────────────────────────
  @override
  Stream<List<Alerta>> flujoPanel() async* {
    yield _listaPanel();
    yield* _panel.stream;
  }

  @override
  Future<Metricas> metricas() async {
    final todas = _registros.values.map((r) => r.alerta);
    final tiempos = _registros.values
        .where((r) => r.alerta.verificadaEn != null && r.creadaPor != _validador)
        .map((r) => r.alerta.verificadaEn!.difference(r.alerta.creadaEn).inSeconds)
        .toList();
    return Metricas(
      activas: todas.where((a) => a.estado.activa).length,
      porValidar: todas.where((a) => a.estado == EstadoAlerta.pendiente).length,
      segundosValidacion: tiempos.isEmpty ? null : tiempos.reduce((a, b) => a + b) ~/ tiempos.length,
      entregasHoy: _registros.values.fold(0, (s, r) => s + r.entregas.length),
      dispositivosActivos: _celdasPorDispositivo.length,
    );
  }

  @override
  Future<List<EntradaBitacora>> bitacora(String alertaId) async => List.of(_registro(alertaId).bitacora);

  @override
  Stream<Alerta> cambiosEnAlertas() => _cambios.stream;

  // ─── Solo demo ─────────────────────────────────────────────────────────────
  /// Simula que un ciudadano verificado reporta algo (botones del simulador del panel).
  Future<ResultadoReporte> simularReporteCiudadano({
    required String categoria,
    required String titulo,
    String? descripcion,
    PuntoDemo punto = sucesoDemo,
  }) async {
    final anterior = _perfil.value;
    _perfil.value = Perfil(id: 'ciudadano-${_secuencia + 1}', rol: Rol.ciudadano, esAnonimo: false, reputacion: 3);
    try {
      return await crearReporte(
        NuevoReporte(
          categoria: categoria,
          titulo: titulo,
          descripcion: descripcion,
          referencia: 'Frente al mercado municipal',
          lat: punto.lat,
          lon: punto.lon,
          folio911: categoriaPorClave(categoria).requiereValidacion ? '911-2026-0${4800 + _secuencia}' : null,
          consentimiento: true,
        ),
      );
    } finally {
      _perfil.value = anterior;
    }
  }

  /// Simula votos de vecinos sobre una alerta.
  void simularVotos(String alertaId, TipoConfirmacion tipo, {int cuantos = 1}) {
    final r = _registro(alertaId);
    if (!r.alerta.estado.activa) return;
    for (var i = 0; i < cuantos; i++) {
      r.votos['vecino-${r.votos.length + 1}'] = tipo.clave;
    }
    _revisarVotos(r);
  }

  @override
  void cerrar() {
    _timer?.cancel();
    _avisos.close();
    _cambios.close();
    _panel.close();
    _cambio.dispose();
    _perfil.dispose();
  }
}
