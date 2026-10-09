// Pruebas del asistente para reportar por WhatsApp (migración 013). El puente entrega cada mensaje de
// una persona a whatsapp_recibido(); el servidor lleva la conversación y, al confirmar, crea la alerta
// con las reglas de la app. Ejecutar:  cd supabase/pruebas && npm test
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno } from './entorno.mjs';

const SECRETO_PUENTE = 'secreto-del-puente-de-prueba-0123456789abcdef';
// Números de prueba (no son de personas reales)
const CEL = '525512345001';
const OTRO = '525512345002';

let env;
before(async () => { env = await crearEntorno(); });
beforeEach(async () => { await env.limpiar(); });

/** Un mensaje de una persona, como lo entrega el puente. Devuelve la respuesta del asistente. */
async function escribe(telefono, texto = null, ubic = null) {
  const [fila] = await env.rpc(null, 'whatsapp_recibido', {
    p_secreto: SECRETO_PUENTE,
    p_telefono: telefono,
    p_texto: texto,
    p_lat: ubic?.lat ?? null,
    p_lon: ubic?.lon ?? null,
  });
  return fila.whatsapp_recibido;
}

/** Un reporte completo: menú, categoría, ubicación, sin frase y confirmar. Devuelve la última respuesta. */
async function reportarCompleto(telefono, categoria, ubic) {
  await escribe(telefono, 'menu');
  await escribe(telefono, categoria);
  await escribe(telefono, null, ubic);
  await escribe(telefono, '0');
  return escribe(telefono, '1');
}

const alertas = () => env.sql(`select id, categoria, titulo, estado, origen, creada_por, lat, lon, referencia, descripcion
                               from alertas order by creada_en`);

test('asistente: solo el puente, con su secreto y un teléfono válido, puede entregarle mensajes', async () => {
  await assert.rejects(env.rpc(null, 'whatsapp_recibido', {
    p_secreto: 'otro-secreto-de-mas-de-32-caracteres-xx', p_telefono: CEL, p_texto: 'hola',
  }), /No autorizado/);
  await assert.rejects(env.rpc(null, 'whatsapp_recibido', {
    p_secreto: SECRETO_PUENTE, p_telefono: 'no-es-telefono', p_texto: 'hola',
  }), /Teléfono inválido/);
});

test('asistente: una persona reporta un robo con el menú, su ubicación y una frase; la alerta queda lista para la app', async () => {
  const inicio = await escribe(CEL, 'hola');
  assert.match(inicio.respuesta, /911/, 'primero, si hay peligro, llamar al 911');
  assert.match(inicio.respuesta, /1 Robo de vehículo/);
  assert.equal(inicio.paso, 'categoria');

  assert.match((await escribe(CEL, '1')).respuesta, /Dónde pasó/);
  assert.equal((await escribe(CEL, null, { lat: 17.96, lon: -102.2 })).paso, 'descripcion', 'mandó su ubicación con el clip');
  const resumen = await escribe(CEL, '0');
  assert.match(resumen.respuesta, /Tipo: Robo de vehículo/);
  assert.match(resumen.respuesta, /Lugar: ubicación enviada/);

  const enviada = await escribe(CEL, '1');
  const [a] = await alertas();
  assert.match(enviada.respuesta, new RegExp(`folio AC-${a.id.slice(0, 8).toUpperCase()}`), 'el folio es el de la app');
  assert.equal(a.categoria, 'robo_vehiculo');
  assert.equal(a.estado, 'no_confirmada', 'entra igual que un reporte de la app');
  assert.equal(a.origen, 'whatsapp');
  assert.equal(a.creada_por, null, 'el número no queda ligado a la alerta');
  assert.equal(a.titulo, 'Robo de vehículo: lugar en el mapa');
  assert.equal(a.lat, 17.96);
  assert.equal(a.lon, -102.2);

  assert.deepEqual(await env.sql(`select count(*)::int as n from privado.conversaciones_whatsapp`), [{ n: 0 }],
    'al enviar se borra la conversación');
  assert.deepEqual(await env.sql(`select count(*)::int as n from privado.mensajes_whatsapp
                                   where telefono = $1 and modo = 'puente' and estado = 'pendiente'`, [CEL]),
    [{ n: 5 }], 'cada respuesta sale por la cola del puente');
});

test('asistente: sin ubicación, escribe la calle (queda aproximada); una persona desaparecida va a revisión', async () => {
  await escribe(CEL, 'menu');
  await escribe(CEL, '6');
  const lugar = await escribe(CEL, 'Calle Hidalgo y Colón');
  assert.match(lugar.respuesta, /aproximado/);
  await escribe(CEL, 'Lleva playera azul');
  await escribe(CEL, '1');

  const [a] = await alertas();
  assert.equal(a.categoria, 'persona_desaparecida');
  assert.equal(a.estado, 'pendiente', 'personas desaparecidas: primero las revisa el CCE');
  assert.equal(a.lat, 17.9581, 'sin ubicación exacta se marca en el centro de la ciudad');
  assert.equal(a.lon, -102.1942);
  assert.equal(a.referencia, 'Calle Hidalgo y Colón');
  assert.equal(a.descripcion, 'Lleva playera azul');
});

test('asistente: respuestas claras ante lo que no entiende; las fotos se explican; "2" empieza de nuevo', async () => {
  assert.equal((await escribe(CEL, 'hola')).paso, 'categoria');
  assert.match((await escribe(CEL, 'abc')).respuesta, /Escriba solo el número/);
  assert.match((await escribe(CEL, '[multimedia]')).respuesta, /Todavía no recibo fotos/);
  assert.equal((await escribe(CEL, '3')).paso, 'lugar');
  assert.match((await escribe(CEL, 'ahí en la esquina')).respuesta, /aproximado/);
  assert.equal((await escribe(CEL, '0')).paso, 'confirmar');
  const otra = await escribe(CEL, '2');
  assert.equal(otra.paso, 'categoria', 'empezar de nuevo vuelve al menú');
  assert.match(otra.respuesta, /Elija el número/);
  assert.match((await escribe(CEL, '9')).respuesta, /Escriba solo el número/);
  assert.deepEqual(await alertas(), [], 'nada se creó mientras tanto');
});

test('asistente: un reporte igual cerca se suma (no crea otro); cada número puede reportar 3 veces por hora', async () => {
  await reportarCompleto(CEL, '1', { lat: 17.96, lon: -102.2 });
  const dup = await reportarCompleto(OTRO, '1', { lat: 17.9602, lon: -102.2001 }); // unos 25 m: el mismo
  assert.match(dup.respuesta, /Ya hay un reporte igual/);
  assert.equal((await alertas()).length, 1, 'el duplicado no crea otra alerta');

  await reportarCompleto(CEL, '2', { lat: 17.90, lon: -102.20 });
  await reportarCompleto(CEL, '3', { lat: 17.85, lon: -102.20 });
  const cuarto = await reportarCompleto(CEL, '4', { lat: 17.80, lon: -102.20 });
  assert.match(cuarto.respuesta, /Ya envió 3 reportes/);
  assert.equal((await alertas()).length, 3, 'el cuarto reporte del mismo número no se crea');
});

test('asistente: quien escribe demasiado en una hora deja de recibir respuestas, en silencio', async () => {
  await env.sql(`update config set mensajes_whatsapp_por_hora = 5`);
  for (let i = 0; i < 5; i++) await escribe(CEL, 'hola');
  assert.deepEqual(await escribe(CEL, 'hola'), { ignorado: true });
  assert.deepEqual(await env.sql(`select count(*)::int as n from privado.mensajes_whatsapp where telefono = $1`, [CEL]),
    [{ n: 5 }], 'el mensaje ignorado no recibe respuesta');
});

test('asistente: la conversación caduca a las 2 h y los datos privados se borran al día', async () => {
  await escribe(CEL, 'hola');
  await escribe(CEL, '1');
  await env.sql(`update privado.conversaciones_whatsapp set actualizado_en = now() - interval '3 hours'`);
  const retomada = await escribe(CEL, '2');
  assert.equal(retomada.paso, 'categoria', 'después de 2 h sin escribir, empieza de nuevo');
  assert.match(retomada.respuesta, /Hola/);

  await env.sql(`update privado.mensajes_entrantes_whatsapp set recibido_en = now() - interval '2 days'`);
  await env.sql(`update privado.conversaciones_whatsapp set actualizado_en = now() - interval '2 days'`);
  await env.sql(`select limpieza_diaria()`);
  assert.deepEqual(await env.sql(`select
      (select count(*)::int from privado.mensajes_entrantes_whatsapp) as entrantes,
      (select count(*)::int from privado.conversaciones_whatsapp) as conversaciones`),
    [{ entrantes: 0, conversaciones: 0 }]);
});

test('asistente: el reporte aparece en la app (alertas cercanas) igual que los de la app', async () => {
  await reportarCompleto(CEL, '1', { lat: 17.96, lon: -102.2 });
  const [a] = await alertas();
  const celda = await env.celda({ lat: 17.96, lon: -102.2 });
  // Como en la app: con la sesión anónima que se abre al instalarla
  const persona = await env.crearUsuario({ anonimo: true });
  const cercanas = await env.rpc(persona, 'alertas_cercanas', { p_celda: celda, p_radio_m: 25000 });
  assert.ok(cercanas.some((f) => f.id === a.id), 'la app lo lista como una alerta cercana');
});

test('asistente: la alerta no guarda el número de quien reporta', async () => {
  await reportarCompleto(CEL, '5', { lat: 17.96, lon: -102.2 });
  const columnas = await env.sql(`select column_name from information_schema.columns
                                  where table_schema = 'public' and table_name = 'alertas' and column_name ilike '%telefono%'`);
  assert.deepEqual(columnas, []);
  const [a] = await env.sql(`select * from alertas`);
  assert.ok(!JSON.stringify(a).includes(CEL), 'el número no aparece en la alerta');
  assert.equal(a.creada_por, null);
  assert.deepEqual(await env.sql(`select accion, usuario_id from bitacora`), [{ accion: 'reportar_whatsapp', usuario_id: null }]);
});

test('asistente: la función que crea reportes no se puede llamar desde la app ni la web; las instituciones no se reportan así', async () => {
  await assert.rejects(env.rpc(null, 'reportar_por_whatsapp', {
    p_telefono: CEL, p_categoria: 'robo_vehiculo', p_lat: 17.9, p_lon: -102.2, p_lugar: null, p_descripcion: null,
  }), /permission denied/);
  await assert.rejects(env.sql(`select reportar_por_whatsapp($1, 'evacuacion', 17.9, -102.2, null, null)`, [CEL]),
    /no se puede reportar por WhatsApp/);
});

test('asistente: las opciones son encuestas que se tocan; un toque cuenta como elegir el número', async () => {
  await escribe(CEL, 'hola');
  const encuestaActual = async () => (await env.sql(
    `select encuesta from privado.mensajes_whatsapp where telefono = $1 order by id desc limit 1`, [CEL]))[0].encuesta;

  const categorias = await encuestaActual();
  assert.equal(categorias.pregunta, '¿Qué pasó?');
  assert.equal(categorias.opciones.length, 7);
  assert.equal(categorias.valores[0], 'categoria:1');

  assert.match((await escribe(CEL, 'categoria:1')).respuesta, /Dónde pasó/);
  assert.equal(await encuestaActual(), null, 'en el paso del lugar no hay encuesta: la ubicación va con el clip');
  // Un toque de una encuesta vieja (la de confirmar) no envía nada: se repite el paso actual
  const viejo = await escribe(CEL, 'confirmar:1');
  assert.equal(viejo.paso, 'lugar');
  assert.match(viejo.respuesta, /Dónde pasó/);
  assert.deepEqual(await alertas(), [], 'nada se creó con el toque viejo');

  await escribe(CEL, null, { lat: 17.96, lon: -102.2 });
  assert.deepEqual((await encuestaActual()).valores, ['descripcion:escribir', 'descripcion:0']);
  assert.match((await escribe(CEL, 'descripcion:escribir')).respuesta, /Escriba su frase/);
  assert.equal(await encuestaActual(), null, 'si va a escribir, no se manda encuesta');

  assert.equal((await escribe(CEL, 'descripcion:0')).paso, 'confirmar');
  assert.deepEqual((await encuestaActual()).valores, ['confirmar:1', 'confirmar:2']);
  await escribe(CEL, 'confirmar:1');
  assert.equal((await alertas()).length, 1, 'el toque "Sí, enviar" crea el reporte');
});

test('asistente: el puente recibe la encuesta junto con el texto de la respuesta', async () => {
  await escribe(CEL, 'hola');
  const [fila] = await env.rpc(null, 'whatsapp_pendientes', { p_secreto: SECRETO_PUENTE, p_limite: 5 });
  assert.match(fila.texto, /911/);
  assert.equal(fila.encuesta.opciones[0], 'Robo de vehículo');
  assert.equal(fila.encuesta.valores[6], 'categoria:7');
});

test('asistente: con respuesta inmediata el puente envía al instante y la cola solo reintenta si se cae', async () => {
  const pedir = (telefono) => env.rpc(null, 'whatsapp_recibido', {
    p_secreto: SECRETO_PUENTE, p_telefono: telefono, p_texto: 'hola', p_inmediato: true,
  }).then((f) => f[0].whatsapp_recibido);
  const tomar = () => env.rpc(null, 'whatsapp_pendientes', { p_secreto: SECRETO_PUENTE, p_limite: 5 });

  const r = await pedir(CEL);
  assert.ok(r.mensaje_id, 'devuelve el id para marcarlo como enviado');
  assert.match(r.respuesta, /911/);
  assert.equal(r.encuesta.opciones.length, 7, 'devuelve la encuesta: el puente no necesita pedirla otra vez');
  assert.deepEqual(await env.sql(`select estado, intentos from privado.mensajes_whatsapp where id = $1`, [r.mensaje_id]),
    [{ estado: 'enviando', intentos: 1 }]);
  assert.deepEqual(await tomar(), [], 'la cola no la toma mientras quien la pidió la está enviando');
  await env.rpc(null, 'whatsapp_resultado', { p_secreto: SECRETO_PUENTE, p_id: r.mensaje_id, p_ok: true });
  assert.deepEqual(await env.sql(`select estado from privado.mensajes_whatsapp where id = $1`, [r.mensaje_id]),
    [{ estado: 'enviado' }]);

  // Si el puente se cae antes de enviarla, al minuto la cola la reintenta
  const s = await pedir(OTRO);
  await env.sql(`update privado.mensajes_whatsapp set actualizado_en = now() - interval '2 minutes' where id = $1`, [s.mensaje_id]);
  const [reintento] = await tomar();
  assert.equal(reintento.id, s.mensaje_id);
  assert.equal(reintento.telefono, OTRO);
});

test('asistente: sin respuesta inmediata (puente anterior) todo sigue como antes: queda pendiente', async () => {
  await escribe(CEL, 'hola');
  assert.deepEqual(await env.sql(`select estado, intentos from privado.mensajes_whatsapp where telefono = $1`, [CEL]),
    [{ estado: 'pendiente', intentos: 0 }]);
});

test('asistente: el paso del lugar explica el clip en tres pasos', async () => {
  await escribe(CEL, 'hola');
  const lugar = (await escribe(CEL, '1')).respuesta;
  assert.match(lugar, /Toque el clip/);
  assert.match(lugar, /Elija «Ubicación»/);
  assert.match(lugar, /Enviar ubicación/);
  assert.match(lugar, /escriba la calle y la colonia/);
});

test('puente: el latido se escribe como máximo cada 10 segundos, no en cada consulta de la cola', async () => {
  const tomar = () => env.rpc(null, 'whatsapp_pendientes', { p_secreto: SECRETO_PUENTE, p_limite: 5 });
  const segundos = async () => (await env.sql(
    `select extract(epoch from now() - latido_en)::int as seg from privado.puente_whatsapp`))[0].seg;
  await env.sql(`update privado.puente_whatsapp set latido_en = now() - interval '1 hour'`);
  await tomar();
  assert.ok(await segundos() < 5, 'la primera consulta lo actualiza');
  await env.sql(`update privado.puente_whatsapp set latido_en = now() - interval '4 seconds'`);
  await tomar();
  assert.ok(await segundos() >= 4, 'una consulta a los 4 s no vuelve a escribir');
});
