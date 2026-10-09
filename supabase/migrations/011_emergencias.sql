-- =============================================================================
-- ALERTA CERCA · 011_emergencias.sql
-- MODO EMERGENCIA (SOS): la app ya avisaba de lo que pasa AFUERA; esto es para la persona
-- a la que le está pasando (asalto, secuestro, la siguen). Activa el SOS con el botón, con
-- una sacudida fuerte del teléfono o desde el atajo, y:
--   1. Los validadores (Protección Civil, el CCE, la institución de guardia) reciben al
--      instante un aviso de prioridad máxima.
--   2. Ven su ubicación EN VIVO (recorrido, velocidad, batería, última señal) y la
--      evidencia que graba el teléfono (video con audio), y le dan seguimiento: toman el
--      caso, registran que avisaron al 911 (folio) y lo cierran cuando la localizan.
--   3. La persona ve en su pantalla quién la está siguiendo; puede llamar al 911,
--      compartir su ubicación y terminar ("Estoy a salvo").
--   4. Si el teléfono deja de mandar señal (lo apagaron, se quedó sin batería), los
--      validadores reciben otro aviso.
--
-- Excepción de privacidad, la única del sistema: mientras una emergencia está abierta SÍ
-- se guarda la ubicación EXACTA de la persona, porque ella misma pidió ayuda. Solo la ven
-- ella y los validadores, deja de enviarse al cerrarse, y el recorrido y la evidencia se
-- borran a los `dias_retencion_emergencia` días (30) del cierre.
--
-- NO es pública: no se avisa a los vecinos (para no exponer a la persona). Si conviene que
-- la colmena ayude a buscar, un validador emite una alerta normal desde el panel.
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

alter table config
  add column emergencias_por_hora      int not null default 5  check (emergencias_por_hora between 1 and 100),
  add column minutos_sin_senal         int not null default 2  check (minutos_sin_senal between 1 and 60),
  add column dias_retencion_emergencia int not null default 30 check (dias_retencion_emergencia between 1 and 365);

-- ─── Emergencias ────────────────────────────────────────────────────────────
create table emergencias (
  id                   uuid primary key default gen_random_uuid(),
  usuario_id           uuid not null references auth.users on delete cascade,
  estado               text not null default 'activa'
                         check (estado in ('activa', 'en_seguimiento', 'cerrada')),
  -- Lo que la persona indica (un toque en su pantalla); 'sos' = sin especificar
  tipo                 text not null default 'sos'
                         check (tipo in ('sos', 'asalto', 'secuestro', 'me_siguen', 'otra')),
  origen               text not null check (origen in ('boton', 'movimiento', 'atajo')),
  -- Última ubicación conocida (el recorrido completo está en emergencia_puntos)
  lat                  double precision not null check (lat between -90 and 90),
  lon                  double precision not null check (lon between -180 and 180),
  precision_m          real check (precision_m >= 0),
  velocidad_ms         real check (velocidad_ms >= 0),
  bateria              smallint check (bateria between 0 and 100),
  ultima_senal_en      timestamptz not null default now(),
  sin_senal_avisada_en timestamptz,                      -- ya se avisó que el teléfono no responde
  creada_en            timestamptz not null default now(),
  atendida_por         uuid references perfiles on delete set null,
  atendida_en          timestamptz,
  policia_avisada_en   timestamptz,
  folio_911            text check (char_length(folio_911) <= 40),
  nota                 text check (char_length(nota) <= 500),
  cerrada_en           timestamptz,
  cierre               text check (cierre in ('a_salvo', 'localizada', 'falsa_alarma')),
  cerrada_por          uuid references perfiles on delete set null,  -- la persona o un validador
  check ((estado = 'cerrada') = (cierre is not null and cerrada_en is not null))
);
create index emergencias_abiertas_idx on emergencias (creada_en desc) where estado <> 'cerrada';
create index emergencias_usuario_idx on emergencias (usuario_id, creada_en desc);
-- Una sola emergencia abierta por persona (dos toques o una sacudida repetida no duplican)
create unique index emergencias_una_abierta on emergencias (usuario_id) where estado <> 'cerrada';

-- Recorrido: un punto cada ~5 s mientras la emergencia está abierta
create table emergencia_puntos (
  id            bigint generated always as identity primary key,
  emergencia_id uuid not null references emergencias on delete cascade,
  lat           double precision not null check (lat between -90 and 90),
  lon           double precision not null check (lon between -180 and 180),
  precision_m   real,
  velocidad_ms  real,
  registrada_en timestamptz not null default now()
);
create index emergencia_puntos_idx on emergencia_puntos (emergencia_id, registrada_en);

-- Evidencia: fragmentos de video (con audio) que el teléfono sube mientras graba
create table emergencia_evidencias (
  id            bigint generated always as identity primary key,
  emergencia_id uuid not null references emergencias on delete cascade,
  tipo          text not null check (tipo in ('video', 'audio', 'foto')),
  ruta          text not null unique check (char_length(ruta) <= 300),  -- bucket privado 'evidencias'
  duracion_s    int check (duracion_s between 0 and 3600),
  creada_en     timestamptz not null default now()
);
create index emergencia_evidencias_idx on emergencia_evidencias (emergencia_id, creada_en);

-- ─── Quién ve qué: la persona, lo suyo; los validadores, todo. Nadie escribe directo ──
alter table emergencias           enable row level security;
alter table emergencia_puntos     enable row level security;
alter table emergencia_evidencias enable row level security;

create policy "mis emergencias" on emergencias for select
  using (usuario_id = auth.uid() or es_validador());
create policy "recorrido de mis emergencias" on emergencia_puntos for select
  using (es_validador() or exists (select 1 from emergencias e
                                   where e.id = emergencia_id and e.usuario_id = auth.uid()));
create policy "evidencia de mis emergencias" on emergencia_evidencias for select
  using (es_validador() or exists (select 1 from emergencias e
                                   where e.id = emergencia_id and e.usuario_id = auth.uid()));

-- ─── Evidencia: bucket privado 'evidencias' (máx. 50 MB por fragmento) ──────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 52428800,
        array['video/mp4', 'audio/mp4', 'audio/aac', 'image/jpeg'])
on conflict (id) do nothing;

-- Subir: solo a <mi id>/<id de MI emergencia>/..., mientras esté abierta o recién cerrada
-- (el último fragmento termina de subir después de "Estoy a salvo"). Sirve también con
-- sesión anónima: para pedir ayuda no se exige cuenta.
create policy "subir evidencia" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias'
              and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.emergencias e
                          where e.id::text = (storage.foldername(name))[2]
                            and e.usuario_id = auth.uid()
                            and (e.estado <> 'cerrada' or e.cerrada_en > now() - interval '15 minutes')));

create policy "ver evidencia" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_validador()));

-- ─── Lo que ve la persona en su pantalla ("Protección Civil ya te está siguiendo") ──
create or replace function estado_emergencia_persona(p_e emergencias) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'emergencia_id',   p_e.id,
    'estado',          p_e.estado,
    'tipo',            p_e.tipo,
    'cierre',          p_e.cierre,
    'atendida_por',    case when p_e.atendida_por is not null
                            then coalesce(v.institucion, v.nombre, 'Un validador') end,
    'policia_avisada', p_e.policia_avisada_en is not null)
  from (select 1) x left join perfiles v on v.id = p_e.atendida_por;
$$;

-- ─── Señal: ubicación, velocidad y batería (cada ~5 s mientras está abierta) ──
create or replace function senal_emergencia(
  p_emergencia uuid, p_lat double precision default null, p_lon double precision default null,
  p_precision_m double precision default null, p_velocidad_ms double precision default null,
  p_bateria int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e      emergencias;
  v_ultimo timestamptz;
begin
  select * into v_e from emergencias where id = p_emergencia and usuario_id = auth.uid() for update;
  if not found then raise exception 'Emergencia no encontrada'; end if;
  if v_e.estado = 'cerrada' then return estado_emergencia_persona(v_e); end if;
  if p_bateria is not null and p_bateria not between 0 and 100 then raise exception 'Batería inválida'; end if;

  if p_lat is not null and p_lon is not null then
    if p_lat not between -90 and 90 or p_lon not between -180 and 180 then
      raise exception 'Ubicación inválida';
    end if;
    -- Máximo un punto cada 3 s: la app manda cada ~5 s; esto frena a un cliente desbocado
    select max(registrada_en) into v_ultimo from emergencia_puntos where emergencia_id = v_e.id;
    if v_ultimo is null or v_ultimo < now() - interval '3 seconds' then
      insert into emergencia_puntos (emergencia_id, lat, lon, precision_m, velocidad_ms)
      values (v_e.id, p_lat, p_lon, case when p_precision_m >= 0 then p_precision_m end, case when p_velocidad_ms >= 0 then p_velocidad_ms end);
    end if;
    update emergencias set lat = p_lat, lon = p_lon, precision_m = case when p_precision_m >= 0 then p_precision_m end,
                           velocidad_ms = case when p_velocidad_ms >= 0 then p_velocidad_ms end
    where id = v_e.id;
  end if;

  -- Aunque no haya GPS, el teléfono sigue vivo: eso también le sirve al validador
  update emergencias set ultima_senal_en = now(), sin_senal_avisada_en = null,
                         bateria = coalesce(p_bateria, bateria)
  where id = v_e.id
  returning * into v_e;
  return estado_emergencia_persona(v_e);
end $$;

-- ─── Activar el SOS ─────────────────────────────────────────────────────────
create or replace function iniciar_emergencia(
  p_lat double precision, p_lon double precision, p_precision_m double precision default null,
  p_origen text default 'boton', p_bateria int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_abierta emergencias;
  v_limite  int;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Sin sesión'; end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Ubicación inválida';
  end if;
  if p_origen is null or p_origen not in ('boton', 'movimiento', 'atajo') then
    raise exception 'Origen inválido';
  end if;

  -- Ya tiene una abierta (otro toque, otra sacudida, la app se reinició): se reutiliza
  select * into v_abierta from emergencias where usuario_id = v_uid and estado <> 'cerrada';
  if found then
    return senal_emergencia(v_abierta.id, p_lat, p_lon, p_precision_m, null, p_bateria)
           || jsonb_build_object('nueva', false);
  end if;

  select emergencias_por_hora into v_limite from config;
  if (select count(*) from emergencias where usuario_id = v_uid and creada_en > now() - interval '1 hour') >= v_limite then
    raise exception 'Activaste el SOS demasiadas veces en la última hora. Si estás en peligro, llama al 911';
  end if;
  if p_bateria is not null and p_bateria not between 0 and 100 then raise exception 'Batería inválida'; end if;

  begin
    insert into emergencias (usuario_id, origen, lat, lon, precision_m, bateria)
    values (v_uid, p_origen, p_lat, p_lon, case when p_precision_m >= 0 then p_precision_m end, p_bateria)
    returning id into v_id;
  exception when unique_violation then
    -- Dos activaciones al mismo tiempo: gana la primera
    select * into v_abierta from emergencias where usuario_id = v_uid and estado <> 'cerrada';
    return estado_emergencia_persona(v_abierta) || jsonb_build_object('nueva', false);
  end;
  insert into emergencia_puntos (emergencia_id, lat, lon, precision_m)
  values (v_id, p_lat, p_lon, case when p_precision_m >= 0 then p_precision_m end);

  -- Aviso inmediato a los validadores (push de prioridad máxima)
  perform llamar_funcion('notificar', jsonb_build_object('emergencia_id', v_id, 'evento', 'nueva'));
  return jsonb_build_object('emergencia_id', v_id, 'estado', 'activa', 'tipo', 'sos', 'cierre', null,
                            'atendida_por', null, 'policia_avisada', false, 'nueva', true);
end $$;

-- ─── La persona indica qué pasa (un toque): "Me asaltan", "Me llevan", "Me siguen" ──
create or replace function tipo_emergencia(p_emergencia uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_e emergencias;
begin
  if p_tipo is null or p_tipo not in ('sos', 'asalto', 'secuestro', 'me_siguen', 'otra') then
    raise exception 'Tipo de emergencia inválido';
  end if;
  update emergencias set tipo = p_tipo
  where id = p_emergencia and usuario_id = auth.uid() and estado <> 'cerrada' and tipo <> p_tipo
  returning * into v_e;
  if found then
    perform llamar_funcion('notificar', jsonb_build_object('emergencia_id', v_e.id, 'evento', 'tipo'));
    return estado_emergencia_persona(v_e);
  end if;
  select * into v_e from emergencias where id = p_emergencia and usuario_id = auth.uid();
  if not found then raise exception 'Emergencia no encontrada'; end if;
  return estado_emergencia_persona(v_e);
end $$;

-- ─── Evidencia: el teléfono sube el fragmento a Storage y lo registra aquí ──
create or replace function registrar_evidencia(p_emergencia uuid, p_tipo text, p_ruta text,
                                               p_duracion_s int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_e emergencias;
begin
  select * into v_e from emergencias where id = p_emergencia and usuario_id = auth.uid();
  if not found then raise exception 'Emergencia no encontrada'; end if;
  if v_e.estado = 'cerrada' and v_e.cerrada_en < now() - interval '15 minutes' then
    raise exception 'La emergencia ya está cerrada';
  end if;
  if p_tipo is null or p_tipo not in ('video', 'audio', 'foto') then raise exception 'Tipo de evidencia inválido'; end if;
  if p_ruta is null or p_ruta not like auth.uid()::text || '/' || p_emergencia::text || '/%' then
    raise exception 'La evidencia debe estar en la carpeta de tu emergencia';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'evidencias' and name = p_ruta) then
    raise exception 'La evidencia no se ha subido';
  end if;
  insert into emergencia_evidencias (emergencia_id, tipo, ruta, duracion_s)
  values (p_emergencia, p_tipo, p_ruta, p_duracion_s)
  on conflict (ruta) do nothing;
end $$;

-- ─── La persona termina: "Estoy a salvo" o "Fue sin querer" ─────────────────
create or replace function terminar_emergencia(p_emergencia uuid, p_cierre text default 'a_salvo')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_e emergencias;
begin
  if p_cierre is null or p_cierre not in ('a_salvo', 'falsa_alarma') then raise exception 'Cierre inválido'; end if;
  update emergencias set estado = 'cerrada', cierre = p_cierre, cerrada_en = now(), cerrada_por = auth.uid()
  where id = p_emergencia and usuario_id = auth.uid() and estado <> 'cerrada'
  returning * into v_e;
  if found then
    -- Los validadores deben saberlo: quizá ya iba una patrulla en camino
    perform llamar_funcion('notificar', jsonb_build_object('emergencia_id', v_e.id, 'evento', 'cerrada'));
    return estado_emergencia_persona(v_e);
  end if;
  select * into v_e from emergencias where id = p_emergencia and usuario_id = auth.uid();
  if not found then raise exception 'Emergencia no encontrada'; end if;
  return estado_emergencia_persona(v_e);   -- ya estaba cerrada (p. ej. la cerró un validador)
end $$;

-- ─── Seguimiento (solo validadores) ─────────────────────────────────────────
--   tomar        → "yo me encargo" (pasa a EN SEGUIMIENTO)
--   policia      → se avisó al 911 / a la policía (folio opcional)
--   nota         → anotación para el turno
--   localizada   → la persona apareció o ya está a salvo (cierra)
--   falsa_alarma → se confirmó que no pasaba nada (cierra)
create or replace function atender_emergencia(p_emergencia uuid, p_accion text,
                                              p_nota text default null, p_folio text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_e    emergencias;
  v_nota text := nullif(btrim(p_nota), '');
begin
  if not es_validador() then raise exception 'Solo validadores pueden dar seguimiento a una emergencia'; end if;
  select * into v_e from emergencias where id = p_emergencia for update;
  if not found then raise exception 'Emergencia no encontrada'; end if;
  if v_e.estado = 'cerrada' then raise exception 'La emergencia ya está cerrada'; end if;
  if v_nota is not null and char_length(v_nota) > 500 then raise exception 'La nota es demasiado larga (máx. 500)'; end if;

  case p_accion
    when 'tomar' then
      update emergencias set estado = 'en_seguimiento', atendida_por = v_uid, atendida_en = now(),
                             nota = coalesce(v_nota, nota)
      where id = v_e.id;
    when 'policia' then
      update emergencias set policia_avisada_en = coalesce(policia_avisada_en, now()),
                             folio_911 = coalesce(nullif(btrim(p_folio), ''), folio_911),
                             estado = 'en_seguimiento',
                             atendida_por = coalesce(atendida_por, v_uid),
                             atendida_en = coalesce(atendida_en, now()),
                             nota = coalesce(v_nota, nota)
      where id = v_e.id;
    when 'nota' then
      if v_nota is null then raise exception 'Escribe la nota'; end if;
      update emergencias set nota = v_nota where id = v_e.id;
    when 'localizada', 'falsa_alarma' then
      update emergencias set estado = 'cerrada', cierre = p_accion, cerrada_en = now(), cerrada_por = v_uid,
                             atendida_por = coalesce(atendida_por, v_uid),
                             atendida_en = coalesce(atendida_en, now()),
                             nota = coalesce(v_nota, nota)
      where id = v_e.id;
    else
      raise exception 'Acción inválida: %', p_accion;
  end case;
end $$;

-- ─── Teléfono de la persona: solo para validadores (para llamarle o dárselo al 911) ──
create or replace function telefono_emergencia(p_usuario uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when es_validador() then (select phone from auth.users where id = p_usuario) end;
$$;

-- ─── Vista para los paneles (security_invoker: respeta RLS) ────────────────
create or replace view emergencias_panel with (security_invoker = true) as
select e.id, e.usuario_id, e.estado, e.tipo, e.origen, e.lat, e.lon, e.precision_m, e.velocidad_ms,
       e.bateria, e.ultima_senal_en, e.sin_senal_avisada_en, e.creada_en, e.atendida_por, e.atendida_en,
       e.policia_avisada_en, e.folio_911, e.nota, e.cerrada_en, e.cierre, e.cerrada_por,
       coalesce(e.cerrada_por = e.usuario_id, false)                                       as cerrada_por_la_persona,
       telefono_emergencia(e.usuario_id)                                                   as telefono,
       v.nombre as atendida_por_nombre, v.institucion as atendida_por_institucion,
       (select count(*) from emergencia_puntos x where x.emergencia_id = e.id)::int        as n_puntos,
       (select count(*) from emergencia_evidencias x where x.emergencia_id = e.id)::int    as n_evidencias
from emergencias e
left join perfiles v on v.id = e.atendida_por;

revoke all on emergencias_panel from anon;

-- Métricas: misma vista de 008 (mismas columnas y orden) + emergencias abiertas al final
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
       conteo_dispositivos()                                                          as dispositivos_activos,
       (select count(*) from emergencias where estado <> 'cerrada')::int              as emergencias_abiertas
from alertas;

-- ─── Tareas: teléfono sin señal y retención ────────────────────────────────
-- Cada 30 s: si una emergencia abierta lleva `minutos_sin_senal` sin señal (lo apagaron,
-- se quedó sin batería o sin datos), se avisa UNA vez a los validadores. Se rearma sola
-- en cuanto el teléfono vuelve a mandar señal. Nunca se cierra sola: la cierra una persona.
create or replace function revisar_senal_emergencias() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
  r   record;
begin
  for r in
    update emergencias set sin_senal_avisada_en = now()
    where estado <> 'cerrada' and sin_senal_avisada_en is null
      and ultima_senal_en < now() - make_interval(mins => (select minutos_sin_senal from config))
    returning id
  loop
    perform llamar_funcion('notificar', jsonb_build_object('emergencia_id', r.id, 'evento', 'sin_senal'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Retención: igual que en 009 + las emergencias cerradas hace más de `dias_retencion_emergencia`
-- (en cascada se van su recorrido y su registro de evidencia; los archivos los borra `mantenimiento`)
create or replace function limpieza_diaria() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from entregas          where enviada_en < now() - interval '30 days';
  delete from entregas_telegram where enviada_en < now() - interval '30 days';
  delete from privado.mensajes_whatsapp where enviado_en < now() - interval '1 day';
  update dispositivos set activo = false where activo and actualizado_en < now() - interval '60 days';
  -- A los 90 días del cierre la alerta se anonimiza (queda solo para estadística).
  -- La foto la borra la Edge Function `mantenimiento` con la API de Storage.
  update alertas set descripcion = null, referencia = null, folio_911 = null, creada_por = null
  where cerrada_en < now() - interval '90 days'
    and (descripcion is not null or referencia is not null or folio_911 is not null or creada_por is not null);
  delete from emergencias
  where estado = 'cerrada'
    and cerrada_en < now() - make_interval(days => (select dias_retencion_emergencia from config));
end $$;

-- Archivos de evidencia que `mantenimiento` debe borrar de Storage: los de emergencias que
-- ya no existen (retención o cuenta borrada). Los de una emergencia viva nunca se tocan.
create or replace function evidencias_por_borrar() returns table (ruta text)
language sql stable security definer set search_path = public as $$
  select o.name from storage.objects o
  where o.bucket_id = 'evidencias' and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from emergencias e where e.id::text = split_part(o.name, '/', 2));
$$;

select cron.schedule('revisar-senal-emergencias', '30 seconds', 'select public.revisar_senal_emergencias()');

-- ─── Tiempo real: los paneles ven moverse el punto y llegar la evidencia (respeta RLS) ──
alter publication supabase_realtime add table emergencias, emergencia_puntos, emergencia_evidencias;

-- ─── Permisos ───────────────────────────────────────────────────────────────
revoke execute on function estado_emergencia_persona(emergencias)                     from public, anon, authenticated;
revoke execute on function revisar_senal_emergencias()                                from public, anon, authenticated;
revoke execute on function evidencias_por_borrar()                                    from public, anon, authenticated;
grant  execute on function revisar_senal_emergencias()                                to service_role;
grant  execute on function evidencias_por_borrar()                                    to service_role;

revoke execute on function iniciar_emergencia(double precision, double precision, double precision, text, int) from public, anon;
revoke execute on function senal_emergencia(uuid, double precision, double precision, double precision,
                                            double precision, int)                    from public, anon;
revoke execute on function tipo_emergencia(uuid, text)                                from public, anon;
revoke execute on function registrar_evidencia(uuid, text, text, int)                 from public, anon;
revoke execute on function terminar_emergencia(uuid, text)                            from public, anon;
revoke execute on function atender_emergencia(uuid, text, text, text)                 from public, anon;
revoke execute on function telefono_emergencia(uuid)                                  from public, anon;
grant  execute on function iniciar_emergencia(double precision, double precision, double precision, text, int) to authenticated;
grant  execute on function senal_emergencia(uuid, double precision, double precision, double precision,
                                            double precision, int)                    to authenticated;
grant  execute on function tipo_emergencia(uuid, text)                                to authenticated;
grant  execute on function registrar_evidencia(uuid, text, text, int)                 to authenticated;
grant  execute on function terminar_emergencia(uuid, text)                            to authenticated;
grant  execute on function atender_emergencia(uuid, text, text, text)                 to authenticated;
grant  execute on function telefono_emergencia(uuid)                                  to authenticated;
