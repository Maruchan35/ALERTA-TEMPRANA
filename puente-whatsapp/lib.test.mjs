import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatosJid, ClienteSupabase, formatoCodigo, leerConfig, oculto } from './lib.mjs';

const SECRETO = 'x'.repeat(40);

test('leerConfig exige URL, llave y un secreto largo, y tiene valores por defecto', () => {
  assert.throws(() => leerConfig({}), /SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SECRETO_PUENTE/);
  assert.throws(() => leerConfig({ SUPABASE_URL: 'u', SUPABASE_PUBLISHABLE_KEY: 'k', SECRETO_PUENTE: 'corto' }),
    /32 caracteres/);
  assert.deepEqual(leerConfig({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'k', SECRETO_PUENTE: SECRETO }), {
    url: 'https://x.supabase.co', llave: 'k', secreto: SECRETO, numero: null, activar: true, intervaloMs: 2000,
  });
  const c = leerConfig({
    SUPABASE_URL: 'u', SUPABASE_PUBLISHABLE_KEY: 'k', SECRETO_PUENTE: SECRETO,
    WHATSAPP_NUMERO: '+52 755 123 4567', ACTIVAR_AL_CONECTAR: 'NO', INTERVALO_MS: '100',
  });
  assert.equal(c.numero, '527551234567');
  assert.equal(c.activar, false);
  assert.equal(c.intervaloMs, 2000, 'menos de medio segundo no se permite');
});

test('candidatosJid: celulares de México con 52 y con 521', () => {
  assert.deepEqual(candidatosJid('527551234567'), ['527551234567', '5217551234567']);
  assert.deepEqual(candidatosJid('+52 1 755 123 4567'), ['5217551234567', '527551234567']);
  assert.deepEqual(candidatosJid('14155550123'), ['14155550123']);
  assert.deepEqual(candidatosJid(''), []);
});

test('oculto y formatoCodigo', () => {
  assert.equal(oculto('527551234567'), '•••• 4567');
  assert.equal(formatoCodigo('ABCD1234'), 'ABCD-1234');
});

test('ClienteSupabase llama las funciones del servidor con la llave y el secreto', async () => {
  const llamadas = [];
  const respuestas = [[{ id: 7, telefono: '527551234567', texto: 'código 123456' }], null, 'puente'];
  const fetchFalso = (url, init) => {
    llamadas.push({ url, headers: init.headers, cuerpo: JSON.parse(init.body) });
    return Promise.resolve(new Response(JSON.stringify(respuestas.shift())));
  };
  const s = new ClienteSupabase({ url: 'https://x.supabase.co', llave: 'sb_publishable_1', secreto: SECRETO }, fetchFalso);
  assert.deepEqual(await s.pendientes(3), [{ id: 7, telefono: '527551234567', texto: 'código 123456' }]);
  await s.resultado(7, true);
  assert.equal(await s.latido('527550000000', true, true), 'puente');
  assert.deepEqual(llamadas.map((l) => l.url), [
    'https://x.supabase.co/rest/v1/rpc/whatsapp_pendientes',
    'https://x.supabase.co/rest/v1/rpc/whatsapp_resultado',
    'https://x.supabase.co/rest/v1/rpc/whatsapp_latido',
  ]);
  assert.equal(llamadas[0].headers.apikey, 'sb_publishable_1');
  assert.deepEqual(llamadas[0].cuerpo, { p_secreto: SECRETO, p_limite: 3 });
  assert.deepEqual(llamadas[1].cuerpo, { p_secreto: SECRETO, p_id: 7, p_ok: true, p_error: null });
  assert.deepEqual(llamadas[2].cuerpo,
    { p_secreto: SECRETO, p_numero: '527550000000', p_conectado: true, p_activar: true });
});

test('ClienteSupabase explica cuando el secreto no coincide', async () => {
  const rechazo = () => Promise.resolve(new Response('{"message":"No autorizado"}', { status: 401 }));
  const s = new ClienteSupabase({ url: 'u', llave: 'k', secreto: SECRETO }, rechazo);
  await assert.rejects(s.pendientes(), /SECRETO_PUENTE no coincide/);
});
