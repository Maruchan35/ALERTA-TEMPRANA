import 'package:intl/intl.dart';

import 'modelos.dart';

/// "ahora", "hace 3 min", "hace 2 h", "hace 3 días".
String haceCuanto(DateTime fecha, {DateTime? ahora}) {
  final d = (ahora ?? DateTime.now()).difference(fecha);
  if (d.inSeconds < 60) return 'ahora';
  if (d.inMinutes < 60) return 'hace ${d.inMinutes} min';
  if (d.inHours < 24) return 'hace ${d.inHours} h';
  final dias = d.inDays;
  return dias == 1 ? 'hace 1 día' : 'hace $dias días';
}

/// "en 12 min", "en 45 s".
String dentroDe(Duration d) {
  if (d.inSeconds < 60) return 'en ${d.inSeconds.clamp(1, 59)} s';
  if (d.inMinutes < 60) return 'en ${d.inMinutes} min';
  return 'en ${d.inHours} h ${d.inMinutes % 60} min';
}

String fechaHora(DateTime fecha) => DateFormat('dd/MM HH:mm').format(fecha.toLocal());

String duracionLegible(int segundos) {
  if (segundos < 60) return '$segundos s';
  if (segundos < 3600) return '${(segundos / 60).round()} min';
  return '${(segundos / 3600).toStringAsFixed(1)} h';
}

/// Texto de "Compartir con contexto" (paso 3.8): fecha, hora y estado, para que no
/// circule como si fuera oficial.
String textoParaCompartir(Alerta a) {
  final b = StringBuffer()
    ..writeln('[ALERTA CERCA] ${a.nombreCorto.toUpperCase()} (${a.estado.legible.toLowerCase()})')
    ..writeln('${fechaHora(a.creadaEn)} · ${a.titulo}');
  if (a.referencia != null && a.referencia!.isNotEmpty) b.writeln(a.referencia);
  if (a.estado == EstadoAlerta.resuelta) b.writeln('ESTE CASO YA SE RESOLVIÓ. ${a.motivoCierre ?? ''}'.trim());
  b
    ..writeln('Mapa: https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=17/${a.lat}/${a.lon}')
    ..write('Verifica antes de reenviar. En una emergencia, llama al 911.');
  return b.toString();
}
