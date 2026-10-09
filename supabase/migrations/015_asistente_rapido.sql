-- ════════════════════════════════════════════════════════════════════════════
-- ALERTA CERCA · 015 · Asistente de WhatsApp: respuestas inmediatas y menos escrituras
-- ════════════════════════════════════════════════════════════════════════════
-- 1. whatsapp_recibido(..., p_inmediato): el puente ya tiene la respuesta en la mano cuando el
--    servidor la prepara, así que la envía de inmediato en vez de esperar a la cola (que se revisa
--    cada 2 s). Con p_inmediato la respuesta nace "enviando" (reclamada por quien la pidió) y se
--    devuelve completa (id, texto y encuesta). Si el puente se cae antes de enviarla, la cola la
--    reintenta al minuto, igual que cualquier mensaje "enviando". Sin p_inmediato (puente anterior)
--    todo sigue como antes.
-- 2. whatsapp_pendientes: el latido del puente se escribe como máximo cada 10 s (antes, una
--    escritura cada 2 s: 43 mil al día solo para decir "sigo vivo").
-- 3. El paso del lugar explica el clip en tres pasos cortos.
-- ════════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

-- 1. El latido solo se escribe si ya pasaron 10 s (misma firma: se reemplaza)
create or replace function whatsapp_pendientes(p_secreto text, p_limite int default 5)
returns table (id bigint, telefono text, texto text, encuesta jsonb)
language plpgsql security definer set search_path = public, privado as $$
#variable_conflict use_column
begin
  if not secreto_puente_valido(p_secreto) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update privado.puente_whatsapp set latido_en = now()
   where puente_whatsapp.id = 1 and (latido_en is null or latido_en < now() - interval '10 seconds');
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
  returning m.id, m.telefono, m.texto, m.encuesta;
end $$;

-- 2. Texto del paso del lugar (lo demás, igual que en 014)
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
    when 'lugar' then E'Anotado: {1}.\n\n¿Dónde pasó? Mande el lugar así:\n1️⃣ Toque el clip 📎\n2️⃣ Elija «Ubicación»\n3️⃣ Toque «Enviar ubicación»\n\nSi no puede, escriba la calle y la colonia.'
    when 'lugar_anotado' then 'Anotado: {1}.'
    when 'lugar_aproximado' then 'Anoté el lugar: {1}. Como no tengo su ubicación exacta, el reporte quedará marcado como aproximado.'
    when 'descripcion' then 'Si quiere, escriba en una frase qué pasó. Si no quiere escribir nada, escriba 0.'
    when 'descripcion_escribir' then 'Escriba su frase en un mensaje. Si no quiere escribir nada, escriba 0.'
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

-- 3. El asistente con respuesta inmediata (se cambia la firma: se recrea y se vuelve a conceder)
drop function if exists whatsapp_recibido(text, text, text, double precision, double precision);
create function whatsapp_recibido(p_secreto text, p_telefono text, p_texto text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_inmediato boolean default false)
returns jsonb language plpgsql security definer set search_path = public, privado, extensions as $$
declare
  c            privado.conversaciones_whatsapp;
  v_t          text := left(btrim(coalesce(p_texto, '')), 500);
  v_n          text := lower(translate(btrim(coalesce(p_texto, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_ubic       boolean := coalesce(p_lat between -90 and 90 and p_lon between -180 and 180, false);
  v_multi      boolean := coalesce(p_texto, '') = '[multimedia]';
  v_voto       boolean := v_n ~ '^(categoria|descripcion|confirmar):';
  v_viejo      boolean := false;
  v_reinicio   boolean := v_n in ('menu', 'inicio', 'empezar', 'reiniciar', 'nuevo', 'hola', 'buenas', 'ayuda');
  v_limite     int;
  v_resp       text;
  v_res        jsonb;
  v_borrar     boolean := false;
  v_con_enc    boolean := true;   -- ¿la respuesta lleva la encuesta del paso actual?
  v_enc        jsonb;
  v_msg_id     bigint;
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

  -- Un toque en la encuesta llega como "paso:valor". Si la encuesta es de otro paso (llegó tarde),
  -- no cambia nada: se repite el paso actual.
  if v_voto then
    if split_part(v_n, ':', 1) = c.paso and c.paso <> 'inicio' then
      v_n := split_part(v_n, ':', 2);
      v_t := v_n;
    else
      v_viejo := true;
    end if;
  end if;

  if v_viejo then
    v_resp := bot_paso(c);
  elsif c.paso = 'inicio' or v_reinicio then
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
    if v_n = 'escribir' then
      v_resp := bot_texto('descripcion_escribir');
      v_con_enc := false;   -- ahora va a escribir: no hace falta la encuesta
    elsif v_n in ('0', 'omitir', 'no', 'nada') then
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

  v_enc := case when v_con_enc and not v_borrar then bot_encuesta(c.paso) end;

  -- La respuesta sale por la cola del puente. Con p_inmediato nace "enviando" (la envía quien la
  -- pidió, ahora mismo; si se cae, la cola la reintenta al minuto). Sin él, queda "pendiente".
  insert into privado.mensajes_whatsapp (telefono, texto, modo, estado, intentos, encuesta)
  values (p_telefono, v_resp, 'puente',
          case when p_inmediato then 'enviando' else 'pendiente' end,
          case when p_inmediato then 1 else 0 end, v_enc)
  returning id into v_msg_id;

  return jsonb_build_object('mensaje_id', v_msg_id, 'respuesta', v_resp, 'encuesta', v_enc,
                            'paso', case when v_borrar then 'inicio' else c.paso end);
end $$;

revoke execute on function whatsapp_recibido(text, text, text, double precision, double precision, boolean) from public;
grant  execute on function whatsapp_recibido(text, text, text, double precision, double precision, boolean) to anon, authenticated;
