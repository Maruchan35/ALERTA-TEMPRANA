import 'modelos.dart';

/// Espejo de la función SQL `radio_permitido()` (para el modo demostración y para
/// explicar el radio en la interfaz). El servidor es quien decide de verdad.
///
/// Escalones de la categoría según los minutos desde la publicación (multiplicados por
/// el factor de tiempo de la demo) y un tope por confianza: no confirmada → tope de la
/// categoría (1 km); corroborada → 3 km; verificada → todos los escalones.
int radioPermitido({
  required Categoria categoria,
  required EstadoAlerta estado,
  required DateTime? publicadaEn,
  required DateTime ahora,
  int? radioManualM,
  double factorTiempo = 1,
}) {
  if (!estado.activa) return 0;
  if (radioManualM != null) return radioManualM;
  if (publicadaEn == null) return 0;
  final minutos = ahora.difference(publicadaEn).inMilliseconds / 60000 * factorTiempo;
  var radio = 0;
  for (final e in categoria.escalones) {
    if (e.minuto <= minutos && e.radioM > radio) radio = e.radioM;
  }
  final tope = switch (estado) {
    EstadoAlerta.noConfirmada => categoria.radioMaxNoConfM,
    EstadoAlerta.corroborada => 3000,
    _ => 1000000,
  };
  return radio < tope ? radio : tope;
}

/// Siguiente escalón: "crece a 3 km en 12 min" (null si ya llegó al máximo).
({int radioM, Duration falta})? siguienteEscalon({
  required Categoria categoria,
  required EstadoAlerta estado,
  required DateTime? publicadaEn,
  required DateTime ahora,
  int? radioManualM,
  double factorTiempo = 1,
}) {
  if (!estado.activa || publicadaEn == null || radioManualM != null) return null;
  final tope = switch (estado) {
    EstadoAlerta.noConfirmada => categoria.radioMaxNoConfM,
    EstadoAlerta.corroborada => 3000,
    _ => 1000000,
  };
  final minutos = ahora.difference(publicadaEn).inMilliseconds / 60000 * factorTiempo;
  for (final e in categoria.escalones) {
    if (e.minuto > minutos && e.radioM <= tope) {
      final faltaMin = (e.minuto - minutos) / factorTiempo;
      return (radioM: e.radioM, falta: Duration(milliseconds: (faltaMin * 60000).round()));
    }
  }
  return null;
}
