// =============================================================================
// ALERTA CERCA · Edge Function `telegram-webhook` (paso 4.1): canal alterno para
// quien no quiere instalar la app. La persona comparte su ubicación una vez y el bot
// guarda SOLO su celda de ~1 km.
//
// Secretos: TELEGRAM_BOT_TOKEN, TELEGRAM_SECRETO.
// Desplegar:  supabase functions deploy telegram-webhook --no-verify-jwt
// (Telegram no manda JWT de Supabase; se autentica con el encabezado secreto del webhook.)
// =============================================================================
import { clienteServicio } from '../_compartido/supabase.ts';
import { geohash } from '../_compartido/geohash.ts';
import { igualesSeguro } from '../_compartido/seguridad.ts';
import { AVISO_911, ESTADO_LEGIBLE, mapaUrl } from '../_compartido/mensajes.ts';

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SECRETO = Deno.env.get('TELEGRAM_SECRETO')!;
const sb = clienteServicio();

const TECLADO_UBICACION = {
  keyboard: [[{ text: '📍 Compartir mi ubicación', request_location: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const BIENVENIDA = [
  'Hola, soy ALERTA CERCA 👋',
  'Te aviso de emergencias que ocurran cerca de tu zona: menores o personas desaparecidas, incendios, inundaciones, robos de vehículos y más.',
  '',
  'Toca «Compartir mi ubicación» para empezar. Solo guardamos una zona de ~1 km, nunca tu ubicación exacta.',
  '',
  'Comandos: /alertas (alertas activas cerca) · /baja (dejar de recibir) · /privacidad · /ayuda',
  '',
  AVISO_911,
].join('\n');

const PRIVACIDAD = [
  '🔒 Privacidad en ALERTA CERCA',
  '• Guardamos tu identificador de chat de Telegram y una celda de ~1.2 × 0.6 km, no tu ubicación exacta.',
  '• No guardamos historial de recorridos.',
  '• Registramos qué alertas te enviamos durante 30 días para no repetirlas.',
  '• Escribe /baja para dejar de recibir alertas en cualquier momento.',
].join('\n');

function responder(chatId: number, text: string, replyMarkup?: unknown) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup, disable_web_page_preview: true }),
  });
}

async function alertasCerca(chatId: number) {
  const { data: sus } = await sb.from('suscriptores_telegram').select('celda, activo').eq('chat_id', chatId)
    .maybeSingle();
  if (!sus?.activo) {
    return responder(
      chatId,
      'Primero comparte tu ubicación para saber qué alertas hay cerca de ti.',
      TECLADO_UBICACION,
    );
  }
  const { data, error } = await sb.rpc('alertas_cercanas', { p_celda: sus.celda, p_radio_m: 10000 });
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  const activas = (data ?? []).filter((a: any) => ['no_confirmada', 'corroborada', 'verificada'].includes(a.estado));
  if (!activas.length) return responder(chatId, '✅ No hay alertas activas a menos de 10 km de tu zona.');
  // deno-lint-ignore no-explicit-any
  const lineas = activas.slice(0, 10).map((a: any) =>
    `• ${a.nombre_corto.toUpperCase()} (${ESTADO_LEGIBLE[a.estado]}): ${a.titulo}\n  ${mapaUrl(a.lat, a.lon)}`
  );
  return responder(chatId, `Alertas activas a menos de 10 km:\n\n${lineas.join('\n\n')}\n\n${AVISO_911}`);
}

Deno.serve(async (req) => {
  // Telegram manda este encabezado con el secreto que registramos en setWebhook
  const recibido = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!SECRETO || !igualesSeguro(recibido, SECRETO)) {
    return new Response('No autorizado', { status: 401 });
  }
  try {
    const { message } = await req.json();
    if (!message?.chat?.id) return new Response('ok');
    const chat: number = message.chat.id;
    const texto: string = (message.text ?? '').trim().split('@')[0].toLowerCase();

    if (message.location) {
      const celda = geohash(message.location.latitude, message.location.longitude, 6);
      const { error } = await sb.from('suscriptores_telegram').upsert({ chat_id: chat, celda, activo: true });
      if (error) throw error;
      await responder(
        chat,
        `✅ Listo. Te avisaré de alertas cerca de esa zona (celda ${celda}).\n` +
          'Solo guardamos una zona de ~1 km, no tu ubicación exacta. Si te mudas, vuelve a compartir tu ubicación.\n' +
          'Escribe /alertas para ver lo que hay activo y /baja para dejar de recibirlas.',
        { remove_keyboard: true },
      );
    } else if (texto === '/baja' || texto === '/stop') {
      await sb.from('suscriptores_telegram').update({ activo: false }).eq('chat_id', chat);
      await responder(chat, 'Te diste de baja: ya no recibirás alertas. Escribe /start para volver.');
    } else if (texto === '/alertas') {
      await alertasCerca(chat);
    } else if (texto === '/privacidad') {
      await responder(chat, PRIVACIDAD);
    } else {
      await responder(chat, BIENVENIDA, TECLADO_UBICACION);
    }
  } catch (e) {
    console.error('telegram-webhook:', e);
  }
  // Siempre 200: si no, Telegram reintenta el mismo mensaje una y otra vez
  return new Response('ok');
});
