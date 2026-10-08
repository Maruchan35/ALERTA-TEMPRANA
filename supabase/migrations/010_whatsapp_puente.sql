-- =============================================================================
-- ALERTA CERCA · 010_whatsapp_puente.sql
-- WhatsApp de verdad SIN WhatsApp Business: un número de WhatsApp normal, vinculado como
-- "dispositivo vinculado" (igual que WhatsApp Web) en el programa `puente-whatsapp/`, envía
-- los códigos de verificación.
--
--   config.whatsapp_modo:
--     'simulado' → la app que pidió el código lo muestra (solo pruebas; así venía en 009)
--     'puente'   → el código queda en cola; el puente lo toma con whatsapp_pendientes() y lo
--                  envía desde su número; reporta con whatsapp_resultado()
--     'meta'     → WhatsApp Cloud API (Business) con la Edge Function `whatsapp`
--
-- El puente se autentica con el secreto `secreto_puente` de Vault (no con la service_role key).
-- Al conectarse puede activar el modo 'puente' él solo (whatsapp_latido con p_activar).
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

-- ─── Modo de envío (reemplaza a config.whatsapp_simulado) ──────────────────
alter table config add column whatsapp_modo text not null default 'simulado'
  check (whatsapp_modo in ('simulado', 'puente', 'meta'));
update config set whatsapp_modo = case when whatsapp_simulado then 'simulado' else 'meta' end;

-- ─── Cola de mensajes ──────────────────────────────────────────────────────
alter table privado.mensajes_whatsapp
  add column modo           text not null default 'simulado' check (modo in ('simulado', 'puente', 'meta')),
  add column estado         text not null default 'enviado'
                            check (estado in ('pendiente', 'enviando', 'enviado', 'error')),
  add column intentos       int not null default 0,
  add column error          text,
  add column actualizado_en timestamptz not null default now();
update privado.mensajes_whatsapp set modo = case when simulado then 'simulado' else 'meta' end;
create index mensajes_whatsapp_cola_idx on privado.mensajes_whatsapp (enviado_en)
  where estado in ('pendiente', 'enviando');

-- Estado del puente: quién está vinculado y cuándo dio señales de vida
create table privado.puente_whatsapp (
  id         int primary key default 1 check (id = 1),
  numero     text,
  conectado  boolean not null default false,
  latido_en  timestamptz
);
insert into privado.puente_whatsapp default values;

-- ─── Auth Hook "Send SMS": igual que en 009, según el modo ─────────────────
create or replace function enviar_codigo_whatsapp(event jsonb) returns jsonb
language plpgsql security definer set search_path = public, privado as $$
declare
  v_tel  text := regexp_replace(coalesce(nullif(event #>> '{sms,phone}', ''),
                                         nullif(event #>> '{user,new_phone}', ''),
                                         nullif(event #>> '{user,phone_change}', ''),
                                         event #>> '{user,phone}', ''), '\D', '', 'g');
  v_otp  text := event #>> '{sms,otp}';
  v_modo text;
begin
  if v_tel !~ '^[0-9]{8,15}$' or coalesce(v_otp, '') = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Número de teléfono inválido'));
  end if;
  select whatsapp_modo into v_modo from config where id = 1;
  v_modo := coalesce(v_modo, 'simulado');

  delete from privado.mensajes_whatsapp where enviado_en < now() - interval '1 day';
  insert into privado.mensajes_whatsapp (telefono, texto, codigo, modo, estado)
  values (v_tel,
          format('ALERTA CERCA: tu código de verificación es %s. No lo compartas con nadie. '
                 'Si no lo pediste, ignora este mensaje.', v_otp),
          case when v_modo = 'simulado' then v_otp end,   -- solo el simulado se lo muestra a la app
          v_modo,
          case when v_modo = 'puente' then 'pendiente' else 'enviado' end);
  if v_modo = 'meta' then
    -- WhatsApp Business: pg_net llama a la Edge Function cuando Auth confirma su transacción
    perform llamar_funcion('whatsapp', jsonb_build_object('telefono', v_tel, 'codigo', v_otp));
  end if;
  return '{}'::jsonb;
exception when others then
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 500, 'message', 'No se pudo enviar el código por WhatsApp: ' || sqlerrm));
end $$;

-- ─── WhatsApp simulado: igual que en 009, ahora con el modo ────────────────
create or replace function whatsapp_simulado(p_telefono text)
returns table (texto text, codigo text, enviado_en timestamptz)
language sql stable security definer set search_path = public, privado as $$
  select m.texto, m.codigo, m.enviado_en
  from privado.mensajes_whatsapp m
  join config k on k.id = 1 and k.whatsapp_modo = 'simulado'
  where m.modo = 'simulado'
    and m.telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
    and m.enviado_en > now() - interval '10 minutes'
  order by m.enviado_en desc
  limit 1;
$$;

alter table config drop column whatsapp_simulado;
alter table privado.mensajes_whatsapp drop column simulado;

-- ─── Lo que llama el puente (con la publishable key + el secreto) ──────────
create or replace function secreto_puente_valido(p_secreto text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_secreto is not null and char_length(p_secreto) >= 32
     and p_secreto = (select decrypted_secret from vault.decrypted_secrets where name = 'secreto_puente');
$$;

-- Toma hasta p_limite mensajes por enviar. Los de más de 10 minutos ya no sirven (el código
-- venció) y los que se quedaron "enviando" más de 1 minuto se reintentan (máx. 3 intentos).
create or replace function whatsapp_pendientes(p_secreto text, p_limite int default 5)
returns table (id bigint, telefono text, texto text)
language plpgsql security definer set search_path = public, privado as $$
#variable_conflict use_column
begin
  if not secreto_puente_valido(p_secreto) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update privado.puente_whatsapp set latido_en = now() where puente_whatsapp.id = 1;
  update privado.mensajes_whatsapp m set estado = 'error', error = 'El código venció antes de enviarse',
                                         actualizado_en = now()
   where m.estado in ('pendiente', 'enviando') and m.enviado_en < now() - interval '10 minutes';
  return query
  with tomados as (
    select m.id from privado.mensajes_whatsapp m
     where m.modo = 'puente'
       and (m.estado = 'pendiente'
            or (m.estado = 'enviando' and m.actualizado_en < now() - interval '1 minute' and m.intentos < 3))
     order by m.enviado_en
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked)
  update privado.mensajes_whatsapp m
     set estado = 'enviando', intentos = m.intentos + 1, actualizado_en = now()
    from tomados t
   where m.id = t.id
  returning m.id, m.telefono, m.texto;
end $$;

create or replace function whatsapp_resultado(p_secreto text, p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public, privado as $$
begin
  if not secreto_puente_valido(p_secreto) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update privado.mensajes_whatsapp
     set estado = case when p_ok then 'enviado' else 'error' end,
         error = case when p_ok then null else left(coalesce(p_error, 'Error desconocido'), 300) end,
         actualizado_en = now()
   where id = p_id and estado = 'enviando';
end $$;

-- Señal de vida del puente. Con p_activar = true y conectado, pasa la verificación a modo 'puente'.
create or replace function whatsapp_latido(p_secreto text, p_numero text, p_conectado boolean,
                                           p_activar boolean default false)
returns text language plpgsql security definer set search_path = public, privado as $$
declare v_modo text;
begin
  if not secreto_puente_valido(p_secreto) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update privado.puente_whatsapp
     set numero = coalesce(nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), ''), numero),
         conectado = coalesce(p_conectado, false), latido_en = now()
   where id = 1;
  if coalesce(p_activar, false) and coalesce(p_conectado, false) then
    update config set whatsapp_modo = 'puente' where id = 1 and whatsapp_modo <> 'puente';
  end if;
  select whatsapp_modo into v_modo from config where id = 1;
  return v_modo;
end $$;

-- ─── Lo que ve la app: cómo llega el código (y desde qué número) ──────────
create or replace function estado_whatsapp() returns jsonb
language sql stable security definer set search_path = public, privado as $$
  select jsonb_build_object(
    'modo', k.whatsapp_modo,
    'conectado', case when k.whatsapp_modo = 'puente'
                      then coalesce(p.conectado and p.latido_en > now() - interval '1 minute', false)
                      else true end,
    'numero', case when k.whatsapp_modo = 'puente' then p.numero end)
  from config k cross join privado.puente_whatsapp p
  where k.id = 1;
$$;

revoke execute on function secreto_puente_valido(text)                       from public, anon, authenticated;
revoke execute on function whatsapp_pendientes(text, int)                    from public;
revoke execute on function whatsapp_resultado(text, bigint, boolean, text)   from public;
revoke execute on function whatsapp_latido(text, text, boolean, boolean)     from public;
revoke execute on function estado_whatsapp()                                 from public, anon;
grant  execute on function whatsapp_pendientes(text, int)                    to anon, authenticated;
grant  execute on function whatsapp_resultado(text, bigint, boolean, text)   to anon, authenticated;
grant  execute on function whatsapp_latido(text, text, boolean, boolean)     to anon, authenticated;
grant  execute on function estado_whatsapp()                                 to authenticated;
