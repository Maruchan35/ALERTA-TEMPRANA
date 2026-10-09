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
   - *Phone*: activado (quien reporta verifica su número **por WhatsApp**, ver el paso 5c). Si pide un proveedor
     de SMS para guardar, deja uno de relleno: el código no viaja por SMS. **No** agregues números de prueba con
     código fijo: esos se saltan WhatsApp.
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

## 5c. Verificación por WhatsApp (R2)

Quien quiere reportar o confirmar verifica su número con un código que llega **por WhatsApp**, no por SMS. Supabase
Auth genera y comprueba el código (1 número = 1 cuenta) y se lo entrega a `enviar_codigo_whatsapp()` (Auth Hook
*Send SMS*, activado por `supabase config push` con `[auth.hook.send_sms]`; en el panel: **Authentication → Hooks**).
Qué pasa después lo decide `config.whatsapp_modo`
([009](../supabase/migrations/009_whatsapp.sql) y [010](../supabase/migrations/010_whatsapp_puente.sql)):

| Modo | Cómo llega el código | Costo |
|---|---|---|
| `puente` | Un WhatsApp **normal** vinculado como dispositivo en [`puente-whatsapp/`](../puente-whatsapp) lo envía desde su número | Gratis (riesgo de bloqueo del número: usar uno aparte) |
| `simulado` | La app que lo pidió lo muestra como burbuja de WhatsApp. **Solo pruebas**: cualquiera podría verificar cualquier número | Gratis |
| `meta` | WhatsApp Business (Cloud API de Meta) con la Edge Function [`whatsapp`](../supabase/functions/whatsapp/index.ts) | Por mensaje |

- **Puente** (lo que usa el prototipo): guarda en Vault `select vault.create_secret('CADENA_LARGA', 'secreto_puente');`,
  llena `puente-whatsapp/.env` y ejecuta `npm start`; al escanear el QR el modo cambia solo a `puente`. Instrucciones y
  riesgos: [puente-whatsapp/README.md](../puente-whatsapp/README.md). Si el puente se apaga, los códigos esperan en
  cola 10 minutos y la app avisa que el servicio está desconectado.
- **Meta**: cuenta de WhatsApp Business, un número que envíe y una plantilla de *autenticación* aprobada (por defecto
  `codigo_verificacion`, `es_MX`, con botón “Copiar código”). Pon `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en
  `supabase/functions/.env`, súbelos con `npx supabase secrets set --env-file supabase/functions/.env`, despliega la
  función (`npx supabase functions deploy whatsapp --use-api`) y en el SQL Editor:
  `update config set whatsapp_modo = 'meta';`.
- Los números de prueba con código fijo (*Authentication → Sign In / Providers → Phone → Test phone numbers*) se
  saltan el hook: bórralos.

## 5d. Modo emergencia (SOS)

1. Servidor: aplica [011_emergencias.sql](../supabase/migrations/011_emergencias.sql) y
   [012_evidencia_huella.sql](../supabase/migrations/012_evidencia_huella.sql) (`npx supabase db push`) y
   vuelve a desplegar `notificar` y `mantenimiento` (`npx supabase functions deploy notificar mantenimiento --use-api`).
   Crea la tabla de emergencias, el bucket privado `evidencias`, la tarea `revisar-senal-emergencias` y la alarma a
   validadores.
2. App: el SOS trae permisos y plugins nativos nuevos (cámara, micrófono, sensores, servicio en primer plano), así que
   **no llega como parche**: la versión actual es la **1.3.1** (beta, con la copia de la evidencia en el teléfono) y se
   instala a mano (`shorebird release`, paso 5b). Desde ahí los cambios de Dart vuelven a llegar solos.
3. En cada teléfono: *Ajustes → Modo emergencia (SOS)*: revisar los permisos (ubicación, notificaciones, cámara y
   micrófono, almacenamiento, "Aparecer con el teléfono bloqueado" en Android 14+), dejar activado **Pedir huella o PIN
   para cancelar** (necesita que el teléfono tenga bloqueo), elegir si se activa con la sacudida y, si se quiere, el
   **modo protección** (con la app cerrada; gasta batería). Hacer un **simulacro** (no avisa a nadie). La **copia en el
   teléfono** (beta) viene activada: tras un SOS real, la evidencia y su constancia quedan en *Descargas › ALERTA
   CERCA* y en *Mis evidencias*.
4. Validadores: reciben la alarma en la app (con su cuenta de validador iniciada) y la ven en el panel (pestaña **SOS**,
   banner rojo y sonido) y en el portal web (*Emergencias SOS*).
5. Probarlo de verdad: con un validador conectado, en un teléfono toca **SOS** y espera los 5 s. En el panel suena la
   alarma y aparece la persona; *Tomar el caso* → en el teléfono dice "… ya te está siguiendo". Ciérrala con
   *Falsa alarma* (o "Estoy a salvo" en el teléfono).

En el SQL Editor: `select id, estado, tipo, ultima_senal_en from emergencias order by creada_en desc limit 5;`

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
| No llega el WhatsApp con el código | Modo `puente`: ¿está corriendo `puente-whatsapp` y dice “WhatsApp conectado”? Su ventana muestra cada envío y cada error. Modo `simulado`: aparece en la misma pantalla en 1–2 s. ¿El número está en *Test phone numbers*? (esos no pasan por WhatsApp: bórralos). ¿*Authentication → Hooks* muestra *Send SMS* con `enviar_codigo_whatsapp`? En SQL: `select telefono, modo, estado, error, enviado_en from privado.mensajes_whatsapp order by enviado_en desc limit 10;` |
| `Por seguridad, espera N segundos para pedir otro código` | Es el límite de Auth por número (30 s). |
| `Alcanzaste el límite de reportes` | Son 10 reportes nuevos por hora por persona (los duplicados no cuentan). Para pruebas intensas: `update config set reportes_por_hora = 30;` |
| La cuenta regresiva del SOS no aparece sola con el teléfono bloqueado | Android 14+: *Ajustes → Modo emergencia → Aparecer con el teléfono bloqueado* (permiso de notificaciones de pantalla completa). Si la notificación "¿Necesitas ayuda?" llega pero no se abre sola, tócala. |
| El modo protección se apaga solo (Xiaomi, Huawei, Oppo…) | Igual que los avisos: batería **Sin restricciones** e **Inicio automático** para ALERTA CERCA. La notificación fija "Modo protección activo" debe verse siempre. |
| La alarma SOS no le llega a un validador | Debe tener la app 1.1.0 con su cuenta de validador iniciada y *Registro para recibir alertas* en verde, o el panel abierto (ahí suena con la pestaña abierta). |
| El SOS dice "Activaste el SOS demasiadas veces" | Son 5 por hora por persona. Para pruebas: `update config set emergencias_por_hora = 20;` |
| Al cancelar el SOS no pide huella/PIN | El teléfono no tiene bloqueo configurado: ponlo en los ajustes del teléfono. Sin bloqueo, cualquiera podría apagar el SOS, así que la app deja cancelar con el diálogo normal y avisa. |
| La sacudida no hace nada (antes sí) | Pasaba al instalar una versión nueva con el modo protección encendido: Android cerraba su servicio y la app creía que seguía escuchando. Desde la 1.3.1 el servicio se reactiva solo al actualizar o abrir la app (vuelve la notificación fija) y, mientras tanto, la app abierta escucha la sacudida. |
| No se oye el audio en vivo del SOS | El micrófono graba cuando la cámara NO está grabando (pantalla apagada). Si la pantalla del SOS está abierta, el audio va dentro del video. Revisa el permiso de micrófono en *Ajustes → Modo emergencia*. |
| *Mis evidencias* no muestra un SOS de antes | Si se reinstaló la app, Android solo le deja ver las copias anteriores con el permiso de almacenamiento (*Ajustes → Modo emergencia → Almacenamiento*). Los archivos siguen en *Descargas › ALERTA CERCA* aunque la app no los vea. |
| `permission denied for function …` desde la app | Es correcto para las funciones internas (prueba P14). La app solo llama `registrar_dispositivo`, `alertas_cercanas`, `obtener_alerta`, `crear_reporte`, `confirmar_alerta`, `validar_alerta`, `borrar_mi_cuenta` y las del SOS (`iniciar_emergencia`, `senal_emergencia`, `tipo_emergencia`, `registrar_evidencia`, `terminar_emergencia`, `atender_emergencia`). |

## Reportar por WhatsApp (asistente para adultos mayores)

1. Servidor: aplica [013_reportes_whatsapp.sql](../supabase/migrations/013_reportes_whatsapp.sql) (`npx supabase db push`). Crea el asistente, los límites (`config.reportes_whatsapp_por_hora` = 3 y `mensajes_whatsapp_por_hora` = 30) y la columna `alertas.origen`.
2. Puente: en la computadora del puente, actualiza `puente-whatsapp/` con esta versión, `npm install` y `npm start`. Ahora también recibe mensajes: quien escriba al número del puente recibe el menú.
3. Probarlo: escribe «hola» al número del puente, elige 1, manda tu ubicación con el clip y confirma. El reporte aparece en la app y en el portal con origen WhatsApp.

> Riesgo: el puente usa una cuenta normal de WhatsApp. WhatsApp puede bloquear el número si detecta mensajes automáticos. Usa un número aparte. La API oficial (modo `meta`) no tiene ese riesgo, pero hay que verificar el negocio en Meta.
