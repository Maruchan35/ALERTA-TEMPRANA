import { createClient } from '@supabase/supabase-js';

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

// Asegura que exista una sesión de autenticación (anónima o de moderador) para acceder al Storage privado con RLS.
// Si varias partes la piden a la vez, se crea UNA sola sesión anónima (no una por llamada).
let sesionAnonimaEnCurso: Promise<unknown> | null = null;

export async function ensureAuthSession() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    sesionAnonimaEnCurso ??= supabase.auth.signInAnonymously().finally(() => {
      sesionAnonimaEnCurso = null;
    });
    await sesionAnonimaEnCurso;
    return (await supabase.auth.getSession()).data.session;
  } catch (err) {
    console.warn('Error asegurando sesión de Supabase:', err);
    return null;
  }
}
