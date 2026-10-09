// =============================================================================
// ALERTA CERCA · puente de WhatsApp (sin WhatsApp Business)
//
// Vincula un número de WhatsApp normal como "dispositivo vinculado" (igual que WhatsApp Web) y hace
// dos cosas:
//  1. Envía los códigos de verificación que genera Supabase Auth: el Auth Hook los deja en cola
//     (supabase/migrations/010_whatsapp_puente.sql) y este programa los toma cada 2 segundos.
//  2. Atiende al asistente de reportes (013 a 015): entrega cada mensaje de una persona al servidor,
//     que lleva la conversación, y envía la respuesta ENSEGUIDA (con "escribiendo…" y su encuesta).
// Mientras esté apagado, nada de esto funciona: déjalo corriendo en una computadora con internet.
//
// Uso:  npm install   (una vez)   ·   npm start   (o iniciar.cmd)
// La primera vez muestra un QR: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
// Lo que pasa se guarda también en puente.log (con los teléfonos ocultos) y los avisos de WhatsApp en
// puente-baileys.log: si algo falla, ahí está el motivo.
// =============================================================================
import { appendFileSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  Browsers, DisconnectReason, getAggregateVotesInPollMessage, useMultiFileAuthState,
} from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import {
  candidatosJid, ClienteSupabase, coordenadasDeEnlace, entradaDeMensaje, formatoCodigo, leerConfig, oculto,
  tiposDeMensaje, valorElegido,
} from './lib.mjs';

try {
  process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
} catch {
  // sin .env: se usan las variables del sistema
}

// ─── Registro: consola + archivo (para poder ver qué pasó aunque se cierre la ventana) ────────────
const RUTA_LOG = fileURLToPath(new URL('./puente.log', import.meta.url));
const RUTA_LOG_BAILEYS = fileURLToPath(new URL('./puente-baileys.log', import.meta.url));
for (const ruta of [RUTA_LOG, RUTA_LOG_BAILEYS]) {
  try {
    if (statSync(ruta).size > 2_000_000) writeFileSync(ruta, readFileSync(ruta).subarray(-300_000));
  } catch {
    // todavía no existe
  }
}
const decir = (mensaje) => {
  const linea = `[${new Date().toLocaleString('es-MX')}] ${mensaje}`;
  console.log(linea);
  try {
    appendFileSync(RUTA_LOG, `${linea}\n`);
  } catch {
    // el registro nunca debe tumbar el puente
  }
};
process.on('unhandledRejection', (e) => decir(`Error no controlado: ${e?.message ?? e}`));
process.on('uncaughtException', (e) => decir(`Error inesperado: ${e?.message ?? e}`));

let cfg;
try {
  cfg = leerConfig(process.env);
} catch (e) {
  decir(e.message);
  process.exit(1);
}

const servidor = new ClienteSupabase(cfg);
// Aquí se guarda la sesión de WhatsApp (equivale a tener la cuenta abierta): NUNCA la subas a git
const CARPETA_SESION = fileURLToPath(new URL('./sesion/', import.meta.url));

let sock;
let conectado = false;
let numeroPropio = null;
let revisando = false;
let pidioCodigo = false;
let intentosReconexion = 0;
const jidPorTelefono = new Map();
// Encuestas enviadas: Baileys necesita el mensaje original para descifrar los toques (se olvidan a las 3 h)
const encuestas = new Map();

const jidVisible = (jid) => oculto(String(jid ?? '').split('@')[0]);

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION);
  const miSock = (sock = makeWASocket({
    auth: state,
    // Solo avisos y errores de WhatsApp, a un archivo (antes se apagaban: los fallos eran invisibles)
    logger: pino({ level: 'warn' }, pino.destination({ dest: RUTA_LOG_BAILEYS, sync: true })),
    browser: Browsers.windows('ALERTA CERCA'),
    markOnlineOnConnect: false, // el teléfono sigue recibiendo sus notificaciones normales
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, // no hace falta el historial de chats
    getMessage: async (llave) => encuestas.get(llave.id)?.mensaje, // para descifrar los toques
  }));
  sock.ev.on('creds.update', saveCreds);

  // Toques en las encuestas: Baileys descifra el voto y lo entrega en update.pollUpdates
  sock.ev.on('messages.update', async (eventos) => {
    for (const { key, update } of eventos) {
      if (!update?.pollUpdates?.length) continue;
      try {
        await atenderVoto(key, update.pollUpdates);
      } catch (e) {
        decir(`No se pudo atender un toque en una encuesta: ${e.message}`);
      }
    }
  });

  // Mensajes de personas (el asistente para reportar). No se contesta a grupos ni al historial.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        await atenderMensaje(m);
      } catch (e) {
        decir(`No se pudo atender un mensaje: ${e.message}`);
      }
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (miSock !== sock) return; // un socket viejo no decide nada: ya hay uno nuevo
    if (qr && !sock.authState.creds.registered) {
      if (cfg.numero && !pidioCodigo) {
        pidioCodigo = true;
        const codigo = formatoCodigo(await sock.requestPairingCode(cfg.numero));
        decir('Para vincular este número: en su WhatsApp abre Dispositivos vinculados → Vincular un dispositivo →');
        decir(`"Vincular con el número de teléfono" y escribe:   ${codigo}`);
      } else if (!cfg.numero) {
        decir('Escanea este QR con el WhatsApp que enviará los códigos:');
        decir('WhatsApp → Ajustes (o ⋮) → Dispositivos vinculados → Vincular un dispositivo');
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === 'open') {
      conectado = true;
      intentosReconexion = 0;
      numeroPropio = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
      decir(`✅ WhatsApp conectado como +${numeroPropio}. Atendiendo códigos y el asistente de reportes…`);
      await latir();
    } else if (connection === 'close') {
      conectado = false;
      const motivo = lastDisconnect?.error?.output?.statusCode;
      if (motivo === DisconnectReason.loggedOut) {
        decir('Se cerró la sesión desde el teléfono. Hay que vincular de nuevo:');
        rmSync(CARPETA_SESION, { recursive: true, force: true });
        pidioCodigo = false;
      }
      // El socket viejo ya no sirve: se deja de escuchar para no atender un mensaje dos veces
      try {
        sock.ev.removeAllListeners('messages.upsert');
        sock.ev.removeAllListeners('messages.update');
      } catch {
        // nada que quitar
      }
      await latir();
      reconectar(motivo);
    }
  });
}

/** Reconecta esperando cada vez más (3, 6, 12… hasta 60 s) y no se rinde nunca. */
function reconectar(motivo) {
  const espera = Math.min(60_000, 3000 * 2 ** intentosReconexion++);
  decir(`Se cortó la conexión (${motivo ?? 'sin código'}). Reconectando en ${Math.round(espera / 1000)} s…`);
  setTimeout(async () => {
    try {
      await conectar();
    } catch (e) {
      decir(`No se pudo reconectar: ${e.message}`);
      reconectar(null);
    }
  }, espera);
}

/** Señal de vida al servidor (la app avisa si el puente está apagado). */
async function latir() {
  try {
    const modo = await servidor.latido(numeroPropio, conectado, cfg.activar);
    if (conectado && modo !== 'puente') {
      decir(`Aviso: la verificación está en modo "${modo}"; los códigos NO pasan por este puente.`);
      decir('Para usarlo: ACTIVAR_AL_CONECTAR=si en .env, o en Supabase: update config set whatsapp_modo = \'puente\';');
    }
  } catch (e) {
    decir(`No se pudo avisar al servidor: ${e.message}`);
  }
}

async function jidDe(telefono) {
  if (jidPorTelefono.has(telefono)) return jidPorTelefono.get(telefono);
  for (const candidato of candidatosJid(telefono)) {
    const [r] = (await sock.onWhatsApp(candidato)) ?? [];
    if (r?.exists) {
      jidPorTelefono.set(telefono, r.jid);
      return r.jid;
    }
  }
  return null;
}

// ─── Asistente de reportes ────────────────────────────────────────────────────────────────────────
/** "Escribiendo…" un momento, como una persona: se ve natural y baja el riesgo de que lo tomen por robot. */
async function escribiendo(jid, texto) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await esperar(Math.min(1800, 500 + String(texto).length * 5));
    await sock.sendPresenceUpdate('paused', jid);
  } catch {
    // la presencia es un adorno: si falla, se contesta igual
  }
}

/** Manda la encuesta de una respuesta (las opciones se tocan). Si falla, el texto ya trae el número de cada opción. */
async function enviarEncuesta(jid, telefono, encuesta) {
  try {
    const enviada = await sock.sendMessage(jid, {
      poll: { name: encuesta.pregunta, values: encuesta.opciones, selectableCount: 1 },
    });
    const ahora = Date.now();
    for (const [id, e] of encuestas) if (ahora - e.creada > 3 * 60 * 60 * 1000) encuestas.delete(id);
    encuestas.set(enviada.key.id, {
      mensaje: enviada.message,
      jid,
      telefono,
      opciones: encuesta.opciones,
      valores: encuesta.valores,
      respondida: false,
      creada: ahora,
    });
  } catch (e) {
    decir(`No se pudo mandar la encuesta a ${oculto(telefono)}: ${e.message}`);
  }
}

/** Contesta lo que el servidor preparó, sin esperar a la cola. Si falla, la cola lo reintenta en un minuto. */
async function responder(jid, telefono, r) {
  try {
    await escribiendo(jid, r.respuesta);
    await sock.sendMessage(jid, { text: r.respuesta });
    if (r.encuesta?.opciones?.length) {
      await esperar(500 + Math.random() * 400);
      await enviarEncuesta(jid, telefono, r.encuesta);
    }
    await servidor.resultado(r.mensaje_id, true);
    decir(`Respuesta a ${oculto(telefono)} enviada${r.encuesta ? ' (con encuesta)' : ''}`);
  } catch (e) {
    decir(`No se pudo contestar a ${oculto(telefono)}: ${e.message} (la cola lo reintenta en un minuto)`);
  }
}

/** Entrega lo que dijo la persona al servidor y le contesta. `jid` es el chat de donde llegó. */
async function atender(entrada, jid) {
  let r;
  try {
    r = await servidor.recibido({ ...entrada, inmediato: true });
  } catch (e) {
    // Que la persona nunca se quede sin respuesta: si el servidor falla, se lo dice WhatsApp mismo
    decir(`El servidor no respondió a ${oculto(entrada.telefono)}: ${e.message}`);
    await sock.sendMessage(jid, {
      text: 'Disculpe, tuve un problema para atenderle. Intente de nuevo en un momento escribiendo MENU.',
    }).catch(() => {});
    return;
  }
  if (r?.ignorado) {
    decir(`${oculto(entrada.telefono)} escribió demasiado esta hora: no se le contesta`);
    return;
  }
  if (!r?.mensaje_id) {
    decir(`El servidor no devolvió respuesta para ${oculto(entrada.telefono)}`);
    return;
  }
  await responder(jid, entrada.telefono, r);
}

async function atenderMensaje(m) {
  const jid = m.key?.remoteJid ?? '';
  if (m.key?.fromMe || !(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) return; // propios, grupos, estados
  // WhatsApp a veces identifica al contacto con un número interno (@lid): se busca su teléfono
  if (jid.endsWith('@lid') && !m.key.remoteJidAlt) {
    try {
      m.key.remoteJidAlt = (await sock.signalRepository.lidMapping.getPNForLID(jid)) ?? undefined;
    } catch {
      // sin teléfono conocido no se puede contestar: se avisa abajo
    }
  }
  let entrada = entradaDeMensaje(m);
  if (!entrada) {
    const tipos = tiposDeMensaje(m).join(', ') || 'sin contenido';
    const motivo = jid.endsWith('@lid') && !m.key.remoteJidAlt ? 'no se pudo conocer su teléfono (@lid)' : 'no es texto ni ubicación';
    decir(`Ignorado (${jidVisible(jid)}): ${motivo}; llegó: ${tipos}`);
    return;
  }
  // Una ubicación también puede llegar escrita: "17.95, -102.19" o un enlace de Google Maps
  if (entrada.texto && entrada.texto !== '[multimedia]') {
    const lugar = await coordenadasDeEnlace(entrada.texto);
    if (lugar) entrada = { ...entrada, texto: null, lat: lugar.lat, lon: lugar.lon };
  }
  const tipo = entrada.lat != null ? 'ubicación' : entrada.texto === '[multimedia]' ? 'multimedia' : 'texto';
  decir(`Entrante de ${oculto(entrada.telefono)}: ${tipo}`);
  await atender(entrada, jid);
}

async function atenderVoto(key, pollUpdates) {
  const encuesta = encuestas.get(key.id);
  if (!encuesta) {
    // Encuesta de antes de reiniciar el puente: ya no están sus opciones
    decir(`Toque en una encuesta que ya no recuerdo (${jidVisible(key.remoteJid)})`);
    await sock.sendMessage(key.remoteJid, {
      text: 'No pude leer esa respuesta. Escriba el número de la opción, por favor.',
    }).catch(() => {});
    return;
  }
  if (encuesta.respondida) return; // cuenta la primera respuesta
  const votos = getAggregateVotesInPollMessage({ message: encuesta.mensaje, pollUpdates }, sock.user?.id);
  const valor = valorElegido(votos, encuesta.opciones, encuesta.valores);
  if (!valor) {
    decir(`Toque de ${oculto(encuesta.telefono)} sin opción reconocida: ${JSON.stringify(votos.map((v) => [v.name, v.voters.length]))}`);
    return;
  }
  encuesta.respondida = true;
  decir(`Toque de ${oculto(encuesta.telefono)}: ${valor}`);
  await atender({ telefono: encuesta.telefono, texto: valor, lat: null, lon: null }, encuesta.jid);
}

// ─── Cola de salida (códigos de verificación y reintentos) ───────────────────────────────────────────
async function revisarCola() {
  if (!conectado || revisando) return;
  revisando = true;
  try {
    for (const m of await servidor.pendientes(5)) {
      try {
        const jid = await jidDe(m.telefono);
        if (!jid) {
          await servidor.resultado(m.id, false, 'Ese número no tiene WhatsApp');
          decir(`${oculto(m.telefono)}: ese número no tiene WhatsApp`);
          continue;
        }
        await sock.sendMessage(jid, { text: m.texto });
        if (m.encuesta?.opciones?.length) await enviarEncuesta(jid, m.telefono, m.encuesta);
        await servidor.resultado(m.id, true);
        decir(`Mensaje de la cola enviado a ${oculto(m.telefono)}`);
        // Ritmo de persona, no de robot: menos riesgo de que WhatsApp bloquee el número
        await esperar(800 + Math.random() * 1200);
      } catch (e) {
        decir(`No se pudo enviar a ${oculto(m.telefono)}: ${e.message}`);
        await servidor.resultado(m.id, false, String(e.message ?? e)).catch(() => {});
      }
    }
  } catch (e) {
    decir(`No se pudo revisar la cola: ${e.message}`);
  } finally {
    revisando = false;
  }
}

async function apagar() {
  decir('Apagando el puente…');
  conectado = false;
  await latir();
  process.exit(0);
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

decir('ALERTA CERCA · puente de WhatsApp');
await conectar();
setInterval(revisarCola, cfg.intervaloMs);
setInterval(latir, 20_000);
