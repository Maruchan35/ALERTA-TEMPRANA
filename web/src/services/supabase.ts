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
