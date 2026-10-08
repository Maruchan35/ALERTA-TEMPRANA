# ALERTA CERCA · Sistema Inteligente de Alertamiento Comunitario por Proximidad

> “Si algo importante está ocurriendo cerca de ti, deberías poder saberlo.”

Prototipo funcional (MVP) para el **HackaITLAC 2026 · Reto del Consejo Coordinador Empresarial de Lázaro Cárdenas**.
Implementa la propuesta de [`docs/Propuesta_ALERTA_CERCA.pdf`](docs/Propuesta_ALERTA_CERCA.pdf) para el reto de
[`docs/Reto_CCE_HackaITLAC_2026.pdf`](docs/Reto_CCE_HackaITLAC_2026.pdf).

Una alerta (menor desaparecido, incendio, robo de vehículo…) llega **primero a quienes están cerca** y su radio
**crece con el tiempo** (anillos 1 → 3 → 10 → 25 km). Privacidad por diseño: el servidor solo conoce una
**celda de ~1 km** de cada teléfono, nunca su ubicación exacta. ALERTA CERCA **no sustituye al 911**.

## Qué hay en el repositorio

| Carpeta | Qué es | Estado |
|---|---|---|
| [`supabase/`](supabase) | Backend: PostgreSQL + PostGIS, RLS, funciones (`crear_reporte`, `radio_permitido`, `dispositivos_objetivo`, `validar_alerta`…), colmena, pg_cron, Vault | **48 pruebas automáticas** (PGlite + PostGIS reales) |
| [`supabase/functions/`](supabase/functions) | Edge Functions: `notificar` (FCM + Telegram), `telegram-webhook`, `cap` (feed CAP 1.2/Atom), `mantenimiento` | **17 pruebas** Deno, tipos y lint |
| [`app/`](app) | App móvil Flutter (Android/iOS/web): mapa, detalle, reportar en 3 pasos, mis zonas, verificación por teléfono, push | Compila; analizada sin errores |
| [`panel/`](panel) | Panel de validadores (Flutter Web): métricas, mapa, cola, verificar/ajustar radio/descartar/resolver, bitácora, emitir alerta oficial, **simulador de 4 teléfonos** | Compila; analizado sin errores |
| [`compartido/`](compartido) | Paquete Dart común: modelos, geohash, catálogo, servicio Supabase y **motor de demostración** con las mismas reglas del backend | Pruebas unitarias |

## Documentación

| Documento | Para qué |
|---|---|
| [docs/despliegue.md](docs/despliegue.md) | Puesta en marcha paso a paso (Supabase, Firebase, funciones, Vault, validadores, Telegram, CAP) y problemas frecuentes |
| [docs/panel-web.md](docs/panel-web.md) | Conectar el panel web de administración (el incluido o uno propio con `supabase-js`): cuentas, datos, acciones y publicación |
| [docs/guion-demo.md](docs/guion-demo.md) | Pitch de 7 minutos, teléfonos A/B/C/D, preguntas difíciles y lista de verificación del día |
| [docs/arquitectura.md](docs/arquitectura.md) | Diagramas, flujo del reto en el código, estados de una alerta y qué datos se guardan |
| [docs/cumplimiento-del-reto.md](docs/cumplimiento-del-reto.md) | Cada objetivo y restricción del reto con su implementación |
| [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md) | P01–P19: prueba automática y manual de cada caso |
| [docs/aviso-de-privacidad.md](docs/aviso-de-privacidad.md) | Borrador del aviso de privacidad |

## Probarlo ya (sin cuentas ni backend)

Sin configuración, la app y el panel arrancan en **MODO DEMOSTRACIÓN** (todo en memoria; validador y vecinos simulados;
factor de tiempo 30). Requiere [Flutter](https://docs.flutter.dev) 3.47+.

```bash
cd panel && flutter run -d chrome     # panel: entra con los datos precargados → pestaña "Simulador"
cd app && flutter run -d chrome       # app: código de verificación de la demo = 123456
```

En el panel: abre “Por validar” → **Verificar** el menor → en “Simulador” el teléfono **A (300 m)** lo recibe al instante,
**B (2.6 km)** a los ~30 s, **C (6 km)** a los ~2 min y **D (Zihuatanejo)** nunca.
GitHub Actions compila un **APK de demostración** en cada push (Actions → “Pruebas” → artefacto `alerta-cerca-demo-apk`), y
el workflow “Publicar demo web” la sube a GitHub Pages (activar antes: Settings → Pages → Source: GitHub Actions).

## Despliegue real (paso a paso)

1. **Supabase** (plan Free): crea el proyecto; en *Authentication → Sign In / Providers* activa *Anonymous sign-ins*,
   *Email* y *Phone* (con números de prueba, p. ej. `525511111111 → 123456`).
2. **Base de datos** (con la CLI: `npx supabase login`, `npx supabase link --project-ref TU_REF`):
   ```bash
   npx supabase db push --include-seed
   ```
   (o pega en el SQL Editor, en orden, `supabase/migrations/001…006` y `supabase/seed.sql`).
3. **Edge Functions**: copia `supabase/functions/.env.ejemplo` a `.env`, llénalo (`SECRETO_FUNCIONES`,
   `FIREBASE_SERVICE_ACCOUNT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRETO`) y:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy --use-api
   ```
4. **Vault**: edita y ejecuta [`supabase/configurar_vault.sql`](supabase/configurar_vault.sql) en el SQL Editor (URL de las
   funciones + el mismo `SECRETO_FUNCIONES`). Así la base de datos llama a `notificar` sin guardar la service_role key.
5. **Validadores**: crea los usuarios (*Authentication → Add user*) y ejecuta
   [`supabase/demo/cuentas_validadores.sql`](supabase/demo/cuentas_validadores.sql).
6. **Firebase** (push): crea el proyecto, `cd app && flutterfire configure --platforms=android,ios`.
7. **App y panel**: copia `config.ejemplo.json` → `config.json` (URL y *publishable/anon key*, que son públicas) y
   ```bash
   flutter run --dart-define-from-file=config.json
   ```
8. **Telegram** (opcional): registra el webhook
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://TU_REF.supabase.co/functions/v1/telegram-webhook&secret_token=<TELEGRAM_SECRETO>`.
   **Feed CAP** para Protección Civil: `https://TU_REF.supabase.co/functions/v1/cap`.
9. **Día de la demo**: [`supabase/demo/preparar_demo.sql`](supabase/demo/preparar_demo.sql) (factor de tiempo 30) y al final
   [`terminar_demo.sql`](supabase/demo/terminar_demo.sql).

## Mejoras sobre la propuesta (detectadas al implementarla y cubiertas por pruebas)

- **Colmena** ([007_colmena.sql](supabase/migrations/007_colmena.sql)): la comunidad no depende de un administrador. Un
  reporte en revisión se publica solo si nadie lo revisa en 5 minutos (o al instante con un segundo testigo); 3
  confirmaciones lo llevan a 3 km y 6 a 10 km; la foto de una persona solo se muestra cuando ya está confirmada. Para
  reportar, confirmar o subir fotos hace falta un teléfono verificado.

- **Fotos**: cualquier sesión podía listar *todas* las fotos (incluidas las de reportes en revisión). Ahora solo el autor,
  los validadores y las alertas activas; al resolverse deja de mostrarse. Solo cuentas verificadas suben fotos y solo con
  ruta propia; las fotos de personas exigen consentimiento.
- **Quién confirmó qué** ya no es público (antes cualquiera podía leer los votos de todos).
- **Vault** guarda un secreto propio (`secreto_funciones`) en vez de la service_role key; `notificar` rechaza llamadas sin él
  (antes cualquiera con la anon key podía reenviar avisos de cierre).
- Guardas en `validar_alerta` (no verificar dos veces ni actuar sobre alertas cerradas; motivo obligatorio al descartar),
  suspensión con reputación ≤ −6, límite de 3 zonas, `dispositivos_objetivo` con `UNION` para usar ambos índices espaciales,
  radio que avanza aunque falle FCM, firma OAuth de FCM con WebCrypto (sin `google-auth-library`) y token compartido entre
  envíos paralelos, feed CAP como Atom + `Cancel` al resolverse.

## Pruebas

```bash
cd supabase/pruebas && npm install && npm test        # 48 pruebas: P01–P14, P19, colmena, RLS, scripts de operación
cd supabase/functions && deno task probar             # 17 pruebas de las Edge Functions
cd compartido && flutter test                         # motor de demo, geohash, radio, mensajes
```

Equipo (sección 7 de la propuesta): R1 base de datos · R2 nube y notificaciones · R3 pantallas · R4 sistema móvil ·
R5 panel, producto y presentación.

**ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales de alertamiento.**
