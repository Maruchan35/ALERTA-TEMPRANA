import 'modelos.dart';

/// Espejo en Dart de `datosPush()` de la Edge Function `notificar`
/// (supabase/functions/_compartido/mensajes.ts). Lo usa el modo demostración para que
/// sus avisos tengan EXACTAMENTE el formato del push real (contrato de la sección 7.2).
Map<String, String> datosPush(Alerta a, String tipo, {int? radioM, String? institucion}) {
  final corto = a.nombreCorto;
  final datos = <String, String>{
    'tipo': tipo,
    'alerta_id': a.id,
    'categoria': a.categoria,
    'nivel': '${a.nivel}',
    'estado': a.estado.clave,
    'titulo': corto.toUpperCase(),
    'cuerpo': a.titulo,
    'lat': '${a.lat}',
    'lon': '${a.lon}',
    'radio_m': '${radioM ?? a.radioActualM}',
    'foto': a.fotoPath != null ? '1' : '0',
  };
  switch (tipo) {
    case 'actualizacion':
      datos['titulo'] = 'AHORA ${a.estado.legible.toUpperCase()}';
      datos['cuerpo'] = a.estado == EstadoAlerta.verificada
          ? '$corto: ${institucion ?? 'una institución'} confirmó el reporte.'
          : '$corto: 3 o más vecinos confirmaron el reporte.';
    case 'cierre':
      if (a.estado == EstadoAlerta.resuelta) {
        datos['titulo'] = 'RESUELTA';
        datos['cuerpo'] = '${_conPunto(a.motivoCierre ?? 'El caso fue resuelto')} Gracias por tu ayuda.';
      } else {
        datos['titulo'] = 'DESCARTADA';
        datos['cuerpo'] = 'La información no pudo confirmarse.';
      }
    case 'validacion':
      datos['titulo'] = 'POR VALIDAR · ${corto.toUpperCase()}';
      datos['cuerpo'] = a.titulo;
  }
  return datos;
}

String _conPunto(String s) => RegExp(r'[.!?¡¿…]$').hasMatch(s.trim()) ? s.trim() : '${s.trim()}.';

/// Cuerpo de la notificación de una alerta nueva, con la distancia calculada EN EL
/// TELÉFONO: "A 450 m de ti · Verificada · Niño de 8 años, playera roja".
String cuerpoConDistancia({required String distancia, required String estado, required String cuerpo}) =>
    'A $distancia de ti · ${EstadoAlerta.desde(estado).legible} · $cuerpo';
