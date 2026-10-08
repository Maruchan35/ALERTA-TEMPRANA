# Despliegue paso a paso

Guía para poner ALERTA CERCA en marcha con servicios reales (todos en planes gratuitos). Sigue el orden: cada paso
indica **quién** lo hace (roles de la sección 7 de la propuesta) y **cómo saber que quedó**.

> ¿Solo quieres verlo funcionar? No hace falta nada de esto: `flutter run -d chrome` en `app/` o `panel/` arranca el
> **modo demostración** (todo en memoria). Ver el [README](../README.md).

## 0. Herramientas (todos)

| Herramienta | Para qué | Instalación (Windows) |
|---|---|---|
| Git | repositorio | git-scm.com |
| Flutter 3.47+ | app y panel | docs.flutter.dev (Windows + Android). `flutter doctor` en verde |
| Android Studio | emulador con **Google Play** (sin Google Play no hay FCM) | developer.android.com/studio |
| Node.js LTS | CLI de Supabase (`npx supabase`), pruebas SQL | nodejs.org |
| Firebase CLI y FlutterFire (R4) | configurar push | `npm install -g firebase-tools` y `dart pub global activate flutterfire_cli` |

La CLI de Supabase no necesita instalarse: `npx supabase@latest <comando>`. Docker **solo** hace falta para el backend
local (`supabase start`); para desplegar a la nube no.

## 1. Supabase (R1)

1. supabase.com → **New project** → nombre `alerta-cerca`, contraseña fuerte (guárdala), región cercana, plan Free.
2. **Authentication → Sign In / Providers**:
   - *Allow anonymous sign-ins*: **activado** (recibir alertas no pide cuenta).
   - *Email*: activado (cuentas de validadores). Puedes desactivar el registro público de correo.
   - *Phone*: activado (quien reporta verifica su número). Agrega **números de prueba** con código fijo, p. ej.
     `525511111111 → 123456`. Si pide un proveedor de SMS para guardar, crea una cuenta de prueba de Twilio.
3. **Project Settings → API Keys**: copia la **Project URL** y la **publishable key** (o la *anon key* en la pestaña
   *Legacy*). Ambas son públicas. **Nunca** copies la `service_role`/`secret` key a la app ni a git.
4. Vincula el proyecto (el REF está en la URL del panel: `supabase.com/dashboard/project/<REF>`):

   ```bash
   npx supabase login
   npx supabase link --project-ref TU_REF
   ```

5. Sube el esquema y el catálogo:

   ```bash
   npx supabase db push --include-seed
   ```

   Alternativa sin CLI: pega en **SQL Editor**, en orden, `supabase/migrations/001_esquema.sql` … `006_tareas.sql` y
   luego `supabase/seed.sql`.

✓ **Listo cuando**: *Table Editor* muestra 12 tablas con candado (RLS); `select count(*) from categorias;` da 12;
*Database → Cron Jobs* muestra 4 tareas; *Advisors → Security* no marca tablas sin RLS.

## 2. Firebase, solo para notificaciones (R2 y R4)

1. console.firebase.google.com → **Agregar proyecto** `alerta-cerca` (sin Google Analytics).
2. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**: descarga un JSON. Es
   **secreto**: no lo subas al repositorio (`.gitignore` ya ignora `*-firebase-adminsdk-*.json`).
3. Verifica que *Firebase Cloud Messaging API (V1)* esté habilitada (**Cloud Messaging**).
4. R4, en la carpeta `app/`:

   ```bash
   firebase login
   flutterfire configure --project=TU_PROYECTO_FIREBASE --platforms=android,ios
   ```

   Reemplaza `app/lib/firebase_options.dart` (hoy es un archivo de relleno) y agrega
   `android/app/google-services.json` y el plugin de Google Services a Gradle.

## 3. Edge Functions y secretos (R2)

1. Copia `supabase/functions/.env.ejemplo` → `supabase/functions/.env` y llénalo:
   - `SECRETO_FUNCIONES`: cadena larga y aleatoria. En PowerShell:
     `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')`
   - `FIREBASE_SERVICE_ACCOUNT`: el JSON completo de la cuenta de servicio **en una sola línea**.
   - `TELEGRAM_BOT_TOKEN` y `TELEGRAM_SECRETO` (paso 6; puedes dejarlos vacíos por ahora).
2. Sube los secretos y despliega las 4 funciones (`config.toml` ya les quita la verificación de JWT: se autentican con
   su propio secreto o son públicas):

   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy --use-api
   ```

3. Guarda en **Vault** la URL de las funciones y el mismo secreto: edita y ejecuta
   [`supabase/configurar_vault.sql`](../supabase/configurar_vault.sql) en el SQL Editor.

✓ **Listo cuando**: *Edge Functions* lista `notificar`, `telegram-webhook`, `cap` y `mantenimiento`, y
`https://TU_REF.supabase.co/functions/v1/cap` abre un XML (un feed vacío está bien).

## 4. Validadores (R5)

1. **Authentication → Users → Add user → Create new user**: `validador1@example.com` (o correos reales de las
   instituciones), contraseña y *Auto Confirm User* (sin confirmar, la cuenta no puede entrar). El proveedor **Email**
   debe quedar encendido: en `config.toml`, `[auth.email] enable_signup = true` (en la nube ese valor es el interruptor
   del proveedor; con `false` nadie entra con correo, ni en la app ni en el panel).
2. Ejecuta [`supabase/demo/cuentas_validadores.sql`](../supabase/demo/cuentas_validadores.sql) (ajusta correos,
   nombres e institución).

Guía completa para quien hace el panel web: [panel-web.md](panel-web.md).

## 5. App y panel (R3, R4, R5)

En `app/` y en `panel/`: copia `config.ejemplo.json` → `config.json` (está en `.gitignore`) con la URL y la
publishable/anon key, y:

```bash
flutter run --dart-define-from-file=config.json            # app en el emulador o teléfono
flutter run -d chrome --dart-define-from-file=config.json  # panel
flutter build apk --release --dart-define-from-file=config.json   # APK para instalar en los teléfonos de la demo
flutter build web --release --dart-define-from-file=config.json   # panel publicable en cualquier hosting estático
```

`"DEMO": "true"` en `config.json` muestra la **ubicación simulada** (puntos A, B, C y D) también en compilaciones
release.

✓ **Prueba integrada #1 (paso 2.9)**: abre la app, acepta permisos y elige el punto **A** en *Ajustes*. En
*Table Editor → dispositivos* aparece una fila con su celda de 6 caracteres (sin coordenadas). Luego, en el SQL
Editor:

```sql
insert into alertas (categoria, titulo, descripcion, lat, lon, estado, creada_por, expira_en, publicada_en)
values ('incendio', 'PRUEBA: humo en bodega', 'Prueba del equipo', 17.9581, -102.1942, 'verificada',
        (select id from perfiles limit 1), now() + interval '1 hour', now());

select * from entregas order by enviada_en desc limit 5;                     -- ¿se registró el envío?
select id, status_code, content::text from net._http_response order by created desc limit 5;  -- ¿qué respondió notificar?
```

En menos de 10 segundos el teléfono muestra **INCENDIO · A 300 m de ti · Verificada · PRUEBA…**.

## 5b. Actualizaciones sin reinstalar (Shorebird)

La APK se genera con [Shorebird](https://shorebird.dev) (code push para Flutter). Una vez instalada, cada cambio
en el código de la app llega solo: el teléfono descarga el parche al abrir la app y lo aplica la siguiente vez que
se abre. No hay que volver a compartir la APK.

1. Una sola vez por computadora: instala Shorebird (`git clone --branch stable https://github.com/shorebirdtech/shorebird.git`
   y agrega su carpeta `bin` al PATH) e inicia sesión con `shorebird login`. `app/shorebird.yaml` ya tiene el
   `app_id` del proyecto.
2. Primera versión (la que se instala en los teléfonos):

   ```bash
   cd app
   shorebird release android --artifact apk --target-platform android-arm,android-arm64 --dart-define-from-file=config.json
   ```

3. Cada actualización posterior:

   ```bash
   scripts\publicar-actualizacion.cmd      # = shorebird patch android --dart-define-from-file=config.json
   ```

Los parches solo cambian código Dart: tampoco llevan **íconos de Material nuevos** (la fuente de íconos se recorta al
compilar y es un archivo, no código). Si `shorebird patch` avisa *“Your app contains asset changes”*, usa un ícono que la
app ya tenga en otra pantalla. Si cambias permisos, plugins, el `AndroidManifest` o Firebase, sube `version:` en
`app/pubspec.yaml` y crea una versión nueva con `shorebird release` (esa sí se vuelve a instalar). Los cambios del
servidor (tablas, categorías, radios, Edge Functions) nunca requieren actualizar la app, y el panel web se actualiza
con solo recargar la página.

## 6. Telegram (R2, opcional)

1. En Telegram, **@BotFather** → `/newbot` (nombre *ALERTA CERCA Demo*, usuario terminado en `bot`). Guarda el token.
   `/setdescription`: “Recibe alertas de emergencia cerca de tu zona. Prototipo HackaITLAC 2026. No sustituye al 911.”
2. Pon `TELEGRAM_BOT_TOKEN` y `TELEGRAM_SECRETO` en `supabase/functions/.env`, vuelve a ejecutar
   `npx supabase secrets set --env-file supabase/functions/.env` y registra el webhook (una sola vez):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://TU_REF.supabase.co/functions/v1/telegram-webhook" -d "secret_token=<TELEGRAM_SECRETO>"
   ```

3. Genera un QR de `https://t.me/<usuario_del_bot>` para la diapositiva final.

✓ **Listo cuando**: `/start` → *Compartir mi ubicación* → aparece una fila en `suscriptores_telegram`; `/alertas`
lista lo activo cerca.

## 7. Feed CAP para autoridades (R2)

- Feed Atom con un documento CAP 1.2 por alerta verificada: `https://TU_REF.supabase.co/functions/v1/cap`
- Documento individual: `…/functions/v1/cap?id=<uuid>`
- Al resolverse una alerta verificada se publica un `Cancel` que referencia a la original durante 24 h.

## 8. Publicar la demostración web (opcional)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions** (una sola vez).
2. **Actions → Publicar demo web → Run workflow**. Queda en `https://<usuario>.github.io/ALERTA-TEMPRANA/`.

Para una versión (Release) con el APK de demostración: `git tag v1.0.0 && git push origin v1.0.0`.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `Anonymous sign-ins are disabled` | Activa *Allow anonymous sign-ins* (paso 1.2). |
| La alerta se guarda pero no llega nada | Revisa `net._http_response`: si está vacío, faltan los secretos de Vault (`configurar_vault.sql`); si `notificar` respondió 401, `SECRETO_FUNCIONES` no coincide con Vault. |
| `notificar` responde 500 con “Google OAuth” | El JSON de `FIREBASE_SERVICE_ACCOUNT` está incompleto o no está en una sola línea. |
| El emulador no recibe push | La imagen del emulador debe decir “Google Play”. |
| Los canales de notificación no cambian | Android los crea una sola vez: desinstala la app del emulador. |
| El proyecto de Supabase “se pausó” | Los proyectos Free se pausan tras 7 días sin actividad: entra al panel el día anterior y el de la final. |
| `Email logins are disabled` al entrar como validador | El proveedor Email está apagado: `[auth.email] enable_signup = true` en `config.toml` y `npx supabase config push`. |
| `Email not confirmed` | Authentication → Users → la cuenta → *Confirm email* (o el `update` de `cuentas_validadores.sql`). |
| Un reporte de persona sigue “en revisión” | Normal los primeros 5 minutos. Después la colmena lo publica sola (`publicar-pendientes` en *Cron Jobs*); no se publica sola si el autor tiene reputación < −2 o si regresó a revisión por votos. Para la demo: `update config set minutos_espera_validador = 1;` |
| Con la app cerrada no llega nada (Xiaomi, Redmi, POCO, Huawei, Oppo, Vivo) | El fabricante bloquea la app en segundo plano: en la app, *Ajustes → Avisos con la app cerrada*, y en los ajustes del teléfono activa **Inicio automático** y batería **Sin restricciones**. *Ajustes → Probar una notificación* confirma que el teléfono las muestra. |
| Solo me llegan mis propias alertas | El push solo llega a teléfonos **registrados**: el panel muestra cuántos hay (*teléfonos registrados*). Cada teléfono necesita la APK v1.0.0 (las anteriores no tienen push ni se actualizan solas), abrirla, aceptar notificaciones y cerrarla y abrirla otra vez para aplicar las actualizaciones. En la app, *Ajustes → Registro para recibir alertas* debe estar en verde. Además el aviso solo llega **dentro del radio** (1 km si no está confirmada): para probar desde lugares distintos, elijan el mismo punto en *Ajustes → Demostración · ubicación simulada*. |
| El botón “Yo también lo vi” no aparece | No aparece en tus propios reportes (nadie confirma lo suyo): ahí la app muestra cuántas confirmaciones lleva. Los demás lo ven en el detalle de la alerta; para que cuente, verifican su número una vez, cada teléfono con un número distinto (55 2222 2222, 55 3333 3333… código 123456). |
| `Alcanzaste el límite de reportes` | Son 10 reportes nuevos por hora por persona (los duplicados no cuentan). Para pruebas intensas: `update config set reportes_por_hora = 30;` |
| `permission denied for function …` desde la app | Es correcto para las funciones internas (prueba P14). La app solo llama `registrar_dispositivo`, `alertas_cercanas`, `obtener_alerta`, `crear_reporte`, `confirmar_alerta`, `validar_alerta` y `borrar_mi_cuenta`. |
