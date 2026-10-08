-- =============================================================================
-- ALERTA CERCA · 007_colmena.sql
-- "Inteligencia colmena": la comunidad hace avanzar las alertas sin depender de un
-- administrador. Los validadores siguen pudiendo verificar, descartar, ajustar y cerrar,
-- pero ya no son un cuello de botella:
--
--   1. Un reporte EN REVISIÓN (personas y menores, o autor con reputación baja) sale como
--      NO CONFIRMADO (≤ 1 km):
--        · al instante, si otra persona verificada reporta lo mismo cerca (dos testigos), o
--        · solo, si ningún validador lo revisa en `minutos_espera_validador` (5 min).
--      Los que regresaron a revisión por votos de "parece falsa" ya no salen solos.
--   2. Confirmaciones de vecinos: 3 → CORROBORADA (tope 3 km); 6 o más → alcance de
--      colmena (tope 10 km). Más allá, solo una institución (verificada).
--   3. La foto de una PERSONA (menor, desaparecida, vulnerable) no se muestra mientras
--      la alerta no esté confirmada: la difunde la colmena, la foto llega con la confianza.
--   4. Para reportar, confirmar o subir fotos hace falta un TELÉFONO verificado (o ser
--      institución). Una cuenta de correo creada por cualquiera ya no basta.
--
-- Los umbrales viven en `config`: el CCE o Protección Civil los ajustan sin programar.
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

-- ─── Umbrales de la colmena ─────────────────────────────────────────────────
alter table config
  add column minutos_espera_validador  int not null default 5     check (minutos_espera_validador between 1 and 1440),
  add column confirmaciones_corroborar int not null default 3     check (confirmaciones_corroborar between 1 and 100),
  add column confirmaciones_colmena    int not null default 6     check (confirmaciones_colmena between 1 and 100),
  add column radio_max_corroborada_m   int not null default 3000  check (radio_max_corroborada_m between 100 and 100000),
  add column radio_max_colmena_m       int not null default 10000 check (radio_max_colmena_m between 100 and 100000);

-- Personas y menores: si la colmena los publica, llegan al primer anillo (1 km)
update categorias set radio_max_no_conf_m = 1000 where requiere_validacion and radio_max_no_conf_m = 0;

-- ─── Teléfono verificado (o institución) ───────────────────────────────────
create or replace function es_verificado() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not es_anonimo() and (
    es_validador()
    or exists (select 1 from auth.users u where u.id = auth.uid() and u.phone_confirmed_at is not null));
$$;

-- ─── ¿La foto se puede mostrar a cualquiera? ───────────────────────────────
create or replace function foto_publica(p_estado estado_alerta, p_de_personas boolean) returns boolean
language sql immutable set search_path = public as $$
  select p_estado in ('corroborada', 'verificada') or (p_estado = 'no_confirmada' and not p_de_personas);
$$;

-- Misma vista de 004 (mismas columnas y orden); solo cambia cuándo se muestra la foto
create or replace view alertas_publicas as
select a.id, a.categoria, c.nombre, c.nombre_corto, c.nivel, a.estado, a.titulo,
       case when a.estado in ('descartada', 'expirada')
                 and a.creada_por is distinct from auth.uid() and not es_validador()
            then null else a.descripcion end                            as descripcion,
       case when a.estado in ('descartada', 'expirada')
                 and a.creada_por is distinct from auth.uid() and not es_validador()
            then null else a.referencia end                             as referencia,
       case when foto_publica(a.estado, c.requiere_validacion)
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

drop policy "ver fotos" on storage.objects;
create policy "ver fotos" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.es_validador()
    or exists (select 1 from public.alertas a join public.categorias c on c.clave = a.categoria
               where a.foto_path = objects.name
                 and public.foto_publica(a.estado, c.requiere_validacion))));

drop policy "subir mis fotos" on storage.objects;
create policy "subir mis fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.es_verificado());

-- ─── Reportar: igual que en 004, pero exige teléfono verificado ────────────
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
    -- 2. Límite: 3 reportes por hora
    if (select count(*) from alertas
        where creada_por = v_uid and creada_en > now() - interval '1 hour') >= 3 then
      raise exception 'Alcanzaste el límite de reportes. Intenta más tarde';
    end if;

    -- 3. ¿Duplicado? Misma categoría, a menos de 500 m, en los últimos 30 minutos:
    --    se suma como confirmación en vez de crear otra alerta (y si estaba en revisión,
    --    el segundo testigo la publica: ver revisar_confirmaciones).
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

-- ─── Confirmar: igual que en 004, pero exige teléfono verificado ───────────
create or replace function confirmar_alerta(p_alerta uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_alerta alertas;
begin
  if auth.uid() is null or not es_verificado() then
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

-- ─── Votos de la colmena ────────────────────────────────────────────────────
-- En revisión y nunca publicada + 1 testigo más → se publica (NO CONFIRMADA, o
-- CORROBORADA si ya juntó las confirmaciones) · N "lo confirmo" → CORROBORADA ·
-- 3 "parece falsa" → regresa a revisión.
create or replace function revisar_confirmaciones() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_si    int;
  v_falsa int;
  v_n     int;
  k       config;
begin
  select * into k from config where id = 1;
  select count(*) filter (where tipo = 'confirmo'), count(*) filter (where tipo = 'parece_falsa')
    into v_si, v_falsa
  from confirmaciones where alerta_id = new.alerta_id;

  if v_si >= 1 then
    update alertas
       set estado = case when v_si >= k.confirmaciones_corroborar then 'corroborada'::estado_alerta
                         else 'no_confirmada'::estado_alerta end,
           publicada_en = now()
     where id = new.alerta_id and estado = 'pendiente' and publicada_en is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into bitacora (alerta_id, usuario_id, accion, detalle)
      values (new.alerta_id, null, 'publicar_colmena', jsonb_build_object('confirmaciones', v_si));
    end if;
  end if;

  if v_si >= k.confirmaciones_corroborar then
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

-- ─── Radio permitido: el tope de CORROBORADA crece con la colmena ──────────
create or replace function radio_permitido(p_alerta uuid) returns int
language sql stable security definer set search_path = public, extensions as $$
  select case
    when a.estado not in ('no_confirmada', 'corroborada', 'verificada') then 0
    when a.radio_manual_m is not null then a.radio_manual_m
    else least(
      (select coalesce(max(e.radio_m), 0) from escalones_radio e
        where e.categoria = a.categoria
          and e.minuto <= extract(epoch from now() - a.publicada_en) / 60 * k.factor_tiempo),
      case a.estado
        when 'no_confirmada' then c.radio_max_no_conf_m
        when 'corroborada' then
          case when (select count(*) from confirmaciones q
                      where q.alerta_id = a.id and q.tipo = 'confirmo') >= k.confirmaciones_colmena
               then k.radio_max_colmena_m else k.radio_max_corroborada_m end
        else 1000000 end)
  end
  from alertas a
  join categorias c on c.clave = a.categoria
  cross join config k
  where a.id = p_alerta and k.id = 1;
$$;

-- ─── Sin validador a tiempo: la colmena la publica (pg_cron, cada 15 s) ────
-- Solo reportes que nunca se publicaron y cuyo autor no está en revisión por su
-- reputación (< −2): esos siguen esperando a un validador o a un segundo testigo.
create or replace function publicar_pendientes() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with publicadas as (
    update alertas a set estado = 'no_confirmada', publicada_en = now()
      from config k, perfiles p
     where k.id = 1 and p.id = a.creada_por
       and a.estado = 'pendiente' and a.publicada_en is null
       and p.reputacion >= -2
       and a.creada_en <= now() - make_interval(mins => k.minutos_espera_validador)
    returning a.id, k.minutos_espera_validador as minutos),
  registro as (
    insert into bitacora (alerta_id, usuario_id, accion, detalle)
    select id, null, 'publicar_auto', jsonb_build_object('minutos_sin_revision', minutos) from publicadas)
  select count(*)::int into v_n from publicadas;
  return v_n;
end $$;

revoke execute on function publicar_pendientes() from public, anon, authenticated;
grant  execute on function publicar_pendientes() to service_role;

select cron.schedule('publicar-pendientes', '15 seconds', 'select public.publicar_pendientes()');
