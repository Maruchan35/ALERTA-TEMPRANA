import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { configDesdeEntorno, enviarCodigo, mensajeCodigo } from './whatsapp.ts';

const entornoDe = (valores: Record<string, string>) => (nombre: string) => valores[nombre];

Deno.test('sin token o sin número de envío, WhatsApp de verdad no está configurado', () => {
  assertEquals(configDesdeEntorno(entornoDe({})), null);
  assertEquals(configDesdeEntorno(entornoDe({ WHATSAPP_TOKEN: 't' })), null);
  assertEquals(configDesdeEntorno(entornoDe({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' })), {
    token: 't',
    numeroId: '123',
    plantilla: 'codigo_verificacion',
    idioma: 'es_MX',
    version: 'v23.0',
  });
});

Deno.test('mensajeCodigo arma la plantilla de autenticación con el código en el texto y en el botón', () => {
  assertEquals(mensajeCodigo('+52 55 1111 1111', '482913', 'codigo_verificacion', 'es_MX'), {
    messaging_product: 'whatsapp',
    to: '525511111111',
    type: 'template',
    template: {
      name: 'codigo_verificacion',
      language: { code: 'es_MX' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
      ],
    },
  });
});

Deno.test('enviarCodigo llama a la Graph API con el token y devuelve el id del mensaje', async () => {
  const cfg = configDesdeEntorno(entornoDe({ WHATSAPP_TOKEN: 'secreto', WHATSAPP_PHONE_NUMBER_ID: '987' }))!;
  let url = '';
  let encabezados: HeadersInit | undefined;
  const fetchFalso = ((u: string, init?: RequestInit) => {
    url = u;
    encabezados = init?.headers;
    return Promise.resolve(Response.json({ messages: [{ id: 'wamid.ABC' }] }));
  }) as typeof fetch;
  assertEquals(await enviarCodigo(cfg, '525511111111', '123456', fetchFalso), 'wamid.ABC');
  assertEquals(url, 'https://graph.facebook.com/v23.0/987/messages');
  assertEquals((encabezados as Record<string, string>).Authorization, 'Bearer secreto');

  const rechazo = (() => Promise.resolve(new Response('{"error":"plantilla"}', { status: 400 }))) as typeof fetch;
  await assertRejects(() => enviarCodigo(cfg, '525511111111', '123456', rechazo), Error, 'WhatsApp respondió 400');
});
