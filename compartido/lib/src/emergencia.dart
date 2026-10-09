import 'dart:math' as math;

// ─── Modo emergencia (SOS) · 011_emergencias.sql ─────────────────────────────
// La persona que está en peligro pide ayuda; los validadores la siguen en vivo.
// Es la única excepción a "el servidor nunca sabe dónde estás": la persona misma la pide,
// solo la ven ella y los validadores, y se borra a los 30 días del cierre.

enum EstadoEmergencia {
  activa('activa', 'ACTIVA'),
  enSeguimiento('en_seguimiento', 'EN SEGUIMIENTO'),
  cerrada('cerrada', 'CERRADA');

  const EstadoEmergencia(this.clave, this.etiqueta);
  final String clave;
  final String etiqueta;

  static EstadoEmergencia desde(String? c) =>
      values.firstWhere((e) => e.clave == c, orElse: () => EstadoEmergencia.activa);

  bool get abierta => this != cerrada;
}

/// Lo que la persona indica con un toque (el validador lo ve; 'sos' = sin especificar).
enum TipoEmergencia {
  sos('sos', 'Emergencia SOS', 'Pedí ayuda'),
  asalto('asalto', 'Asalto en curso', 'Me están asaltando'),
  secuestro('secuestro', 'Posible secuestro', 'Me llevan'),
  meSiguen('me_siguen', 'La están siguiendo', 'Me están siguiendo'),
  otra('otra', 'Otra emergencia', 'Otra emergencia');

  const TipoEmergencia(this.clave, this.nombre, this.enPrimeraPersona);
  final String clave;

  /// Como lo ve el validador ("Posible secuestro").
  final String nombre;

  /// El botón que toca la persona ("Me llevan").
  final String enPrimeraPersona;

  static TipoEmergencia desde(String? c) => values.firstWhere((t) => t.clave == c, orElse: () => TipoEmergencia.sos);
}

enum OrigenEmergencia {
  boton('boton', 'Botón SOS'),
  movimiento('movimiento', 'Sacudida fuerte del teléfono'),
  atajo('atajo', 'Atajo del teléfono');

  const OrigenEmergencia(this.clave, this.texto);
  final String clave;
  final String texto;

  static OrigenEmergencia desde(String? c) =>
      values.firstWhere((o) => o.clave == c, orElse: () => OrigenEmergencia.boton);
}

enum CierreEmergencia {
  aSalvo('a_salvo', 'La persona indicó que está a salvo'),
  localizada('localizada', 'Localizada'),
  falsaAlarma('falsa_alarma', 'Falsa alarma');

  const CierreEmergencia(this.clave, this.texto);
  final String clave;
  final String texto;

  static CierreEmergencia? desde(String? c) => values.where((x) => x.clave == c).firstOrNull;
}

/// Lo que un validador puede hacer con una emergencia (función `atender_emergencia`).
enum AccionEmergencia {
  tomar('tomar', 'Tomar el caso'),
  policia('policia', 'Avisé al 911'),
  nota('nota', 'Agregar nota'),
  localizada('localizada', 'Localizada / a salvo'),
  falsaAlarma('falsa_alarma', 'Falsa alarma');

  const AccionEmergencia(this.clave, this.texto);
  final String clave;
  final String texto;

  bool get cierra => this == localizada || this == falsaAlarma;
}

DateTime? _fecha(Object? v) => v == null ? null : DateTime.parse(v as String);
double? _real(Object? v) => (v as num?)?.toDouble();

/// Lo que ve en su pantalla la persona que pidió ayuda (respuesta de las funciones del SOS).
class EstadoMiEmergencia {
  const EstadoMiEmergencia({
    required this.id,
    this.estado = EstadoEmergencia.activa,
    this.tipo = TipoEmergencia.sos,
    this.cierre,
    this.atendidaPor,
    this.policiaAvisada = false,
  });

  factory EstadoMiEmergencia.desdeMapa(Map<String, dynamic> m) => EstadoMiEmergencia(
    id: m['emergencia_id'] as String,
    estado: EstadoEmergencia.desde(m['estado'] as String?),
    tipo: TipoEmergencia.desde(m['tipo'] as String?),
    cierre: CierreEmergencia.desde(m['cierre'] as String?),
    atendidaPor: m['atendida_por'] as String?,
    policiaAvisada: m['policia_avisada'] as bool? ?? false,
  );

  final String id;
  final EstadoEmergencia estado;
  final TipoEmergencia tipo;
  final CierreEmergencia? cierre;

  /// Institución (o validador) que ya le está dando seguimiento.
  final String? atendidaPor;
  final bool policiaAvisada;
}

/// Una emergencia vista por los validadores (vista `emergencias_panel`).
class Emergencia {
  const Emergencia({
    required this.id,
    required this.estado,
    required this.tipo,
    required this.origen,
    required this.lat,
    required this.lon,
    required this.ultimaSenalEn,
    required this.creadaEn,
    this.precisionM,
    this.velocidadMs,
    this.bateria,
    this.sinSenalAvisadaEn,
    this.atendidaEn,
    this.policiaAvisadaEn,
    this.folio911,
    this.nota,
    this.cerradaEn,
    this.cierre,
    this.cerradaPorLaPersona = false,
    this.telefono,
    this.atendidaPorNombre,
    this.atendidaPorInstitucion,
    this.nPuntos = 0,
    this.nEvidencias = 0,
  });

  factory Emergencia.desdeMapa(Map<String, dynamic> m) => Emergencia(
    id: m['id'] as String,
    estado: EstadoEmergencia.desde(m['estado'] as String?),
    tipo: TipoEmergencia.desde(m['tipo'] as String?),
    origen: OrigenEmergencia.desde(m['origen'] as String?),
    lat: (m['lat'] as num).toDouble(),
    lon: (m['lon'] as num).toDouble(),
    precisionM: _real(m['precision_m']),
    velocidadMs: _real(m['velocidad_ms']),
    bateria: (m['bateria'] as num?)?.toInt(),
    ultimaSenalEn: _fecha(m['ultima_senal_en'])!,
    sinSenalAvisadaEn: _fecha(m['sin_senal_avisada_en']),
    creadaEn: _fecha(m['creada_en'])!,
    atendidaEn: _fecha(m['atendida_en']),
    policiaAvisadaEn: _fecha(m['policia_avisada_en']),
    folio911: m['folio_911'] as String?,
    nota: m['nota'] as String?,
    cerradaEn: _fecha(m['cerrada_en']),
    cierre: CierreEmergencia.desde(m['cierre'] as String?),
    cerradaPorLaPersona: m['cerrada_por_la_persona'] as bool? ?? false,
    telefono: m['telefono'] as String?,
    atendidaPorNombre: m['atendida_por_nombre'] as String?,
    atendidaPorInstitucion: m['atendida_por_institucion'] as String?,
    nPuntos: (m['n_puntos'] as num?)?.toInt() ?? 0,
    nEvidencias: (m['n_evidencias'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final EstadoEmergencia estado;
  final TipoEmergencia tipo;
  final OrigenEmergencia origen;
  final double lat;
  final double lon;
  final double? precisionM;
  final double? velocidadMs;
  final int? bateria;
  final DateTime ultimaSenalEn;
  final DateTime? sinSenalAvisadaEn;
  final DateTime creadaEn;
  final DateTime? atendidaEn;
  final DateTime? policiaAvisadaEn;
  final String? folio911;
  final String? nota;
  final DateTime? cerradaEn;
  final CierreEmergencia? cierre;
  final bool cerradaPorLaPersona;

  /// Teléfono verificado de la persona (solo validadores; null si pidió ayuda sin verificar).
  final String? telefono;
  final String? atendidaPorNombre;
  final String? atendidaPorInstitucion;
  final int nPuntos;
  final int nEvidencias;

  bool get abierta => estado.abierta;
  String? get atendidaPor => atendidaPorInstitucion ?? atendidaPorNombre;

  /// Velocidad en km/h (null si el GPS no la dio).
  int? get velocidadKmh => velocidadMs == null ? null : (velocidadMs! * 3.6).round();

  /// ¿Va en vehículo? (> 20 km/h): en un posible secuestro es la señal más importante.
  bool get enVehiculo => (velocidadKmh ?? 0) > 20;

  Duration sinSenal(DateTime ahora) {
    final d = ahora.difference(ultimaSenalEn);
    return d.isNegative ? Duration.zero : d;
  }

  /// El teléfono dejó de mandar señal (lo apagaron, sin batería o sin datos).
  bool sinSenalDesde(DateTime ahora, {Duration limite = const Duration(minutes: 2)}) =>
      abierta && sinSenal(ahora) >= limite;

  /// Teléfono listo para marcar desde México (+52...).
  String? get telefonoParaLlamar {
    final t = telefono?.replaceAll(RegExp(r'\D'), '');
    if (t == null || t.isEmpty) return null;
    return t.startsWith('52') && t.length == 12 ? '+$t' : t;
  }
}

/// Orden de los paneles: abiertas primero (las que nadie ha tomado, arriba), luego las más nuevas.
int compararEmergencias(Emergencia a, Emergencia b) {
  if (a.abierta != b.abierta) return a.abierta ? -1 : 1;
  final sinTomarA = a.estado == EstadoEmergencia.activa;
  final sinTomarB = b.estado == EstadoEmergencia.activa;
  if (sinTomarA != sinTomarB) return sinTomarA ? -1 : 1;
  return b.creadaEn.compareTo(a.creadaEn);
}

class PuntoEmergencia {
  const PuntoEmergencia({
    required this.lat,
    required this.lon,
    required this.registradaEn,
    this.id,
    this.precisionM,
    this.velocidadMs,
  });

  factory PuntoEmergencia.desdeMapa(Map<String, dynamic> m) => PuntoEmergencia(
    id: (m['id'] as num?)?.toInt(),
    lat: (m['lat'] as num).toDouble(),
    lon: (m['lon'] as num).toDouble(),
    precisionM: _real(m['precision_m']),
    velocidadMs: _real(m['velocidad_ms']),
    registradaEn: _fecha(m['registrada_en'])!,
  );

  final int? id;
  final double lat;
  final double lon;
  final double? precisionM;
  final double? velocidadMs;
  final DateTime registradaEn;
}

class EvidenciaEmergencia {
  const EvidenciaEmergencia({required this.tipo, required this.ruta, required this.creadaEn, this.duracionS});

  factory EvidenciaEmergencia.desdeMapa(Map<String, dynamic> m) => EvidenciaEmergencia(
    tipo: m['tipo'] as String,
    ruta: m['ruta'] as String,
    duracionS: (m['duracion_s'] as num?)?.toInt(),
    creadaEn: _fecha(m['creada_en'])!,
  );

  final String tipo; // video | audio | foto
  final String ruta;
  final int? duracionS;
  final DateTime creadaEn;
}

/// Detecta una sacudida FUERTE e intencional (o un forcejeo): [picos] golpes de aceleración
/// por encima de [umbralG] dentro de [ventana], es decir, unas 4 sacudidas por segundo.
/// Caminar, un bache o dejar el teléfono en la mesa no la disparan, y correr tampoco: los
/// pasos llegan a ~3 por segundo. Aun así, antes de pedir ayuda la app da unos segundos
/// para cancelar. La misma regla corre en el servicio de Android (ModoProteccionService.kt)
/// para cuando la app está cerrada.
class DetectorSacudida {
  DetectorSacudida({
    this.umbralG = 2.5,
    this.picos = 4,
    this.ventana = const Duration(milliseconds: 1000),
    this.separacion = const Duration(milliseconds: 100),
    this.espera = const Duration(seconds: 10),
  });

  final double umbralG;
  final int picos;
  final Duration ventana;

  /// Dos lecturas más juntas que esto son el mismo golpe.
  final Duration separacion;

  /// Tras disparar, no vuelve a disparar en este tiempo.
  final Duration espera;

  final _golpes = <DateTime>[];
  DateTime? _ultimoDisparo;

  /// [x], [y], [z] en m/s² CON gravedad (el acelerómetro del teléfono). true = sacudida.
  bool agregar(double x, double y, double z, DateTime t) {
    final g = math.sqrt(x * x + y * y + z * z) / 9.80665;
    if (g < umbralG) return false;
    if (_ultimoDisparo != null && t.difference(_ultimoDisparo!) < espera) return false;
    if (_golpes.isNotEmpty && t.difference(_golpes.last) < separacion) return false;
    _golpes
      ..add(t)
      ..removeWhere((p) => t.difference(p) > ventana);
    if (_golpes.length < picos) return false;
    _golpes.clear();
    _ultimoDisparo = t;
    return true;
  }

  void reiniciar() {
    _golpes.clear();
    _ultimoDisparo = null;
  }
}
