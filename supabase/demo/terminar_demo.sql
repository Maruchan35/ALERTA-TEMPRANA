-- =============================================================================
-- ALERTA CERCA · terminar la demo (Anexo C, "Al terminar")
-- =============================================================================

-- 1) ¡Regresar el tiempo a la normalidad!
update config set factor_tiempo = 1;

-- 2) Resolver las alertas abiertas de la demo (avisa "RESUELTA" a quienes la recibieron)
update alertas set estado = 'resuelta', cerrada_en = now(), motivo_cierre = 'Fin de la demostración'
where estado in ('pendiente', 'no_confirmada', 'corroborada', 'verificada');

-- 3) Nadie recibió una alerta dos veces: una fila por (alerta, dispositivo)
select alerta_id, count(*) as telefonos, max(radio_m) as radio_maximo
from entregas group by alerta_id order by max(enviada_en) desc limit 10;
