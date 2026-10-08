-- =============================================================================
-- ALERTA CERCA · 002_triggers.sql
-- Ubicaciones, celdas y perfiles automáticos (paso 1.3).
-- =============================================================================

-- Convierte lat/lon de la alerta en un punto geográfico
create or replace function fijar_ubicacion_alerta() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.ubicacion := st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography;
  return new;
end $$;

create trigger alertas_ubicacion before insert or update of lat, lon on alertas
  for each row execute function fijar_ubicacion_alerta();

-- Convierte la celda (geohash) en el punto central de ese cuadro
create or replace function fijar_centro_celda() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.celda := lower(new.celda);
  if new.celda is null or new.celda !~ '^[0-9b-hjkmnp-z]{6}$' then
    raise exception 'Celda inválida: debe ser un geohash de 6 caracteres';
  end if;
  new.centro_celda := st_setsrid(st_pointfromgeohash(new.celda), 4326)::geography;
  return new;
end $$;

create trigger dispositivos_celda before insert or update of celda on dispositivos
  for each row execute function fijar_centro_celda();
create trigger zonas_celda before insert or update of celda on zonas_usuario
  for each row execute function fijar_centro_celda();
create trigger telegram_celda before insert or update of celda on suscriptores_telegram
  for each row execute function fijar_centro_celda();

-- Máximo 3 zonas por persona (casa, escuela, trabajo)
create or replace function limitar_zonas() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from zonas_usuario where usuario_id = new.usuario_id) >= 3 then
    raise exception 'Puedes guardar como máximo 3 zonas';
  end if;
  return new;
end $$;

create trigger zonas_limite before insert on zonas_usuario
  for each row execute function limitar_zonas();

-- Cada usuario nuevo (incluso anónimo) recibe su perfil de 'ciudadano'
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function crear_perfil();

-- Comprobación rápida (debe coincidir con la app y con las Edge Functions):
--   select st_geohash(st_setsrid(st_makepoint(-102.1942, 17.9581), 4326), 6);   -- 9epq4t
