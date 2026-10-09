import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'proteccion.dart';
import 'ubicacion.dart';

/// Un archivo de evidencia guardado en el teléfono (Descargas/ALERTA CERCA/[carpeta]/[nombre]).
class ArchivoGuardado {
  const ArchivoGuardado({
    required this.uri,
    required this.nombre,
    required this.carpeta,
    required this.mime,
    required this.bytes,
    required this.fecha,
  });

  factory ArchivoGuardado.desdeMapa(Map<Object?, Object?> m) => ArchivoGuardado(
    uri: m['uri'] as String,
    nombre: m['nombre'] as String? ?? '',
    carpeta: m['carpeta'] as String? ?? '',
    mime: m['mime'] as String? ?? 'application/octet-stream',
    bytes: (m['bytes'] as num?)?.toInt() ?? 0,
    fecha: DateTime.fromMillisecondsSinceEpoch((m['fecha'] as num?)?.toInt() ?? 0),
  );

  final String uri;
  final String nombre;

  /// La carpeta de la emergencia, p. ej. "SOS 2026-10-08 14.03.05".
  final String carpeta;
  final String mime;
  final int bytes;
  final DateTime fecha;

  bool get esVideo => mime.startsWith('video/');
  bool get esAudio => mime.startsWith('audio/');
  bool get esConstancia => nombre.startsWith('constancia');
}

/// COPIA DE LA EVIDENCIA DEL SOS EN EL TELÉFONO, para presentarla en una denuncia: el servidor borra
/// la suya 30 días después del cierre. Puente con CopiaEvidencia.kt. Solo Android: en la web, en iOS
/// y en las pruebas responde "no disponible" sin fallar.
abstract final class CopiaEvidencia {
  static const _canal = MethodChannel('alerta_cerca/evidencia');

  /// Dónde la encuentra la persona (con la app de Archivos o en la galería).
  static const ubicacion = 'Descargas › ALERTA CERCA';
  static const nombreConstancia = 'constancia.txt';

  static bool get disponible => Proteccion.disponible;

  static Future<T?> _llamar<T>(String metodo, [Object? argumentos]) async {
    if (!disponible) return null;
    try {
      return await _canal.invokeMethod<T>(metodo, argumentos);
    } on MissingPluginException {
      return null;
    } on PlatformException catch (e) {
      debugPrint('Copia de evidencia: $metodo falló: ${e.message}');
      return null;
    }
  }

  /// Copia un fragmento recién grabado a la carpeta de su emergencia. Devuelve el uri y el nombre con
  /// el que quedó, o null si no se pudo (sin espacio, sin permiso en Android 9…): el SOS sigue igual.
  static Future<({String uri, String nombre})?> guardar(
    String ruta, {
    required String carpeta,
    required String nombre,
    required String mime,
  }) async => _comoArchivo(
    await _llamar<Map<Object?, Object?>>('guardar', {'ruta': ruta, 'carpeta': carpeta, 'nombre': nombre, 'mime': mime}),
  );

  /// Guarda (o reescribe, si [reemplazar] es de esta instalación) un texto en la carpeta.
  static Future<({String uri, String nombre})?> guardarTexto(
    String texto, {
    required String carpeta,
    String nombre = nombreConstancia,
    String? reemplazar,
  }) async => _comoArchivo(
    await _llamar<Map<Object?, Object?>>('guardarTexto', {
      'texto': texto,
      'carpeta': carpeta,
      'nombre': nombre,
      'reemplazar': reemplazar,
    }),
  );

  static ({String uri, String nombre})? _comoArchivo(Map<Object?, Object?>? m) =>
      m == null ? null : (uri: m['uri'] as String, nombre: m['nombre'] as String);

  /// Todo lo que hay en Descargas/ALERTA CERCA: lo de esta instalación siempre; lo de antes de
  /// reinstalar la app, solo con el permiso de leer videos y audios.
  static Future<List<ArchivoGuardado>> listar() async {
    final lista = await _llamar<List<Object?>>('listar');
    return [
      for (final m in lista ?? const <Object?>[])
        if (m is Map<Object?, Object?>) ArchivoGuardado.desdeMapa(m),
    ];
  }

  /// Huella SHA-256 del archivo tal como está ahora.
  static Future<String?> huella(String uri) => _llamar<String>('huella', {'uri': uri});

  static Future<bool> compartir(List<String> uris, String titulo) async =>
      await _llamar<bool>('compartir', {'uris': uris, 'titulo': titulo}) ?? false;

  static Future<bool> abrir(ArchivoGuardado a) async =>
      await _llamar<bool>('abrir', {'uri': a.uri, 'mime': a.mime}) ?? false;

  /// Permiso de leer (y en Android 9 o menos, de guardar) en el almacenamiento.
  static Future<bool> permiso() async => await _llamar<bool>('permiso') ?? false;

  /// Si Android ya no muestra la pregunta (se negó antes), abre los ajustes de la app.
  static Future<bool> pedirPermiso() async {
    if (!disponible) return false;
    final antes = DateTime.now();
    final si = await _llamar<bool>('pedirPermiso') ?? false;
    if (!si && DateTime.now().difference(antes) < const Duration(milliseconds: 400)) {
      try {
        await Ubicacion.abrirAjustes();
      } catch (_) {}
    }
    return si;
  }

  /// Android 10+ guarda sin permiso; Android 9 o menos lo necesita.
  static Future<bool> puedeGuardar() async => await _llamar<bool>('puedeGuardar') ?? false;
}
