-- ════════════════════════════════════════════════════════════════════════════
-- ALERTA CERCA · 012 · Huella SHA-256 de la evidencia del SOS
-- ════════════════════════════════════════════════════════════════════════════
-- El teléfono guarda una COPIA de cada fragmento (video o audio) en el propio teléfono
-- (Descargas/ALERTA CERCA/SOS <fecha hora>/) para que la persona la presente en una denuncia:
-- el servidor borra la suya 30 días después del cierre. Antes de subir cada fragmento calcula su
-- huella SHA-256 y aquí queda registrada, con la hora del servidor. Así se puede comprobar que la
-- copia del teléfono es idéntica a la que se grabó durante la emergencia (si alguien la recorta o
-- la edita, su huella cambia). La huella no es un dato personal: no revela nada del contenido.
-- ════════════════════════════════════════════════════════════════════════════

set search_path = public, extensions;

alter table emergencia_evidencias
  add column if not exists sha256 text check (sha256 ~ '^[0-9a-f]{64}$');

comment on column emergencia_evidencias.sha256 is
  'Huella SHA-256 (hex) que calculó el teléfono al grabar el fragmento; null en versiones anteriores de la app.';

-- Mismo contrato que en 011 más la huella (opcional: la app 1.2 no la manda). Se reemplaza la
-- función en lugar de sumar otra versión: con dos, rpc() no sabría a cuál llamar.
drop function if exists registrar_evidencia(uuid, text, text, int);

create function registrar_evidencia(p_emergencia uuid, p_tipo text, p_ruta text,
                                    p_duracion_s int default null, p_sha256 text default null)
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
  if p_sha256 is not null and p_sha256 !~* '^[0-9a-f]{64}$' then
    raise exception 'Huella SHA-256 inválida';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'evidencias' and name = p_ruta) then
    raise exception 'La evidencia no se ha subido';
  end if;
  -- Un reintento no duplica ni cambia la huella ya registrada
  insert into emergencia_evidencias (emergencia_id, tipo, ruta, duracion_s, sha256)
  values (p_emergencia, p_tipo, p_ruta, p_duracion_s, lower(p_sha256))
  on conflict (ruta) do nothing;
end $$;

revoke execute on function registrar_evidencia(uuid, text, text, int, text) from public, anon;
grant  execute on function registrar_evidencia(uuid, text, text, int, text) to authenticated;
