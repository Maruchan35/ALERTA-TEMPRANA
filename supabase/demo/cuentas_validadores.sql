-- =============================================================================
-- ALERTA CERCA · dar el rol de validador (paso 1.8)
--
-- 1. En Supabase: Authentication → Users → Add user → "Create new user":
--      correo validador1@example.com, una contraseña, y "Auto Confirm User" activado.
--    Repite con validador2@example.com (u otros correos reales de las instituciones).
-- 2. Ejecuta esto en el SQL Editor (cambia correos, nombres e institución).
-- =============================================================================

update perfiles set rol = 'validador', nombre = 'Validador 1', institucion = 'Protección Civil (demo)'
where id = (select id from auth.users where email = 'validador1@example.com');

update perfiles set rol = 'validador', nombre = 'Validador 2', institucion = 'CCE Lázaro Cárdenas (demo)'
where id = (select id from auth.users where email = 'validador2@example.com');

-- Si al crearlas no marcaste "Auto Confirm User", confírmalas aquí (si no, no pueden entrar):
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
where email in ('validador1@example.com', 'validador2@example.com');

-- Una institución emite alertas oficiales (salen VERIFICADAS) igual que un validador:
--   update perfiles set rol = 'institucion', institucion = 'Protección Civil Municipal'
--   where id = (select id from auth.users where email = 'proteccion.civil@example.com');

select u.email, p.rol, p.nombre, p.institucion
from perfiles p join auth.users u on u.id = p.id
where p.rol <> 'ciudadano';
