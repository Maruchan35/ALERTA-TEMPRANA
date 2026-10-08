-- =============================================================================
-- ALERTA CERCA · prueba de carga con 5,000 teléfonos falsos (paso 5.2, prueba P19)
-- Anota el tiempo que reporta EXPLAIN ANALYZE: es un dato fuerte para la diapositiva de
-- escalabilidad. En las pruebas automáticas (supabase/pruebas) la consulta tarda ~2-3 ms.
-- =============================================================================

-- 1) 5,000 dispositivos falsos repartidos ~11 km alrededor de Lázaro Cárdenas
insert into dispositivos (usuario_id, fcm_token, plataforma, celda)
select (select id from auth.users limit 1), 'falso-' || g, 'android',
       st_geohash(st_setsrid(st_makepoint(-102.1942 + (random() - 0.5) * 0.2,
                                          17.9581  + (random() - 0.5) * 0.2), 4326), 6)
from generate_series(1, 5000) g;
analyze dispositivos;

-- 2) ¿Usa el índice espacial? Debe aparecer "Index Scan using dispositivos_centro_idx"
explain analyze
select d.id from alertas a, dispositivos d
where a.id = (select id from alertas order by creada_en desc limit 1)
  and d.activo and st_dwithin(d.centro_celda, a.ubicacion, 3700);

-- 3) ¡Limpiar ANTES de cualquier envío real! (si no, notificar intentará mandarles push)
delete from dispositivos where fcm_token like 'falso-%';
