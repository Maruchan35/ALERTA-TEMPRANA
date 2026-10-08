/// Modelos de ALERTA CERCA. Los nombres de campos del servidor (snake_case) se
/// convierten aquí; el resto del código usa solo estos tipos.
library;

enum EstadoAlerta {
  pendiente('pendiente', 'En revisión'),
  noConfirmada('no_confirmada', 'No confirmada'),
  corroborada('corroborada', 'Corroborada'),
  verificada('verificada', 'Verificada'),
  resuelta('resuelta', 'Resuelta'),
  descartada('descartada', 'Descartada'),
  expirada('expirada', 'Expirada');

  const EstadoAlerta(this.clave, this.legible);

  /// Valor en la base de datos.
  final String clave;

  /// Texto para mostrar.
  final String legible;

  static EstadoAlerta desde(String? clave) =>
      values.firstWhere((e) => e.clave == clave, orElse: () => EstadoAlerta.pendiente);

  /// Se está difundiendo.
  bool get activa => this == noConfirmada || this == corroborada || this == verificada;

  /// Activa o en revisión (todavía se puede verificar, descartar o resolver).
  bool get abierta => activa || this == pendiente;

  bool get cerrada => !abierta;

  /// Descripción de confianza para la insignia y el detalle.
  String get explicacion => switch (this) {
    pendiente => 'En revisión: lo publica un validador, un segundo testigo o la colmena a los 5 min',
    noConfirmada => 'Reporte ciudadano sin confirmar',
    corroborada => 'Confirmada por 3 o más vecinos',
    verificada => 'Validada por una institución',
    resuelta => 'El caso se resolvió',
    descartada => 'La información no pudo confirmarse',
    expirada => 'La alerta venció',
  };
}

class Escalon {
  const Escalon(this.minuto, this.radioM);

  /// Minutos desde que se publicó la alerta.
  final int minuto;
  final int radioM;
}

class Categoria {
  const Categoria({
    required this.clave,
    required this.nombre,
    required this.nombreCorto,
    required this.etiqueta,
    required this.nivel,
    required this.requiereValidacion,
    required this.soloInstitucion,
    required this.radioMaxNoConfM,
    required this.vigencia,
    required this.categoriaCap,
    required this.instrucciones,
    required this.escalones,
  });

  final String clave;
  final String nombre;
  final String nombreCorto;

  /// Texto corto para la cuadrícula de "Reportar" ("Menor", "Vehículo"...).
  final String etiqueta;
  final int nivel;
  final bool requiereValidacion;
  final bool soloInstitucion;
  final int radioMaxNoConfM;
  final Duration vigencia;
  final String categoriaCap;
  final String instrucciones;
  final List<Escalon> escalones;

  /// Personas y menores: la foto requiere consentimiento y conviene el folio del 911.
  bool get esDePersonas => requiereValidacion;

  int get radioMaximo => escalones.map((e) => e.radioM).reduce((a, b) => a > b ? a : b);
}

/// Espejo de `foto_publica()` (007_colmena.sql): la foto de una PERSONA solo se muestra a
/// todos cuando la alerta ya está confirmada (corroborada o verificada).
bool fotoPublica(EstadoAlerta estado, {required bool dePersonas}) =>
    estado == EstadoAlerta.corroborada ||
    estado == EstadoAlerta.verificada ||
    (estado == EstadoAlerta.noConfirmada && !dePersonas);

class Alerta {
  const Alerta({
    required this.id,
    required this.categoria,
    required this.nombre,
    required this.nombreCorto,
    required this.nivel,
    required this.estado,
    required this.titulo,
    required this.lat,
    required this.lon,
    required this.radioActualM,
    required this.creadaEn,
    required this.expiraEn,
    this.descripcion,
    this.referencia,
    this.fotoPath,
    this.publicadaEn,
    this.verificadaEn,
    this.cerradaEn,
    this.motivoCierre,
    this.validadaPor,
    this.instrucciones,
    this.nConfirmo = 0,
    this.nYaNoEsta = 0,
    this.nPareceFalsa = 0,
    this.miConfirmacion,
    this.esMia = false,
    // Solo en el panel de validadores
    this.folio911,
    this.consentimiento = false,
    this.radioManualM,
    this.autorReputacion,
    this.autorRol,
    this.autorInstitucion,
    this.nEntregas,
    this.nTelegram,
  });

  final String id;
  final String categoria;
  final String nombre;
  final String nombreCorto;
  final int nivel;
  final EstadoAlerta estado;
  final String titulo;
  final String? descripcion;
  final String? referencia;
  final String? fotoPath;
  final double lat;
  final double lon;
  final int radioActualM;
  final DateTime creadaEn;
  final DateTime? publicadaEn;
  final DateTime? verificadaEn;
  final DateTime? cerradaEn;
  final DateTime expiraEn;
  final String? motivoCierre;

  /// Institución que la validó ("Protección Civil Municipal").
  final String? validadaPor;
  final String? instrucciones;
  final int nConfirmo;
  final int nYaNoEsta;
  final int nPareceFalsa;

  /// 'confirmo' | 'ya_no_esta' | 'parece_falsa' si el usuario ya votó.
  final String? miConfirmacion;
  final bool esMia;

  final String? folio911;
  final bool consentimiento;
  final int? radioManualM;
  final int? autorReputacion;
  final String? autorRol;
  final String? autorInstitucion;
  final int? nEntregas;
  final int? nTelegram;

  /// Radio que se dibuja en el mapa.
  int get radioVisibleM => radioActualM > 0 ? radioActualM : (radioManualM ?? 0);

  static DateTime? _fecha(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

  static int _entero(Object? v) => v == null ? 0 : (v as num).toInt();

  factory Alerta.desdeMapa(Map<String, dynamic> m) {
    final cat = m['categorias'] as Map<String, dynamic>?; // si viene con join
    return Alerta(
      id: m['id'] as String,
      categoria: m['categoria'] as String,
      nombre: (m['nombre'] ?? cat?['nombre'] ?? m['categoria']) as String,
      nombreCorto: (m['nombre_corto'] ?? cat?['nombre_corto'] ?? m['nombre'] ?? m['categoria']) as String,
      nivel: _entero(m['nivel'] ?? cat?['nivel'] ?? 2),
      estado: EstadoAlerta.desde(m['estado'] as String?),
      titulo: m['titulo'] as String,
      descripcion: m['descripcion'] as String?,
      referencia: m['referencia'] as String?,
      fotoPath: m['foto_path'] as String?,
      lat: (m['lat'] as num).toDouble(),
      lon: (m['lon'] as num).toDouble(),
      radioActualM: _entero(m['radio_actual_m']),
      creadaEn: _fecha(m['creada_en'])!,
      publicadaEn: _fecha(m['publicada_en']),
      verificadaEn: _fecha(m['verificada_en']),
      cerradaEn: _fecha(m['cerrada_en']),
      expiraEn: _fecha(m['expira_en']) ?? DateTime.now().add(const Duration(hours: 6)),
      motivoCierre: m['motivo_cierre'] as String?,
      validadaPor: (m['validada_por'] ?? m['validador_institucion']) as String?,
      instrucciones: (m['instrucciones'] ?? cat?['instrucciones']) as String?,
      nConfirmo: _entero(m['n_confirmo']),
      nYaNoEsta: _entero(m['n_ya_no_esta']),
      nPareceFalsa: _entero(m['n_parece_falsa']),
      miConfirmacion: m['mi_confirmacion'] as String?,
      esMia: (m['es_mia'] as bool?) ?? false,
      folio911: m['folio_911'] as String?,
      consentimiento: (m['consentimiento'] as bool?) ?? false,
      radioManualM: (m['radio_manual_m'] as num?)?.toInt(),
      autorReputacion: (m['autor_reputacion'] as num?)?.toInt(),
      autorRol: m['autor_rol'] as String?,
      autorInstitucion: m['autor_institucion'] as String?,
      nEntregas: (m['n_entregas'] as num?)?.toInt(),
      nTelegram: (m['n_telegram'] as num?)?.toInt(),
    );
  }

  Alerta copiar({
    EstadoAlerta? estado,
    int? radioActualM,
    int? radioManualM,
    DateTime? publicadaEn,
    DateTime? verificadaEn,
    DateTime? cerradaEn,
    String? motivoCierre,
    String? validadaPor,
    int? nConfirmo,
    int? nYaNoEsta,
    int? nPareceFalsa,
    String? miConfirmacion,
    int? nEntregas,
    String? fotoPath,
    bool quitarFoto = false,
  }) => Alerta(
    id: id,
    categoria: categoria,
    nombre: nombre,
    nombreCorto: nombreCorto,
    nivel: nivel,
    estado: estado ?? this.estado,
    titulo: titulo,
    descripcion: descripcion,
    referencia: referencia,
    fotoPath: quitarFoto ? null : (fotoPath ?? this.fotoPath),
    lat: lat,
    lon: lon,
    radioActualM: radioActualM ?? this.radioActualM,
    creadaEn: creadaEn,
    publicadaEn: publicadaEn ?? this.publicadaEn,
    verificadaEn: verificadaEn ?? this.verificadaEn,
    cerradaEn: cerradaEn ?? this.cerradaEn,
    expiraEn: expiraEn,
    motivoCierre: motivoCierre ?? this.motivoCierre,
    validadaPor: validadaPor ?? this.validadaPor,
    instrucciones: instrucciones,
    nConfirmo: nConfirmo ?? this.nConfirmo,
    nYaNoEsta: nYaNoEsta ?? this.nYaNoEsta,
    nPareceFalsa: nPareceFalsa ?? this.nPareceFalsa,
    miConfirmacion: miConfirmacion ?? this.miConfirmacion,
    esMia: esMia,
    folio911: folio911,
    consentimiento: consentimiento,
    radioManualM: radioManualM ?? this.radioManualM,
    autorReputacion: autorReputacion,
    autorRol: autorRol,
    autorInstitucion: autorInstitucion,
    nEntregas: nEntregas ?? this.nEntregas,
    nTelegram: nTelegram,
  );
}

/// Respuesta de `crear_reporte`.
class ResultadoReporte {
  const ResultadoReporte({this.alertaId, this.estado, this.duplicadaDe});

  factory ResultadoReporte.desdeMapa(Map<String, dynamic> m) => ResultadoReporte(
    alertaId: m['alerta_id'] as String?,
    estado: m['estado'] == null ? null : EstadoAlerta.desde(m['estado'] as String),
    duplicadaDe: m['duplicada_de'] as String?,
  );

  final String? alertaId;
  final EstadoAlerta? estado;
  final String? duplicadaDe;

  bool get esDuplicado => duplicadaDe != null;

  /// Mensaje para la persona que reportó (textos del paso 2.8).
  String get mensaje {
    if (esDuplicado) return 'Ya había un reporte igual cerca. Sumamos tu confirmación.';
    return switch (estado) {
      EstadoAlerta.pendiente =>
        'Tu reporte está en revisión. Si ningún validador lo revisa en 5 minutos, o si alguien más '
            'reporta lo mismo cerca, se publicará solo a 1 km a la redonda.',
      EstadoAlerta.verificada => 'Alerta oficial publicada. Avisamos a las personas cercanas.',
      _ => 'Reporte publicado. Avisamos a las personas cercanas.',
    };
  }
}

enum TipoConfirmacion {
  confirmo('confirmo', 'Yo también lo vi'),
  yaNoEsta('ya_no_esta', 'Ya no está'),
  pareceFalsa('parece_falsa', 'Parece falsa');

  const TipoConfirmacion(this.clave, this.texto);
  final String clave;
  final String texto;
}

enum AccionValidador {
  verificar('verificar', 'Verificar'),
  descartar('descartar', 'Descartar'),
  resolver('resolver', 'Resolver'),
  ajustarRadio('ajustar_radio', 'Ajustar radio');

  const AccionValidador(this.clave, this.texto);
  final String clave;
  final String texto;
}

enum Rol {
  ciudadano('ciudadano'),
  validador('validador'),
  institucion('institucion'),
  admin('admin');

  const Rol(this.clave);
  final String clave;

  static Rol desde(String? c) => values.firstWhere((r) => r.clave == c, orElse: () => Rol.ciudadano);

  bool get esValidador => this != ciudadano;
}

class Perfil {
  const Perfil({
    required this.id,
    required this.rol,
    required this.esAnonimo,
    this.nombre,
    this.institucion,
    this.reputacion = 0,
    this.telefono,
    this.correo,
  });

  final String id;
  final Rol rol;
  final bool esAnonimo;
  final String? nombre;
  final String? institucion;
  final int reputacion;
  final String? telefono;
  final String? correo;

  bool get puedeReportar => !esAnonimo;
}

class NuevoReporte {
  const NuevoReporte({
    required this.categoria,
    required this.titulo,
    required this.lat,
    required this.lon,
    this.descripcion,
    this.referencia,
    this.fotoPath,
    this.folio911,
    this.consentimiento = false,
  });

  final String categoria;
  final String titulo;
  final String? descripcion;
  final String? referencia;
  final double lat;
  final double lon;
  final String? fotoPath;
  final String? folio911;
  final bool consentimiento;
}

class Zona {
  const Zona({required this.id, required this.nombre, required this.celda});

  factory Zona.desdeMapa(Map<String, dynamic> m) =>
      Zona(id: m['id'] as String, nombre: m['nombre'] as String, celda: m['celda'] as String);

  final String id;
  final String nombre;
  final String celda;
}

class Metricas {
  const Metricas({this.activas = 0, this.porValidar = 0, this.segundosValidacion, this.entregasHoy = 0});

  factory Metricas.desdeMapa(Map<String, dynamic> m) => Metricas(
    activas: (m['activas'] as num?)?.toInt() ?? 0,
    porValidar: (m['por_validar'] as num?)?.toInt() ?? 0,
    segundosValidacion: (m['segundos_validacion'] as num?)?.toInt(),
    entregasHoy: (m['entregas_hoy'] as num?)?.toInt() ?? 0,
  );

  final int activas;
  final int porValidar;
  final int? segundosValidacion;
  final int entregasHoy;
}

class EntradaBitacora {
  const EntradaBitacora({required this.accion, required this.creadaEn, this.usuarioId, this.detalle = const {}});

  factory EntradaBitacora.desdeMapa(Map<String, dynamic> m) => EntradaBitacora(
    accion: m['accion'] as String,
    creadaEn: DateTime.parse(m['creada_en'] as String).toLocal(),
    usuarioId: m['usuario_id'] as String?,
    detalle: (m['detalle'] as Map<String, dynamic>?) ?? const {},
  );

  final String accion;
  final DateTime creadaEn;
  final String? usuarioId;
  final Map<String, dynamic> detalle;

  String get descripcion => switch (accion) {
    'reportar' => 'Reporte ciudadano creado',
    'emitir_oficial' => 'Alerta oficial emitida',
    'verificar' => 'Verificada por un validador',
    'descartar' => 'Descartada${_motivo()}',
    'resolver' => 'Resuelta${_motivo()}',
    'ajustar_radio' => 'Radio ajustado a ${detalle['radio_m']} m',
    'corroborar_auto' => 'Corroborada por la colmena (${detalle['confirmaciones'] ?? 3} vecinos)',
    'publicar_auto' => 'Publicada por la colmena: nadie la revisó en ${detalle['minutos_sin_revision'] ?? 5} min',
    'publicar_colmena' => 'Publicada por la colmena: otra persona reportó lo mismo',
    'revision_por_votos' => 'Regresó a revisión por votos de "parece falsa"',
    'expirar' => 'Expiró',
    _ => accion,
  };

  String _motivo() {
    final m = detalle['motivo'];
    return m == null ? '' : ': $m';
  }
}
