-- =============================================================================
-- ALERTA CERCA · preparar la demo (paso 5.3 y Anexo C)
-- Ejecutar en el SQL Editor justo antes de presentar. Al terminar: terminar_demo.sql
-- =============================================================================

-- 1) Expirar las alertas de prueba que hayan quedado abiertas
update alertas set estado = 'expirada', cerrada_en = now()
where estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada');

-- 2) Dos o tres alertas "de fondo" verificadas para que el mapa no se vea vacío.
--    Se crean con radio fijo (radio_manual_m) para que no crezcan ni avisen durante la demo.
--    OJO: al insertarlas se envían a los teléfonos cercanos. Hazlo ANTES de acomodar los teléfonos.
insert into alertas (categoria, titulo, descripcion, referencia, lat, lon, estado, creada_por,
                     verificada_por, publicada_en, verificada_en, expira_en, radio_manual_m)
select v.categoria::categoria_alerta, v.titulo, v.descripcion, v.referencia, v.lat, v.lon, 'verificada',
       val.id, val.id, now() - interval '25 minutes', now() - interval '22 minutes',
       now() + interval '3 hours', v.radio
from (values
  ('accidente', 'Choque entre dos autos en Av. Lázaro Cárdenas', 'Hay tránsito lento en ambos sentidos.',
   'Frente a la gasolinera', 17.9662, -102.2003, 1000),
  ('robo_vehiculo', 'Nissan Versa gris, placas DEMO-123', 'Datos ficticios para la demostración.',
   'Se dirigía hacia la autopista Siglo XXI', 17.9720, -102.2150, 3000)
) as v(categoria, titulo, descripcion, referencia, lat, lon, radio)
cross join lateral (select p.id from perfiles p where p.rol in ('validador', 'institucion', 'admin') limit 1) val;

-- 3) Modo demo: 1 minuto real = 30 minutos (el escalón de 15 min llega en 30 s)
update config set factor_tiempo = 30;

-- 4) Revisión rápida (Anexo C)
select (select factor_tiempo from config)                                      as factor_tiempo,
       (select count(*) from dispositivos where activo)                         as telefonos_activos,
       (select count(*) from perfiles where rol in ('validador', 'institucion')) as validadores,
       (select count(*) from cron.job)                                          as tareas_cron,
       (select max(start_time) from cron.job_run_details)                       as ultima_ejecucion_cron;
