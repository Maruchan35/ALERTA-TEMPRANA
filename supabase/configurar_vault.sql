-- =============================================================================
-- ALERTA CERCA · configurar_vault.sql
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, DESPUÉS de desplegar las funciones.
--
-- 1. Reemplaza TU_REF por el identificador de tu proyecto (está en la URL del panel:
--    https://supabase.com/dashboard/project/TU_REF).
-- 2. Reemplaza CAMBIA_ESTE_SECRETO por una cadena larga y aleatoria. Debe ser EXACTAMENTE
--    la misma que pusiste en el secreto SECRETO_FUNCIONES de las Edge Functions:
--      supabase secrets set SECRETO_FUNCIONES=...
--    (en PowerShell puedes generar una con:  [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
--
-- Este archivo NO se versiona con valores reales: no subas tus secretos a GitHub.
-- =============================================================================

select vault.create_secret('https://TU_REF.supabase.co/functions/v1', 'url_funciones',
                           'URL base de las Edge Functions de ALERTA CERCA');
select vault.create_secret('CAMBIA_ESTE_SECRETO', 'secreto_funciones',
                           'Secreto compartido con la variable SECRETO_FUNCIONES de las Edge Functions');

-- ¿Quedaron guardados? (no muestra el valor)
select name, description, created_at from vault.secrets order by created_at;

-- Para cambiarlos después:
--   select vault.update_secret((select id from vault.secrets where name = 'url_funciones'),
--                              'https://OTRO_REF.supabase.co/functions/v1');
--   select vault.update_secret((select id from vault.secrets where name = 'secreto_funciones'), 'NUEVO');
--
-- Prueba de punta a punta: crea una alerta de prueba y revisa qué respondió `notificar`:
--   select id, status_code, content::text from net._http_response order by created desc limit 5;
