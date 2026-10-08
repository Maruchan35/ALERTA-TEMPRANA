-- =============================================================================
-- Emulación mínima de Supabase para probar las migraciones sobre PostgreSQL + PostGIS
-- (PGlite). Reproduce: roles (anon, authenticated, service_role), privilegios por
-- defecto, auth.uid()/auth.jwt(), auth.users, storage (buckets, objects, foldername),
-- Vault, pg_net (net.http_post guarda la petición en net.solicitudes), pg_cron
-- (cron.schedule guarda la tarea en cron.job) y la publicación supabase_realtime.
-- Solo se usa en las pruebas; NUNCA se ejecuta en el proyecto real.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

grant usage on schema public, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ─── auth ───────────────────────────────────────────────────────────────────
create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  phone              text,
  is_anonymous       boolean not null default false,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         auth.jwt() ->> 'sub'), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ─── storage ────────────────────────────────────────────────────────────────
create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets,
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  metadata   jsonb
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;

-- ─── vault ──────────────────────────────────────────────────────────────────
create schema if not exists vault;
create table vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  secret      text,
  description text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret, description, created_at, updated_at from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null,
                                               new_description text default '') returns uuid
language sql as $$
  insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description)
  returning id
$$;

-- ─── pg_net ─────────────────────────────────────────────────────────────────
create schema if not exists net;
create table net.solicitudes (
  id      bigserial primary key,
  url     text,
  headers jsonb,
  body    jsonb,
  creada  timestamptz default clock_timestamp()
);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
                                         params jsonb default '{}'::jsonb,
                                         headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
                                         timeout_milliseconds int default 5000) returns bigint
language sql as $$
  insert into net.solicitudes (url, headers, body) values (url, headers, body) returning id
$$;

-- ─── pg_cron ────────────────────────────────────────────────────────────────
create schema if not exists cron;
create table cron.job (
  jobid    bigserial primary key,
  jobname  text unique,
  schedule text,
  command  text
);
create table cron.job_run_details (
  runid          bigserial primary key,
  jobid          bigint,
  status         text,
  start_time     timestamptz,
  return_message text
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

-- ─── Realtime ───────────────────────────────────────────────────────────────
create publication supabase_realtime;
