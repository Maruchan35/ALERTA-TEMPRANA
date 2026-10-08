-- =============================================================================
-- ALERTA CERCA · seed.sql — catálogo de categorías y escalones del radio dinámico (paso 1.4)
--
-- Se aplica solo con `supabase db reset` (local) o con `supabase db push --include-seed`.
-- También se puede pegar en el SQL Editor. Es idempotente: se puede ejecutar varias veces
-- y actualiza los valores. Valores iniciales propuestos para la demo: deben revisarse con
-- el CCE y Protección Civil.
-- =============================================================================

insert into categorias (clave, nombre, nombre_corto, nivel, requiere_validacion, solo_institucion,
                        radio_max_no_conf_m, vigencia, categoria_cap, instrucciones) values
 ('menor_desaparecido', 'Menor desaparecido o posible sustracción', 'Menor desaparecido',
  4, true, false, 0, '72 hours', 'Rescue',
  'Si lo ves, no lo pierdas de vista y llama al 911 de inmediato. No intervengas por tu cuenta.'),
 ('persona_desaparecida', 'Persona desaparecida', 'Persona desaparecida',
  3, true, false, 0, '72 hours', 'Rescue',
  'Si la ves, llama al 911 e indica dónde y a qué hora. No difundas datos personales adicionales.'),
 ('persona_vulnerable', 'Adulto mayor o persona vulnerable extraviada', 'Persona vulnerable extraviada',
  3, true, false, 0, '48 hours', 'Rescue',
  'Si la ves, acércate con calma, procura que esté segura y llama al 911.'),
 ('robo_vehiculo', 'Robo de vehículo', 'Robo de vehículo',
  3, false, false, 1000, '24 hours', 'Security',
  'Si ves el vehículo, no lo sigas ni intervengas. Anota lugar, hora y dirección, y llama al 911.'),
 ('asalto', 'Asalto o situación de riesgo', 'Asalto o riesgo',
  3, false, false, 1000, '2 hours', 'Security',
  'Evita la zona. Si estás en peligro, ponte a salvo y llama al 911.'),
 ('incendio', 'Incendio', 'Incendio',
  3, false, false, 1000, '6 hours', 'Fire',
  'Aléjate del humo y no bloquees el paso a los bomberos. Si hay personas en riesgo, llama al 911.'),
 ('inundacion', 'Inundación', 'Inundación',
  3, false, false, 1000, '12 hours', 'Met',
  'No cruces calles inundadas a pie ni en vehículo. Busca zonas altas y sigue a Protección Civil.'),
 ('accidente', 'Accidente o emergencia', 'Accidente',
  2, false, false, 1000, '3 hours', 'Transport',
  'Evita la zona para no estorbar a los servicios de emergencia. Si hay heridos, llama al 911.'),
 ('riesgo_ambiental', 'Riesgo ambiental', 'Riesgo ambiental',
  2, false, false, 1000, '24 hours', 'Env',
  'Si hay humo o gases, cierra puertas y ventanas y sigue las indicaciones de Protección Civil.'),
 ('evacuacion', 'Evacuación', 'Evacuación',
  4, false, true, 0, '12 hours', 'Safety',
  'Sigue las rutas de evacuación y las indicaciones de las autoridades. No regreses hasta que lo indiquen.'),
 ('fenomeno_natural', 'Fenómeno natural', 'Fenómeno natural',
  4, false, true, 0, '24 hours', 'Geo',
  'Mantén la calma, sigue a Protección Civil y ten a la mano tu mochila de emergencia.'),
 ('otro', 'Otra situación de riesgo', 'Situación de riesgo',
  1, false, false, 1000, '6 hours', 'Other',
  'Mantente atento y evita riesgos innecesarios. En una emergencia, llama al 911.')
on conflict (clave) do update set
  nombre = excluded.nombre, nombre_corto = excluded.nombre_corto, nivel = excluded.nivel,
  requiere_validacion = excluded.requiere_validacion, solo_institucion = excluded.solo_institucion,
  radio_max_no_conf_m = excluded.radio_max_no_conf_m, vigencia = excluded.vigencia,
  categoria_cap = excluded.categoria_cap, instrucciones = excluded.instrucciones;

-- Escalones: minuto desde la publicación → radio. Se reemplazan completos.
delete from escalones_radio;
insert into escalones_radio (categoria, minuto, radio_m) values
 ('menor_desaparecido', 0, 1000), ('menor_desaparecido', 15, 3000),
 ('menor_desaparecido', 60, 10000), ('menor_desaparecido', 180, 25000),
 ('persona_desaparecida', 0, 1000), ('persona_desaparecida', 30, 3000), ('persona_desaparecida', 120, 10000),
 ('persona_vulnerable', 0, 1000), ('persona_vulnerable', 30, 3000), ('persona_vulnerable', 120, 10000),
 ('robo_vehiculo', 0, 3000), ('robo_vehiculo', 20, 10000), ('robo_vehiculo', 60, 25000),
 ('asalto', 0, 1000), ('asalto', 30, 2000),
 ('incendio', 0, 1000), ('incendio', 20, 3000),
 ('inundacion', 0, 2000), ('inundacion', 60, 5000),
 ('accidente', 0, 1000),
 ('riesgo_ambiental', 0, 3000), ('riesgo_ambiental', 60, 10000),
 ('evacuacion', 0, 2000),
 ('fenomeno_natural', 0, 10000),
 ('otro', 0, 1000);
