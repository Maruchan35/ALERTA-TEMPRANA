// =============================================================================
// ALERTA CERCA · Edge Function `whatsapp`: envía el código de verificación por WhatsApp.
//
// La llama el Auth Hook `enviar_codigo_whatsapp()` (009_whatsapp.sql) con pg_net cuando
// `config.whatsapp_simulado` es false. Mientras sea true (sin WhatsApp Business), nadie la llama:
// la app muestra el código como WhatsApp simulado.
//
// Secretos: SECRETO_FUNCIONES, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y, opcionales,
//           WHATSAPP_PLANTILLA, WHATSAPP_IDIOMA y WHATSAPP_API_VERSION.
// Desplegar:  supabase functions deploy whatsapp --no-verify-jwt
// =============================================================================
import { autorizado } from '../_compartido/seguridad.ts';
import { configDesdeEntorno, enviarCodigo } from '../_compartido/whatsapp.ts';

const cfg = configDesdeEntorno();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Usa POST' }, { status: 405 });
  if (!autorizado(req)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!cfg) {
    return Response.json({ error: 'WhatsApp no está configurado (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)' }, {
      status: 503,
    });
  }
  try {
    const { telefono, codigo } = await req.json();
    if (!/^\d{8,15}$/.test(String(telefono ?? '')) || !/^\d{4,10}$/.test(String(codigo ?? ''))) {
      return Response.json({ error: 'Teléfono o código inválido' }, { status: 400 });
    }
    return Response.json({ enviado: true, id: await enviarCodigo(cfg, telefono, codigo) });
  } catch (e) {
    console.error('whatsapp:', e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
});
