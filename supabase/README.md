# Backend ALERTA CERCA (Supabase)

Roles R1 (base de datos) y R2 (funciones y notificaciones). Despliegue: [docs/despliegue.md](../docs/despliegue.md).

| Archivo | Contenido |
|---|---|
| `migrations/001_esquema.sql` | Extensiones (PostGIS, pg_cron, pg_net), tipos y las 12 tablas. Ninguna guarda lat/lon de personas |
| `migrations/002_triggers.sql` | Punto geográfico de la alerta, centro de cada celda, perfil automático, máximo 3 zonas |
| `migrations/003_seguridad.sql` | RLS en todas las tablas, bucket privado de fotos con políticas, Realtime |
| `migrations/004_funciones.sql` | RPC de la app y el panel, radio dinámico, destinatarios, confirmaciones, validación, métricas, retención y permisos |
| `migrations/005_disparadores.sql` | `llamar_funcion()` con pg_net + Vault y los triggers que llaman a `notificar` |
| `migrations/006_tareas.sql` | pg_cron: ampliar radios (15 s), expirar (1 min), limpieza diaria, fotos |
| `migrations/007_colmena.sql` | Colmena: publicación sin validador (5 min o segundo testigo), tope de 10 km con 6 confirmaciones, foto de personas hasta confirmarse, teléfono verificado obligatorio, umbrales en `config` |
| `migrations/009_whatsapp.sql` | Verificación por WhatsApp: Auth Hook `enviar_codigo_whatsapp`, WhatsApp simulado (`whatsapp_simulado()`) y bandeja privada `privado.mensajes_whatsapp` (1 día) |
| `migrations/008_colmena_ajustes.sql` | Límite de reportes configurable (10 por hora; los duplicados no cuentan) y teléfonos registrados en las métricas del panel |
| `seed.sql` | Catálogo: 12 categorías, niveles, vigencias, instrucciones y escalones de radio (idempotente) |
| `functions/` | Edge Functions `notificar`, `telegram-webhook`, `cap`, `mantenimiento` y el código compartido con sus pruebas |
| `configurar_vault.sql` | Guarda en Vault la URL de las funciones y el secreto compartido |
| `demo/` | Cuentas de validadores, preparar y terminar la demo, prueba de carga |
| `pruebas/` | 41 pruebas automáticas sobre PostgreSQL 17 + PostGIS reales (PGlite), con Supabase emulado |

## Funciones que puede llamar la app (todas exigen sesión)

| Función | Para qué |
|---|---|
| `registrar_dispositivo(p_token, p_plataforma, p_celda)` | Token de push + celda de ~1 km (se sobrescribe: sin historial) |
| `alertas_cercanas(p_celda, p_radio_m)` | Alertas visibles alrededor de una celda, con conteos y el voto propio |
| `obtener_alerta(p_alerta)` | Una alerta (al tocar una notificación) |
| `crear_reporte(p_categoria, p_titulo, p_descripcion, p_referencia, p_lat, p_lon, p_foto_path, p_folio_911, p_consentimiento)` | Devuelve `{alerta_id, estado}` o `{duplicada_de}` |
| `confirmar_alerta(p_alerta, p_tipo)` | `confirmo`, `ya_no_esta` o `parece_falsa` |
| `validar_alerta(p_alerta, p_accion, p_motivo, p_radio_m)` | `verificar`, `descartar`, `resolver`, `ajustar_radio` |
| `borrar_mi_cuenta()` | Derecho de cancelación |

Las funciones internas (`dispositivos_objetivo`, `radio_permitido`, `telegram_objetivo`, `llamar_funcion`…) están
revocadas para `anon` y `authenticated`: nadie con la anon key puede descargar tokens (prueba P14).

```bash
cd pruebas && npm install && npm test
cd functions && deno task probar && deno task revisar
```
