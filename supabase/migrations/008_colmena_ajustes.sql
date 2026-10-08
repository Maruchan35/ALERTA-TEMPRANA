-- =============================================================================
-- ALERTA CERCA · 008_colmena_ajustes.sql
-- Ajustes después de las primeras pruebas con teléfonos reales:
--
--   1. Límite de reportes configurable (`config.reportes_por_hora`, 10 por defecto; antes
--      3 fijos). Un reporte duplicado ya no choca con el límite: se suma como confirmación.
--   2. El panel ve cuántos teléfonos están registrados para recibir push
--      (`metricas.dispositivos_activos`, solo para validadores): si son pocos, las alertas
--      no tienen a quién llegar.
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

alter table config
  add column reportes_por_hora int not null default 10 check (reportes_por_hora between 1 and 1000);

-- ─── Reportar: igual que en 007, con el duplicado ANTES del límite ─────────
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
  v_limite int;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  -- 1. Solo cuentas con teléfono verificado (o instituciones) pueden reportar
  if v_uid is null or not es_verificado() then
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
    -- 2. ¿Duplicado? Misma categoría, a menos de 500 m, en los últimos 30 minutos: se suma
    --    como confirmación en vez de crear otra alerta (y si estaba en revisión, el segundo
    --    testigo la publica). Va antes del límite: sumarse a lo que ya existe nunca se bloquea.
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
      select estado into v_dup.estado from alertas where id = v_dup.id;
      return jsonb_build_object('duplicada_de', v_dup.id, 'estado', v_dup.estado);
    end if;

    -- 3. Límite de reportes por hora (config.reportes_por_hora)
    select reportes_por_hora into v_limite from config where id = 1;
    if (select count(*) from alertas
        where creada_por = v_uid and creada_en > now() - interval '1 hour') >= v_limite then
      raise exception 'Alcanzaste el límite de reportes (% por hora). Intenta más tarde', v_limite;
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

-- ─── ¿A cuántos teléfonos puede llegar una alerta? (solo validadores) ──────
create or replace function conteo_dispositivos() returns int
language sql stable security definer set search_path = public as $$
  select case when es_validador() then (select count(*)::int from dispositivos where activo) end;
$$;

revoke execute on function conteo_dispositivos() from public, anon;
grant  execute on function conteo_dispositivos() to authenticated, service_role;

-- Misma vista de 004 (mismas columnas y orden) + teléfonos registrados al final
create or replace view metricas with (security_invoker = true) as
select count(*) filter (where estado in ('no_confirmada', 'corroborada', 'verificada')) as activas,
       count(*) filter (where estado = 'pendiente')                                   as por_validar,
       (extract(epoch from avg(verificada_en - creada_en)
          filter (where verificada_en is not null
                    and verificada_por is distinct from creada_por
                    and creada_en > now() - interval '7 days')))::int                 as segundos_validacion,
       (select count(*) from entregas
         where enviada_en >= (date_trunc('day', now() at time zone 'America/Mexico_City')
                              at time zone 'America/Mexico_City'))::int               as entregas_hoy,
       conteo_dispositivos()                                                          as dispositivos_activos
from alertas;
