import 'dart:math' as math;

/// Distancia en metros entre dos puntos (fórmula de haversine, radio medio de la Tierra).
/// Igual a `Geolocator.distanceBetween` para las distancias que maneja la app.
double distanciaMetros(double lat1, double lon1, double lat2, double lon2) {
  const r = 6371008.8;
  final dLat = _rad(lat2 - lat1);
  final dLon = _rad(lon2 - lon1);
  final a =
      math.pow(math.sin(dLat / 2), 2) + math.cos(_rad(lat1)) * math.cos(_rad(lat2)) * math.pow(math.sin(dLon / 2), 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}

double _rad(double grados) => grados * math.pi / 180;

/// "450 m", "1.2 km", "76 km".
String formatoDistancia(double metros) {
  if (metros < 1000) return '${((metros / 10).round() * 10).clamp(10, 990)} m';
  if (metros < 10000) return '${(metros / 1000).toStringAsFixed(1)} km';
  return '${(metros / 1000).round()} km';
}

/// "1 km", "2.5 km", "800 m" para radios.
String formatoRadio(int metros) {
  if (metros < 1000) return '$metros m';
  final km = metros / 1000;
  return km == km.roundToDouble() ? '${km.round()} km' : '${km.toStringAsFixed(1)} km';
}
