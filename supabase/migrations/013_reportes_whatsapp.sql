-- ════════════════════════════════════════════════════════════════════════════
-- ALERTA CERCA · 013 · Reportar por WhatsApp (asistente guiado para adultos mayores)
-- ════════════════════════════════════════════════════════════════════════════
-- El puente de WhatsApp (puente-whatsapp/) recibe los mensajes de quien escribe y los entrega a
-- whatsapp_recibido(), que lleva la conversación paso a paso (menú con números, ubicación con el
-- clip, una frase opcional, confirmar) y deja la respuesta en la cola de salida del puente.
-- Al confirmar, reportar_por_whatsapp() crea la alerta con las mismas reglas que la app
-- (categorías, duplicados, personas desaparecidas a revisión), así que aparece en la app, el mapa,
-- el portal y las notificaciones igual que cualquier otro reporte.
--
-- Privacidad: la alerta NO guarda el número de quien reporta. El número solo vive en privado.* y se
-- borra a las 24 h (la conversación, los mensajes entrantes y el registro de reportes del límite).
-- ════════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- 1. Límites (ajustables desde config, como reportes_por_hora)
alter table config
  add column if not exists reportes_whatsapp_por_hora int not null default 3
    check (reportes_whatsapp_por_hora between 1 and 20),
  add column if not exists mensajes_whatsapp_por_hora int not null default 30
    check (mensajes_whatsapp_por_hora between 5 and 500);

-- 2. ¿De dónde vino la alerta? (la app la muestra igual; los validadores lo ven)
alter table alertas
  add column if not exists origen text not null default 'app' check (origen in ('app', 'whatsapp'));

-- 3. Datos privados del asistente (no son públicos; se borran a las 24 h)
create table if not exists privado.conversaciones_whatsapp (
  telefono       text primary key check (telefono ~ '^[0-9]{8,15}$'),
  paso           text not null default 'inicio'
                   check (paso in ('inicio', 'categoria', 'lugar', 'descripcion', 'confirmar')),
  categoria      categoria_alerta,
  lat            double precision,   -- el lugar del SUCESO que reporta, no la ubicación de la persona
  lon            double precision,
  lugar_texto    text check (char_length(lugar_texto) <= 200),
  descripcion    text check (char_length(descripcion) <= 280),
  actualizado_en timestamptz not null default now()
);

create table if not exists privado.mensajes_entrantes_whatsapp (
  id          bigint generated always as identity primary key,
  telefono    text not null check (telefono ~ '^[0-9]{8,15}$'),
  recibido_en timestamptz not null default now()
);
create index if not exists mensajes_entrantes_whatsapp_idx
  on privado.mensajes_entrantes_whatsapp (telefono, recibido_en);

create table if not exists privado.reportes_whatsapp (
  telefono  text not null check (telefono ~ '^[0-9]{8,15}$'),
  alerta_id uuid not null references alertas on delete cascade,
  creado_en timestamptz not null default now()
);
create index if not exists reportes_whatsapp_idx on privado.reportes_whatsapp (telefono, creado_en);

alter table privado.conversaciones_whatsapp     enable row level security;
alter table privado.mensajes_entrantes_whatsapp enable row level security;
alter table privado.reportes_whatsapp           enable row level security;
revoke all on privado.conversaciones_whatsapp, privado.mensajes_entrantes_whatsapp,
              privado.reportes_whatsapp from public, anon, authenticated;

-- 4. Textos del asistente (en un solo lugar: fáciles de revisar y de cambiar)
create or replace function bot_menu() returns text
language sql immutable set search_path = public as $$
  select E'Elija el número de lo que pasó:\n1 Robo de vehículo\n2 Asalto o situación de riesgo\n3 Incendio\n4 Accidente\n5 Inundación\n6 Persona desaparecida\n7 Otra situación';
$$;

create or replace function bot_texto(p_clave text, p_1 text default null, p_2 text default null,
                                     p_3 text default null)
returns text language plpgsql immutable set search_path = public as $$
declare t text;
begin
  t := case p_clave
    when 'menu' then bot_menu()
    when 'bienvenida' then 'Hola 👋 Soy el asistente de ALERTA CERCA.'
      || E'\n\n🚨 Si hay peligro AHORA, llame al 911.\n\n' || bot_menu()
      || E'\n\nSu número no se muestra a nadie. Para volver a empezar, escriba MENU.'
    when 'multimedia' then 'Por ahora solo puedo leer textos y ubicaciones. Todavía no recibo fotos ni audios.'
    when 'ubicacion' then 'Ubicación recibida ✅.'
    when 'lugar' then E'Anotado: {1}.\n\n¿Dónde pasó?\n📎 Toque el clip y mande su ubicación (elija «Ubicación»).\n✍️ O escriba la calle y la colonia.'
    when 'lugar_anotado' then 'Anotado: {1}.'
    when 'lugar_aproximado' then 'Anoté el lugar: {1}. Como no tengo su ubicación exacta, el reporte quedará marcado como aproximado.'
    when 'descripcion' then 'Si quiere, escriba en una frase qué pasó. Si no quiere escribir nada, escriba 0.'
    when 'resumen' then E'Revise su reporte:\n\nTipo: {1}\nLugar: {2}\nDetalle: {3}\n\n1 Enviar ✅\n2 Empezar de nuevo'
    when 'creada' then E'Listo ✅ Su reporte quedó registrado con el folio {1}.\nYa aparece en la app y en el portal de ALERTA CERCA, y las personas cercanas lo verán.\n\nSi hay peligro, llame al 911.'
    when 'duplicada' then E'Ya hay un reporte igual cerca de ese lugar, hace poco. Gracias: ya quedó registrado.\n\nSi hay peligro, llame al 911.'
    when 'limite' then 'Ya envió {1} reportes en la última hora. Si hay peligro, llame al 911 ahora mismo. Podrá reportar de nuevo más tarde.'
    when 'error_categoria' then E'Escriba solo el número de la opción (del 1 al 7).\nPara ver las opciones otra vez, escriba MENU.'
    when 'error_lugar' then 'Mande su ubicación con el clip 📎 o escriba la calle y la colonia.'
    when 'error_descripcion' then 'Escriba una frase sobre lo que pasó, o escriba 0 si no quiere escribir nada.'
    when 'error_confirmar' then 'Escriba 1 para enviar o 2 para empezar de nuevo.'
    else 'Escriba MENU para empezar.'
  end;
  return replace(replace(replace(t, '{1}', coalesce(p_1, '')), '{2}', coalesce(p_2, '')), '{3}', coalesce(p_3, ''));
end $$;

-- Número del menú → categoría (solo las que una persona puede reportar sin institución)
create or replace function bot_categoria(p_numero int) returns categoria_alerta
language sql immutable set search_path = public as $$
  select case p_numero
    when 1 then 'robo_vehiculo'::categoria_alerta
    when 2 then 'asalto'::categoria_alerta
    when 3 then 'incendio'::categoria_alerta
    when 4 then 'accidente'::categoria_alerta
    when 5 then 'inundacion'::categoria_alerta
    when 6 then 'persona_desaparecida'::categoria_alerta
    else 'otro'::categoria_alerta
  end;
$$;

-- Lo que se le muestra a la persona según el paso en el que va
create or replace function bot_paso(p privado.conversaciones_whatsapp) returns text
language plpgsql stable set search_path = public, privado as $$
declare v_nombre text;
begin
  if p.paso = 'categoria' then return bot_texto('menu'); end if;
  if p.paso = 'lugar' then
    select nombre into v_nombre from categorias where clave = p.categoria;
    return bot_texto('lugar', v_nombre);
  end if;
  if p.paso = 'descripcion' then return bot_texto('descripcion'); end if;
  if p.paso = 'confirmar' then
    select nombre into v_nombre from categorias where clave = p.categoria;
    return bot_texto('resumen', v_nombre,
      coalesce(p.lugar_texto, case when p.lat is not null then 'ubicación enviada' else 'sin lugar' end),
      coalesce(p.descripcion, 'sin detalle'));
  end if;
  return bot_texto('bienvenida');
end $$;

-- 5. Crear el reporte: las mismas reglas que la app, sin usuario (el número no se guarda en la alerta)
create or replace function reportar_por_whatsapp(p_telefono text, p_categoria categoria_alerta,
  p_lat double precision, p_lon double precision, p_lugar text, p_descripcion text)
returns jsonb language plpgsql security definer set search_path = public, privado, extensions as $$
declare
  v_cat    categorias;
  v_dup    alertas;
  v_limite int;
  v_estado estado_alerta;
  v_id     uuid;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Ubicación inválida';
  end if;
  select * into v_cat from categorias where clave = p_categoria;
  if not found or v_cat.solo_institucion then
    raise exception 'Esta categoría no se puede reportar por WhatsApp';
  end if;

  -- Igual que en la app: un reporte igual cerca y reciente no crea otro (se considera el mismo)
  select * into v_dup from alertas
   where categoria = p_categoria
     and estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada')
     and creada_en > now() - interval '30 minutes'
     and st_dwithin(ubicacion, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, 500)
   order by creada_en desc limit 1;
  if found then
    return jsonb_build_object('resultado', 'duplicada', 'alerta_id', v_dup.id);
  end if;

  -- Límite por número (config.reportes_whatsapp_por_hora)
  select reportes_whatsapp_por_hora into v_limite from config where id = 1;
  if (select count(*) from privado.reportes_whatsapp
      where telefono = p_telefono and creado_en > now() - interval '1 hour') >= v_limite then
    return jsonb_build_object('resultado', 'limite', 'limite', v_limite);
  end if;

  -- Personas desaparecidas y menores: a revisión; el resto entra como "no confirmada" (como en la app)
  v_estado := case when v_cat.requiere_validacion then 'pendiente' else 'no_confirmada' end;
  insert into alertas (categoria, titulo, descripcion, referencia, lat, lon, estado, origen,
                       creada_por, expira_en, publicada_en)
  values (p_categoria,
          left(v_cat.nombre || ': ' || coalesce(nullif(btrim(p_lugar), ''), 'lugar en el mapa'), 80),
          nullif(btrim(p_descripcion), ''), nullif(btrim(p_lugar), ''), p_lat, p_lon, v_estado, 'whatsapp',
          null, now() + v_cat.vigencia, case when v_estado <> 'pendiente' then now() end)
  returning id into v_id;

  insert into privado.reportes_whatsapp (telefono, alerta_id) values (p_telefono, v_id);
  insert into bitacora (alerta_id, usuario_id, accion, detalle)
  values (v_id, null, 'reportar_whatsapp', jsonb_build_object('estado', v_estado, 'categoria', p_categoria));
  return jsonb_build_object('resultado', 'creada', 'alerta_id', v_id, 'estado', v_estado);
end $$;

-- 6. El puente entrega cada mensaje de una persona; el servidor decide la respuesta.
--    p_texto = '[multimedia]' si mandó una foto o un audio. p_lat/p_lon si mandó su ubicación.
create or replace function whatsapp_recibido(p_secreto text, p_telefono text, p_texto text default null,
  p_lat double precision default null, p_lon double precision default null)
returns jsonb language plpgsql security definer set search_path = public, privado, extensions as $$
declare
  c            privado.conversaciones_whatsapp;
  v_t          text := left(btrim(coalesce(p_texto, '')), 500);
  v_n          text := lower(translate(btrim(coalesce(p_texto, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_ubic       boolean := coalesce(p_lat between -90 and 90 and p_lon between -180 and 180, false);
  v_multi      boolean := coalesce(p_texto, '') = '[multimedia]';
  v_reinicio   boolean := v_n in ('menu', 'inicio', 'empezar', 'reiniciar', 'nuevo', 'hola', 'buenas', 'ayuda');
  v_limite     int;
  v_resp       text;
  v_res        jsonb;
  v_borrar     boolean := false;
  v_centro_lat constant double precision := 17.9581;   -- centro de Lázaro Cárdenas (Config.latInicial)
  v_centro_lon constant double precision := -102.1942;
begin
  if not secreto_puente_valido(p_secreto) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if coalesce(p_telefono, '') !~ '^[0-9]{8,15}$' then raise exception 'Teléfono inválido'; end if;

  -- Anti-spam: quien escribe demasiado en una hora deja de recibir respuestas (en silencio)
  select mensajes_whatsapp_por_hora into v_limite from config where id = 1;
  if (select count(*) from privado.mensajes_entrantes_whatsapp
      where telefono = p_telefono and recibido_en > now() - interval '1 hour') >= v_limite then
    return jsonb_build_object('ignorado', true);
  end if;
  insert into privado.mensajes_entrantes_whatsapp (telefono) values (p_telefono);

  insert into privado.conversaciones_whatsapp (telefono) values (p_telefono) on conflict (telefono) do nothing;
  select * into c from privado.conversaciones_whatsapp where telefono = p_telefono for update;
  -- Si pasaron más de 2 horas sin escribir, la conversación empieza de nuevo
  if c.actualizado_en < now() - interval '2 hours' then
    c.paso := 'inicio';
  end if;

  if c.paso = 'inicio' or v_reinicio then
    c.paso := 'categoria';
    c.categoria := null; c.lat := null; c.lon := null; c.lugar_texto := null; c.descripcion := null;
    v_resp := bot_texto('bienvenida');
    if v_ubic then
      c.lat := p_lat; c.lon := p_lon;
      v_resp := v_resp || E'\n\n' || bot_texto('ubicacion');
    end if;
  elsif v_multi then
    v_resp := bot_texto('multimedia') || E'\n\n' || bot_paso(c);
  elsif v_ubic then
    c.lat := p_lat; c.lon := p_lon;
    if c.paso = 'lugar' then c.paso := 'descripcion'; end if;
    v_resp := bot_texto('ubicacion') || E'\n\n' || bot_paso(c);
  elsif c.paso = 'categoria' then
    if v_n ~ '^[1-7]$' then
      c.categoria := bot_categoria(v_n::int);
      c.paso := 'lugar';
      v_resp := bot_paso(c);
    else
      v_resp := bot_texto('error_categoria');
    end if;
  elsif c.paso = 'lugar' then
    if v_t <> '' then
      c.lugar_texto := left(v_t, 200);
      if c.lat is null then
        -- Sin ubicación exacta: se marca en el centro y se dice que es aproximado
        c.lat := v_centro_lat; c.lon := v_centro_lon;
        v_resp := bot_texto('lugar_aproximado', c.lugar_texto);
      else
        v_resp := bot_texto('lugar_anotado', c.lugar_texto);
      end if;
      c.paso := 'descripcion';
      v_resp := v_resp || E'\n\n' || bot_paso(c);
    else
      v_resp := bot_texto('error_lugar');
    end if;
  elsif c.paso = 'descripcion' then
    if v_n in ('0', 'omitir', 'no', 'nada') then
      c.paso := 'confirmar';
      v_resp := bot_paso(c);
    elsif v_t <> '' then
      c.descripcion := left(v_t, 280);
      c.paso := 'confirmar';
      v_resp := bot_paso(c);
    else
      v_resp := bot_texto('error_descripcion');
    end if;
  elsif c.paso = 'confirmar' then
    if v_n in ('1', 'si', 'enviar', 'mandar') then
      v_res := reportar_por_whatsapp(p_telefono, c.categoria, c.lat, c.lon, c.lugar_texto, c.descripcion);
      if v_res->>'resultado' = 'creada' then
        v_resp := bot_texto('creada', 'AC-' || upper(left(v_res->>'alerta_id', 8)));
      elsif v_res->>'resultado' = 'duplicada' then
        v_resp := bot_texto('duplicada');
      else
        v_resp := bot_texto('limite', v_res->>'limite');
      end if;
      v_borrar := true;   -- terminó la conversación: sus datos ya no hacen falta
    elsif v_n in ('2', 'no', 'cambiar') then
      c.paso := 'categoria';
      c.categoria := null; c.lat := null; c.lon := null; c.lugar_texto := null; c.descripcion := null;
      v_resp := bot_texto('menu');
    else
      v_resp := bot_texto('error_confirmar');
    end if;
  end if;

  if v_borrar then
    delete from privado.conversaciones_whatsapp where telefono = p_telefono;
  else
    update privado.conversaciones_whatsapp
       set paso = c.paso, categoria = c.categoria, lat = c.lat, lon = c.lon,
           lugar_texto = c.lugar_texto, descripcion = c.descripcion, actualizado_en = now()
     where telefono = p_telefono;
  end if;

  -- La respuesta sale por la misma cola que los códigos de verificación (el puente la envía)
  insert into privado.mensajes_whatsapp (telefono, texto, modo, estado)
  values (p_telefono, v_resp, 'puente', 'pendiente');

  return jsonb_build_object('respuesta', v_resp, 'paso', case when v_borrar then 'inicio' else c.paso end);
end $$;

-- 7. Permisos: lo llama el puente con su secreto (como las demás funciones del puente)
revoke execute on function reportar_por_whatsapp(text, categoria_alerta, double precision, double precision, text, text)
  from public, anon, authenticated;
revoke execute on function whatsapp_recibido(text, text, text, double precision, double precision) from public;
grant  execute on function whatsapp_recibido(text, text, text, double precision, double precision) to anon, authenticated;

-- 8. Limpieza diaria: también borra lo del asistente a las 24 h (copia de 011 con lo nuevo)
create or replace function limpieza_diaria() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from entregas          where enviada_en < now() - interval '30 days';
  delete from entregas_telegram where enviada_en < now() - interval '30 days';
  delete from privado.mensajes_whatsapp where enviado_en < now() - interval '1 day';
  -- Asistente de WhatsApp: su número y la conversación duran 1 día
  delete from privado.mensajes_entrantes_whatsapp where recibido_en < now() - interval '1 day';
  delete from privado.conversaciones_whatsapp where actualizado_en < now() - interval '1 day';
  delete from privado.reportes_whatsapp where creado_en < now() - interval '1 day';
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
