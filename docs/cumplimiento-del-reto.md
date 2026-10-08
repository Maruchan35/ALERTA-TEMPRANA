# Cómo cumple ALERTA CERCA cada punto del reto

Tabla para los jueces (sección 6 de la propuesta), con el lugar del código donde se implementa.

## Objetivos específicos

| # | Objetivo del reto | Cómo lo cumple | Dónde |
|---|---|---|---|
| 1 | Compatible con los principales sistemas operativos | Flutter: Android e iOS con el mismo código; panel web; Telegram en cualquier teléfono | `app/`, `panel/`, `supabase/functions/telegram-webhook` |
| 2 | Alertas vinculadas a una ubicación | Punto geográfico por GPS o pin en el mapa | Pantalla *Reportar* paso 2; `alertas.ubicacion` |
| 3 | Niveles y categorías | 12 categorías y 4 niveles configurables en tablas | `seed.sql`, `categorias` |
| 4 | Radios de 1, 3, 5, 10 o más km | Escalones por categoría y radio manual del validador (1, 3, 5, 10, 25 km) | `escalones_radio`; *Ajustar radio* |
| 5 | Radio dinámico | pg_cron cada 15 s + `radio_permitido()` + tabla `entregas` (anillos sin repetir) | `006_tareas.sql`, `ampliar_radios()` |
| 6 | Foto, descripción, ubicación, fecha, hora, características | Campos de la alerta; Storage privado; consentimiento del tutor; folio del 911 | `001_esquema.sql`, *Reportar* paso 3 |
| 7 | Nivel de confiabilidad | Estados en revisión / no confirmada / corroborada / verificada con insignias de color. **Colmena**: la comunidad publica y amplía las alertas (segundo testigo, 5 min sin revisión, 3 y 6 confirmaciones) sin depender de un administrador | `InsigniaEstado`, `estado_alerta`, `007_colmena.sql` |
| 8 | Distinguir verificadas de no confirmadas | Insignia, radio distinto (1 km vs. todos los escalones) y texto en la notificación | `radio_permitido()`, `procesarAlerta()` |
| 9 | Prevenir falsas, maliciosas, duplicadas o viejas | Teléfono verificado para reportar y confirmar, foto de personas solo cuando ya está confirmada, 10 reportes nuevos por hora (configurable), duplicados a 500 m/30 min, votos “parece falsa”, reputación y suspensión, vigencia y expiración, validación previa de personas, bitácora, compartir con contexto | `crear_reporte()`, `revisar_confirmaciones()`, `expirar_alertas()` |
| 10 | Cancelar o cerrar una alerta | Resolver o descartar (validador; el autor puede resolver la suya), con aviso a quienes la recibieron | `validar_alerta()`, `notificar` (cierre) |
| 11 | Privacidad y protección de datos | Celdas de ~1 km, RLS en todas las tablas, fotos sin metadatos y privadas, retención 30/60/90 días, aviso de privacidad, borrar mi cuenta | `003_seguridad.sql`, [aviso-de-privacidad.md](aviso-de-privacidad.md) |
| 12 | Escalar e integrarse con autoridades | Roles de validador e institución, feed CAP 1.2 / Atom, índices espaciales | `cap/`, `perfiles.rol` |
| 13 | Llegar a más dispositivos sin depender de un operador | Push por internet (FCM), Telegram, app web; análisis de canales (Cell Broadcast, SMS, WhatsApp) | Sección 5 de la propuesta; `notificar` |

## Restricciones (sección 13 del reto)

| Restricción | Cómo se cumple |
|---|---|
| Gratuidad para el usuario final | El usuario no paga nada; el prototipo corre en planes gratuitos |
| Independencia del operador | Todo viaja por internet; no se usan SMS para alertar |
| Compatibilidad | Android, iOS (mismo código), web y Telegram |
| Consentimiento | Cada permiso se explica antes de pedirlo; ubicación en segundo plano opcional |
| Uso responsable de la geolocalización | Celdas de ~1 km, sin historial, distancia calculada en el teléfono |
| Protección de datos personales | Aviso de privacidad, derechos ARCO (borrar mi cuenta), retención limitada |
| Seguridad de la información | RLS, funciones del servidor, HTTPS, secretos fuera del código (Vault y secretos de Supabase) |
| Validación de alertas | Estados, validadores, bitácora |
| Prevención de información falsa | Mecanismos del objetivo 9 |
| Cierre o cancelación | Estados resuelta, descartada y expirada |
| Escalabilidad | Índices espaciales; prueba de carga con 5,000 dispositivos (P19) |

**ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales de alertamiento**: es un mecanismo complementario de
información y prevención comunitaria, como pide el reto.
