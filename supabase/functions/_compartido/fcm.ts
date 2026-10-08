// Firebase Cloud Messaging (API HTTP v1) sin dependencias: la firma del JWT de la cuenta
// de servicio se hace con WebCrypto. (La propuesta usaba google-auth-library; esta versión
// arranca más rápido en Edge Functions y no depende de módulos de Node.)
import { textoVisible } from './mensajes.ts';

export interface CuentaServicio {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

export interface Destino {
  dispositivo_id: string;
  fcm_token: string;
  plataforma: string;
}

export type ResultadoEnvio = 'ok' | 'token_invalido' | 'error';

const ALCANCE = 'https://www.googleapis.com/auth/firebase.messaging';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';

const b64url = (datos: Uint8Array | string): string => {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemABytes(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** JWT firmado con RS256 que se cambia por un token de acceso de Google (OAuth 2.0). */
export async function firmarJwt(cuenta: CuentaServicio, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const encabezado: Record<string, string> = { alg: 'RS256', typ: 'JWT' };
  if (cuenta.private_key_id) encabezado.kid = cuenta.private_key_id;
  const carga = { iss: cuenta.client_email, scope: ALCANCE, aud: URL_TOKEN, iat: ahora, exp: ahora + 3600 };
  const entrada = `${b64url(JSON.stringify(encabezado))}.${b64url(JSON.stringify(carga))}`;
  const llave = await crypto.subtle.importKey(
    'pkcs8',
    pemABytes(cuenta.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(entrada));
  return `${entrada}.${b64url(new Uint8Array(firma))}`;
}

/** Mensaje FCM según la plataforma del teléfono. */
export function construirMensajeFcm(d: Destino, datos: Record<string, string>): Record<string, unknown> {
  const nivel = Number(datos.nivel ?? '2');
  const message: Record<string, unknown> = {
    token: d.fcm_token,
    data: datos, // Android: la app arma la notificación (canal por nivel y distancia exacta)
    android: { priority: 'high', ttl: '3600s' },
  };
  const visible = textoVisible(datos);
  if (d.plataforma === 'ios') {
    message.notification = visible;
    message.apns = {
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
      payload: { aps: { sound: 'default', 'interruption-level': nivel >= 4 ? 'time-sensitive' : 'active' } },
    };
  } else if (d.plataforma === 'web') {
    message.webpush = { notification: { ...visible, requireInteraction: nivel >= 4 }, headers: { Urgency: 'high' } };
  }
  return message;
}

export class ClienteFcm {
  #acceso?: { token: string; expira: number };
  #pendiente?: Promise<string>;

  constructor(private readonly cuenta: CuentaServicio, private readonly fetchFn: typeof fetch = fetch) {}

  /** null si el secreto FIREBASE_SERVICE_ACCOUNT no está configurado (se omite el push). */
  static desdeEntorno(): ClienteFcm | null {
    const json = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!json) return null;
    return new ClienteFcm(JSON.parse(json) as CuentaServicio);
  }

  get proyecto(): string {
    return this.cuenta.project_id;
  }

  /** Token OAuth en caché; si varios envíos en paralelo lo piden a la vez, se pide una sola vez. */
  tokenDeAcceso(): Promise<string> {
    if (this.#acceso && this.#acceso.expira > Date.now() + 60_000) return Promise.resolve(this.#acceso.token);
    this.#pendiente ??= this.#pedirToken().finally(() => {
      this.#pendiente = undefined;
    });
    return this.#pendiente;
  }

  async #pedirToken(): Promise<string> {
    const r = await this.fetchFn(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await firmarJwt(this.cuenta),
      }),
    });
    if (!r.ok) throw new Error(`Google OAuth respondió ${r.status}: ${await r.text()}`);
    const { access_token, expires_in } = await r.json();
    this.#acceso = { token: access_token, expira: Date.now() + Number(expires_in ?? 3600) * 1000 };
    return access_token;
  }

  async enviar(d: Destino, datos: Record<string, string>): Promise<ResultadoEnvio> {
    const acceso = await this.tokenDeAcceso();
    const r = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${this.cuenta.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acceso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: construirMensajeFcm(d, datos) }),
    });
    if (r.ok) return 'ok';
    const cuerpo = await r.text();
    // 404 UNREGISTERED: la app se desinstaló. 400 con "registration token": token mal formado.
    if (
      r.status === 404 || /UNREGISTERED/.test(cuerpo) ||
      (r.status === 400 && /registration token/i.test(cuerpo))
    ) {
      return 'token_invalido';
    }
    console.error(`FCM ${r.status} para ${d.dispositivo_id}: ${cuerpo.slice(0, 300)}`);
    return 'error';
  }

  /** Envía de 100 en 100, en paralelo. Devuelve cuántos salieron y qué tokens ya no sirven. */
  async enviarATodos(destinos: Destino[], datos: Record<string, string>) {
    let enviados = 0, errores = 0;
    const invalidos: string[] = [];
    for (let i = 0; i < destinos.length; i += 100) {
      const lote = destinos.slice(i, i + 100);
      const resultados = await Promise.all(lote.map((d) =>
        this.enviar(d, datos).catch((e) => {
          console.error(`Error enviando a ${d.dispositivo_id}: ${e}`);
          return 'error' as const;
        })
      ));
      resultados.forEach((r, j) => {
        if (r === 'ok') enviados++;
        else if (r === 'token_invalido') invalidos.push(lote[j].dispositivo_id);
        else errores++;
      });
    }
    return { enviados, invalidos, errores };
  }
}
