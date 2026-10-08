-- =============================================================================
-- ALERTA CERCA · 005_disparadores.sql
-- Disparar la Edge Function `notificar` automáticamente con pg_net + Vault (paso 2.5).
--
-- Mejora sobre la propuesta: en Vault ya NO se guarda la service_role key (que salta
-- todas las reglas). Se guarda un secreto propio y de un solo uso, `secreto_funciones`,
-- que las Edge Functions comparan con su variable SECRETO_FUNCIONES. Mínimo privilegio.
--
-- Configuración (una sola vez, después de desplegar; ver supabase/configurar_vault.sql):
--   select vault.create_secret('https://TU_REF.supabase.co/functions/v1', 'url_funciones');
--   select vault.create_secret('UNA_CADENA_LARGA_Y_ALEATORIA',            'secreto_funciones');
-- =============================================================================

-- Llama a una Edge Function desde SQL. pg_net envía la petición DESPUÉS de que la
-- transacción se confirma, así que la función ya encuentra la alerta guardada.
create or replace function llamar_funcion(p_funcion text, p_cuerpo jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url     text;
  v_secreto text;
begin
  select decrypted_secret into v_url     from vault.decrypted_secrets where name = 'url_funciones';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'secreto_funciones';
  if v_url is null or v_secreto is null then
    -- Sin configurar no se rompe nada: la alerta se guarda y solo se omite el envío.
    raise warning 'ALERTA CERCA: faltan url_funciones/secreto_funciones en Vault; no se llamó a %', p_funcion;
    return;
  end if;
  perform net.http_post(
    url                  := rtrim(v_url, '/') || '/' || p_funcion,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-alerta-secreto', v_secreto),
    body                 := p_cuerpo,
    timeout_milliseconds := 60000);
end $$;

revoke execute on function llamar_funcion(text, jsonb) from public, anon, authenticated;
grant  execute on function llamar_funcion(text, jsonb) to service_role;

-- Cada vez que se crea una alerta o cambia su estado, se llama a notificar.
-- (Al expirar no se avisa a nadie: la alerta simplemente sale del mapa.)
create or replace function al_cambiar_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform llamar_funcion('notificar', jsonb_build_object(
    'alerta_id', new.id, 'evento', 'estado',
    'anterior', case when tg_op = 'UPDATE' then old.estado::text end));
  return new;
end $$;

create trigger alertas_estado_insert after insert on alertas
  for each row execute function al_cambiar_estado();

create trigger alertas_estado_update after update of estado on alertas
  for each row when (old.estado is distinct from new.estado and new.estado <> 'expirada')
  execute function al_cambiar_estado();
