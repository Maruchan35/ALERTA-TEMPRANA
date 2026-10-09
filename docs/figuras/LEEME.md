# Figuras para la documentación

| Archivo | Pie de figura (listo para pegar) | Origen |
|---|---|---|
| `fig1-portal.png` | **Figura 1.** Interfaz principal de ALERTA CERCA (portal web en React y TypeScript). | Captura del portal (perímetro seguro, sin alertas activas en el momento de la captura). |
| `fig2-mapa-leaflet.png` | **Figura 2.** Mapa de alertas con Leaflet y OpenStreetMap (vista Mapa Radar). | Captura del portal. |
| `fig3-base-datos.png` | **Figura 3.** Base de datos con Supabase y PostgreSQL (PostGIS): tablas principales y llaves foráneas. | Diagrama generado a partir de `supabase/migrations`. No es una captura del panel de Supabase. |
| `fig4-github.png` | **Figura 4.** Repositorio y control de versiones con GitHub. | Captura de la página pública del repositorio. |
| `fig5-app-movil.png` | **Figura 5.** Interfaz móvil de ALERTA CERCA (app en Flutter, con módulos nativos en Kotlin para Android). | Captura de la app en modo demostración, a 390 × 844. |
| `fig6-notificaciones-cap.png` | **Figura 6.** Notificaciones, verificación por WhatsApp y alertas CAP 1.2. | Texto y XML generados con el código del servidor. Datos de ejemplo. |

## Notas

- La figura 5 original decía "Kotlin, Jetpack Compose y Flutter". El proyecto **no usa Jetpack Compose**: la interfaz es Flutter y solo hay código nativo en Kotlin para el servicio de Android.
- La figura 6 original decía "WhatsApp Business". El servidor puede enviar el código en modo simulado, por el puente de WhatsApp o por la API oficial de Meta (WhatsApp Business), según la configuración. Por eso el pie dice "WhatsApp" sin especificar.
- No usé las capturas de Supabase ni la de la verificación del teléfono que mandaste: muestran datos de tu cuenta y de tu proyecto.

## Cómo regenerarlas

- `src/captura.mjs`: toma las capturas con Microsoft Edge abierto con `--remote-debugging-port=9333`.
- `src/fig3-base-datos.html` y `src/fig6-notificaciones-cap.html`: diagramas en HTML (se capturan con `captura.mjs`).
- `src/generar.ts`: produce el texto de la notificación y el XML CAP con el código de `supabase/functions/_compartido` (`deno run --no-check -A generar.ts`).
