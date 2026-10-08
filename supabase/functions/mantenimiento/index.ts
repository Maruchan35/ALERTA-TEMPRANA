// =============================================================================
// ALERTA CERCA · Edge Function `mantenimiento`: retención de fotos (sección 12).
// La llama pg_cron una vez al día. Las fotos se borran con la API de Storage (no con
// SQL directo sobre storage.objects): las de alertas cerradas hace más de 90 días y los
// archivos huérfanos (subidos pero sin alerta) de más de 24 h.
//
// Desplegar:  supabase functions deploy mantenimiento --no-verify-jwt
// =============================================================================
import { clienteServicio } from '../_compartido/supabase.ts';
import { autorizado } from '../_compartido/seguridad.ts';

const sb = clienteServicio();

Deno.serve(async (req) => {
  if (!autorizado(req)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { data, error } = await sb.rpc('fotos_por_borrar');
    if (error) throw error;
    const rutas: string[] = (data ?? []).map((f: { ruta: string }) => f.ruta);
    let borradas = 0;
    for (let i = 0; i < rutas.length; i += 100) {
      const lote = rutas.slice(i, i + 100);
      const { data: quitadas, error: e } = await sb.storage.from('fotos').remove(lote);
      if (e) throw e;
      borradas += quitadas?.length ?? 0;
      const { error: e2 } = await sb.rpc('olvidar_fotos', { p_rutas: lote });
      if (e2) throw e2;
    }
    return Response.json({ revisadas: rutas.length, borradas });
  } catch (e) {
    console.error('mantenimiento:', e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
