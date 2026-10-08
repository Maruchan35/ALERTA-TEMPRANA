-- =============================================================================
-- ALERTA CERCA · 003_seguridad.sql
-- RLS, fotos y tiempo real (paso 1.5).
--
-- Regla de oro: la app NUNCA escribe directamente en `alertas`; solo llama funciones
-- del servidor (crear_reporte, confirmar_alerta, validar_alerta) que validan todo.
-- =============================================================================

-- ¿Quien hace la petición es validador, institución o admin?
create or replace function es_validador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles
                 where id = auth.uid() and rol in ('validador', 'institucion', 'admin'));
$$;

-- ¿La sesión es anónima? (para recibir alertas no se pide cuenta; para reportar, sí)
create or replace function es_anonimo() returns boolean
language sql stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

alter table perfiles              enable row level security;
alter table categorias            enable row level security;
alter table escalones_radio       enable row level security;
alter table alertas               enable row level security;
alter table dispositivos          enable row level security;
alter table zonas_usuario         enable row level security;
alter table entregas              enable row level security;
alter table entregas_telegram     enable row level security;   -- sin políticas: solo el servidor
alter table confirmaciones        enable row level security;
alter table suscriptores_telegram enable row level security;   -- sin políticas: solo el servidor
alter table bitacora              enable row level security;
alter table config                enable row level security;   -- sin políticas: solo el servidor

create policy "catalogo publico"     on categorias      for select using (true);
create policy "escalones publicos"   on escalones_radio for select using (true);
create policy "mi perfil"            on perfiles        for select using (id = auth.uid() or es_validador());

-- Las alertas en revisión solo las ven su autor y los validadores
create policy "alertas visibles"     on alertas         for select using (
  estado in ('no_confirmada', 'corroborada', 'verificada', 'resuelta')
  or creada_por = auth.uid() or es_validador());
-- alertas no tiene políticas de insert/update/delete: solo se modifica con las funciones del servidor

create policy "mis dispositivos"     on dispositivos    for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "mis zonas"            on zonas_usuario   for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Mejora sobre la propuesta: quién confirmó qué NO es público. Cada quien ve sus votos;
-- los validadores ven todos. Los conteos se exponen con alertas_cercanas()/obtener_alerta().
create policy "mis confirmaciones"   on confirmaciones  for select using (usuario_id = auth.uid() or es_validador());
create policy "entregas validadores" on entregas        for select using (es_validador());
create policy "bitacora validadores" on bitacora        for select using (es_validador());

-- ─── Fotos: bucket privado 'fotos' (máx. 5 MB, solo imágenes) ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Subir: solo cuentas verificadas (no anónimas) y solo a su propia carpeta (su id de usuario)
create policy "subir mis fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and (storage.foldername(name))[1] = auth.uid()::text
              and not public.es_anonimo());

-- Ver: mejora sobre la propuesta. Antes cualquier sesión podía listar TODAS las fotos,
-- incluidas las de reportes en revisión. Ahora solo: las mías, las de alertas activas
-- (al resolverse la foto deja de mostrarse) y todas para los validadores.
create policy "ver fotos" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.es_validador()
    or exists (select 1 from public.alertas a
               where a.foto_path = objects.name
                 and a.estado in ('no_confirmada', 'corroborada', 'verificada'))));

-- ─── Tiempo real: el panel se actualiza solo cuando cambia una alerta (respeta RLS) ──
alter publication supabase_realtime add table alertas;
