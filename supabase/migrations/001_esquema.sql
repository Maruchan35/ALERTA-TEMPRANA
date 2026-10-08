-- =============================================================================
-- ALERTA CERCA · 001_esquema.sql
-- Extensiones, tipos y tablas (pasos 1.1 y 1.2 de la propuesta).
--
-- Regla de privacidad: NINGUNA tabla guarda la latitud/longitud de personas.
-- De los teléfonos solo se conoce una celda geohash de 6 caracteres (~1.2 × 0.6 km).
-- La única ubicación exacta que se guarda es la del SUCESO (un lugar, no una persona).
-- =============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;   -- tareas periódicas
create extension if not exists pg_net with schema extensions;    -- HTTP desde SQL (crea el esquema net)

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

-- ─── Tipos ──────────────────────────────────────────────────────────────────
create type categoria_alerta as enum (
  'menor_desaparecido', 'persona_desaparecida', 'persona_vulnerable', 'robo_vehiculo',
  'asalto', 'incendio', 'inundacion', 'accidente', 'riesgo_ambiental', 'evacuacion',
  'fenomeno_natural', 'otro');

create type estado_alerta as enum (
  'pendiente', 'no_confirmada', 'corroborada', 'verificada', 'resuelta', 'descartada', 'expirada');

create type rol_usuario as enum ('ciudadano', 'validador', 'institucion', 'admin');

-- ─── Perfiles (uno por usuario de Auth, incluso anónimo) ────────────────────
create table perfiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text,
  rol         rol_usuario not null default 'ciudadano',
  institucion text,                                    -- p. ej. 'Protección Civil Municipal'
  reputacion  int not null default 0,                  -- +1 verificado, −2 descartado
  creado_en   timestamptz not null default now()
);

-- ─── Catálogo: categorías y escalones del radio dinámico ────────────────────
-- Todo vive en tablas, no en el código: el CCE o Protección Civil ajustan valores sin programar.
create table categorias (
  clave               categoria_alerta primary key,
  nombre              text not null,
  nombre_corto        text not null,                   -- para notificaciones: 'Menor desaparecido'
  nivel              smallint not null check (nivel between 1 and 4),
  requiere_validacion boolean not null default false,  -- personas y menores
  solo_institucion    boolean not null default false,  -- evacuación, fenómenos naturales
  radio_max_no_conf_m int not null default 1000,       -- tope mientras no esté confirmada
  vigencia            interval not null,
  categoria_cap       text not null,                   -- Rescue, Fire, Security... (CAP 1.2)
  instrucciones       text                             -- "qué hacer", se muestra en la alerta
);

create table escalones_radio (
  categoria categoria_alerta references categorias on delete cascade,
  minuto    int not null check (minuto >= 0),          -- minutos desde que se publicó
  radio_m   int not null check (radio_m > 0),
  primary key (categoria, minuto)
);

-- ─── Alertas ────────────────────────────────────────────────────────────────
create table alertas (
  id             uuid primary key default gen_random_uuid(),
  categoria      categoria_alerta not null references categorias,
  titulo         text not null check (char_length(titulo) between 5 and 80),
  descripcion    text check (char_length(descripcion) <= 1000),
  referencia     text check (char_length(referencia) <= 200),   -- "frente al mercado municipal"
  foto_path      text,                                 -- ruta en Storage (bucket privado 'fotos')
  folio_911      text check (char_length(folio_911) <= 40),     -- folio del 911 o de la denuncia
  consentimiento boolean not null default false,       -- consentimiento del tutor/familiar (personas)
  lat            double precision not null check (lat between -90 and 90),
  lon            double precision not null check (lon between -180 and 180),
  ubicacion      geography(Point, 4326),               -- la llena un trigger (002)
  estado         estado_alerta not null default 'pendiente',
  radio_actual_m int not null default 0,               -- hasta dónde ya se envió
  radio_manual_m int check (radio_manual_m between 100 and 100000),  -- si el validador fija uno
  creada_por     uuid references perfiles on delete set null,
  verificada_por uuid references perfiles on delete set null,
  creada_en      timestamptz not null default now(),
  publicada_en   timestamptz,                          -- arranca el reloj del radio dinámico
  verificada_en  timestamptz,
  cerrada_en     timestamptz,
  expira_en      timestamptz not null,
  motivo_cierre  text check (char_length(motivo_cierre) <= 300)
);
create index alertas_ubicacion_idx on alertas using gist (ubicacion);
create index alertas_estado_idx on alertas (estado);
create index alertas_autor_idx on alertas (creada_por, creada_en);     -- límite de reportes
create index alertas_categoria_idx on alertas (categoria, creada_en);  -- duplicados
create index alertas_expira_idx on alertas (expira_en)
  where estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada');

-- ─── Dispositivos: token FCM + celda de ~1 km (sin coordenadas, sin historial) ──
create table dispositivos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users on delete cascade,
  fcm_token      text not null unique,
  plataforma     text not null check (plataforma in ('android', 'ios', 'web')),
  celda          text not null check (celda ~ '^[0-9b-hjkmnp-z]{6}$'),  -- geohash de 6 caracteres
  centro_celda   geography(Point, 4326),                                -- la llena un trigger
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create index dispositivos_centro_idx on dispositivos using gist (centro_celda) where activo;
create index dispositivos_usuario_idx on dispositivos (usuario_id);

-- ─── Mis zonas (casa, escuela, trabajo): solo su celda; el punto exacto vive en el teléfono ──
create table zonas_usuario (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users on delete cascade,
  nombre       text not null check (char_length(nombre) between 1 and 40),
  celda        text not null check (celda ~ '^[0-9b-hjkmnp-z]{6}$'),
  centro_celda geography(Point, 4326),
  unique (usuario_id, nombre)
);
create index zonas_centro_idx on zonas_usuario using gist (centro_celda);

-- ─── Entregas: a quién se le envió cada alerta (evita duplicados; se borra a 30 días) ──
create table entregas (
  alerta_id      uuid references alertas on delete cascade,
  dispositivo_id uuid references dispositivos on delete cascade,
  radio_m        int not null,
  enviada_en     timestamptz not null default now(),
  primary key (alerta_id, dispositivo_id)
);
create index entregas_dispositivo_idx on entregas (dispositivo_id);
create index entregas_fecha_idx on entregas (enviada_en);

-- ─── Confirmaciones de vecinos ──────────────────────────────────────────────
create table confirmaciones (
  alerta_id  uuid references alertas on delete cascade,
  usuario_id uuid references auth.users on delete cascade,
  tipo       text not null check (tipo in ('confirmo', 'ya_no_esta', 'parece_falsa')),
  creada_en  timestamptz not null default now(),
  primary key (alerta_id, usuario_id)
);
create index confirmaciones_usuario_idx on confirmaciones (usuario_id);

-- ─── Canal alterno: Telegram ────────────────────────────────────────────────
create table suscriptores_telegram (
  chat_id      bigint primary key,
  celda        text not null check (celda ~ '^[0-9b-hjkmnp-z]{6}$'),
  centro_celda geography(Point, 4326),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);
create index telegram_centro_idx on suscriptores_telegram using gist (centro_celda) where activo;

create table entregas_telegram (
  alerta_id  uuid references alertas on delete cascade,
  chat_id    bigint references suscriptores_telegram on delete cascade,
  enviada_en timestamptz not null default now(),
  primary key (alerta_id, chat_id)
);
create index entregas_telegram_fecha_idx on entregas_telegram (enviada_en);

-- ─── Bitácora: quién verificó, descartó, ajustó o cerró cada alerta ─────────
create table bitacora (
  id         bigint generated always as identity primary key,
  alerta_id  uuid references alertas on delete cascade,
  usuario_id uuid,                                     -- null = acción automática del sistema
  accion     text not null,
  detalle    jsonb,
  creada_en  timestamptz not null default now()
);
create index bitacora_alerta_idx on bitacora (alerta_id, creada_en);

-- ─── Configuración (una sola fila) ──────────────────────────────────────────
create table config (
  id            int primary key default 1 check (id = 1),
  factor_tiempo numeric not null default 1 check (factor_tiempo > 0)  -- demo: 30 (1 min real = 30 min)
);
insert into config default values;
