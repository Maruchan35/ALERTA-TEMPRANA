// WhatsApp Cloud API (Meta): mensaje con el código de verificación. Para usarlo hace falta una
// cuenta de WhatsApp Business, un número que envíe y una plantilla de tipo "autenticación"
// aprobada (Meta exige plantilla para escribirle primero a alguien). Mientras tanto la app usa
// WhatsApp SIMULADO (009_whatsapp.sql) y esta función no se llama.

export interface ConfigWhatsapp {
  /** WHATSAPP_TOKEN: token de acceso (usuario del sistema) de Meta. */
  token: string;
  /** WHATSAPP_PHONE_NUMBER_ID: id del número que envía (no el número en sí). */
  numeroId: string;
  /** WHATSAPP_PLANTILLA: nombre de la plantilla de autenticación aprobada. */
  plantilla: string;
  /** WHATSAPP_IDIOMA: idioma de la plantilla. */
  idioma: string;
  /** WHATSAPP_API_VERSION: versión de la Graph API. */
  version: string;
}

/** null si faltan los secretos (WhatsApp de verdad todavía no está configurado). */
export function configDesdeEntorno(
  entorno: (nombre: string) => string | undefined = (nombre) => Deno.env.get(nombre),
): ConfigWhatsapp | null {
  const token = entorno('WHATSAPP_TOKEN');
  const numeroId = entorno('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !numeroId) return null;
  return {
    token,
    numeroId,
    plantilla: entorno('WHATSAPP_PLANTILLA') || 'codigo_verificacion',
    idioma: entorno('WHATSAPP_IDIOMA') || 'es_MX',
    version: entorno('WHATSAPP_API_VERSION') || 'v23.0',
  };
}

/** Cuerpo de la plantilla de autenticación: el código va en el texto y en el botón "Copiar código". */
export function mensajeCodigo(telefono: string, codigo: string, plantilla: string, idioma: string) {
  return {
    messaging_product: 'whatsapp',
    to: telefono.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: plantilla,
      language: { code: idioma },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: codigo }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
      ],
    },
  };
}

/** Envía el código. Devuelve el id del mensaje de WhatsApp; lanza un error si Meta lo rechaza. */
export async function enviarCodigo(
  cfg: ConfigWhatsapp,
  telefono: string,
  codigo: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const r = await fetchFn(`https://graph.facebook.com/${cfg.version}/${cfg.numeroId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensajeCodigo(telefono, codigo, cfg.plantilla, cfg.idioma)),
  });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const cuerpo = await r.json();
  return cuerpo?.messages?.[0]?.id ?? null;
}
