/// Geohash: mismo algoritmo que PostGIS (`ST_GeoHash`) y que las Edge Functions.
/// `geohash(17.9581, -102.1942) == '9epq4t'`. Con 6 caracteres cada celda mide
/// ~1.2 × 0.6 km: es lo ÚNICO que el servidor sabe de la ubicación de un teléfono.
library;

const _base32 = '0123456789bcdefghjkmnpqrstuvwxyz';

String geohash(double lat, double lon, [int precision = 6]) {
  var latMin = -90.0, latMax = 90.0, lonMin = -180.0, lonMax = 180.0;
  final sb = StringBuffer();
  var bit = 0, ch = 0;
  var esLon = true;
  while (sb.length < precision) {
    if (esLon) {
      final mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        lonMin = mid;
      } else {
        ch = ch << 1;
        lonMax = mid;
      }
    } else {
      final mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    esLon = !esLon;
    if (++bit == 5) {
      sb.write(_base32[ch]);
      bit = 0;
      ch = 0;
    }
  }
  return sb.toString();
}

/// Centro de una celda geohash como `(lat, lon)`.
(double, double) centroDeGeohash(String celda) {
  var latMin = -90.0, latMax = 90.0, lonMin = -180.0, lonMax = 180.0;
  var esLon = true;
  for (final c in celda.toLowerCase().split('')) {
    final valor = _base32.indexOf(c);
    if (valor < 0) throw FormatException('Carácter inválido en geohash: $c');
    for (var b = 4; b >= 0; b--) {
      final activo = (valor >> b) & 1 == 1;
      if (esLon) {
        final mid = (lonMin + lonMax) / 2;
        if (activo) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        final mid = (latMin + latMax) / 2;
        if (activo) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      esLon = !esLon;
    }
  }
  return ((latMin + latMax) / 2, (lonMin + lonMax) / 2);
}

bool esCeldaValida(String celda) => RegExp(r'^[0-9b-hjkmnp-z]{6}$').hasMatch(celda);
