// Pruebas del backend de ALERTA CERCA. Cubren el plan de pruebas de la propuesta
// (P01–P14 y P19) más las reglas de confianza, privacidad y seguridad.
// Ejecutar:  cd supabase/pruebas && npm install && npm test
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, PUNTOS } from './entorno.mjs';

const SECRETO_PUENTE = 'secreto-del-puente-de-prueba-0123456789abcdef';

let env;
before(async () => { env = await crearEntorno(); });
beforeEach(async () => { await env.limpiar(); });

const TABLAS = ['alertas', 'bitacora', 'categorias', 'confirmaciones', 'config', 'dispositivos',
  'entregas', 'entregas_telegram', 'escalones_radio', 'perfiles', 'suscriptores_telegram', 'zonas_usuario'];

async function telefonosDemo() {
  return {
    A: await env.telefonoEn(PUNTOS.A, 'A'),
    B: await env.telefonoEn(PUNTOS.B, 'B'),
    C: await env.telefonoEn(PUNTOS.C, 'C'),
    D: await env.telefonoEn(PUNTOS.D, 'D'),
  };
}

// ─── Esquema y catálogo ─────────────────────────────────────────────────────

test('el esquema tiene las 12 tablas, todas con RLS, y el catálogo completo', async () => {
  const tablas = await env.sql(`
    select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  assert.deepEqual(tablas.map((t) => t.relname).sort(), [...TABLAS].sort());
  assert.ok(tablas.every((t) => t.relrowsecurity), 'todas las tablas deben tener RLS');
  const [{ n }] = await env.sql(`select count(*)::int as n from categorias`);
  assert.equal(n, 12);
  const [{ e }] = await env.sql(`select count(*)::int as e from escalones_radio`);
  assert.equal(e, 25);
  const sinEscalones = await env.sql(`
    select clave from categorias c where not exists (select 1 from escalones_radio e where e.categoria = c.clave)`);
  assert.deepEqual(sinEscalones, []);
});

test('el seed es idempotente (se puede volver a ejecutar)', async () => {
  const { readFile } = await import('node:fs/promises');
  const seed = await readFile(new URL('../seed.sql', import.meta.url), 'utf8');
  await env.db.exec(seed);
  const [{ n }] = await env.sql(`select count(*)::int as n from escalones_radio`);
  assert.equal(n, 25);
});

test('pg_cron: las cinco tareas quedan programadas', async () => {
  const tareas = await env.sql(`select jobname, schedule from cron.job order by jobname`);
  assert.deepEqual(tareas, [
    { jobname: 'ampliar-radios', schedule: '15 seconds' },
    { jobname: 'expirar-alertas', schedule: '* * * * *' },
    { jobname: 'limpieza-diaria', schedule: '0 4 * * *' },
    { jobname: 'mantenimiento-fotos', schedule: '30 4 * * *' },
    { jobname: 'publicar-pendientes', schedule: '15 seconds' },
  ]);
});

test('geohash: los puntos de la demo caen en las celdas de la propuesta', async () => {
  assert.equal(await env.celda(PUNTOS.suceso), '9epq4t');
  assert.equal(await env.celda(PUNTOS.A), '9epq4t');
  assert.equal(await env.celda(PUNTOS.B), '9epq69');
  assert.equal(await env.celda(PUNTOS.C), '9epq6x');
  assert.equal(await env.celda(PUNTOS.D), '9epu35');
});

// ─── P01 · P02: recibir sin cuenta, privacidad ──────────────────────────────

test('P01/P02: recibir sin cuenta crea perfil anónimo y guarda solo la celda (sin historial)', async () => {
  const u = await env.crearUsuario({ anonimo: true });
  const [perfil] = await env.sql(`select rol, reputacion from perfiles where id = $1`, [u.id]);
  assert.deepEqual(perfil, { rol: 'ciudadano', reputacion: 0 });

  await env.rpc(u, 'registrar_dispositivo', { p_token: 'token-anonimo-123', p_plataforma: 'android', p_celda: '9epq4t' });
  await env.rpc(u, 'registrar_dispositivo', { p_token: 'token-anonimo-123', p_plataforma: 'android', p_celda: '9epq69' });
  const filas = await env.sql(`select celda, centro_celda is not null as con_centro from dispositivos`);
  assert.deepEqual(filas, [{ celda: '9epq69', con_centro: true }], 'una sola fila: la celda se sobrescribe');

  // Ninguna tabla tiene columnas de latitud/longitud, salvo `alertas` (la ubicación del SUCESO)
  const columnas = await env.sql(`
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name <> 'alertas'
      and c.column_name ~* '^(lat|lon|latitud|longitud|latitude|longitude)$'`);
  assert.deepEqual(columnas, []);
});

test('registrar_dispositivo rechaza celdas inválidas y exige sesión', async () => {
  const u = await env.crearUsuario({ anonimo: true });
  await assert.rejects(
    env.rpc(u, 'registrar_dispositivo', { p_token: 'token-celda-mala', p_plataforma: 'android', p_celda: 'abc' }),
    /Celda inválida/);
  await assert.rejects(
    env.rpc(u, 'registrar_dispositivo', { p_token: 'token-celda-mala', p_plataforma: 'android', p_celda: '9epq4a' }),
    /Celda inválida/, 'la letra "a" no existe en el alfabeto geohash');
  await assert.rejects(
    env.rpc(null, 'registrar_dispositivo', { p_token: 'token-sin-sesion', p_plataforma: 'android', p_celda: '9epq4t' }),
    /permission denied/);
});

// ─── P03 · P04 · P05: proximidad y radio dinámico ───────────────────────────

test('P03/P04: una alerta oficial a 300 m llega a A y nunca a D', async () => {
  const t = await telefonosDemo();
  const pc = await env.crearUsuario({ rol: 'institucion', institucion: 'Protección Civil (demo)' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'PRUEBA: humo en bodega' });
  assert.equal(r.estado, 'verificada');
  assert.equal(await env.radio(r.alerta_id), 1000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 1000, Object.values(t)), ['A']);

  const [llamada] = await env.llamadasANotificar();
  assert.equal(llamada.url, 'https://prueba.supabase.co/functions/v1/notificar');
  assert.equal(llamada.headers['x-alerta-secreto'], 'secreto-de-prueba');
  assert.deepEqual(llamada.body, { alerta_id: r.alerta_id, evento: 'estado', anterior: null });
});

test('P05: radio dinámico en anillos — A al instante, B a los 15 min, C a los 60, D nunca; nadie dos veces', async () => {
  const t = await telefonosDemo();
  const ciudadano = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador', institucion: 'Protección Civil (demo)' });
  const r = await env.reportar(ciudadano, {
    categoria: 'menor_desaparecido', titulo: 'Niño de 8 años, playera roja', folio: '911-12345',
  });
  assert.equal(r.estado, 'pendiente');
  assert.equal(await env.radio(r.alerta_id), 0, 'en revisión no se difunde');

  await env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'verificar' });
  const todos = Object.values(t);
  assert.equal(await env.radio(r.alerta_id), 1000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 1000, todos), ['A']);

  await env.retrocederPublicacion(r.alerta_id, 15);
  assert.equal(await env.radio(r.alerta_id), 3000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 3000, todos), ['B'], 'A no la recibe de nuevo');

  await env.retrocederPublicacion(r.alerta_id, 60);
  assert.equal(await env.radio(r.alerta_id), 10000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 10000, todos), ['C']);

  await env.retrocederPublicacion(r.alerta_id, 180);
  assert.equal(await env.radio(r.alerta_id), 25000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 25000, todos), [], 'D (76 km) nunca la recibe');

  await env.retrocederPublicacion(r.alerta_id, 5000);
  assert.equal(await env.radio(r.alerta_id), 25000, 'el radio máximo de la categoría es 25 km');

  const [{ n }] = await env.sql(`select count(*)::int as n from entregas where alerta_id = $1`, [r.alerta_id]);
  assert.equal(n, 3, 'una fila por dispositivo: A, B y C');
});

test('modo demo: con factor_tiempo = 30 el escalón de 15 min llega en 30 s', async () => {
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'menor_desaparecido', titulo: 'Menor visto en el mercado' });
  await env.sql(`update config set factor_tiempo = 30`);
  await env.sql(`update alertas set publicada_en = now() - interval '29 seconds' where id = $1`, [r.alerta_id]);
  assert.equal(await env.radio(r.alerta_id), 1000);
  await env.sql(`update alertas set publicada_en = now() - interval '31 seconds' where id = $1`, [r.alerta_id]);
  assert.equal(await env.radio(r.alerta_id), 3000);
  await env.sql(`update alertas set publicada_en = now() - interval '121 seconds' where id = $1`, [r.alerta_id]);
  assert.equal(await env.radio(r.alerta_id), 10000);
});

test('margen de celda: B no entra en el anillo de 1 km y C no entra en el de 3 km', async () => {
  const [d] = await env.sql(`
    select round(st_distance(st_setsrid(st_pointfromgeohash('9epq69'), 4326)::geography,
                             st_setsrid(st_makepoint(-102.1942, 17.9581), 4326)::geography))::int as b,
           round(st_distance(st_setsrid(st_pointfromgeohash('9epq6x'), 4326)::geography,
                             st_setsrid(st_makepoint(-102.1942, 17.9581), 4326)::geography))::int as c`);
  assert.ok(d.b > 1700, `centro de la celda de B a ${d.b} m (debe quedar fuera de 1 km + 700 m)`);
  assert.ok(d.c > 3700, `centro de la celda de C a ${d.c} m (debe quedar fuera de 3 km + 700 m)`);
});

test('ajustar radio: el validador fija 5 km y el anillo llega a B y C de inmediato', async () => {
  const t = await telefonosDemo();
  const pc = await env.crearUsuario({ rol: 'validador' });
  const r = await env.reportar(pc, { categoria: 'evacuacion', titulo: 'Evacuación preventiva por fuga' });
  assert.equal(await env.radio(r.alerta_id), 2000);
  await env.rpc(pc, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'ajustar_radio', p_radio_m: 7000 });
  assert.equal(await env.radio(r.alerta_id), 7000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 7000, Object.values(t)), ['A', 'B', 'C']);
  const llamadas = await env.llamadasANotificar();
  assert.equal(llamadas.at(-1).body.evento, 'ajuste');
  await assert.rejects(
    env.rpc(pc, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'ajustar_radio', p_radio_m: 50 }),
    /Radio inválido/);
});

test('ampliar_radios() (pg_cron) actualiza el radio y llama a notificar con el anillo nuevo', async () => {
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'menor_desaparecido', titulo: 'Menor visto en el mercado' });
  assert.equal((await env.sql(`select ampliar_radios() as n`))[0].n, 1, 'de 0 a 1 km');
  assert.equal((await env.alerta(r.alerta_id)).radio_actual_m, 1000);
  assert.equal((await env.sql(`select ampliar_radios() as n`))[0].n, 0, 'sin cambios no vuelve a llamar');
  await env.retrocederPublicacion(r.alerta_id, 20);
  assert.equal((await env.sql(`select ampliar_radios() as n`))[0].n, 1);
  const ultima = (await env.llamadasANotificar()).at(-1);
  assert.deepEqual(ultima.body, { alerta_id: r.alerta_id, evento: 'ampliacion', radio_m: 3000 });
});

// ─── P06 · P07 · P08: reportes ciudadanos ───────────────────────────────────

test('P06: un reporte ciudadano queda NO CONFIRMADO y viaja máximo 1 km', async () => {
  const u = await env.crearUsuario();
  const asalto = await env.reportar(u, { categoria: 'asalto', titulo: 'Asalto a transeúnte' });
  assert.equal(asalto.estado, 'no_confirmada');
  await env.retrocederPublicacion(asalto.alerta_id, 45); // el escalón de 30 min sería 2 km
  assert.equal(await env.radio(asalto.alerta_id), 1000);

  const robo = await env.reportar(u, { categoria: 'robo_vehiculo', titulo: 'Robo de camioneta gris', punto: PUNTOS.C });
  assert.equal(await env.radio(robo.alerta_id), 1000, 'robo empieza en 3 km, pero el tope es 1 km');
});

test('P07: un menor desaparecido reportado por un ciudadano queda EN REVISIÓN y solo lo ven autor y validadores', async () => {
  const autor = await env.crearUsuario();
  const vecino = await env.crearUsuario({ anonimo: true });
  const validador = await env.crearUsuario({ rol: 'validador' });
  const r = await env.reportar(autor, { categoria: 'menor_desaparecido', titulo: 'Niña de 6 años, vestido azul' });
  assert.equal(r.estado, 'pendiente');

  const celda = await env.celda(PUNTOS.A);
  const delVecino = await env.rpc(vecino, 'alertas_cercanas', { p_celda: celda });
  assert.equal(delVecino.length, 0);
  assert.deepEqual(await env.rpc(vecino, 'obtener_alerta', { p_alerta: r.alerta_id }), []);
  const [delAutor] = await env.rpc(autor, 'alertas_cercanas', { p_celda: celda });
  assert.equal(delAutor.estado, 'pendiente');
  assert.equal(delAutor.es_mia, true);
  const delValidador = await env.rpc(validador, 'alertas_cercanas', { p_celda: celda });
  assert.equal(delValidador.length, 1);

  const [llamada] = await env.llamadasANotificar();
  assert.deepEqual(llamada.body, { alerta_id: r.alerta_id, evento: 'estado', anterior: null });
});

test('P08: un reporte duplicado (misma categoría, 200 m, < 30 min) suma una confirmación', async () => {
  const u1 = await env.crearUsuario();
  const u2 = await env.crearUsuario();
  const primero = await env.reportar(u1, { categoria: 'incendio', titulo: 'Humo en bodega del centro' });
  const cerca = { lat: PUNTOS.suceso.lat + 0.0018, lon: PUNTOS.suceso.lon }; // ~200 m
  const segundo = await env.reportar(u2, { categoria: 'incendio', titulo: 'Se ve fuego en una bodega', punto: cerca });
  assert.equal(segundo.duplicada_de, primero.alerta_id);
  const [{ n }] = await env.sql(`select count(*)::int as n from alertas`);
  assert.equal(n, 1);
  const conf = await env.sql(`select usuario_id, tipo from confirmaciones`);
  assert.deepEqual(conf, [{ usuario_id: u2.id, tipo: 'confirmo' }]);

  // El mismo autor no se confirma a sí mismo
  const propio = await env.reportar(u1, { categoria: 'incendio', titulo: 'Sigue el humo en la bodega' });
  assert.equal(propio.duplicada_de, primero.alerta_id);
  assert.equal((await env.sql(`select count(*)::int as n from confirmaciones`))[0].n, 1);

  // Otra categoría en el mismo lugar sí es una alerta nueva
  const otra = await env.reportar(u2, { categoria: 'accidente', titulo: 'Choque frente a la bodega' });
  assert.ok(otra.alerta_id);
});

// ─── P09 · P10: confirmaciones de vecinos ──────────────────────────────────

test('P09: tres vecinos verificados la CORROBORAN y su tope sube a 3 km', async () => {
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'incendio', titulo: 'Incendio en lote baldío' });
  await assert.rejects(env.rpc(autor, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' }),
    /tu propio reporte/);
  const anonimo = await env.crearUsuario({ anonimo: true });
  await assert.rejects(env.rpc(anonimo, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' }),
    /Verifica tu número/);

  for (let i = 0; i < 3; i++) {
    const vecino = await env.crearUsuario();
    await env.rpc(vecino, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  }
  assert.equal((await env.alerta(r.alerta_id)).estado, 'corroborada');
  await env.retrocederPublicacion(r.alerta_id, 25);
  assert.equal(await env.radio(r.alerta_id), 3000);
  const [bit] = await env.sql(`select accion from bitacora where accion = 'corroborar_auto'`);
  assert.ok(bit);
  const llamada = (await env.llamadasANotificar()).at(-1);
  assert.deepEqual(llamada.body, { alerta_id: r.alerta_id, evento: 'estado', anterior: 'no_confirmada' });

  const [vista] = await env.rpc(anonimo, 'obtener_alerta', { p_alerta: r.alerta_id });
  assert.equal(vista.n_confirmo, 3);
});

test('P10: tres votos de "parece falsa" la regresan a revisión', async () => {
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'asalto', titulo: 'Asalto en la parada' });
  for (let i = 0; i < 3; i++) {
    const vecino = await env.crearUsuario();
    await env.rpc(vecino, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'parece_falsa' });
  }
  assert.equal((await env.alerta(r.alerta_id)).estado, 'pendiente');
  assert.equal(await env.radio(r.alerta_id), 0);
});

test('una persona puede cambiar su voto, pero solo cuenta una vez', async () => {
  const autor = await env.crearUsuario();
  const vecino = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'accidente', titulo: 'Choque en avenida principal' });
  await env.rpc(vecino, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  await env.rpc(vecino, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'ya_no_esta' });
  const [vista] = await env.rpc(vecino, 'obtener_alerta', { p_alerta: r.alerta_id });
  assert.equal(vista.n_confirmo, 0);
  assert.equal(vista.n_ya_no_esta, 1);
  assert.equal(vista.mi_confirmacion, 'ya_no_esta');
});

// ─── Colmena: la comunidad avanza las alertas sin depender de un validador ──

test('colmena: si ningún validador lo revisa en 5 min, el reporte en revisión se publica solo a 1 km', async () => {
  const t = await telefonosDemo();
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'menor_desaparecido', titulo: 'Niño de 8 años, playera roja' });
  assert.equal(r.estado, 'pendiente');
  assert.equal((await env.sql(`select publicar_pendientes() as n`))[0].n, 0, 'todavía hay tiempo para un validador');

  await env.sql(`update alertas set creada_en = now() - interval '6 minutes' where id = $1`, [r.alerta_id]);
  assert.equal((await env.sql(`select publicar_pendientes() as n`))[0].n, 1);
  const a = await env.alerta(r.alerta_id);
  assert.equal(a.estado, 'no_confirmada');
  assert.ok(a.publicada_en, 'arranca el reloj del radio dinámico');
  assert.equal(await env.radio(r.alerta_id), 1000);
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 1000, Object.values(t)), ['A']);
  await env.retrocederPublicacion(r.alerta_id, 20);
  assert.equal(await env.radio(r.alerta_id), 1000, 'sin confirmar no pasa de 1 km');

  const [bit] = await env.sql(`select usuario_id, detalle from bitacora where accion = 'publicar_auto'`);
  assert.deepEqual(bit, { usuario_id: null, detalle: { minutos_sin_revision: 5 } });
  const llamada = (await env.llamadasANotificar()).at(-1);
  assert.deepEqual(llamada.body, { alerta_id: r.alerta_id, evento: 'estado', anterior: 'pendiente' });
  assert.equal((await env.sql(`select publicar_pendientes() as n`))[0].n, 0, 'una sola vez');

  // Y la comunidad puede seguir: 3 vecinos la corroboran
  for (let i = 0; i < 3; i++) {
    await env.rpc(await env.crearUsuario(), 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  }
  assert.equal((await env.alerta(r.alerta_id)).estado, 'corroborada');
  assert.equal(await env.radio(r.alerta_id), 3000);
});

test('colmena: un segundo testigo publica al instante el reporte en revisión', async () => {
  const autor = await env.crearUsuario();
  const testigo = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'persona_desaparecida', titulo: 'Joven de 17 años, sudadera gris' });
  assert.equal(r.estado, 'pendiente');
  const cerca = { lat: PUNTOS.suceso.lat + 0.0018, lon: PUNTOS.suceso.lon }; // ~200 m
  const segundo = await env.reportar(testigo, {
    categoria: 'persona_desaparecida', titulo: 'Buscamos a un joven de sudadera gris', punto: cerca,
  });
  assert.deepEqual(segundo, { duplicada_de: r.alerta_id, estado: 'no_confirmada' });
  const a = await env.alerta(r.alerta_id);
  assert.equal(a.estado, 'no_confirmada');
  assert.ok(a.publicada_en);
  const [bit] = await env.sql(`select detalle from bitacora where accion = 'publicar_colmena'`);
  assert.deepEqual(bit.detalle, { confirmaciones: 1 });
});

test('colmena: no se publican solos los de autores con reputación baja ni los regresados por votos', async () => {
  const dudoso = await env.crearUsuario();
  await env.sql(`update perfiles set reputacion = -3 where id = $1`, [dudoso.id]);
  const r1 = await env.reportar(dudoso, { categoria: 'incendio', titulo: 'Incendio en la esquina' });
  assert.equal(r1.estado, 'pendiente');

  const autor = await env.crearUsuario();
  const r2 = await env.reportar(autor, { categoria: 'asalto', titulo: 'Asalto en la parada', punto: PUNTOS.C });
  for (let i = 0; i < 3; i++) {
    await env.rpc(await env.crearUsuario(), 'confirmar_alerta', { p_alerta: r2.alerta_id, p_tipo: 'parece_falsa' });
  }
  assert.equal((await env.alerta(r2.alerta_id)).estado, 'pendiente');

  await env.sql(`update alertas set creada_en = now() - interval '1 hour'`);
  assert.equal((await env.sql(`select publicar_pendientes() as n`))[0].n, 0);
  assert.equal((await env.alerta(r1.alerta_id)).estado, 'pendiente');
  assert.equal((await env.alerta(r2.alerta_id)).estado, 'pendiente');
});

test('colmena: con 6 confirmaciones el tope de CORROBORADA sube de 3 a 10 km', async () => {
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'robo_vehiculo', titulo: 'Robo de camioneta gris' });
  await env.retrocederPublicacion(r.alerta_id, 70); // escalones: 3 km → 10 km (20 min) → 25 km (60 min)
  assert.equal(await env.radio(r.alerta_id), 1000);
  const confirmar = async (n) => {
    for (let i = 0; i < n; i++) {
      await env.rpc(await env.crearUsuario(), 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
    }
  };
  await confirmar(3);
  assert.equal(await env.radio(r.alerta_id), 3000);
  await confirmar(2);
  assert.equal(await env.radio(r.alerta_id), 3000);
  await confirmar(1);
  assert.equal(await env.radio(r.alerta_id), 10000, '6 vecinos: alcance de colmena');
  const validador = await env.crearUsuario({ rol: 'validador' });
  await env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'verificar' });
  assert.equal(await env.radio(r.alerta_id), 25000, 'más allá, solo verificada');
});

test('colmena: los umbrales viven en config y se ajustan sin programar', async () => {
  await env.sql(`update config set minutos_espera_validador = 1, confirmaciones_corroborar = 2`);
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'persona_vulnerable', titulo: 'Señora de 80 años desorientada' });
  await env.sql(`update alertas set creada_en = now() - interval '90 seconds' where id = $1`, [r.alerta_id]);
  assert.equal((await env.sql(`select publicar_pendientes() as n`))[0].n, 1);
  for (let i = 0; i < 2; i++) {
    await env.rpc(await env.crearUsuario(), 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  }
  assert.equal((await env.alerta(r.alerta_id)).estado, 'corroborada');
});

test('colmena: la foto de una persona solo se muestra cuando la alerta ya está confirmada', async () => {
  const autor = await env.crearUsuario();
  const vecino = await env.crearUsuario({ anonimo: true });
  const foto = `${autor.id}/menor.jpg`;
  await env.sql(`insert into storage.objects (bucket_id, name, owner) values ('fotos', $1, $2)`, [foto, autor.id]);
  const r = await env.reportar(autor, {
    categoria: 'menor_desaparecido', titulo: 'Niña de 6 años, vestido azul', foto, consentimiento: true,
  });
  await env.sql(`update alertas set creada_en = now() - interval '6 minutes' where id = $1`, [r.alerta_id]);
  await env.sql(`select publicar_pendientes()`);

  const ver = async () => ({
    vista: (await env.rpc(vecino, 'obtener_alerta', { p_alerta: r.alerta_id }))[0].foto_path,
    archivos: await env.como(vecino, async (tx) => (await tx.query(`select name from storage.objects`)).rows.length),
  });
  assert.deepEqual(await ver(), { vista: null, archivos: 0 }, 'no confirmada: el aviso sí, la foto no');
  assert.equal((await env.rpc(autor, 'obtener_alerta', { p_alerta: r.alerta_id }))[0].foto_path, foto);

  for (let i = 0; i < 3; i++) {
    await env.rpc(await env.crearUsuario(), 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  }
  assert.deepEqual(await ver(), { vista: foto, archivos: 1 }, 'corroborada: ya se muestra');
});

test('para reportar, confirmar o subir fotos hace falta un teléfono verificado: el correo solo no basta', async () => {
  const correo = await env.crearUsuario({ soloCorreo: true });
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'incendio', titulo: 'Incendio en lote baldío' });
  await assert.rejects(env.reportar(correo, { punto: PUNTOS.C }), /Verifica tu número de teléfono/);
  await assert.rejects(env.rpc(correo, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' }),
    /Verifica tu número/);
  await assert.rejects(env.como(correo, (tx) => tx.query(
    `insert into storage.objects (bucket_id, name, owner) values ('fotos', $1, $2)`, [`${correo.id}/x.jpg`, correo.id])),
  /row-level security/);

  // Las cuentas de institución (correo, sin teléfono) sí emiten alertas oficiales
  const pc = await env.crearUsuario({ rol: 'institucion', soloCorreo: true });
  assert.equal((await env.reportar(pc, { titulo: 'Incendio en bodega', punto: PUNTOS.D })).estado, 'verificada');
});

// ─── Verificación del teléfono por WhatsApp (Auth Hook "Send SMS") ──────────

/** Lo que hace Supabase Auth al mandar un código: llama al hook con el rol supabase_auth_admin. */
const hookWhatsapp = (evento) => env.db.transaction(async (tx) => {
  await tx.exec('set local role supabase_auth_admin');
  return (await tx.query(`select enviar_codigo_whatsapp($1::jsonb) as r`, [JSON.stringify(evento)])).rows[0].r;
});

test('WhatsApp simulado: Auth entrega el código al hook y la app que lo pidió lo "recibe"', async () => {
  const u = await env.crearUsuario({ anonimo: true });
  // Cuenta anónima que agrega su número: el número nuevo viene en `new_phone`
  assert.deepEqual(await hookWhatsapp({ user: { id: u.id, phone: '', new_phone: '525522222222' }, sms: { otp: '482913' } }), {});
  const [m] = await env.rpc(u, 'whatsapp_simulado', { p_telefono: '+52 55 2222 2222' });
  assert.equal(m.codigo, '482913');
  assert.match(m.texto, /tu código de verificación es 482913/);

  // Lo normal: Auth manda el número en `sms.phone`
  await hookWhatsapp({ user: { id: u.id, phone: '525533333333' }, sms: { otp: '111222', phone: '+525533333333' } });
  assert.equal((await env.rpc(u, 'whatsapp_simulado', { p_telefono: '525533333333' }))[0].codigo, '111222');

  // Solo los de los últimos 10 minutos, y solo en modo simulado
  await env.sql(`update privado.mensajes_whatsapp set enviado_en = now() - interval '11 minutes'
                 where telefono = '525533333333'`);
  assert.deepEqual(await env.rpc(u, 'whatsapp_simulado', { p_telefono: '525533333333' }), []);
  await env.sql(`update config set whatsapp_modo = 'meta'`);
  assert.deepEqual(await env.rpc(u, 'whatsapp_simulado', { p_telefono: '525522222222' }), []);

  // Retención: a los 1 día se borran
  await env.sql(`update privado.mensajes_whatsapp set enviado_en = now() - interval '2 days'`);
  await env.sql(`select limpieza_diaria()`);
  assert.equal((await env.sql(`select count(*)::int as n from privado.mensajes_whatsapp`))[0].n, 0);
});

test('WhatsApp Business (modo meta): el hook llama a la Edge Function y no guarda el código', async () => {
  await env.sql(`update config set whatsapp_modo = 'meta'`);
  const evento = { user: { id: '00000000-0000-4000-8000-000000000001', phone: '', new_phone: '525544444444' },
    sms: { otp: '654321' } };
  assert.deepEqual(await hookWhatsapp(evento), {});
  const llamadas = await env.sql(`select headers, body from net.solicitudes where url like '%/whatsapp'`);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].body, { telefono: '525544444444', codigo: '654321' });
  assert.equal(llamadas[0].headers['x-alerta-secreto'], 'secreto-de-prueba');
  assert.deepEqual(await env.sql(`select codigo, modo, estado from privado.mensajes_whatsapp`),
    [{ codigo: null, modo: 'meta', estado: 'enviado' }]);
});

test('WhatsApp: el hook rechaza números inválidos y nadie más puede llamarlo ni leer los mensajes', async () => {
  const r = await hookWhatsapp({ user: { phone: 'abc' }, sms: { otp: '123456' } });
  assert.equal(r.error.http_code, 400);
  const u = await env.crearUsuario({ anonimo: true });
  for (const usuario of [null, u]) {
    await assert.rejects(env.como(usuario, (tx) => tx.query(`select enviar_codigo_whatsapp('{}'::jsonb)`)),
      /permission denied/);
    await assert.rejects(env.como(usuario, (tx) => tx.query(`select * from privado.mensajes_whatsapp`)),
      /permission denied/);
  }
  await assert.rejects(env.rpc(null, 'whatsapp_simulado', { p_telefono: '525522222222' }), /permission denied/);
});

test('WhatsApp por el puente: el código queda en cola, el puente lo toma una sola vez y reporta el envío', async () => {
  await env.sql(`update config set whatsapp_modo = 'puente'`);
  const u = await env.crearUsuario({ anonimo: true });
  assert.deepEqual(await hookWhatsapp({ user: { id: u.id }, sms: { otp: '246810', phone: '525577777777' } }), {});
  assert.deepEqual(await env.rpc(u, 'whatsapp_simulado', { p_telefono: '525577777777' }), [],
    'la app ya no ve el código: le llega por WhatsApp');

  const tomar = () => env.rpc(null, 'whatsapp_pendientes', { p_secreto: SECRETO_PUENTE, p_limite: 5 });
  const [m] = await tomar();
  assert.equal(m.telefono, '525577777777');
  assert.match(m.texto, /tu código de verificación es 246810/);
  assert.deepEqual(await tomar(), [], 'un mensaje se toma una sola vez');

  await env.rpc(null, 'whatsapp_resultado', { p_secreto: SECRETO_PUENTE, p_id: m.id, p_ok: true });
  assert.deepEqual(await env.sql(`select estado, intentos, error from privado.mensajes_whatsapp`),
    [{ estado: 'enviado', intentos: 1, error: null }]);

  // Sin el secreto correcto nadie toma la cola ni reporta
  await assert.rejects(env.rpc(null, 'whatsapp_pendientes', { p_secreto: 'otro-secreto-de-mas-de-32-caracteres-xx' }),
    /No autorizado/);
  await assert.rejects(env.rpc(u, 'whatsapp_resultado', { p_secreto: null, p_id: m.id, p_ok: false }), /No autorizado/);
});

test('puente: reintenta lo que se quedó "enviando" y descarta los códigos vencidos', async () => {
  await env.sql(`update config set whatsapp_modo = 'puente'`);
  await hookWhatsapp({ user: {}, sms: { otp: '111111', phone: '525511112222' } });
  await hookWhatsapp({ user: {}, sms: { otp: '222222', phone: '525533334444' } });
  const tomar = () => env.rpc(null, 'whatsapp_pendientes', { p_secreto: SECRETO_PUENTE });
  assert.equal((await tomar()).length, 2);
  // El puente se cayó a medio envío: al minuto se reintenta; el de hace 11 min ya venció
  await env.sql(`update privado.mensajes_whatsapp set actualizado_en = now() - interval '2 minutes'`);
  await env.sql(`update privado.mensajes_whatsapp set enviado_en = now() - interval '11 minutes'
                 where telefono = '525533334444'`);
  const reintento = await tomar();
  assert.deepEqual(reintento.map((r) => r.telefono), ['525511112222']);
  const estados = await env.sql(
    `select telefono, estado, intentos, error from privado.mensajes_whatsapp order by telefono`);
  assert.deepEqual(estados, [
    { telefono: '525511112222', estado: 'enviando', intentos: 2, error: null },
    { telefono: '525533334444', estado: 'error', intentos: 1, error: 'El código venció antes de enviarse' },
  ]);
  await env.rpc(null, 'whatsapp_resultado', {
    p_secreto: SECRETO_PUENTE, p_id: reintento[0].id, p_ok: false, p_error: 'El número no tiene WhatsApp',
  });
  assert.equal((await env.sql(`select error from privado.mensajes_whatsapp where telefono = '525511112222'`))[0].error,
    'El número no tiene WhatsApp');
});

test('puente: el latido registra su número y activa el modo; la app ve desde dónde llega el código', async () => {
  const u = await env.crearUsuario({ anonimo: true });
  const estado = async () => (await env.rpc(u, 'estado_whatsapp'))[0].estado_whatsapp;
  assert.deepEqual(await estado(), { modo: 'simulado', conectado: true, numero: null });

  const latido = (activar) => env.rpc(null, 'whatsapp_latido', {
    p_secreto: SECRETO_PUENTE, p_numero: '+52 755 000 0000', p_conectado: true, p_activar: activar,
  });
  assert.equal((await latido(false))[0].whatsapp_latido, 'simulado', 'sin p_activar no cambia el modo');
  assert.equal((await latido(true))[0].whatsapp_latido, 'puente');
  assert.deepEqual(await estado(), { modo: 'puente', conectado: true, numero: '527550000000' });

  await env.sql(`update privado.puente_whatsapp set latido_en = now() - interval '2 minutes'`);
  assert.equal((await estado()).conectado, false, 'sin señales de vida en 1 minuto: desconectado');

  await assert.rejects(env.rpc(null, 'whatsapp_latido', { p_secreto: 'x', p_numero: '1', p_conectado: true }),
    /No autorizado/);
  await assert.rejects(env.rpc(null, 'estado_whatsapp'), /permission denied/);
});

// ─── P11: límite de reportes ───────────────────────────────────────────────

test('P11: al pasar el límite de reportes por hora (config, 10 por defecto) se rechaza con un mensaje claro', async () => {
  assert.equal((await env.sql(`select reportes_por_hora from config`))[0].reportes_por_hora, 10);
  await env.sql(`update config set reportes_por_hora = 3`);
  const u = await env.crearUsuario();
  const lugares = [PUNTOS.A, PUNTOS.B, PUNTOS.C, PUNTOS.D];
  for (let i = 0; i < 3; i++) {
    await env.reportar(u, { categoria: 'otro', titulo: `Reporte de prueba ${i + 1}`, punto: lugares[i] });
  }
  await assert.rejects(env.reportar(u, { categoria: 'accidente', titulo: 'Reporte de prueba 4', punto: lugares[3] }),
    /Alcanzaste el límite de reportes \(3 por hora\)/);

  // Sumarse a un reporte que ya existe no choca con el límite: cuenta como confirmación
  const vecino = await env.crearUsuario();
  const incendio = await env.reportar(vecino, { categoria: 'incendio', titulo: 'Humo en la bodega', punto: PUNTOS.D });
  const dup = await env.reportar(u, { categoria: 'incendio', titulo: 'Sí, sale humo de la bodega', punto: PUNTOS.D });
  assert.equal(dup.duplicada_de, incendio.alerta_id);
  assert.equal((await env.sql(`select count(*)::int as n from confirmaciones where usuario_id = $1`, [u.id]))[0].n, 1);

  const pc = await env.crearUsuario({ rol: 'institucion' });
  for (let i = 0; i < 4; i++) {
    await env.reportar(pc, { categoria: 'otro', titulo: `Aviso oficial ${i + 1}`, punto: lugares[i] });
  }
});

// ─── P12 · P13: cierre y expiración ────────────────────────────────────────

test('P12: al resolverse queda RESUELTA, la foto deja de mostrarse y se puede ver 24 h', async () => {
  const autor = await env.crearUsuario();
  const vecino = await env.crearUsuario({ anonimo: true });
  const validador = await env.crearUsuario({ rol: 'validador' });
  const foto = `${autor.id}/1700000000000.jpg`;
  await env.sql(`insert into storage.objects (bucket_id, name, owner) values ('fotos', $1, $2)`, [foto, autor.id]);
  const r = await env.reportar(autor, { categoria: 'incendio', titulo: 'Incendio en bodega', foto });
  const celda = await env.celda(PUNTOS.A);

  let [vista] = await env.rpc(vecino, 'alertas_cercanas', { p_celda: celda });
  assert.equal(vista.foto_path, foto);
  let fotos = await env.como(vecino, async (tx) => (await tx.query(`select name from storage.objects`)).rows);
  assert.equal(fotos.length, 1, 'la foto de una alerta activa se puede ver');

  const otro = await env.crearUsuario();
  await assert.rejects(env.rpc(otro, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'resolver' }), /No autorizado/);
  await env.rpc(validador, 'validar_alerta', {
    p_alerta: r.alerta_id, p_accion: 'resolver', p_motivo: 'Bomberos controlaron el fuego',
  });

  [vista] = await env.rpc(vecino, 'alertas_cercanas', { p_celda: celda });
  assert.equal(vista.estado, 'resuelta');
  assert.equal(vista.foto_path, null);
  assert.equal(vista.motivo_cierre, 'Bomberos controlaron el fuego');
  fotos = await env.como(vecino, async (tx) => (await tx.query(`select name from storage.objects`)).rows);
  assert.equal(fotos.length, 0, 'la foto de una alerta resuelta ya no se puede descargar');

  await assert.rejects(env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'verificar' }),
    /ya está cerrada/);
  const cierre = (await env.llamadasANotificar()).at(-1);
  assert.deepEqual(cierre.body, { alerta_id: r.alerta_id, evento: 'estado', anterior: 'no_confirmada' });

  await env.sql(`update alertas set cerrada_en = now() - interval '25 hours' where id = $1`, [r.alerta_id]);
  assert.equal((await env.rpc(vecino, 'alertas_cercanas', { p_celda: celda })).length, 0);
});

test('el autor puede marcar su propio reporte como resuelto', async () => {
  const autor = await env.crearUsuario();
  const r = await env.reportar(autor, { categoria: 'persona_vulnerable', titulo: 'Adulto mayor extraviado' });
  await env.rpc(autor, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'resolver', p_motivo: 'Ya apareció' });
  const a = await env.alerta(r.alerta_id);
  assert.equal(a.estado, 'resuelta');
  assert.equal(a.motivo_cierre, 'Ya apareció');
});

test('P13: una alerta vencida pasa a EXPIRADA, sale del mapa y no avisa a nadie', async () => {
  const u = await env.crearUsuario();
  const r = await env.reportar(u, { categoria: 'accidente', titulo: 'Choque leve en el crucero' });
  await env.sql(`update alertas set expira_en = now() - interval '1 minute' where id = $1`, [r.alerta_id]);
  const antes = (await env.llamadasANotificar()).length;
  assert.equal((await env.sql(`select expirar_alertas() as n`))[0].n, 1);
  assert.equal((await env.alerta(r.alerta_id)).estado, 'expirada');
  assert.equal((await env.llamadasANotificar()).length, antes, 'expirar no llama a notificar');
  const vecino = await env.crearUsuario({ anonimo: true });
  assert.equal((await env.rpc(vecino, 'alertas_cercanas', { p_celda: '9epq4t' })).length, 0);
});

// ─── P14: seguridad ─────────────────────────────────────────────────────────

test('P14: con la anon key no se pueden leer tokens ni llamar funciones internas', async () => {
  const t = await telefonosDemo();
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio en bodega' });

  const internas = [
    `select * from dispositivos_objetivo('${r.alerta_id}', 100000)`,
    `select * from dispositivos_validadores()`,
    `select * from telegram_objetivo('${r.alerta_id}', 100000)`,
    `select radio_permitido('${r.alerta_id}')`,
    `select llamar_funcion('notificar', '{}'::jsonb)`,
    `select ampliar_radios()`,
    `select publicar_pendientes()`,
    `select expirar_alertas()`,
    `select limpieza_diaria()`,
    `select * from fotos_por_borrar()`,
    `select * from alertas_publicas`,
    `select enviar_codigo_whatsapp('{}'::jsonb)`,
    `select secreto_puente_valido('x')`,
    `select * from privado.mensajes_whatsapp`,
  ];
  for (const usuario of [null, t.A]) {
    for (const consulta of internas) {
      await assert.rejects(env.como(usuario, (tx) => tx.query(consulta)), /permission denied/, consulta);
    }
  }

  // Con sesión: solo sus propios dispositivos; nada de config, Telegram ni entregas
  const visibles = await env.como(t.A, async (tx) => ({
    dispositivos: (await tx.query(`select usuario_id from dispositivos`)).rows,
    config: (await tx.query(`select * from config`)).rows,
    telegram: (await tx.query(`select * from suscriptores_telegram`)).rows,
    entregas: (await tx.query(`select * from entregas`)).rows,
    bitacora: (await tx.query(`select * from bitacora`)).rows,
  }));
  assert.deepEqual(visibles.dispositivos, [{ usuario_id: t.A.id }]);
  assert.deepEqual(visibles.config, []);
  assert.deepEqual(visibles.telegram, []);
  assert.deepEqual(visibles.entregas, []);
  assert.deepEqual(visibles.bitacora, []);
});

test('P14: nadie escribe directo en alertas, ni siquiera un validador', async () => {
  const validador = await env.crearUsuario({ rol: 'validador' });
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio en bodega' });
  await assert.rejects(env.como(validador, (tx) => tx.query(
    `insert into alertas (categoria, titulo, lat, lon, estado, expira_en)
     values ('incendio', 'Alerta inyectada', 17.95, -102.19, 'verificada', now() + interval '1 hour')`)),
  /row-level security/);
  const cambiadas = await env.como(validador, async (tx) =>
    (await tx.query(`update alertas set estado = 'resuelta' where id = $1`, [r.alerta_id])).affectedRows);
  assert.equal(cambiadas, 0);
  const borradas = await env.como(validador, async (tx) =>
    (await tx.query(`delete from alertas where id = $1`, [r.alerta_id])).affectedRows);
  assert.equal(borradas, 0);
  assert.equal((await env.alerta(r.alerta_id)).estado, 'verificada');
});

test('quién confirmó qué no es público: cada quien ve solo sus votos', async () => {
  const autor = await env.crearUsuario();
  const v1 = await env.crearUsuario();
  const v2 = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador' });
  const r = await env.reportar(autor, { categoria: 'incendio', titulo: 'Incendio en bodega' });
  await env.rpc(v1, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'confirmo' });
  await env.rpc(v2, 'confirmar_alerta', { p_alerta: r.alerta_id, p_tipo: 'parece_falsa' });
  const deV1 = await env.como(v1, async (tx) => (await tx.query(`select usuario_id from confirmaciones`)).rows);
  assert.deepEqual(deV1, [{ usuario_id: v1.id }]);
  const deValidador = await env.como(validador, async (tx) => (await tx.query(`select * from confirmaciones`)).rows);
  assert.equal(deValidador.length, 2);
});

test('los perfiles son privados: un ciudadano solo ve el suyo', async () => {
  const u = await env.crearUsuario();
  await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador' });
  const propios = await env.como(u, async (tx) => (await tx.query(`select id from perfiles`)).rows);
  assert.deepEqual(propios, [{ id: u.id }]);
  const todos = await env.como(validador, async (tx) => (await tx.query(`select id from perfiles`)).rows);
  assert.equal(todos.length, 3);
});

// ─── Reglas de confianza ───────────────────────────────────────────────────

test('para reportar se necesita una cuenta verificada (no anónima)', async () => {
  const anonimo = await env.crearUsuario({ anonimo: true });
  await assert.rejects(env.reportar(anonimo), /Verifica tu número de teléfono/);
});

test('evacuaciones y fenómenos naturales solo los emiten instituciones', async () => {
  const u = await env.crearUsuario();
  await assert.rejects(env.reportar(u, { categoria: 'evacuacion', titulo: 'Evacuación de la colonia' }),
    /solo la pueden emitir instituciones/);
  await assert.rejects(env.reportar(u, { categoria: 'fenomeno_natural', titulo: 'Sismo fuerte en la ciudad' }),
    /solo la pueden emitir instituciones/);
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'fenomeno_natural', titulo: 'Tormenta tropical en la costa' });
  assert.equal(r.estado, 'verificada');
  assert.equal(await env.radio(r.alerta_id), 10000);
});

test('validaciones de entrada: título, foto ajena y consentimiento', async () => {
  const u = await env.crearUsuario();
  await assert.rejects(env.reportar(u, { titulo: 'Hum' }), /entre 5 y 80 caracteres/);
  await assert.rejects(env.reportar(u, { foto: 'otra-persona/foto.jpg' }), /Foto inválida/);
  await assert.rejects(env.reportar(u, {
    categoria: 'menor_desaparecido', titulo: 'Niño de 8 años', foto: `${u.id}/menor.jpg`,
  }), /consentimiento/);
  const ok = await env.reportar(u, {
    categoria: 'menor_desaparecido', titulo: 'Niño de 8 años', foto: `${u.id}/menor.jpg`, consentimiento: true,
  });
  assert.equal(ok.estado, 'pendiente');
});

test('reputación: +1 si se verifica, −2 si se descarta; con −4 va a revisión y con −6 se suspende', async () => {
  const u = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador' });
  const lugares = [PUNTOS.A, PUNTOS.B, PUNTOS.C];
  // Para no topar con el límite de 3 reportes por hora, los anteriores se "envejecen"
  const envejecer = () => env.sql(
    `update alertas set creada_en = now() - interval '2 hours' where creada_por = $1`, [u.id]);

  const bueno = await env.reportar(u, { categoria: 'accidente', titulo: 'Choque en el puente', punto: PUNTOS.D });
  await envejecer();
  await env.rpc(validador, 'validar_alerta', { p_alerta: bueno.alerta_id, p_accion: 'verificar' });
  await assert.rejects(env.rpc(validador, 'validar_alerta', { p_alerta: bueno.alerta_id, p_accion: 'verificar' }),
    /ya está verificada/);
  assert.equal((await env.sql(`select reputacion from perfiles where id = $1`, [u.id]))[0].reputacion, 1);

  for (const punto of lugares) {
    const r = await env.reportar(u, { categoria: 'asalto', titulo: 'Asalto inventado', punto });
    await assert.rejects(env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'descartar' }),
      /motivo/);
    await env.rpc(validador, 'validar_alerta', {
      p_alerta: r.alerta_id, p_accion: 'descartar', p_motivo: 'No se pudo confirmar',
    });
  }
  assert.equal((await env.sql(`select reputacion from perfiles where id = $1`, [u.id]))[0].reputacion, -5);

  await env.sql(`delete from alertas where creada_por = $1`, [u.id]); // libera el límite por hora
  const enRevision = await env.reportar(u, { categoria: 'incendio', titulo: 'Incendio en la esquina' });
  assert.equal(enRevision.estado, 'pendiente', 'con reputación < −2 sus reportes van a revisión');

  await env.sql(`update perfiles set reputacion = -6 where id = $1`, [u.id]);
  await assert.rejects(env.reportar(u, { categoria: 'otro', titulo: 'Otro reporte más', punto: PUNTOS.D }),
    /suspendida/);
});

test('bitácora: queda registro de cada acción con su autor', async () => {
  const autor = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador' });
  const r = await env.reportar(autor, { categoria: 'persona_desaparecida', titulo: 'Joven de 17 años' });
  await env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'verificar' });
  await env.rpc(validador, 'validar_alerta', { p_alerta: r.alerta_id, p_accion: 'resolver', p_motivo: 'Localizado' });
  const bitacora = await env.como(validador, async (tx) =>
    (await tx.query(`select accion, usuario_id from bitacora where alerta_id = $1 order by id`, [r.alerta_id])).rows);
  assert.deepEqual(bitacora, [
    { accion: 'reportar', usuario_id: autor.id },
    { accion: 'verificar', usuario_id: validador.id },
    { accion: 'resolver', usuario_id: validador.id },
  ]);
});

// ─── Fotos (Storage) ───────────────────────────────────────────────────────

test('fotos: solo cuentas verificadas suben, y solo a su carpeta', async () => {
  const anonimo = await env.crearUsuario({ anonimo: true });
  const u = await env.crearUsuario();
  const subir = (usuario, nombre) => env.como(usuario, (tx) =>
    tx.query(`insert into storage.objects (bucket_id, name, owner) values ('fotos', $1, $2)`, [nombre, usuario.id]));
  await assert.rejects(subir(anonimo, `${anonimo.id}/a.jpg`), /row-level security/);
  await assert.rejects(subir(u, `${anonimo.id}/b.jpg`), /row-level security/);
  await subir(u, `${u.id}/c.jpg`);
});

test('fotos: las de un reporte en revisión no las ve nadie más que el autor y los validadores', async () => {
  const autor = await env.crearUsuario();
  const vecino = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador' });
  const foto = `${autor.id}/menor.jpg`;
  await env.sql(`insert into storage.objects (bucket_id, name, owner) values ('fotos', $1, $2)`, [foto, autor.id]);
  await env.reportar(autor, { categoria: 'menor_desaparecido', titulo: 'Niño de 8 años', foto, consentimiento: true });
  const ver = (usuario) => env.como(usuario, async (tx) => (await tx.query(`select name from storage.objects`)).rows.length);
  assert.equal(await ver(vecino), 0);
  assert.equal(await ver(autor), 1);
  assert.equal(await ver(validador), 1);
});

// ─── Mis zonas, Telegram, métricas, cuenta ─────────────────────────────────

test('mis zonas: máximo 3, y una zona cercana hace que el teléfono reciba la alerta aunque esté lejos', async () => {
  const lejos = await env.telefonoEn(PUNTOS.D, 'D');
  const insertarZona = (nombre, punto) => env.como(lejos, async (tx) =>
    tx.query(`insert into zonas_usuario (usuario_id, nombre, celda) values ($1, $2, $3)`,
      [lejos.id, nombre, punto]));
  await insertarZona('Escuela de Ana', await env.celda(PUNTOS.A));
  await insertarZona('Casa', await env.celda(PUNTOS.D));
  await insertarZona('Trabajo', '9epq69');
  await assert.rejects(insertarZona('Gimnasio', '9epq6x'), /máximo 3 zonas/);

  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio cerca de la escuela' });
  assert.deepEqual(await env.enviarAnillo(r.alerta_id, 1000, [lejos]), ['D']);
});

test('Telegram: solo los suscriptores cercanos y activos reciben la alerta', async () => {
  await env.sql(`insert into suscriptores_telegram (chat_id, celda) values (111, $1), (222, $2), (333, $1)`,
    [await env.celda(PUNTOS.A), await env.celda(PUNTOS.D)]);
  await env.sql(`update suscriptores_telegram set activo = false where chat_id = 333`);
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio en bodega' });
  const chats = await env.sql(`select chat_id from telegram_objetivo($1, 1000)`, [r.alerta_id]);
  assert.deepEqual(chats.map((c) => Number(c.chat_id)), [111]);
});

test('métricas y vista del panel para validadores', async () => {
  const autor = await env.crearUsuario();
  const validador = await env.crearUsuario({ rol: 'validador', institucion: 'Protección Civil (demo)' });
  const pendiente = await env.reportar(autor, { categoria: 'menor_desaparecido', titulo: 'Niño perdido', folio: 'F-911-1' });
  await env.reportar(autor, { categoria: 'incendio', titulo: 'Incendio en bodega', punto: PUNTOS.C });
  await env.sql(`update alertas set creada_en = now() - interval '3 minutes' where id = $1`, [pendiente.alerta_id]);
  await env.rpc(validador, 'validar_alerta', { p_alerta: pendiente.alerta_id, p_accion: 'verificar' });

  await env.telefonoEn(PUNTOS.A, 'A');
  await env.telefonoEn(PUNTOS.B, 'B');
  const [m] = await env.como(validador, async (tx) => (await tx.query(`select * from metricas`)).rows);
  assert.equal(m.activas, 2);
  assert.equal(m.por_validar, 0);
  assert.ok(m.segundos_validacion >= 179 && m.segundos_validacion <= 190, `segundos: ${m.segundos_validacion}`);
  assert.equal(m.dispositivos_activos, 2, 'teléfonos registrados para recibir push');
  const [delAutor] = await env.como(autor, async (tx) => (await tx.query(`select * from metricas`)).rows);
  assert.equal(delAutor.dispositivos_activos, null, 'el conteo de teléfonos es solo para validadores');

  const panel = await env.como(validador, async (tx) =>
    (await tx.query(`select titulo, folio_911, autor_reputacion, validador_institucion from alertas_panel order by titulo`)).rows);
  assert.deepEqual(panel, [
    { titulo: 'Incendio en bodega', folio_911: null, autor_reputacion: 1, validador_institucion: null },
    { titulo: 'Niño perdido', folio_911: 'F-911-1', autor_reputacion: 1, validador_institucion: 'Protección Civil (demo)' },
  ]);
  const [publica] = await env.rpc(autor, 'obtener_alerta', { p_alerta: pendiente.alerta_id });
  assert.equal(publica.validada_por, 'Protección Civil (demo)');
  assert.equal('folio_911' in publica, false, 'el folio nunca sale en la vista pública');
});

test('borrar mi cuenta elimina perfil, dispositivos y zonas; sus alertas quedan sin autor', async () => {
  const u = await env.telefonoEn(PUNTOS.A, 'A');
  await env.sql(`update auth.users set is_anonymous = false, phone = '525599990000', phone_confirmed_at = now()
                 where id = $1`, [u.id]);
  const verificado = { ...u, anonimo: false };
  await env.como(verificado, (tx) =>
    tx.query(`insert into zonas_usuario (usuario_id, nombre, celda) values ($1, 'Casa', '9epq4t')`, [u.id]));
  const r = await env.reportar(verificado, { categoria: 'otro', titulo: 'Cable caído en la calle' });
  await env.rpc(verificado, 'borrar_mi_cuenta');
  for (const tabla of ['perfiles', 'dispositivos', 'zonas_usuario']) {
    const [{ n }] = await env.sql(`select count(*)::int as n from ${tabla}`);
    assert.equal(n, 0, tabla);
  }
  assert.equal((await env.alerta(r.alerta_id)).creada_por, null);
});

test('sin secretos en Vault la alerta se guarda igual y solo se omite el envío', async () => {
  await env.sql(`delete from vault.secrets`);
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio en bodega' });
  assert.equal(r.estado, 'verificada');
  assert.equal((await env.llamadasANotificar()).length, 0);
});

test('retención: limpieza diaria y fotos por borrar', async () => {
  const u = await env.crearUsuario();
  const foto = `${u.id}/vieja.jpg`;
  const r = await env.reportar(u, { categoria: 'otro', titulo: 'Cable caído en la calle', foto });
  await env.sql(`update alertas set estado = 'resuelta', cerrada_en = now() - interval '91 days' where id = $1`, [r.alerta_id]);
  await env.sql(`insert into storage.objects (bucket_id, name, created_at) values ('fotos', $1, now() - interval '2 days')`,
    [`${u.id}/huerfana.jpg`]);
  const porBorrar = (await env.sql(`select ruta from fotos_por_borrar() order by 1`)).map((f) => f.ruta);
  assert.deepEqual(porBorrar, [`${u.id}/huerfana.jpg`, foto]);
  await env.sql(`select limpieza_diaria()`);
  const a = await env.alerta(r.alerta_id);
  assert.equal(a.descripcion, null);
  assert.equal(a.creada_por, null);
  await env.sql(`select olvidar_fotos($1)`, [[foto]]);
  assert.equal((await env.alerta(r.alerta_id)).foto_path, null);
});

// ─── P19: carga ─────────────────────────────────────────────────────────────

test('P19: con 5,000 teléfonos la búsqueda de destinatarios usa el índice espacial', async () => {
  const u = await env.crearUsuario({ anonimo: true });
  await env.sql(`
    insert into dispositivos (usuario_id, fcm_token, plataforma, celda)
    select $1, 'falso-' || g, 'android',
           st_geohash(st_setsrid(st_makepoint(-102.1942 + (random() - 0.5) * 0.2,
                                              17.9581  + (random() - 0.5) * 0.2), 4326), 6)
    from generate_series(1, 5000) g`, [u.id]);
  await env.sql(`analyze dispositivos`);
  const pc = await env.crearUsuario({ rol: 'institucion' });
  const r = await env.reportar(pc, { categoria: 'incendio', titulo: 'Incendio en bodega' });

  const plan = (await env.sql(`explain analyze
    select d.id from alertas a, dispositivos d
    where a.id = '${r.alerta_id}' and d.activo and st_dwithin(d.centro_celda, a.ubicacion, 3700)`))
    .map((f) => f['QUERY PLAN']).join('\n');
  assert.match(plan, /dispositivos_centro_idx/, plan);
  const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)[1]);
  console.log(`      P19 · consulta espacial sobre 5,000 dispositivos: ${ms.toFixed(2)} ms (índice dispositivos_centro_idx)`);

  const t0 = performance.now();
  const destinos = await env.sql(`select count(*)::int as n from dispositivos_objetivo($1, 3000)`, [r.alerta_id]);
  console.log(`      P19 · dispositivos_objetivo(3 km): ${destinos[0].n} destinatarios en ${(performance.now() - t0).toFixed(1)} ms`);
  assert.ok(destinos[0].n > 0);
});

// ─── Scripts de operación (docs/despliegue.md y guion de la demo) ──────────

test('los scripts de operación se ejecutan sin errores: vault, validadores, demo y carga', async () => {
  const { readFile } = await import('node:fs/promises');
  const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');
  await env.sql(`delete from vault.secrets`);
  await env.db.exec(await leer('configurar_vault.sql'));
  const secretos = (await env.sql(`select name from vault.secrets order by name`)).map((s) => s.name);
  assert.deepEqual(secretos, ['secreto_funciones', 'url_funciones']);

  await env.sql(`insert into auth.users (email) values ('validador1@example.com'), ('validador2@example.com')`);
  await env.db.exec(await leer('demo/cuentas_validadores.sql'));
  const roles = await env.sql(`select rol from perfiles p join auth.users u on u.id = p.id order by u.email`);
  assert.deepEqual(roles.map((r) => r.rol), ['validador', 'validador']);

  await env.db.exec(await leer('demo/preparar_demo.sql'));
  assert.equal(Number((await env.sql(`select factor_tiempo from config`))[0].factor_tiempo), 30);
  const fondo = await env.sql(`select titulo, estado, radio_manual_m from alertas order by titulo`);
  assert.equal(fondo.length, 2);
  assert.ok(fondo.every((a) => a.estado === 'verificada' && a.radio_manual_m > 0));

  await env.db.exec(await leer('demo/prueba_carga.sql'));
  assert.equal((await env.sql(`select count(*)::int as n from dispositivos where fcm_token like 'falso-%'`))[0].n, 0);

  await env.db.exec(await leer('demo/terminar_demo.sql'));
  assert.equal(Number((await env.sql(`select factor_tiempo from config`))[0].factor_tiempo), 1);
  assert.equal((await env.sql(`select count(*)::int as n from alertas where estado = 'resuelta'`))[0].n, 2);
});
