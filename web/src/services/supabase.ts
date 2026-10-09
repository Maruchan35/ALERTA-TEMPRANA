import { createClient, type Session } from '@supabase/supabase-js';

// URL y Llave pública del proyecto boygtmnmtgeknlwvtwkf
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://boygtmnmtgeknlwvtwkf.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ee4huSHv_7Xj8hs41NYYWA_rXJb7psi';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Cliente oficial de Supabase
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/** La sesión es de una persona real (correo o teléfono), no una anónima como las de los ciudadanos. */
export function esSesionReal(sesion: Session | null | undefined): sesion is Session {
  return Boolean(sesion && !sesion.user.is_anonymous);
}

/**
 * Sesión de un moderador: la que quedó guardada al entrar con correo y contraseña. A diferencia de
 * ensureAuthSession, NUNCA abre una sesión anónima: una anónima no ve nada del panel y haría creer
 * que nadie pide ayuda (el SOS "no llega" cuando en realidad se consulta como ciudadano).
 */
export async function sesionDeModerador(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return esSesionReal(data?.session) ? data.session : null;
  } catch {
    return null;
  }
}

// Asegura que exista una sesión de autenticación (anónima o de moderador) para acceder al Storage privado con RLS
export async function ensureAuthSession() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      const { data: anonData } = await supabase.auth.signInAnonymously();
      return anonData?.session || null;
    }
    return data.session;
  } catch (err) {
    console.warn('Error asegurando sesión de Supabase:', err);
    return null;
  }
}
