import { assertEquals } from 'jsr:@std/assert@1';
import { autorizado, igualesSeguro } from './seguridad.ts';

const pedir = (encabezados: Record<string, string>) =>
  new Request('https://x/functions/v1/notificar', { method: 'POST', headers: encabezados });
const entorno = { secreto: 'secreto-largo-123', llaveServicio: 'llave-servicio' };

Deno.test('igualesSeguro', () => {
  assertEquals(igualesSeguro('abc', 'abc'), true);
  assertEquals(igualesSeguro('abc', 'abd'), false);
  assertEquals(igualesSeguro('abc', 'abcd'), false);
  assertEquals(igualesSeguro('', ''), true);
});

Deno.test('autorizado: acepta el secreto de pg_net o la service_role, y nada más', () => {
  assertEquals(autorizado(pedir({ 'x-alerta-secreto': 'secreto-largo-123' }), entorno), true);
  assertEquals(autorizado(pedir({ authorization: 'Bearer llave-servicio' }), entorno), true);
  assertEquals(autorizado(pedir({ 'x-alerta-secreto': 'otro' }), entorno), false);
  assertEquals(autorizado(pedir({ authorization: 'Bearer anon-key-publica' }), entorno), false);
  assertEquals(autorizado(pedir({}), entorno), false);
  assertEquals(autorizado(pedir({ 'x-alerta-secreto': '' }), { secreto: '', llaveServicio: '' }), false);
});
