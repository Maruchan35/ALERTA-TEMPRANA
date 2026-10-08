import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Llave con permisos de servidor. Solo existe dentro de las Edge Functions, nunca en la app. */
export function llaveServicio(): string {
  const directa = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (directa) return directa;
  // Proyectos con las llaves nuevas (sb_secret_...): SUPABASE_SECRET_KEYS = {"default": "..."}
  const secretas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretas) {
    try {
      const llaves = JSON.parse(secretas) as Record<string, string>;
      const llave = llaves.default ?? Object.values(llaves)[0];
      if (llave) return llave;
    } catch { /* formato desconocido */ }
  }
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno de la Edge Function');
}

export function clienteServicio(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, llaveServicio(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
