// Geohash: mismo algoritmo que PostGIS (ST_GeoHash) y que la app (lib/geohash.dart).
// geohash(17.9581, -102.1942) === '9epq4t'. Con 6 caracteres cada celda mide ~1.2 × 0.6 km.
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohash(lat: number, lon: number, precision = 6): string {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let s = '', bit = 0, ch = 0, esLon = true;
  while (s.length < precision) {
    if (esLon) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        lonMin = mid;
      } else {
        ch <<= 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch <<= 1;
        latMax = mid;
      }
    }
    esLon = !esLon;
    if (++bit === 5) {
      s += B32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return s;
}

/** Centro de una celda geohash (lo único que el servidor sabe de un teléfono). */
export function centroDeGeohash(celda: string): { lat: number; lon: number } {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let esLon = true;
  for (const c of celda.toLowerCase()) {
    const valor = B32.indexOf(c);
    if (valor < 0) throw new Error(`Carácter inválido en geohash: ${c}`);
    for (let b = 4; b >= 0; b--) {
      const bitActivo = (valor >> b) & 1;
      if (esLon) {
        const mid = (lonMin + lonMax) / 2;
        if (bitActivo) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitActivo) latMin = mid;
        else latMax = mid;
      }
      esLon = !esLon;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

export const esCeldaValida = (celda: string) => /^[0-9b-hjkmnp-z]{6}$/.test(celda);
