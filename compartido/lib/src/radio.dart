import 'modelos.dart';

/// Umbrales de la "colmena": espejo de las columnas de `config` (007_colmena.sql).
/// En el servidor se ajustan sin programar; aquí se usan los valores por defecto.
class ReglasColmena {
  const ReglasColmena({
    this.minutosEsperaValidador = 5,
    this.confirmacionesCorroborar = 3,
    this.confirmacionesColmena = 6,
    this.radioMaxCorroboradaM = 3000,
    this.radioMaxColmenaM = 10000,
  });

  /// Sin revisión de un validador en este tiempo, el reporte en revisión se publica solo.
  final int minutosEsperaValidador;

  /// "Lo confirmo" necesarios para pasar a CORROBORADA.
  final int confirmacionesCorroborar;

  /// "Lo confirmo" para el alcance de colmena (tope [radioMaxColmenaM]).
  final int confirmacionesColmena;
  final int radioMaxCorroboradaM;
  final int radioMaxColmenaM;

  /// Tope del radio según la confianza: no confirmada → tope de la categoría (1 km);
  /// corroborada → 3 km, o 10 km con 6 o más confirmaciones; verificada → sin tope.
  int tope(Categoria categoria, EstadoAlerta estado, int nConfirmo) => switch (estado) {
    EstadoAlerta.noConfirmada => categoria.radioMaxNoConfM,
    EstadoAlerta.corroborada => nConfirmo >= confirmacionesColmena ? radioMaxColmenaM : radioMaxCorroboradaM,
    _ => 1000000,
  };
}

const reglasColmena = ReglasColmena();

/// Espejo de la función SQL `radio_permitido()` (para el modo demostración y para
/// explicar el radio en la interfaz). El servidor es quien decide de verdad.
///
/// Escalones de la categoría según los minutos desde la publicación (multiplicados por
/// el factor de tiempo de la demo) y un tope por confianza ([ReglasColmena.tope]).
int radioPermitido({
  required Categoria categoria,
  required EstadoAlerta estado,
  required DateTime? publicadaEn,
  required DateTime ahora,
  int? radioManualM,
  double factorTiempo = 1,
  int nConfirmo = 0,
  ReglasColmena reglas = reglasColmena,
}) {
  if (!estado.activa) return 0;
  if (radioManualM != null) return radioManualM;
  if (publicadaEn == null) return 0;
  final minutos = ahora.difference(publicadaEn).inMilliseconds / 60000 * factorTiempo;
  var radio = 0;
  for (final e in categoria.escalones) {
    if (e.minuto <= minutos && e.radioM > radio) radio = e.radioM;
  }
  final tope = reglas.tope(categoria, estado, nConfirmo);
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
  int nConfirmo = 0,
  ReglasColmena reglas = reglasColmena,
}) {
  if (!estado.activa || publicadaEn == null || radioManualM != null) return null;
  final tope = reglas.tope(categoria, estado, nConfirmo);
  final minutos = ahora.difference(publicadaEn).inMilliseconds / 60000 * factorTiempo;
  for (final e in categoria.escalones) {
    if (e.minuto > minutos && e.radioM <= tope) {
      final faltaMin = (e.minuto - minutos) / factorTiempo;
      return (radioM: e.radioM, falta: Duration(milliseconds: (faltaMin * 60000).round()));
    }
  }
  return null;
}
