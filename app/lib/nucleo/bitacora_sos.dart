import 'dart:async';
import 'dart:convert';
import 'dart:io' show Directory, File;
import 'dart:math' as math;

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import 'copia_evidencia.dart';

/// Huella SHA-256 y tamaño de un archivo recién grabado (corre en otro hilo con `compute`).
({String sha256, int bytes}) huellaArchivo(String ruta) {
  final datos = File(ruta).readAsBytesSync();
  return (sha256: crypto.sha256.convert(datos).toString(), bytes: datos.length);
}

/// Un fragmento grabado durante el SOS, con la huella que se le sacó al terminar de grabarlo.
class ArchivoSos {
  const ArchivoSos({
    required this.nombre,
    required this.tipo,
    required this.inicio,
    required this.duracionS,
    required this.bytes,
    required this.sha256,
    this.uri,
  });

  factory ArchivoSos.desdeJson(Map<String, dynamic> m) => ArchivoSos(
    nombre: m['nombre'] as String,
    tipo: m['tipo'] as String,
    inicio: DateTime.parse(m['inicio'] as String),
    duracionS: (m['duracion_s'] as num).toInt(),
    bytes: (m['bytes'] as num).toInt(),
    sha256: m['sha256'] as String,
    uri: m['uri'] as String?,
  );

  /// Como quedó en el teléfono, p. ej. "14.03.12 video.mp4".
  final String nombre;
  final String tipo; // video | audio
  final DateTime inicio;
  final int duracionS;
  final int bytes;
  final String sha256;

  /// La copia en el teléfono; null si no se guardó (copia apagada o sin espacio).
  final String? uri;

  Map<String, dynamic> aJson() => {
    'nombre': nombre,
    'tipo': tipo,
    'inicio': inicio.toIso8601String(),
    'duracion_s': duracionS,
    'bytes': bytes,
    'sha256': sha256,
    'uri': uri,
  };
}

/// BITÁCORA de una emergencia, guardada SOLO en el teléfono (en la carpeta privada de la app). Con
/// ella la app arma la constancia para la denuncia aunque el servidor ya haya borrado la emergencia
/// (30 días después del cierre).
class BitacoraSos {
  BitacoraSos({required this.id, required this.inicio, required this.origen, String? carpeta, this.retomada = false})
    : carpeta = carpeta ?? 'SOS ${DateFormat('yyyy-MM-dd HH.mm.ss').format(inicio)}';

  factory BitacoraSos.desdeJson(Map<String, dynamic> m) {
    DateTime? fecha(Object? v) => v == null ? null : DateTime.parse(v as String);
    double? numero(Object? v) => (v as num?)?.toDouble();
    return BitacoraSos(
        id: m['id'] as String,
        inicio: DateTime.parse(m['inicio'] as String),
        origen: OrigenEmergencia.desde(m['origen'] as String?),
        carpeta: m['carpeta'] as String?,
        retomada: m['retomada'] as bool? ?? false,
      )
      ..lat = numero(m['lat'])
      ..lon = numero(m['lon'])
      ..precisionM = numero(m['precision_m'])
      ..ultimaLat = numero(m['ultima_lat'])
      ..ultimaLon = numero(m['ultima_lon'])
      ..ultimaEn = fecha(m['ultima_en'])
      ..senales = (m['senales'] as num?)?.toInt() ?? 0
      ..tipo = TipoEmergencia.desde(m['tipo'] as String?)
      ..fin = fecha(m['fin'])
      ..cierre = m['cierre'] as String?
      ..constanciaUri = m['constancia_uri'] as String?
      ..eventos.addAll([
        for (final e in m['eventos'] as List? ?? const [])
          (hora: DateTime.parse((e as Map)['hora'] as String), texto: e['texto'] as String),
      ])
      ..archivos.addAll([
        for (final a in m['archivos'] as List? ?? const []) ArchivoSos.desdeJson((a as Map).cast<String, dynamic>()),
      ]);
  }

  final String id;
  final DateTime inicio;
  final OrigenEmergencia origen;

  /// Descargas/ALERTA CERCA/[carpeta]: "SOS 2026-10-08 14.03.05" (sin ":", para poder copiarla a una USB).
  final String carpeta;

  /// La app se cerró a media emergencia y la retomó después: no sabe exactamente cuándo empezó.
  final bool retomada;

  /// Dónde estaba al pedir ayuda.
  double? lat, lon, precisionM;

  /// La última ubicación que llegó al servidor.
  double? ultimaLat, ultimaLon;
  DateTime? ultimaEn;
  int senales = 0;
  TipoEmergencia tipo = TipoEmergencia.sos;
  final eventos = <({DateTime hora, String texto})>[];
  final archivos = <ArchivoSos>[];
  DateTime? fin;
  String? cierre;

  /// La constancia que se dejó en la carpeta (se reescribe en el mismo archivo).
  String? constanciaUri;

  void anotar(String texto, [DateTime? hora]) => eventos.add((hora: hora ?? DateTime.now(), texto: texto));

  Map<String, dynamic> aJson() => {
    'id': id,
    'inicio': inicio.toIso8601String(),
    'origen': origen.clave,
    'carpeta': carpeta,
    'retomada': retomada,
    'lat': lat,
    'lon': lon,
    'precision_m': precisionM,
    'ultima_lat': ultimaLat,
    'ultima_lon': ultimaLon,
    'ultima_en': ultimaEn?.toIso8601String(),
    'senales': senales,
    'tipo': tipo.clave,
    'fin': fin?.toIso8601String(),
    'cierre': cierre,
    'constancia_uri': constanciaUri,
    'eventos': [
      for (final e in eventos) {'hora': e.hora.toIso8601String(), 'texto': e.texto},
    ],
    'archivos': [for (final a in archivos) a.aJson()],
  };
}

/// Las bitácoras viven en la carpeta privada de la app: no salen del teléfono, no se ven con la app
/// de Archivos y se borran al desinstalarla.
abstract final class Bitacoras {
  /// La carpeta privada de la app. Las pruebas la cambian (null: la bitácora solo vive en memoria).
  @visibleForTesting
  static Future<Directory?> Function() carpetaBase = () async =>
      Directory('${(await getApplicationSupportDirectory()).path}/sos');

  static Future<Directory?> _carpeta() async {
    if (kIsWeb) return null;
    try {
      final d = await carpetaBase();
      if (d != null && !await d.exists()) await d.create(recursive: true);
      return d;
    } catch (_) {
      return null;
    }
  }

  /// Siempre se escribe el estado más reciente y de una vez (son pocos KB): un fragmento y una señal
  /// que llegan al mismo tiempo no se mezclan. Va aparte y luego se renombra: quien la lea nunca ve
  /// un archivo a medias.
  static Future<void> guardar(BitacoraSos b) async {
    try {
      final d = await _carpeta();
      if (d == null) return;
      File('${d.path}/${b.id}.json.tmp')
        ..writeAsStringSync(jsonEncode(b.aJson()), flush: true)
        ..renameSync('${d.path}/${b.id}.json');
    } catch (e) {
      debugPrint('Bitácora del SOS: $e');
    }
  }

  static Future<BitacoraSos?> leer(String id) async {
    final d = await _carpeta();
    final f = d == null ? null : File('${d.path}/$id.json');
    if (f == null || !await f.exists()) return null;
    try {
      return BitacoraSos.desdeJson(jsonDecode(await f.readAsString()) as Map<String, dynamic>);
    } catch (e) {
      debugPrint('Bitácora del SOS: $e');
      return null;
    }
  }

  static Future<List<BitacoraSos>> todas() async {
    final d = await _carpeta();
    if (d == null) return const [];
    final lista = <BitacoraSos>[];
    await for (final f in d.list()) {
      if (f is! File || !f.path.endsWith('.json')) continue;
      try {
        lista.add(BitacoraSos.desdeJson(jsonDecode(await f.readAsString()) as Map<String, dynamic>));
      } catch (_) {}
    }
    return lista;
  }
}

/// Una emergencia en "Mis evidencias": lo que hay en el teléfono y, si sigue, su bitácora.
class GrupoEvidencia {
  const GrupoEvidencia({required this.carpeta, required this.archivos, this.bitacora, this.constancia});

  final String carpeta;

  /// Videos y audios, en el orden en que se grabaron.
  final List<ArchivoGuardado> archivos;
  final BitacoraSos? bitacora;
  final ArchivoGuardado? constancia;

  /// Cuándo empezó: lo sabe la bitácora; si no, el nombre de la carpeta.
  DateTime get inicio =>
      bitacora?.inicio ??
      fechaDeCarpeta(carpeta) ??
      (archivos.isEmpty ? DateTime(2000) : archivos.map((a) => a.fecha).reduce((a, b) => a.isBefore(b) ? a : b));

  int get videos => archivos.where((a) => a.esVideo).length;
  int get audios => archivos.where((a) => a.esAudio).length;
  int get bytes => archivos.fold(0, (s, a) => s + a.bytes);
}

/// "SOS 2026-10-08 14.03.05" → la fecha (hora local).
DateTime? fechaDeCarpeta(String carpeta) {
  final m = RegExp(r'^SOS (\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})').firstMatch(carpeta);
  if (m == null) return null;
  final n = [for (var i = 1; i <= 6; i++) int.parse(m[i]!)];
  return DateTime(n[0], n[1], n[2], n[3], n[4], n[5]);
}

/// Agrupa por emergencia lo que hay en el teléfono (las más recientes primero). Incluye las que
/// tienen bitácora aunque no haya copia en el teléfono: su constancia se puede compartir igual.
List<GrupoEvidencia> agruparEvidencias(List<ArchivoGuardado> archivos, List<BitacoraSos> bitacoras) {
  final porCarpeta = <String, List<ArchivoGuardado>>{};
  for (final a in archivos) {
    if (a.carpeta.startsWith('SOS ')) porCarpeta.putIfAbsent(a.carpeta, () => []).add(a);
  }
  final bitacoraDe = {for (final b in bitacoras) b.carpeta: b};
  final grupos = <GrupoEvidencia>[];
  for (final carpeta in {...porCarpeta.keys, ...bitacoraDe.keys}) {
    final todos = porCarpeta[carpeta] ?? const <ArchivoGuardado>[];
    final b = bitacoraDe[carpeta];
    final grabado = {for (final a in b?.archivos ?? const <ArchivoSos>[]) a.nombre: a.inicio};
    final evidencia = todos.where((a) => !a.esConstancia).toList()
      ..sort((x, y) => (grabado[x.nombre] ?? x.fecha).compareTo(grabado[y.nombre] ?? y.fecha));
    grupos.add(
      GrupoEvidencia(
        carpeta: carpeta,
        archivos: evidencia,
        bitacora: b,
        constancia: todos.where((a) => a.esConstancia).firstOrNull,
      ),
    );
  }
  grupos.sort((a, b) => b.inicio.compareTo(a.inicio));
  return grupos;
}

String tamanoLegible(int bytes) => bytes >= 1024 * 1024
    ? '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB'
    : '${math.max(1, (bytes / 1024).round())} KB';

String _coordenadas(double lat, double lon) => '${lat.toStringAsFixed(6)}, ${lon.toStringAsFixed(6)}';

/// CONSTANCIA para la denuncia: qué pasó, cuándo, dónde, y la huella SHA-256 de cada archivo.
///
/// [enTelefono]: lo que hay ahora en la carpeta y [huellas] (uri → SHA-256) su huella de este
/// momento, para revisar que no cambió; null al cerrar la emergencia (recién grabado).
/// [enServidor]: huella → hora en que el servidor la registró (mientras conserve la emergencia).
String constanciaSos({
  required String carpeta,
  BitacoraSos? bitacora,
  List<ArchivoGuardado>? enTelefono,
  Map<String, String> huellas = const {},
  Map<String, DateTime> enServidor = const {},
  required DateTime ahora,
}) {
  final fecha = DateFormat('dd/MM/yyyy HH:mm:ss');
  final hora = DateFormat('HH:mm:ss');
  final b = bitacora;
  final s = StringBuffer()
    ..writeln('ALERTA CERCA · CONSTANCIA DE EVIDENCIA (SOS)')
    ..writeln('Generada por la app en el teléfono el ${fecha.format(ahora)}.')
    ..writeln();

  if (b == null) {
    s
      ..writeln(
        'Este teléfono ya no tiene el registro de la emergencia (¿se reinstaló la app?). Se listan los archivos de la carpeta con su huella de este momento.',
      )
      ..writeln();
  } else {
    s
      ..writeln('EMERGENCIA')
      ..writeln('Identificador: ${b.id}')
      ..writeln(
        b.retomada
            ? 'Inicio: no registrado en el teléfono (la app retomó la emergencia el ${fecha.format(b.inicio)})'
            : 'Inicio: ${fecha.format(b.inicio)} · ${b.origen.texto}',
      );
    if (b.tipo != TipoEmergencia.sos) s.writeln('Lo que indicó la persona: ${b.tipo.enPrimeraPersona}');
    if (b.lat != null && b.lon != null) {
      final precision = b.precisionM == null ? '' : ' (± ${b.precisionM!.round()} m)';
      s
        ..writeln('Ubicación al pedir ayuda: ${_coordenadas(b.lat!, b.lon!)}$precision')
        ..writeln('  ${enlaceMapa(b.lat!, b.lon!)}');
    }
    if (b.ultimaLat != null && b.ultimaLon != null && b.ultimaEn != null) {
      s
        ..writeln(
          'Última ubicación enviada: ${_coordenadas(b.ultimaLat!, b.ultimaLon!)} a las ${hora.format(b.ultimaEn!)}',
        )
        ..writeln('  ${enlaceMapa(b.ultimaLat!, b.ultimaLon!)}');
    }
    if (b.senales > 0) s.writeln('Señales de ubicación enviadas: ${b.senales}');
    s.writeln(
      b.fin == null ? 'Fin: no registrado en el teléfono' : 'Fin: ${fecha.format(b.fin!)} · ${b.cierre ?? 'cerrada'}',
    );
    if (b.eventos.isNotEmpty) {
      s
        ..writeln()
        ..writeln('LO QUE PASÓ');
      for (final e in b.eventos) {
        s.writeln('${hora.format(e.hora)}  ${e.texto}');
      }
    }
    s.writeln();
  }

  s.writeln('ARCHIVOS (Descargas/ALERTA CERCA/$carpeta)');
  final sinRegistro = {
    for (final a in enTelefono ?? const <ArchivoGuardado>[])
      if (!a.esConstancia) a.nombre: a,
  };
  var n = 0;
  for (final r in b?.archivos ?? const <ArchivoSos>[]) {
    n++;
    final copia = sinRegistro.remove(r.nombre);
    s
      ..writeln(
        '$n. ${r.nombre} · grabado a las ${hora.format(r.inicio)} · ${r.duracionS} s · ${tamanoLegible(r.bytes)}',
      )
      ..writeln('   SHA-256 al grabarlo: ${r.sha256}');
    final registrada = enServidor[r.sha256];
    if (registrada != null) s.writeln('   El servidor la registró a las ${hora.format(registrada)}.');
    if (r.uri == null) {
      s.writeln('   Sin copia en el teléfono (solo se subió al servidor).');
    } else if (enTelefono != null) {
      final actual = copia == null ? null : huellas[copia.uri];
      s.writeln(switch ((copia, actual)) {
        (null, _) => '   Ya no está en la carpeta (se borró o se movió).',
        (_, null) => '   No se pudo leer para revisarlo.',
        (_, final h?) when h == r.sha256 => '   Revisado ahora: coincide; el archivo no ha cambiado.',
        (_, final h?) => '   Revisado ahora: NO COINCIDE (SHA-256 actual: $h). El archivo cambió después de grabarlo.',
      });
    }
  }
  // En la carpeta pero sin registro en este teléfono (p. ej. después de reinstalar la app)
  for (final a in sinRegistro.values.toList()..sort((x, y) => x.nombre.compareTo(y.nombre))) {
    n++;
    s.writeln('$n. ${a.nombre} · ${tamanoLegible(a.bytes)}');
    final actual = huellas[a.uri];
    if (actual == null) continue;
    final registrada = enServidor[actual];
    s
      ..writeln('   SHA-256: $actual')
      ..writeln(
        registrada == null
            ? '   Sin huella de referencia en este teléfono.'
            : '   Coincide con la huella que el servidor registró a las ${hora.format(registrada)}.',
      );
  }
  if (n == 0) s.writeln('No hay video ni audio de esta emergencia en el teléfono.');

  return (s
        ..writeln()
        ..writeln('CÓMO COMPROBAR QUE NO SE EDITARON')
        ..writeln(
          'La huella SHA-256 de cada archivo se calculó en el teléfono al terminar de grabarlo y se registró en el '
          'servidor de ALERTA CERCA, con la hora, durante la emergencia. Si alguien recorta, edita o vuelve a '
          'comprimir un archivo, su huella cambia. Para calcularla en una computadora:',
        )
        ..writeln('  Windows:   certutil -hashfile "nombre del archivo" SHA256')
        ..writeln('  Mac/Linux: shasum -a 256 "nombre del archivo"')
        ..writeln(
          'El servidor conserva su copia y estos registros hasta 30 días después del cierre de la emergencia. '
          'Entrega los archivos tal como están, sin editarlos.',
        )
        ..writeln()
        ..writeln('ALERTA CERCA no sustituye al 911 ni a la denuncia ante el Ministerio Público.'))
      .toString();
}
