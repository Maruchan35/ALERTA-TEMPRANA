import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ClienteFcm, construirMensajeFcm, type CuentaServicio, firmarJwt } from './fcm.ts';

async function cuentaDePrueba(): Promise<{ cuenta: CuentaServicio; publica: CryptoKey }> {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
  const b64 = btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join('\n');
  return {
    cuenta: {
      project_id: 'alerta-cerca',
      client_email: 'firebase-adminsdk@alerta-cerca.iam.gserviceaccount.com',
      private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
      private_key_id: 'llave-1',
    },
    publica: par.publicKey,
  };
}

const b64urlABytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

Deno.test('firmarJwt produce un JWT RS256 válido para el token de Google', async () => {
  const { cuenta, publica } = await cuentaDePrueba();
  const jwt = await firmarJwt(cuenta, 1_700_000_000);
  const [h, c, f] = jwt.split('.');
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlABytes(h))), { alg: 'RS256', typ: 'JWT', kid: 'llave-1' });
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlABytes(c))), {
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  const valida = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publica,
    b64urlABytes(f),
    new TextEncoder().encode(`${h}.${c}`),
  );
  assert(valida, 'la firma debe verificarse con la llave pública');
});

Deno.test('construirMensajeFcm: Android solo data con prioridad alta; iOS con notificación visible', () => {
  const datos = { tipo: 'nueva', nivel: '4', estado: 'verificada', titulo: 'INCENDIO', cuerpo: 'Humo en bodega' };
  const android = construirMensajeFcm({ dispositivo_id: '1', fcm_token: 't', plataforma: 'android' }, datos);
  assertEquals(android.android, { priority: 'high', ttl: '3600s' });
  assertEquals(android.notification, undefined);
  const ios = construirMensajeFcm({ dispositivo_id: '2', fcm_token: 't', plataforma: 'ios' }, datos);
  assertEquals(ios.notification, { title: 'INCENDIO', body: 'Verificada · Humo en bodega' });
  // deno-lint-ignore no-explicit-any
  assertEquals((ios.apns as any).payload.aps['interruption-level'], 'time-sensitive');
});

Deno.test('ClienteFcm: reutiliza el token de acceso y clasifica los errores de FCM', async () => {
  const { cuenta } = await cuentaDePrueba();
  let pedidasDeToken = 0;
  const respuestas: Record<string, Response> = {
    ok: new Response('{}', { status: 200 }),
    desinstalada: new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', {
      status: 404,
    }),
    malformado: new Response('{"error":{"message":"The registration token is not a valid FCM registration token"}}', {
      status: 400,
    }),
    caida: new Response('{"error":"boom"}', { status: 503 }),
  };
  const fetchFalso = ((url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('oauth2')) {
      pedidasDeToken++;
      return Promise.resolve(new Response(JSON.stringify({ access_token: 'acceso-123', expires_in: 3600 })));
    }
    assertEquals((init!.headers as Record<string, string>).Authorization, 'Bearer acceso-123');
    const { message } = JSON.parse(String(init!.body));
    return Promise.resolve(respuestas[message.token].clone());
  }) as typeof fetch;

  const cliente = new ClienteFcm(cuenta, fetchFalso);
  const destinos = ['ok', 'desinstalada', 'malformado', 'caida'].map((t, i) => ({
    dispositivo_id: `d${i}`,
    fcm_token: t,
    plataforma: 'android',
  }));
  const original = console.error;
  console.error = () => {};
  try {
    const r = await cliente.enviarATodos(destinos, { tipo: 'nueva', nivel: '3' });
    assertEquals(r, { enviados: 1, invalidos: ['d1', 'd2'], errores: 1 });
  } finally {
    console.error = original;
  }
  assertEquals(pedidasDeToken, 1, 'el token de acceso se pide una sola vez');
});
