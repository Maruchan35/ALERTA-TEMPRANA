import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getAggregateVotesInPollMessage } from 'baileys';
import {
  candidatosJid, ClienteSupabase, entradaDeMensaje, formatoCodigo, leerConfig, oculto, telefonoDeJid, valorElegido,
} from './lib.mjs';

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

test('telefonoDeJid: quita el sufijo del dispositivo y el 1 de los celulares de México', () => {
  assert.equal(telefonoDeJid('5217551234567@s.whatsapp.net'), '527551234567');
  assert.equal(telefonoDeJid('527551234567@s.whatsapp.net'), '527551234567');
  assert.equal(telefonoDeJid('527551234567:12@s.whatsapp.net'), '527551234567');
  assert.equal(telefonoDeJid('123456@lid'), null, 'un identificador interno no es un teléfono');
  assert.equal(telefonoDeJid(undefined), null);
});

test('entradaDeMensaje: texto, ubicación y foto de una persona; ignora grupos, mensajes propios y reacciones', () => {
  const de = (remoteJid, message, extra = {}) => ({ key: { remoteJid, fromMe: false, id: 'x', ...extra }, message });
  assert.deepEqual(entradaDeMensaje(de('527551234567@s.whatsapp.net', { conversation: ' hola ' })),
    { telefono: '527551234567', texto: 'hola', lat: null, lon: null });
  assert.deepEqual(entradaDeMensaje(de('527551234567@s.whatsapp.net',
    { locationMessage: { degreesLatitude: 17.96, degreesLongitude: -102.2 } })),
    { telefono: '527551234567', texto: null, lat: 17.96, lon: -102.2 });
  assert.equal(entradaDeMensaje(de('527551234567@s.whatsapp.net', { imageMessage: {} })).texto, '[multimedia]');
  // Con la dirección interna (@lid), el teléfono viene en remoteJidAlt
  assert.equal(entradaDeMensaje(de('98765@lid', { conversation: 'hola' },
    { remoteJidAlt: '5217551234567@s.whatsapp.net' })).telefono, '527551234567');
  assert.equal(entradaDeMensaje(de('98765@lid', { conversation: 'hola' })), null, 'sin teléfono no se puede contestar');
  assert.equal(entradaDeMensaje(de('120363@g.us', { conversation: 'hola' })), null, 'los grupos no');
  assert.equal(entradaDeMensaje(de('527551234567@s.whatsapp.net', { reactionMessage: {} })), null);
  assert.equal(entradaDeMensaje({ key: { remoteJid: '527551234567@s.whatsapp.net', fromMe: true },
    message: { conversation: 'x' } }), null);
  // Un mensaje temporal se lee por dentro
  assert.equal(entradaDeMensaje(de('527551234567@s.whatsapp.net',
    { ephemeralMessage: { message: { conversation: 'hola' } } })).texto, 'hola');
});

test('recibido: entrega el mensaje al servidor con el secreto del puente', async () => {
  let enviado;
  const cliente = new ClienteSupabase({ url: 'https://x.supabase.co', llave: 'k', secreto: SECRETO },
    async (url, opciones) => {
      enviado = { url, cuerpo: JSON.parse(opciones.body) };
      return { ok: true, text: async () => '{"respuesta":"Hola"}' };
    });
  const respuesta = await cliente.recibido({ telefono: '527551234567', texto: 'hola', lat: null, lon: null });
  assert.match(enviado.url, /rpc\/whatsapp_recibido$/);
  assert.equal(enviado.cuerpo.p_secreto, SECRETO);
  assert.equal(enviado.cuerpo.p_telefono, '527551234567');
  assert.equal(enviado.cuerpo.p_texto, 'hola');
  assert.deepEqual(respuesta, { respuesta: 'Hola' });
});

test('valorElegido: la opción tocada se convierte en el valor del paso', () => {
  const opciones = ['Robo', 'Incendio'];
  const valores = ['categoria:1', 'categoria:3'];
  assert.equal(valorElegido([{ name: 'Robo', voters: [] }, { name: 'Incendio', voters: ['5217551234567@s.whatsapp.net'] }],
    opciones, valores), 'categoria:3');
  assert.equal(valorElegido([{ name: 'Robo', voters: [] }, { name: 'Incendio', voters: [] }], opciones, valores), null,
    'sin toque no hay respuesta');
  assert.equal(valorElegido([{ name: 'Otra', voters: ['5217551234567@s.whatsapp.net'] }], opciones, valores), null,
    'una opción desconocida no cuenta');
});

test('getAggregateVotesInPollMessage de Baileys + valorElegido: el toque cifrado llega como la opción correcta', () => {
  // Así guarda Baileys las opciones (sha256 del nombre) y así llega el voto ya descifrado
  const hash = (texto) => createHash('sha256').update(Buffer.from(texto)).digest();
  const encuesta = { pollCreationMessageV3: { options: [{ optionName: 'Robo' }, { optionName: 'Incendio' }] } };
  const votos = getAggregateVotesInPollMessage({
    message: encuesta,
    pollUpdates: [{
      pollUpdateMessageKey: { remoteJid: '5217551234567@s.whatsapp.net', fromMe: false, id: 'voto-1' },
      vote: { selectedOptions: [hash('Incendio')] },
    }],
  }, '5210000000000@s.whatsapp.net');
  assert.equal(valorElegido(votos, ['Robo', 'Incendio'], ['categoria:1', 'categoria:3']), 'categoria:3');
});
