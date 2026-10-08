// =============================================================================
// ALERTA CERCA · Edge Function `cap` (paso 4.2): feed público de alertas VERIFICADAS
// en CAP 1.2 para que Protección Civil u otras autoridades puedan retransmitirlas
// (incluido, en el futuro, Cell Broadcast) sin rehacer nada.
//
//   GET /functions/v1/cap            → feed Atom con un documento CAP por alerta
//   GET /functions/v1/cap?id=<uuid>  → documento CAP individual
//
// Solo publica alertas verificadas (y su cancelación si se resolvieron en las últimas 24 h).
// Nunca publica reportes ciudadanos sin confirmar, ni fotos, ni datos de quien reporta.
// Desplegar:  supabase functions deploy cap --no-verify-jwt   (es un feed público)
// =============================================================================
import { clienteServicio } from '../_compartido/supabase.ts';
import { type AlertaCap, documentoCap, feedAtom } from '../_compartido/cap.ts';

const sb = clienteServicio();
const BASE = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cap`;
const EMISOR = Deno.env.get('CAP_EMISOR') ?? 'alertacerca';
const CAMPOS = 'id, estado, titulo, descripcion, referencia, lat, lon, radio_actual_m, radio_manual_m, ' +
  'verificada_en, cerrada_en, expira_en, motivo_cierre, categoria, ' +
  'categorias(nombre, nivel, categoria_cap, instrucciones), ' +
  'validador:perfiles!alertas_verificada_por_fkey(institucion, nombre)';

const xml = (cuerpo: string, tipo: string, status = 200) =>
  new Response(cuerpo, {
    status,
    headers: {
      'Content-Type': `${tipo}; charset=utf-8`,
      'Cache-Control': 'public, max-age=30',
      'Access-Control-Allow-Origin': '*',
    },
  });

Deno.serve(async (req) => {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return xml('<error>id inválido</error>', 'application/xml', 400);
      const { data, error } = await sb.from('alertas').select(CAMPOS).eq('id', id)
        .not('verificada_en', 'is', null)
        .in('estado', ['verificada', 'resuelta', 'descartada'])
        .maybeSingle<AlertaCap>();
      if (error) throw error;
      if (!data) return xml('<error>No existe una alerta verificada con ese id</error>', 'application/xml', 404);
      return xml(documentoCap(data, EMISOR, `${BASE}?id=${id}`), 'application/cap+xml');
    }

    const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [activas, cerradas] = await Promise.all([
      sb.from('alertas').select(CAMPOS).eq('estado', 'verificada').order('verificada_en', { ascending: false }).limit(
        200,
      ),
      sb.from('alertas').select(CAMPOS).in('estado', ['resuelta', 'descartada'])
        .not('verificada_en', 'is', null).gte('cerrada_en', hace24h).limit(100),
    ]);
    if (activas.error) throw activas.error;
    if (cerradas.error) throw cerradas.error;
    const alertas = [...(activas.data ?? []), ...(cerradas.data ?? [])] as unknown as AlertaCap[];
    return xml(feedAtom(alertas, BASE, EMISOR), 'application/atom+xml');
  } catch (e) {
    console.error('cap:', e);
    return xml('<error>Error interno</error>', 'application/xml', 500);
  }
});
