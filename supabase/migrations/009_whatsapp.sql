-- =============================================================================
-- ALERTA CERCA · 009_whatsapp.sql
-- Verificación del teléfono por WhatsApp en vez de SMS: mucha más gente lo usa y es más fácil.
--
-- Supabase Auth sigue generando y comprobando el código (1 número = 1 cuenta), pero ya no lo
-- manda por SMS: se lo entrega a `enviar_codigo_whatsapp()` (Auth Hook "Send SMS", activado
-- en config.toml). Mientras no haya WhatsApp Business el envío es SIMULADO: el mensaje queda
-- en `privado.mensajes_whatsapp` y la app que lo pidió lo muestra como si le hubiera llegado
-- por WhatsApp. Con `update config set whatsapp_simulado = false;` el mismo código se envía de
-- verdad con la Edge Function `whatsapp` (WhatsApp Cloud API de Meta).
--
-- ¡Solo para pruebas! En modo simulado cualquiera puede ver el código de cualquier número.
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

alter table config add column whatsapp_simulado boolean not null default true;

-- Fuera de la API: PostgREST no publica el esquema `privado` y solo las funciones del
-- servidor (security definer) pueden leerlo o escribirlo.
create schema if not exists privado;
revoke all on schema privado from public;

create table privado.mensajes_whatsapp (
  id         bigint generated always as identity primary key,
  telefono   text not null check (telefono ~ '^[0-9]{8,15}$'),   -- como lo guarda Auth: 525511111111
  texto      text not null,
  codigo     text,                                               -- solo en modo simulado
  simulado   boolean not null,
  enviado_en timestamptz not null default now()
);
create index mensajes_whatsapp_telefono_idx on privado.mensajes_whatsapp (telefono, enviado_en desc);

-- ─── Auth Hook "Send SMS": Supabase Auth entrega aquí el código ────────────
-- Evento: {"user": {...}, "sms": {"otp": "123456", "phone": "525511111111"}}. Por si una
-- versión de Auth no manda `sms.phone`, el número también se busca en el usuario: el nuevo
-- (`new_phone`) al convertir una cuenta anónima, o `phone` al entrar con uno que ya tiene cuenta.
create or replace function enviar_codigo_whatsapp(event jsonb) returns jsonb
language plpgsql security definer set search_path = public, privado as $$
declare
  v_tel     text := regexp_replace(coalesce(nullif(event #>> '{sms,phone}', ''),
                                            nullif(event #>> '{user,new_phone}', ''),
                                            nullif(event #>> '{user,phone_change}', ''),
                                            event #>> '{user,phone}', ''), '\D', '', 'g');
  v_otp     text := event #>> '{sms,otp}';
  v_simular boolean;
begin
  if v_tel !~ '^[0-9]{8,15}$' or coalesce(v_otp, '') = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Número de teléfono inválido'));
  end if;
  select whatsapp_simulado into v_simular from config where id = 1;
  v_simular := coalesce(v_simular, true);

  delete from privado.mensajes_whatsapp where enviado_en < now() - interval '1 day';
  insert into privado.mensajes_whatsapp (telefono, texto, codigo, simulado)
  values (v_tel,
          format('ALERTA CERCA: tu código de verificación es %s. No lo compartas con nadie.', v_otp),
          case when v_simular then v_otp end,
          v_simular);
  if not v_simular then
    -- WhatsApp de verdad: pg_net llama a la Edge Function cuando Auth confirma su transacción
    perform llamar_funcion('whatsapp', jsonb_build_object('telefono', v_tel, 'codigo', v_otp));
  end if;
  return '{}'::jsonb;
exception when others then
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 500, 'message', 'No se pudo enviar el código por WhatsApp: ' || sqlerrm));
end $$;

revoke execute on function enviar_codigo_whatsapp(jsonb) from public, anon, authenticated;
grant  execute on function enviar_codigo_whatsapp(jsonb) to supabase_auth_admin;

-- ─── WhatsApp simulado: la app que pidió el código lo "recibe" ─────────────
create or replace function whatsapp_simulado(p_telefono text)
returns table (texto text, codigo text, enviado_en timestamptz)
language sql stable security definer set search_path = public, privado as $$
  select m.texto, m.codigo, m.enviado_en
  from privado.mensajes_whatsapp m
  join config k on k.id = 1 and k.whatsapp_simulado
  where m.simulado
    and m.telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
    and m.enviado_en > now() - interval '10 minutes'
  order by m.enviado_en desc
  limit 1;
$$;

revoke execute on function whatsapp_simulado(text) from public, anon;
grant  execute on function whatsapp_simulado(text) to authenticated;

-- ─── Retención: igual que en 004 + los mensajes de WhatsApp (1 día) ────────
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
end $$;
