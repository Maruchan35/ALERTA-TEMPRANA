// =============================================================================
// ALERTA CERCA · puente de WhatsApp (sin WhatsApp Business)
//
// Vincula un número de WhatsApp normal como "dispositivo vinculado" (igual que WhatsApp Web) y
// envía desde él los códigos de verificación que genera Supabase Auth: el Auth Hook los deja en
// cola (supabase/migrations/010_whatsapp_puente.sql) y este programa los toma cada 2 segundos.
// Mientras esté apagado, los códigos no salen: déjalo corriendo en una computadora con internet.
//
// Uso:  npm install   (una vez)   ·   npm start   (o iniciar.cmd)
// La primera vez muestra un QR: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
// =============================================================================
import { rmSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { candidatosJid, ClienteSupabase, entradaDeMensaje, formatoCodigo, leerConfig, oculto } from './lib.mjs';

try {
  process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
} catch {
  // sin .env: se usan las variables del sistema
}

const decir = (mensaje) => console.log(`[${new Date().toLocaleTimeString('es-MX')}] ${mensaje}`);

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
const jidPorTelefono = new Map();

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION);
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.windows('ALERTA CERCA'),
    markOnlineOnConnect: false, // el teléfono sigue recibiendo sus notificaciones normales
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, // no hace falta el historial de chats
  });
  sock.ev.on('creds.update', saveCreds);
  // Mensajes de personas (el asistente para reportar): el servidor decide qué responder y lo deja en la
  // cola de salida, que revisarCola envía. No se contesta a grupos, estados ni al historial.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      const entrada = entradaDeMensaje(m);
      if (!entrada) continue;
      try {
        await servidor.recibido(entrada);
        decir(`Mensaje de ${oculto(entrada.telefono)} atendido`);
      } catch (e) {
        decir(`No se pudo atender un mensaje de ${oculto(entrada.telefono)}: ${e.message}`);
      }
    }
  });
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
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
      numeroPropio = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
      decir(`✅ WhatsApp conectado como +${numeroPropio}. Enviando los códigos de ALERTA CERCA…`);
      await latir();
    } else if (connection === 'close') {
      conectado = false;
      const motivo = lastDisconnect?.error?.output?.statusCode;
      if (motivo === DisconnectReason.loggedOut) {
        decir('Se cerró la sesión desde el teléfono. Hay que vincular de nuevo:');
        rmSync(CARPETA_SESION, { recursive: true, force: true });
        pidioCodigo = false;
      } else {
        decir(`Se cortó la conexión (${motivo ?? 'sin código'}). Reconectando…`);
      }
      await latir();
      setTimeout(() => conectar().catch((e) => decir(`No se pudo reconectar: ${e.message}`)), 3000);
    }
  });
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
        await servidor.resultado(m.id, true);
        decir(`Código enviado a ${oculto(m.telefono)}`);
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
