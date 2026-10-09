# Puente de WhatsApp (sin WhatsApp Business)

Envía los códigos de verificación de ALERTA CERCA desde un número de WhatsApp **normal**, vinculado como
dispositivo (igual que WhatsApp Web). No usa WhatsApp Business ni cuesta por mensaje.

## Cómo funciona

1. Alguien pide su código en la app → Supabase Auth lo genera y el Auth Hook lo deja **en cola**
   ([010_whatsapp_puente.sql](../supabase/migrations/010_whatsapp_puente.sql)). La app ya no ve el código.
2. Este programa revisa la cola cada 2 segundos (`whatsapp_pendientes`), envía el mensaje por WhatsApp y reporta el
   resultado (`whatsapp_resultado`). Lo que no se pudo enviar se reintenta; un código de más de 10 minutos ya no sale.
3. Cada 20 segundos avisa que sigue vivo (`whatsapp_latido`). Si se apaga, la app muestra “el servicio de WhatsApp
   está desconectado”.

Se autentica con un secreto propio (`secreto_puente` en Vault), nunca con la `service_role` key.

## Ponerlo en marcha

1. Node.js 20 o más. En esta carpeta: `npm install`.
2. Copia `.env.ejemplo` como `.env` y llena `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SECRETO_PUENTE`. El
   secreto es el mismo que se guarda en Vault (SQL Editor):
   `select vault.create_secret('LA_MISMA_CADENA_LARGA', 'secreto_puente');`
3. `npm start` (o doble clic en `iniciar.cmd`) y escanea el QR con el WhatsApp que enviará los códigos:
   **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**. ¿El QR no se lee? Pon `WHATSAPP_NUMERO` en
   `.env` (con lada, p. ej. `527551234567`) y aparecerá un código de 8 letras para *Vincular con el número de
   teléfono*.
4. Al conectarse dice **“✅ WhatsApp conectado”** y la verificación pasa sola a modo `puente`.

**Déjalo corriendo**: si la computadora se apaga o pierde internet, los códigos no salen. La sesión queda en
`sesion/` (equivale a tener la cuenta abierta: no la compartas ni la subas a git); la próxima vez entra sin QR.

## Antes de usarlo, lee esto

- No es la API oficial de WhatsApp: **WhatsApp puede bloquear números** que mandan mensajes automáticos. Usen un
  **número aparte** (un chip de prepago), no el personal de nadie.
- Envía códigos que alguien pidió y las respuestas del asistente de reportes, a ritmo de persona (1–2 segundos entre mensajes). No lo usen para difundir
  alertas: para eso están las notificaciones push.
- Para producción, WhatsApp Business (modo `meta`): ver [docs/despliegue.md](../docs/despliegue.md), paso 5c.

## Cambiar de modo

En el SQL Editor de Supabase:

```sql
update config set whatsapp_modo = 'puente';    -- este programa envía los códigos
update config set whatsapp_modo = 'simulado';  -- la app muestra el código (solo pruebas)
update config set whatsapp_modo = 'meta';      -- WhatsApp Business (Edge Function `whatsapp`)
```

Pruebas: `npm test`.

## Recibir mensajes: el asistente de reportes

El puente también **recibe** los mensajes de quien le escribe. No los contesta él: los entrega a `whatsapp_recibido()` del servidor ([013_reportes_whatsapp.sql](../supabase/migrations/013_reportes_whatsapp.sql)), que lleva la conversación (menú con números, ubicación con el clip, una frase opcional, confirmar) y deja la respuesta en la misma cola que los códigos.

- Contesta **enseguida** (con «escribiendo…» y su encuesta), sin esperar a la cola; si el puente se cae a medias, la cola reintenta la respuesta al minuto.
- La ubicación se acepta como ubicación de WhatsApp (el clip), como coordenadas escritas (`17.9581, -102.1942`) o como enlace de Google Maps (también el corto que manda «Compartir» desde Maps).
- Si WhatsApp identifica al contacto con un número interno (@lid), se busca su teléfono; si no se puede, queda anotado en el registro.
- No contesta grupos, estados, mensajes propios, reacciones ni el historial.
- Quien escribe más de 30 mensajes por hora deja de recibir respuestas (config `mensajes_whatsapp_por_hora`).
- Cada número puede levantar 3 reportes por hora (config `reportes_whatsapp_por_hora`).
- El número no se guarda en las alertas, y la conversación se borra a las 24 h.
- Las opciones se mandan como **encuestas de WhatsApp** que la persona toca (funcionan en cuentas normales, sin la API de Business). Si no se ven, el mensaje también trae el número de cada opción y se puede escribir.

Un asistente que contesta mensajes es automatizado: usa un número aparte.

## Si algo falla: los registros

El puente escribe lo que pasa en `puente.log` (teléfonos ocultos: solo los últimos 4 dígitos) y los avisos y errores de WhatsApp en `puente-baileys.log`. Ahí se ve cada mensaje que llega (texto, ubicación, toque en una encuesta), cada respuesta que sale y por qué se ignoró algo que no se entendió. Se recortan solos al pasar de 2 MB y no se suben a git.

- Se corta la conexión: reconecta solo, esperando 3, 6, 12… hasta 60 segundos, y no se rinde.
- Si el servidor no responde, la persona recibe un aviso por WhatsApp en vez de quedarse sin respuesta.
