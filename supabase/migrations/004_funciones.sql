-- =============================================================================
-- ALERTA CERCA · 004_funciones.sql
-- Funciones del servidor: contratos de la sección 7.2 y pasos 2.1–2.3, 3.2–3.4 y 4.1–4.3.
--
-- Todas llevan `set search_path` explícito (PostGIS vive en el esquema `extensions`).
-- Las funciones INTERNAS (devuelven tokens o hacen tareas del sistema) se revocan al
-- final del archivo: nadie con la anon key puede llamarlas (prueba P14).
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

-- ─── Vista interna con los campos que se pueden mostrar a cualquier persona ──
-- No se expone por la API (se revoca abajo); la usan alertas_cercanas() y obtener_alerta().
-- Nunca incluye quién reportó ni el folio del 911.
create view alertas_publicas as
select a.id, a.categoria, c.nombre, c.nombre_corto, c.nivel, a.estado, a.titulo,
       case when a.estado in ('descartada', 'expirada')
                 and a.creada_por is distinct from auth.uid() and not es_validador()
            then null else a.descripcion end                            as descripcion,
       case when a.estado in ('descartada', 'expirada')
                 and a.creada_por is distinct from auth.uid() and not es_validador()
            then null else a.referencia end                             as referencia,
       -- La foto solo se muestra mientras la alerta está activa (al resolverse deja de mostrarse)
       case when a.estado in ('no_confirmada', 'corroborada', 'verificada')
                 or a.creada_por = auth.uid() or es_validador()
            then a.foto_path end                                        as foto_path,
       a.lat, a.lon, a.radio_actual_m, a.creada_en, a.publicada_en, a.verificada_en,
       a.cerrada_en, a.expira_en, a.motivo_cierre,
       case when a.verificada_por is not null
            then coalesce(v.institucion, v.nombre, 'Validador') end    as validada_por,
       c.instrucciones,
       coalesce(k.n_confirmo, 0)     as n_confirmo,
       coalesce(k.n_ya_no_esta, 0)   as n_ya_no_esta,
       coalesce(k.n_parece_falsa, 0) as n_parece_falsa,
       k.mi_confirmacion,
       coalesce(a.creada_por = auth.uid(), false)                       as es_mia
from alertas a
join categorias c on c.clave = a.categoria
left join perfiles v on v.id = a.verificada_por
left join lateral (
  select count(*) filter (where q.tipo = 'confirmo')::int       as n_confirmo,
         count(*) filter (where q.tipo = 'ya_no_esta')::int     as n_ya_no_esta,
         count(*) filter (where q.tipo = 'parece_falsa')::int   as n_parece_falsa,
         max(q.tipo) filter (where q.usuario_id = auth.uid())   as mi_confirmacion
  from confirmaciones q where q.alerta_id = a.id) k on true;

-- ─── Registrar el dispositivo ───────────────────────────────────────────────
-- La app la llama al abrir y cada vez que cambia de celda. Reemplaza la celda
-- anterior: no existe historial de recorridos.
create or replace function registrar_dispositivo(p_token text, p_plataforma text, p_celda text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_token is null or char_length(p_token) < 10 or char_length(p_token) > 4096 then
    raise exception 'Token inválido';
  end if;
  insert into dispositivos (usuario_id, fcm_token, plataforma, celda)
  values (auth.uid(), p_token, p_plataforma, lower(p_celda))
  on conflict (fcm_token) do update
    set usuario_id = excluded.usuario_id, plataforma = excluded.plataforma,
        celda = excluded.celda, activo = true, actualizado_en = now();
end $$;

-- ─── Alertas para el mapa, buscadas por la CELDA (no por la ubicación exacta) ──
create or replace function alertas_cercanas(p_celda text, p_radio_m int default 25000)
returns setof alertas_publicas
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_celda is null or p_celda !~ '^[0-9b-hjkmnp-z]{4,9}$' then
    raise exception 'Celda inválida';
  end if;
  return query
  select d.*
  from alertas_publicas d
  join alertas a on a.id = d.id
  where (   a.estado in ('no_confirmada', 'corroborada', 'verificada')
         or (a.estado = 'resuelta' and a.cerrada_en > now() - interval '24 hours')
         or (a.estado = 'pendiente' and (a.creada_por = auth.uid() or es_validador())))
    and st_dwithin(a.ubicacion,
                   st_setsrid(st_pointfromgeohash(lower(p_celda)), 4326)::geography,
                   least(greatest(coalesce(p_radio_m, 25000), 100), 50000))
  order by d.nivel desc, d.creada_en desc
  limit 100;
end $$;

-- ─── Una alerta por id (al tocar una notificación) ──────────────────────────
create or replace function obtener_alerta(p_alerta uuid)
returns setof alertas_publicas
language sql stable security definer set search_path = public as $$
  select d.*
  from alertas_publicas d
  join alertas a on a.id = d.id
  where d.id = p_alerta
    and (a.estado <> 'pendiente' or a.creada_por = auth.uid() or es_validador());
$$;

-- ─── Crear reportes con todas las reglas de confianza (paso 2.2) ────────────
create or replace function crear_reporte(
  p_categoria categoria_alerta, p_titulo text, p_descripcion text, p_referencia text,
  p_lat double precision, p_lon double precision, p_foto_path text default null,
  p_folio_911 text default null, p_consentimiento boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid    uuid := auth.uid();
  v_perfil perfiles;
  v_cat    categorias;
  v_inst   boolean;
  v_dup    alertas;
  v_estado estado_alerta;
  v_id     uuid;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  -- 1. Solo cuentas verificadas (no anónimas) pueden reportar
  if v_uid is null or es_anonimo() then
    raise exception 'Verifica tu número de teléfono para poder reportar';
  end if;
  select * into v_perfil from perfiles where id = v_uid;
  if not found then raise exception 'Perfil no encontrado'; end if;
  select * into v_cat from categorias where clave = p_categoria;
  if not found then raise exception 'Categoría inválida'; end if;
  v_inst := v_perfil.rol in ('validador', 'institucion', 'admin');

  if v_cat.solo_institucion and not v_inst then
    raise exception 'Esta categoría solo la pueden emitir instituciones';
  end if;
  if not v_inst and v_perfil.reputacion <= -6 then
    raise exception 'Tu cuenta está suspendida para reportar por reportes descartados. Si crees que es un error, contacta al CCE';
  end if;
  if char_length(v_titulo) not between 5 and 80 then
    raise exception 'El título debe tener entre 5 y 80 caracteres';
  end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Ubicación inválida';
  end if;
  if p_foto_path is not null and p_foto_path not like v_uid::text || '/%' then
    raise exception 'Foto inválida';
  end if;
  if v_cat.requiere_validacion and p_foto_path is not null and not coalesce(p_consentimiento, false) then
    raise exception 'Para publicar la foto de una persona se necesita el consentimiento de su familiar o tutor';
  end if;

  if not v_inst then
    -- 2. Límite: 3 reportes por hora
    if (select count(*) from alertas
        where creada_por = v_uid and creada_en > now() - interval '1 hour') >= 3 then
      raise exception 'Alcanzaste el límite de reportes. Intenta más tarde';
    end if;

    -- 3. ¿Duplicado? Misma categoría, a menos de 500 m, en los últimos 30 minutos:
    --    se suma como confirmación en vez de crear otra alerta.
    select * into v_dup from alertas
     where categoria = p_categoria
       and estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada')
       and creada_en > now() - interval '30 minutes'
       and st_dwithin(ubicacion, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, 500)
     order by creada_en desc limit 1;
    if found then
      if v_dup.creada_por is distinct from v_uid then
        insert into confirmaciones (alerta_id, usuario_id, tipo)
        values (v_dup.id, v_uid, 'confirmo')
        on conflict (alerta_id, usuario_id) do update set tipo = 'confirmo', creada_en = now();
      end if;
      return jsonb_build_object('duplicada_de', v_dup.id, 'estado', v_dup.estado);
    end if;
  end if;

  -- 4. Estado inicial según quién reporta y qué categoría es
  v_estado := case
    when v_inst then 'verificada'
    when v_cat.requiere_validacion or v_perfil.reputacion < -2 then 'pendiente'
    else 'no_confirmada' end;

  insert into alertas (categoria, titulo, descripcion, referencia, foto_path, folio_911,
                       consentimiento, lat, lon, estado, creada_por, expira_en,
                       publicada_en, verificada_por, verificada_en)
  values (p_categoria, v_titulo, nullif(btrim(p_descripcion), ''), nullif(btrim(p_referencia), ''),
          p_foto_path, nullif(btrim(p_folio_911), ''), coalesce(p_consentimiento, false),
          p_lat, p_lon, v_estado, v_uid, now() + v_cat.vigencia,
          case when v_estado <> 'pendiente' then now() end,
          case when v_inst then v_uid end,
          case when v_inst then now() end)
  returning id into v_id;

  insert into bitacora (alerta_id, usuario_id, accion, detalle)
  values (v_id, v_uid, case when v_inst then 'emitir_oficial' else 'reportar' end,
          jsonb_build_object('estado', v_estado, 'categoria', p_categoria));

  return jsonb_build_object('alerta_id', v_id, 'estado', v_estado);
end $$;

-- ─── ¿Hasta dónde puede llegar esta alerta AHORA? (escalones + tope por confianza) ──
create or replace function radio_permitido(p_alerta uuid) returns int
language sql stable security definer set search_path = public, extensions as $$
  select case
    when a.estado not in ('no_confirmada', 'corroborada', 'verificada') then 0
    when a.radio_manual_m is not null then a.radio_manual_m
    else least(
      (select coalesce(max(e.radio_m), 0) from escalones_radio e
        where e.categoria = a.categoria
          and e.minuto <= extract(epoch from now() - a.publicada_en) / 60
                          * (select factor_tiempo from config where id = 1)),
      case a.estado when 'no_confirmada' then c.radio_max_no_conf_m
                    when 'corroborada'   then 3000
                    else 1000000 end)
  end
  from alertas a join categorias c on c.clave = a.categoria
  where a.id = p_alerta;
$$;

-- ─── Teléfonos que deben recibirla ──────────────────────────────────────────
-- Su celda o alguna de sus zonas está dentro del radio (+700 m de margen de celda:
-- la mitad de la diagonal de una celda de ~1.2 × 0.6 km) y todavía no la recibieron.
-- Se usa UNION (no OR) para que ambas búsquedas aprovechen su índice espacial.
create or replace function dispositivos_objetivo(p_alerta uuid, p_radio_m int)
returns table (dispositivo_id uuid, fcm_token text, plataforma text)
language sql stable security definer set search_path = public, extensions as $$
  with suceso as (select id, ubicacion from alertas where id = p_alerta),
  candidatos as (
    select d.id
    from dispositivos d, suceso s
    where d.activo and st_dwithin(d.centro_celda, s.ubicacion, p_radio_m + 700)
    union
    select d.id
    from zonas_usuario z
    join dispositivos d on d.usuario_id = z.usuario_id and d.activo, suceso s
    where st_dwithin(z.centro_celda, s.ubicacion, p_radio_m + 700)
  )
  select d.id, d.fcm_token, d.plataforma
  from candidatos c join dispositivos d on d.id = c.id
  where not exists (select 1 from entregas e
                    where e.alerta_id = p_alerta and e.dispositivo_id = d.id);
$$;

create or replace function dispositivos_validadores()
returns table (dispositivo_id uuid, fcm_token text, plataforma text)
language sql stable security definer set search_path = public as $$
  select d.id, d.fcm_token, d.plataforma
  from dispositivos d join perfiles p on p.id = d.usuario_id
  where d.activo and p.rol in ('validador', 'institucion', 'admin');
$$;

-- ─── Suscriptores de Telegram cercanos que aún no la reciben (paso 4.1) ─────
create or replace function telegram_objetivo(p_alerta uuid, p_radio_m int)
returns table (chat_id bigint)
language sql stable security definer set search_path = public, extensions as $$
  select s.chat_id from alertas a, suscriptores_telegram s
  where a.id = p_alerta and s.activo
    and st_dwithin(s.centro_celda, a.ubicacion, p_radio_m + 700)
    and not exists (select 1 from entregas_telegram e
                    where e.alerta_id = a.id and e.chat_id = s.chat_id);
$$;

-- ─── Confirmaciones de vecinos (paso 3.2) ───────────────────────────────────
create or replace function confirmar_alerta(p_alerta uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_alerta alertas;
begin
  if auth.uid() is null or es_anonimo() then
    raise exception 'Verifica tu número para confirmar alertas';
  end if;
  if p_tipo is null or p_tipo not in ('confirmo', 'ya_no_esta', 'parece_falsa') then
    raise exception 'Tipo de confirmación inválido';
  end if;
  select * into v_alerta from alertas where id = p_alerta;
  if not found or v_alerta.estado not in ('no_confirmada', 'corroborada', 'verificada') then
    raise exception 'Esta alerta ya no está activa';
  end if;
  if v_alerta.creada_por = auth.uid() then
    raise exception 'No puedes confirmar tu propio reporte';
  end if;
  insert into confirmaciones (alerta_id, usuario_id, tipo) values (p_alerta, auth.uid(), p_tipo)
  on conflict (alerta_id, usuario_id) do update set tipo = excluded.tipo, creada_en = now();
end $$;

-- 3 "lo confirmo" → CORROBORADA · 3 "parece falsa" → regresa a revisión
create or replace function revisar_confirmaciones() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_si    int;
  v_falsa int;
  v_n     int;
begin
  select count(*) filter (where tipo = 'confirmo'), count(*) filter (where tipo = 'parece_falsa')
    into v_si, v_falsa
  from confirmaciones where alerta_id = new.alerta_id;

  if v_si >= 3 then
    update alertas set estado = 'corroborada' where id = new.alerta_id and estado = 'no_confirmada';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into bitacora (alerta_id, usuario_id, accion, detalle)
      values (new.alerta_id, null, 'corroborar_auto', jsonb_build_object('confirmaciones', v_si));
    end if;
  end if;
  if v_falsa >= 3 then
    update alertas set estado = 'pendiente'
    where id = new.alerta_id and estado in ('no_confirmada', 'corroborada');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into bitacora (alerta_id, usuario_id, accion, detalle)
      values (new.alerta_id, null, 'revision_por_votos', jsonb_build_object('parece_falsa', v_falsa));
    end if;
  end if;
  return new;
end $$;

create trigger confirmaciones_revisar after insert or update on confirmaciones
  for each row execute function revisar_confirmaciones();

-- ─── Acciones de los validadores y bitácora (paso 3.3) ─────────────────────
create or replace function validar_alerta(p_alerta uuid, p_accion text,
                                          p_motivo text default null, p_radio_m int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_alerta alertas;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_alerta from alertas where id = p_alerta for update;
  if not found then raise exception 'La alerta no existe'; end if;
  -- El autor solo puede marcar SU alerta como resuelta; todo lo demás es de validadores
  if not es_validador() and not (p_accion = 'resolver' and v_alerta.creada_por = auth.uid()) then
    raise exception 'No autorizado';
  end if;
  if v_alerta.estado not in ('pendiente', 'no_confirmada', 'corroborada', 'verificada') then
    raise exception 'La alerta ya está cerrada (%)', v_alerta.estado;
  end if;

  case p_accion
    when 'verificar' then
      if v_alerta.estado = 'verificada' then raise exception 'La alerta ya está verificada'; end if;
      update alertas set estado = 'verificada', verificada_por = auth.uid(), verificada_en = now(),
                         publicada_en = coalesce(publicada_en, now())
      where id = p_alerta;
      update perfiles set reputacion = reputacion + 1
      where id = v_alerta.creada_por and id is distinct from auth.uid();
    when 'descartar' then
      if v_motivo is null then raise exception 'Indica el motivo del descarte'; end if;
      update alertas set estado = 'descartada', cerrada_en = now(), motivo_cierre = left(v_motivo, 300)
      where id = p_alerta;
      update perfiles set reputacion = reputacion - 2
      where id = v_alerta.creada_por and id is distinct from auth.uid();
    when 'resolver' then
      update alertas set estado = 'resuelta', cerrada_en = now(),
                         motivo_cierre = left(coalesce(v_motivo, 'El caso fue resuelto'), 300)
      where id = p_alerta;
    when 'ajustar_radio' then
      if p_radio_m is null or p_radio_m not between 100 and 100000 then
        raise exception 'Radio inválido: debe estar entre 100 m y 100 km';
      end if;
      update alertas set radio_manual_m = p_radio_m where id = p_alerta;
      -- No esperamos a pg_cron: se envía el anillo nuevo de inmediato
      perform llamar_funcion('notificar', jsonb_build_object(
        'alerta_id', p_alerta, 'evento', 'ajuste', 'radio_m', p_radio_m));
    else
      raise exception 'Acción desconocida: %', p_accion;
  end case;

  insert into bitacora (alerta_id, usuario_id, accion, detalle)
  values (p_alerta, auth.uid(), p_accion,
          jsonb_build_object('motivo', v_motivo, 'radio_m', p_radio_m,
                             'estado_anterior', v_alerta.estado));
end $$;

-- ─── Derecho de cancelación (ARCO): borrar mi cuenta y mis datos ────────────
-- En cascada se van perfil, dispositivos, zonas y confirmaciones; las alertas que
-- haya reportado se conservan sin autor (creada_por = null).
create or replace function borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ─── Métricas para el panel (security_invoker: respeta RLS) ────────────────
create view metricas with (security_invoker = true) as
select count(*) filter (where estado in ('no_confirmada', 'corroborada', 'verificada')) as activas,
       count(*) filter (where estado = 'pendiente')                                   as por_validar,
       (extract(epoch from avg(verificada_en - creada_en)
          filter (where verificada_en is not null
                    and verificada_por is distinct from creada_por
                    and creada_en > now() - interval '7 days')))::int                 as segundos_validacion,
       (select count(*) from entregas
         where enviada_en >= (date_trunc('day', now() at time zone 'America/Mexico_City')
                              at time zone 'America/Mexico_City'))::int               as entregas_hoy
from alertas;

-- ─── Vista para el panel de validadores (security_invoker: solo ellos ven todo) ──
create or replace function conteo_telegram(p_alerta uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from entregas_telegram where alerta_id = p_alerta;
$$;

create view alertas_panel with (security_invoker = true) as
select a.id, a.categoria, c.nombre, c.nombre_corto, c.nivel, a.estado, a.titulo, a.descripcion, a.referencia,
       a.foto_path, a.folio_911, a.consentimiento, a.lat, a.lon, a.radio_actual_m, a.radio_manual_m,
       a.creada_en, a.publicada_en, a.verificada_en, a.cerrada_en, a.expira_en, a.motivo_cierre,
       a.creada_por, p.reputacion as autor_reputacion, p.rol as autor_rol,
       p.institucion as autor_institucion,
       v.nombre as validador_nombre, v.institucion as validador_institucion,
       (select count(*) from confirmaciones k where k.alerta_id = a.id and k.tipo = 'confirmo')::int     as n_confirmo,
       (select count(*) from confirmaciones k where k.alerta_id = a.id and k.tipo = 'ya_no_esta')::int   as n_ya_no_esta,
       (select count(*) from confirmaciones k where k.alerta_id = a.id and k.tipo = 'parece_falsa')::int as n_parece_falsa,
       (select count(*) from entregas e where e.alerta_id = a.id)::int                                   as n_entregas,
       conteo_telegram(a.id)                                                                             as n_telegram
from alertas a
join categorias c on c.clave = a.categoria
left join perfiles p on p.id = a.creada_por
left join perfiles v on v.id = a.verificada_por;

-- ─── Tareas periódicas (las programa 006_tareas.sql) ───────────────────────
-- Cada 15 s: las alertas que ya pueden llegar más lejos actualizan su radio y se
-- notifica el anillo nuevo. Si la Edge Function falla, el siguiente anillo incluye
-- a los teléfonos pendientes (dispositivos_objetivo excluye solo a quien ya la recibió).
create or replace function ampliar_radios() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
  r   record;
begin
  for r in
    update alertas a set radio_actual_m = x.radio
    from (select id, radio_permitido(id) as radio from alertas
          where estado in ('no_confirmada', 'corroborada', 'verificada')) x
    where a.id = x.id and x.radio > a.radio_actual_m
    returning a.id, x.radio
  loop
    perform llamar_funcion('notificar', jsonb_build_object(
      'alerta_id', r.id, 'evento', 'ampliacion', 'radio_m', r.radio));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Cada minuto: las alertas vencidas pasan a EXPIRADA y salen del mapa
create or replace function expirar_alertas() returns int
language sql security definer set search_path = public as $$
  with vencidas as (
    update alertas set estado = 'expirada', cerrada_en = now()
    where estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada') and expira_en < now()
    returning id),
  registro as (
    insert into bitacora (alerta_id, usuario_id, accion)
    select id, null, 'expirar' from vencidas)
  select count(*)::int from vencidas;
$$;

-- Diario: retención de datos (sección 12)
create or replace function limpieza_diaria() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from entregas          where enviada_en < now() - interval '30 days';
  delete from entregas_telegram where enviada_en < now() - interval '30 days';
  update dispositivos set activo = false where activo and actualizado_en < now() - interval '60 days';
  -- A los 90 días del cierre la alerta se anonimiza (queda solo para estadística).
  -- La foto la borra la Edge Function `mantenimiento` con la API de Storage.
  update alertas set descripcion = null, referencia = null, folio_911 = null, creada_por = null
  where cerrada_en < now() - interval '90 days'
    and (descripcion is not null or referencia is not null or folio_911 is not null or creada_por is not null);
end $$;

-- Fotos que la Edge Function `mantenimiento` debe borrar de Storage:
-- de alertas cerradas hace más de 90 días y archivos huérfanos de más de 24 h.
create or replace function fotos_por_borrar() returns table (ruta text)
language sql stable security definer set search_path = public as $$
  select foto_path from alertas
  where foto_path is not null and cerrada_en < now() - interval '90 days'
  union
  select o.name from storage.objects o
  where o.bucket_id = 'fotos' and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from alertas a where a.foto_path = o.name);
$$;

create or replace function olvidar_fotos(p_rutas text[]) returns void
language sql security definer set search_path = public as $$
  update alertas set foto_path = null where foto_path = any (p_rutas);
$$;

-- ─── Permisos: estas funciones devuelven tokens o son internas ─────────────
-- ¡IMPORTANTE! En Supabase cualquier función del esquema public se puede llamar con la
-- anon key (/rest/v1/rpc/...). Si se olvida un revoke, cualquiera podría descargar los
-- tokens de todos los teléfonos. La prueba P14 lo verifica.
revoke all on alertas_publicas from public, anon, authenticated;

revoke execute on function radio_permitido(uuid)            from public, anon, authenticated;
revoke execute on function dispositivos_objetivo(uuid, int) from public, anon, authenticated;
revoke execute on function dispositivos_validadores()       from public, anon, authenticated;
revoke execute on function telegram_objetivo(uuid, int)     from public, anon, authenticated;
revoke execute on function ampliar_radios()                 from public, anon, authenticated;
revoke execute on function expirar_alertas()                from public, anon, authenticated;
revoke execute on function limpieza_diaria()                from public, anon, authenticated;
revoke execute on function fotos_por_borrar()               from public, anon, authenticated;
revoke execute on function olvidar_fotos(text[])            from public, anon, authenticated;

grant execute on function radio_permitido(uuid)            to service_role;
grant execute on function dispositivos_objetivo(uuid, int) to service_role;
grant execute on function dispositivos_validadores()       to service_role;
grant execute on function telegram_objetivo(uuid, int)     to service_role;
grant execute on function ampliar_radios()                 to service_role;
grant execute on function expirar_alertas()                to service_role;
grant execute on function limpieza_diaria()                to service_role;
grant execute on function fotos_por_borrar()               to service_role;
grant execute on function olvidar_fotos(text[])            to service_role;

-- Las funciones para la app exigen sesión (anónima o verificada): fuera el rol anon
revoke execute on function registrar_dispositivo(text, text, text) from public, anon;
revoke execute on function alertas_cercanas(text, int)              from public, anon;
revoke execute on function obtener_alerta(uuid)                     from public, anon;
revoke execute on function crear_reporte(categoria_alerta, text, text, text, double precision,
                                         double precision, text, text, boolean) from public, anon;
revoke execute on function confirmar_alerta(uuid, text)             from public, anon;
revoke execute on function validar_alerta(uuid, text, text, int)    from public, anon;
revoke execute on function borrar_mi_cuenta()                       from public, anon;
revoke execute on function conteo_telegram(uuid)                    from public, anon;

grant execute on function registrar_dispositivo(text, text, text) to authenticated, service_role;
grant execute on function alertas_cercanas(text, int)              to authenticated, service_role;
grant execute on function obtener_alerta(uuid)                     to authenticated, service_role;
grant execute on function crear_reporte(categoria_alerta, text, text, text, double precision,
                                        double precision, text, text, boolean) to authenticated;
grant execute on function confirmar_alerta(uuid, text)             to authenticated;
grant execute on function validar_alerta(uuid, text, text, int)    to authenticated;
grant execute on function borrar_mi_cuenta()                       to authenticated;
grant execute on function conteo_telegram(uuid)                    to authenticated, service_role;
