// Entorno de pruebas: PostgreSQL 17 + PostGIS reales (PGlite, en WebAssembly) con una
// emulación mínima de Supabase. Aplica las migraciones y el seed tal como están en el repo.
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizSupabase = path.resolve(aqui, '..');

// Puntos de la demo (paso 5.3 de la propuesta)
export const PUNTOS = {
  suceso: { lat: 17.9581, lon: -102.1942 }, // centro de Lázaro Cárdenas (aprox.)
  A: { lat: 17.9608, lon: -102.1942 },      // 300 m al norte
  B: { lat: 17.9815, lon: -102.1942 },      // 2.6 km al norte
  C: { lat: 18.0121, lon: -102.1942 },      // 6 km al norte
  D: { lat: 17.6417, lon: -101.5517 },      // Zihuatanejo, 76 km
};

export async function crearEntorno() {
  const db = new PGlite({ extensions: { postgis } });
  await db.exec(await readFile(path.join(aqui, 'stubs_supabase.sql'), 'utf8'));
  await db.exec('set search_path = public, extensions');

  const migraciones = (await readdir(path.join(raizSupabase, 'migrations')))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const archivo of migraciones) {
    let sql = await readFile(path.join(raizSupabase, 'migrations', archivo), 'utf8');
    // pg_cron y pg_net no existen en PGlite: los emulan los stubs
    sql = sql.replace(/^create extension if not exists (pg_cron|pg_net)[^;]*;/gim, '-- (emulado en pruebas)');
    // Como en `supabase db push`: cada archivo corre en una sesión SIN el esquema `extensions`
    // en el search_path, así que cada migración debe declararlo (PostGIS vive ahí).
    await db.exec(`set search_path = "$user", public`);
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Falló la migración ${archivo}: ${e.message}`);
    }
  }
  await db.exec(await readFile(path.join(raizSupabase, 'seed.sql'), 'utf8'));
  return new Entorno(db, migraciones);
}

export class Entorno {
  constructor(db, migraciones) {
    this.db = db;
    this.migraciones = migraciones;
    this.contador = 0;
  }

  /** Consulta como superusuario (equivale al SQL Editor de Supabase). */
  async sql(consulta, parametros = []) {
    return (await this.db.query(consulta, parametros)).rows;
  }

  /** Deja la base como recién migrada (conserva catálogo, config y secretos de prueba). */
  async limpiar() {
    await this.db.exec(`
      truncate alertas, dispositivos, zonas_usuario, entregas, confirmaciones,
               suscriptores_telegram, entregas_telegram, bitacora, storage.objects,
               net.solicitudes, privado.mensajes_whatsapp, emergencias, emergencia_puntos,
               emergencia_evidencias restart identity cascade;
      delete from auth.users;
      update config set factor_tiempo = 1, minutos_espera_validador = 5, confirmaciones_corroborar = 3,
                        confirmaciones_colmena = 6, radio_max_corroborada_m = 3000, radio_max_colmena_m = 10000,
                        reportes_por_hora = 10, whatsapp_modo = 'simulado', emergencias_por_hora = 5,
                        minutos_sin_senal = 2, dias_retencion_emergencia = 30;
      update privado.puente_whatsapp set numero = null, conectado = false, latido_en = null;
      delete from vault.secrets;
      select vault.create_secret('https://prueba.supabase.co/functions/v1', 'url_funciones');
      select vault.create_secret('secreto-de-prueba', 'secreto_funciones');
      select vault.create_secret('secreto-del-puente-de-prueba-0123456789abcdef', 'secreto_puente');
    `);
  }

  /**
   * Crea un usuario de Auth (el trigger le crea su perfil) y opcionalmente le da un rol.
   * Por defecto tiene teléfono verificado; `soloCorreo` crea una cuenta de correo sin teléfono.
   */
  async crearUsuario({ anonimo = false, rol = 'ciudadano', institucion = null, nombre = null, soloCorreo = false } = {}) {
    this.contador += 1;
    const correo = anonimo ? null : `u${this.contador}@prueba.mx`;
    const telefono = anonimo || soloCorreo ? null : `52551111${String(this.contador).padStart(4, '0')}`;
    const [u] = await this.sql(
      `insert into auth.users (email, phone, is_anonymous, email_confirmed_at, phone_confirmed_at)
       values ($1::text, $2::text, $3, case when $1::text is not null then now() end,
               case when $2::text is not null then now() end) returning id`,
      [correo, telefono, anonimo],
    );
    if (rol !== 'ciudadano' || institucion || nombre) {
      await this.sql(`update perfiles set rol = $2, institucion = $3, nombre = $4 where id = $1`,
        [u.id, rol, institucion, nombre]);
    }
    return { id: u.id, anonimo };
  }

  /**
   * Ejecuta `fn(tx)` como lo haría una petición desde la app: rol `authenticated` con los
   * claims del JWT (o rol `anon` si no hay usuario). Las reglas RLS aplican.
   */
  async como(usuario, fn) {
    return this.db.transaction(async (tx) => {
      if (usuario) {
        const claims = { sub: usuario.id, role: 'authenticated', is_anonymous: Boolean(usuario.anonimo) };
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        await tx.exec('set local role authenticated');
      } else {
        await tx.exec('set local role anon');
      }
      return fn(tx);
    });
  }

  /** Llama una función como `supabase.rpc(nombre, args)`. Devuelve las filas. */
  async rpc(usuario, nombre, args = {}) {
    const claves = Object.keys(args);
    const lista = claves.map((k, i) => `${k} => $${i + 1}`).join(', ');
    return this.como(usuario, async (tx) =>
      (await tx.query(`select * from ${nombre}(${lista})`, claves.map((k) => args[k]))).rows);
  }

  /** crear_reporte con valores por defecto razonables. Devuelve el jsonb de respuesta. */
  async reportar(usuario, { categoria = 'incendio', titulo = 'Humo en una bodega', punto = PUNTOS.suceso, ...resto } = {}) {
    const [fila] = await this.rpc(usuario, 'crear_reporte', {
      p_categoria: categoria,
      p_titulo: titulo,
      p_descripcion: resto.descripcion ?? 'Descripción de prueba',
      p_referencia: resto.referencia ?? 'Frente al mercado',
      p_lat: punto.lat,
      p_lon: punto.lon,
      p_foto_path: resto.foto ?? null,
      p_folio_911: resto.folio ?? null,
      p_consentimiento: resto.consentimiento ?? false,
    });
    return fila.crear_reporte;
  }

  /** Celda geohash de 6 caracteres calculada por PostGIS. */
  async celda(punto) {
    const [r] = await this.sql(
      `select st_geohash(st_setsrid(st_makepoint($2, $1), 4326), 6) as celda`, [punto.lat, punto.lon]);
    return r.celda;
  }

  /** Teléfono anónimo registrado en la celda de `punto` (como al abrir la app). */
  async telefonoEn(punto, nombre) {
    const usuario = await this.crearUsuario({ anonimo: true });
    await this.rpc(usuario, 'registrar_dispositivo', {
      p_token: `token-${nombre}-${usuario.id}`,
      p_plataforma: 'android',
      p_celda: await this.celda(punto),
    });
    const [d] = await this.sql(`select id from dispositivos where usuario_id = $1`, [usuario.id]);
    return { ...usuario, nombre, dispositivoId: d.id };
  }

  async radio(alertaId) {
    const [r] = await this.sql(`select radio_permitido($1) as radio`, [alertaId]);
    return r.radio;
  }

  /** Emula lo que hace la Edge Function `notificar` con un anillo: aparta y "envía". */
  async enviarAnillo(alertaId, radio, telefonos) {
    const destinos = await this.sql(
      `select dispositivo_id from dispositivos_objetivo($1, $2)`, [alertaId, radio]);
    for (const d of destinos) {
      await this.sql(`insert into entregas (alerta_id, dispositivo_id, radio_m) values ($1, $2, $3)
                      on conflict do nothing`, [alertaId, d.dispositivo_id, radio]);
    }
    const porId = new Map(telefonos.map((t) => [t.dispositivoId, t.nombre]));
    return destinos.map((d) => porId.get(d.dispositivo_id) ?? d.dispositivo_id).sort();
  }

  async retrocederPublicacion(alertaId, minutos) {
    await this.sql(`update alertas set publicada_en = now() - make_interval(mins => $2) where id = $1`,
      [alertaId, minutos]);
  }

  async alerta(alertaId) {
    const [a] = await this.sql(`select * from alertas where id = $1`, [alertaId]);
    return a;
  }

  async llamadasANotificar() {
    return this.sql(`select url, headers, body from net.solicitudes where url like '%/notificar' order by id`);
  }

  /** Avisos de emergencia (SOS) que la base de datos pidió a `notificar`, en orden. */
  async avisosDeEmergencia() {
    return (await this.llamadasANotificar())
      .filter((l) => l.body.emergencia_id)
      .map((l) => ({ emergencia_id: l.body.emergencia_id, evento: l.body.evento }));
  }

  /** Activa el SOS como lo hace la app. Devuelve el jsonb de respuesta. */
  async sos(usuario, { punto = PUNTOS.suceso, origen = 'boton', precision = 15, bateria = 80 } = {}) {
    const [fila] = await this.rpc(usuario, 'iniciar_emergencia', {
      p_lat: punto.lat, p_lon: punto.lon, p_precision_m: precision, p_origen: origen, p_bateria: bateria,
    });
    return fila.iniciar_emergencia;
  }

  /** Una señal del teléfono (ubicación, velocidad, batería). Devuelve lo que ve la persona. */
  async senal(usuario, emergenciaId, { punto = PUNTOS.suceso, velocidad = null, bateria = null } = {}) {
    const [fila] = await this.rpc(usuario, 'senal_emergencia', {
      p_emergencia: emergenciaId, p_lat: punto.lat, p_lon: punto.lon, p_precision_m: 10,
      p_velocidad_ms: velocidad, p_bateria: bateria,
    });
    return fila.senal_emergencia;
  }

  async emergencia(id) {
    const [e] = await this.sql(`select * from emergencias where id = $1`, [id]);
    return e;
  }
}
