// Funciones del puente que no dependen de WhatsApp (se prueban en lib.test.mjs).

/** Lee la configuración del .env. Lanza un error claro si falta algo. */
export function leerConfig(env) {
  const url = (env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const llave = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  const secreto = (env.SECRETO_PUENTE ?? '').trim();
  const faltan = [
    !url && 'SUPABASE_URL',
    !llave && 'SUPABASE_PUBLISHABLE_KEY',
    secreto.length < 32 && 'SECRETO_PUENTE (32 caracteres o más)',
  ].filter(Boolean);
  if (faltan.length) throw new Error(`Falta en .env: ${faltan.join(', ')}. Copia .env.ejemplo como .env y llénalo.`);
  const intervalo = Number(env.INTERVALO_MS ?? 2000);
  return {
    url,
    llave,
    secreto,
    // Opcional: vincular con un código de 8 letras en vez de escanear el QR
    numero: (env.WHATSAPP_NUMERO ?? '').replace(/\D/g, '') || null,
    // Al conectarse, la verificación pasa sola a modo "puente" (salvo ACTIVAR_AL_CONECTAR=no)
    activar: (env.ACTIVAR_AL_CONECTAR ?? 'si').trim().toLowerCase() !== 'no',
    intervaloMs: Number.isFinite(intervalo) && intervalo >= 500 ? intervalo : 2000,
  };
}

/**
 * Celulares de México: WhatsApp los conoce como 52 + 10 dígitos o, en cuentas antiguas,
 * 521 + 10 dígitos. Se prueban ambos (el primero que exista gana).
 */
export function candidatosJid(telefono) {
  const t = String(telefono ?? '').replace(/\D/g, '');
  if (/^52\d{10}$/.test(t)) return [t, `521${t.slice(2)}`];
  if (/^521\d{10}$/.test(t)) return [t, `52${t.slice(3)}`];
  return t ? [t] : [];
}

/** Para los registros: solo los últimos 4 dígitos. */
export const oculto = (telefono) => `•••• ${String(telefono ?? '').slice(-4)}`;

/** "ABCD1234" → "ABCD-1234" (como lo muestra WhatsApp al vincular con número). */
export const formatoCodigo = (codigo) => String(codigo ?? '').replace(/^(.{4})(.{4})$/, '$1-$2');

/** Llamadas a las funciones del servidor (010_whatsapp_puente.sql) con la publishable key + el secreto. */
export class ClienteSupabase {
  constructor({ url, llave, secreto }, fetchFn = fetch) {
    this.url = url;
    this.llave = llave;
    this.secreto = secreto;
    this.fetchFn = fetchFn;
  }

  async #rpc(nombre, argumentos) {
    const r = await this.fetchFn(`${this.url}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: { apikey: this.llave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secreto: this.secreto, ...argumentos }),
    });
    const texto = await r.text();
    if (!r.ok) {
      if (/No autorizado/.test(texto)) {
        throw new Error('El servidor rechazó el secreto: SECRETO_PUENTE no coincide con "secreto_puente" de Vault');
      }
      throw new Error(`${nombre} respondió ${r.status}: ${texto.slice(0, 200)}`);
    }
    return texto ? JSON.parse(texto) : null;
  }

  /** Toma hasta `limite` mensajes por enviar: [{ id, telefono, texto }]. */
  pendientes(limite = 5) {
    return this.#rpc('whatsapp_pendientes', { p_limite: limite }).then((filas) => filas ?? []);
  }

  resultado(id, ok, error = null) {
    return this.#rpc('whatsapp_resultado', { p_id: id, p_ok: ok, p_error: error });
  }

  /** Señal de vida. Devuelve el modo de verificación actual ('simulado' | 'puente' | 'meta'). */
  latido(numero, conectado, activar = false) {
    return this.#rpc('whatsapp_latido', { p_numero: numero, p_conectado: conectado, p_activar: activar });
  }
}
