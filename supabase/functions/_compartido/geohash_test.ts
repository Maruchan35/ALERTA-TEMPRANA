import { assertAlmostEquals, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { centroDeGeohash, esCeldaValida, geohash } from './geohash.ts';

Deno.test('geohash coincide con PostGIS y con la tabla de la demo', () => {
  assertEquals(geohash(17.9581, -102.1942), '9epq4t'); // suceso: centro de Lázaro Cárdenas
  assertEquals(geohash(17.9608, -102.1942), '9epq4t'); // A · 300 m
  assertEquals(geohash(17.9815, -102.1942), '9epq69'); // B · 2.6 km
  assertEquals(geohash(18.0121, -102.1942), '9epq6x'); // C · 6 km
  assertEquals(geohash(17.6417, -101.5517), '9epu35'); // D · Zihuatanejo
});

Deno.test('geohash respeta la precisión pedida', () => {
  assertEquals(geohash(17.9581, -102.1942, 4), '9epq');
  assertEquals(geohash(17.9581, -102.1942, 9).slice(0, 6), '9epq4t');
});

Deno.test('el centro de la celda queda dentro de ella y cerca del punto (~700 m como máximo)', () => {
  const c = centroDeGeohash('9epq4t');
  assertEquals(geohash(c.lat, c.lon), '9epq4t');
  assertAlmostEquals(c.lat, 17.9581, 0.006);
  assertAlmostEquals(c.lon, -102.1942, 0.006);
  assertThrows(() => centroDeGeohash('9epq4a'));
});

Deno.test('esCeldaValida', () => {
  assertEquals(esCeldaValida('9epq4t'), true);
  assertEquals(esCeldaValida('9epq4'), false);
  assertEquals(esCeldaValida('9epqia'), false); // i y a no existen en base32 de geohash
});
