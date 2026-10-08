-- =============================================================================
-- ALERTA CERCA · 006_tareas.sql
-- Tareas periódicas con pg_cron (pasos 3.1, 3.4 y 4.3). La hora de pg_cron es UTC:
-- las 4:00 UTC son las 22:00 en Lázaro Cárdenas (UTC-6).
--
-- cron.schedule() con un nombre existente actualiza la tarea: este archivo se puede
-- volver a ejecutar sin duplicar nada.
-- =============================================================================

-- En Supabase, PostGIS vive en el esquema `extensions`: la sesión de la migración debe verlo.
set search_path = public, extensions;

-- Radio dinámico: cada 15 segundos, ¿alguna alerta ya puede llegar más lejos?
select cron.schedule('ampliar-radios', '15 seconds', 'select public.ampliar_radios()');

-- Expiración: cada minuto, las alertas vencidas salen del mapa
select cron.schedule('expirar-alertas', '* * * * *', 'select public.expirar_alertas()');

-- Retención: entregas a 30 días, dispositivos inactivos a 60, anonimizar a 90
select cron.schedule('limpieza-diaria', '0 4 * * *', 'select public.limpieza_diaria()');

-- Fotos: se borran con la API de Storage desde la Edge Function `mantenimiento`
select cron.schedule('mantenimiento-fotos', '30 4 * * *',
                     $$select public.llamar_funcion('mantenimiento', '{}'::jsonb)$$);

-- Para la demo (¡regresarlo a 1 al terminar!):
--   update config set factor_tiempo = 30;   -- 1 minuto real = 30 minutos
--
-- ¿Están corriendo?
--   select j.jobname, d.status, d.start_time, d.return_message
--   from cron.job_run_details d join cron.job j using (jobid)
--   order by d.start_time desc limit 10;
