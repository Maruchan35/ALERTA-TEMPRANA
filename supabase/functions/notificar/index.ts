// =============================================================================
// ALERTA CERCA · Edge Function `notificar` (paso 2.4): el corazón del envío.
//
// La llama la base de datos (pg_net) cuando una alerta se crea o cambia de estado
// (evento 'estado'), cuando pg_cron amplía su radio (evento 'ampliacion') y cuando un
// validador ajusta el radio (evento 'ajuste'). Según el estado de la alerta:
//   1. resuelta/descartada → avisa el cierre a quienes ya la habían recibido
//   2. pendiente           → avisa solo a los validadores
//   3. subió de confianza  → avisa "AHORA VERIFICADA/CORROBORADA" a quienes la tenían
//   4. anillo nuevo        → envía a los teléfonos dentro del radio que aún no la reciben
//
// Modo emergencia (SOS, 011_emergencias.sql): con `emergencia_id` en lugar de `alerta_id`
// avisa SOLO a los validadores (nunca a los vecinos): 'nueva', 'tipo', 'sin_senal', 'cerrada'.
//
// Secretos: SECRETO_FUNCIONES, FIREBASE_SERVICE_ACCOUNT (opcional), TELEGRAM_BOT_TOKEN (opcional).
// Desplegar:  supabase functions deploy notificar --no-verify-jwt
// =============================================================================
import { clienteServicio } from '../_compartido/supabase.ts';
import { autorizado } from '../_compartido/seguridad.ts';
import { ClienteFcm, type Destino } from '../_compartido/fcm.ts';
import {
  type AlertaAviso,
  datosEmergencia,
  datosPush,
  type EmergenciaAviso,
  type EventoEmergencia,
  textoTelegramCierre,
  textoTelegramNueva,
} from '../_compartido/mensajes.ts';

const sb = clienteServicio();
const fcm = ClienteFcm.desdeEntorno();
const TG = Deno.env.get('TELEGRAM_BOT_TOKEN');

if (!fcm) console.warn('FIREBASE_SERVICE_ACCOUNT no está configurado: se omiten las notificaciones push.');

type Alerta = AlertaAviso & {
  verificada_por: string | null;
  validador: { institucion: string | null; nombre: string | null } | null;
};

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });

/** Dispositivos activos que ya recibieron la alerta (para cierres y actualizaciones). */
async function yaLaRecibieron(alertaId: string): Promise<Destino[]> {
  const { data, error } = await sb.from('entregas')
    .select('dispositivo_id, dispositivos(fcm_token, plataforma, activo)')
    .eq('alerta_id', alertaId);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).filter((e: any) => e.dispositivos?.activo)
    // deno-lint-ignore no-explicit-any
    .map((e: any) => ({
      dispositivo_id: e.dispositivo_id,
      fcm_token: e.dispositivos.fcm_token,
      plataforma: e.dispositivos.plataforma,
    }));
}

async function enviarPush(destinos: Destino[], datos: Record<string, string>) {
  if (!fcm || destinos.length === 0) return 0;
  const { enviados, invalidos } = await fcm.enviarATodos(destinos, datos);
  if (invalidos.length) {
    // La app se desinstaló o el token caducó: no se le vuelve a enviar
    await sb.from('dispositivos').update({ activo: false }).in('id', invalidos);
  }
  return enviados;
}

async function telegram(chatId: number | string, texto: string) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
  });
  if (r.status === 403) {
    // El usuario bloqueó al bot: se da de baja
    await sb.from('suscriptores_telegram').update({ activo: false }).eq('chat_id', chatId);
  }
  return r.ok;
}

/** Anillo nuevo por Telegram. Igual que con los teléfonos, se "aparta" cada envío antes de mandarlo. */
async function telegramAnillo(a: Alerta, radio: number) {
  if (!TG) return 0;
  const { data: chats, error } = await sb.rpc('telegram_objetivo', { p_alerta: a.id, p_radio_m: radio });
  if (error) throw error;
  if (!chats?.length) return 0;
  const { data: apartados } = await sb.from('entregas_telegram')
    .upsert(chats.map((c: { chat_id: number }) => ({ alerta_id: a.id, chat_id: c.chat_id })), {
      onConflict: 'alerta_id,chat_id',
      ignoreDuplicates: true,
    })
    .select('chat_id');
  const texto = textoTelegramNueva(a);
  const resultados = await Promise.all((apartados ?? []).map((c: { chat_id: number }) => telegram(c.chat_id, texto)));
  return resultados.filter(Boolean).length;
}

async function telegramCierre(a: Alerta) {
  if (!TG) return 0;
  const { data } = await sb.from('entregas_telegram').select('chat_id').eq('alerta_id', a.id);
  const texto = textoTelegramCierre(a);
  const resultados = await Promise.all((data ?? []).map((c: { chat_id: number }) => telegram(c.chat_id, texto)));
  return resultados.filter(Boolean).length;
}

/** SOS: aviso de prioridad máxima a los teléfonos de validadores, instituciones y admin. */
async function avisarEmergencia(id: string, evento: EventoEmergencia) {
  const { data: e, error } = await sb.from('emergencias')
    .select('id, estado, tipo, origen, lat, lon, velocidad_ms, bateria, cierre')
    .eq('id', id)
    .maybeSingle<EmergenciaAviso>();
  if (error) throw error;
  if (!e) return json({ error: 'La emergencia no existe' }, 404);
  const { data: val, error: e2 } = await sb.rpc('dispositivos_validadores');
  if (e2) throw e2;
  return json({ validadores: await enviarPush(val ?? [], datosEmergencia(e, evento)) });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!autorizado(req)) return json({ error: 'No autorizado' }, 401);

  try {
    const cuerpo = await req.json();
    if (cuerpo.emergencia_id) return await avisarEmergencia(cuerpo.emergencia_id, cuerpo.evento ?? 'nueva');
    const { alerta_id, evento, anterior } = cuerpo;
    const { data: a, error } = await sb.from('alertas')
      .select(
        '*, categorias(nombre, nombre_corto, nivel, instrucciones), validador:perfiles!alertas_verificada_por_fkey(institucion, nombre)',
      )
      .eq('id', alerta_id)
      .maybeSingle<Alerta>();
    if (error) throw error;
    if (!a) return json({ error: 'La alerta no existe' }, 404);
    const institucion = a.validador?.institucion ?? a.validador?.nombre ?? null;

    // 1) Cierre o descarte: avisar a todos los que ya la tenían
    if (a.estado === 'resuelta' || a.estado === 'descartada') {
      const cierre = await enviarPush(await yaLaRecibieron(a.id), datosPush(a, 'cierre'));
      return json({ cierre, telegram: await telegramCierre(a) });
    }

    // 2) En revisión: avisar solo a los validadores
    if (a.estado === 'pendiente') {
      const { data: val, error: e } = await sb.rpc('dispositivos_validadores');
      if (e) throw e;
      return json({ validadores: await enviarPush(val ?? [], datosPush(a, 'validacion')) });
    }

    if (a.estado === 'expirada') return json({ omitida: 'expirada' });

    // 3) Subió de confianza (p. ej. ahora está VERIFICADA): avisar a quienes ya la tenían
    let actualizados = 0;
    if (
      evento === 'estado' && ['corroborada', 'verificada'].includes(a.estado) &&
      ['no_confirmada', 'corroborada'].includes(anterior)
    ) {
      actualizados = await enviarPush(await yaLaRecibieron(a.id), datosPush(a, 'actualizacion', { institucion }));
    }

    // 4) Anillo nuevo: teléfonos dentro del radio permitido que aún no la reciben
    const { data: radio, error: e2 } = await sb.rpc('radio_permitido', { p_alerta: a.id });
    if (e2) throw e2;
    if (!radio || radio <= 0) return json({ actualizados });
    if (radio > a.radio_actual_m) {
      await sb.from('alertas').update({ radio_actual_m: radio }).eq('id', a.id);
    }

    let enviados = 0;
    if (fcm) {
      const { data: candidatos, error: e3 } = await sb.rpc('dispositivos_objetivo', {
        p_alerta: a.id,
        p_radio_m: radio,
      });
      if (e3) throw e3;
      if (candidatos?.length) {
        // "Apartamos" cada envío en `entregas` ANTES de mandarlo: si dos ejecuciones coinciden,
        // solo una logra insertar la fila, y solo esa envía. Así nadie la recibe dos veces.
        const { data: apartados, error: e4 } = await sb.from('entregas')
          .upsert(
            candidatos.map((d: Destino) => ({ alerta_id: a.id, dispositivo_id: d.dispositivo_id, radio_m: radio })),
            { onConflict: 'alerta_id,dispositivo_id', ignoreDuplicates: true },
          )
          .select('dispositivo_id');
        if (e4) throw e4;
        const ids = new Set((apartados ?? []).map((e: { dispositivo_id: string }) => e.dispositivo_id));
        enviados = await enviarPush(
          candidatos.filter((d: Destino) => ids.has(d.dispositivo_id)),
          datosPush(a, 'nueva', { radio_m: radio }),
        );
      }
    }
    const telegramEnviados = await telegramAnillo(a, radio);
    return json({ radio, enviados, actualizados, telegram: telegramEnviados });
  } catch (e) {
    console.error('notificar:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
