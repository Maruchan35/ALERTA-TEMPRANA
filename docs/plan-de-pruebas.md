# Plan de pruebas (sección 8.8, paso 5.1)

Cada caso de la propuesta tiene una prueba **automática** (se ejecuta en GitHub Actions en cada push) y, cuando
aplica, su versión **manual** para el ensayo con teléfonos reales.

| ID | Caso | Prueba automática | Prueba manual con teléfonos |
|---|---|---|---|
| P01 | Recibir sin cuenta | `supabase/pruebas` · *P01/P02* | Instalar la app y aceptar permisos → usuario anónimo y fila en `dispositivos` con celda de 6 caracteres |
| P02 | Privacidad | *P01/P02*: ninguna tabla tiene lat/lon de personas; la celda se sobrescribe (sin historial) | Abrir la tabla `dispositivos` |
| P03 | Alerta cercana | *P03/P04* | Institución publica un incendio a 300 m de A → A la recibe en < 10 s con “A 300 m de ti” |
| P04 | Alerta lejana | *P03/P04* | D (Zihuatanejo) no la recibe |
| P05 | Radio dinámico | *P05* (SQL) y *P05: anillos A → B → C* (motor de demo) | Menor verificado con `factor_tiempo = 30`: B a los ~30 s, C a los ~2 min |
| P06 | Reporte ciudadano | *P06* | Cuenta verificada reporta un asalto → no confirmada, ≤ 1 km, insignia ámbar |
| P07 | Categoría sensible | *P07* y *colmena* | Ciudadano reporta un menor → pendiente; solo le llega al validador. Sin revisión en 5 min (o con un segundo testigo) → no confirmada a 1 km, sin la foto |
| P08 | Duplicado | *P08* | Segundo reporte igual a 200 m → no crea alerta, suma una confirmación |
| P09 | Corroboración | *P09* | Tres cuentas confirman → corroborada; llega “AHORA CORROBORADA” |
| P10 | Votos de falsa | *P10* | Tres “parece falsa” → regresa a revisión |
| P11 | Límite de reportes | *P11* | Más de 10 reportes nuevos en una hora (`config.reportes_por_hora`) → se rechaza con mensaje claro; sumarse a un reporte que ya existe no cuenta |
| P12 | Cierre | *P12* | El validador la resuelve → todos ven “RESUELTA”; la foto deja de mostrarse |
| P13 | Expiración | *P13* | Forzar `expira_en` en el pasado → al minuto queda expirada y sale del mapa |
| P14 | Seguridad | *P14* (anon key y sesión: tokens, funciones internas, escrituras directas) | `curl` a `/rest/v1/rpc/dispositivos_objetivo` con la anon key → *permission denied* |
| P15 | Fotos sin metadatos | La app recomprime con `keepExif: false` (`app/lib/pantallas/reportar.dart`) | Subir una foto con GPS → el archivo en Storage no tiene EXIF |
| P16 | Telegram | `telegram_objetivo` (*Telegram: solo los suscriptores cercanos*) y textos (`mensajes_test.ts`) | `/start` y compartir ubicación cercana → llega el mensaje de la alerta |
| P17 | CAP | `cap_test.ts`: XML válido, elementos obligatorios, `Cancel` al resolverse | Abrir la URL del feed → XML con la alerta verificada |
| P18 | Token inválido | `fcm_test.ts`: 404/UNREGISTERED y token mal formado → `token_invalido` | Desinstalar la app y publicar una alerta → el dispositivo queda inactivo |
| P19 | Carga | *P19*: 5,000 dispositivos, usa `dispositivos_centro_idx`, ~2–3 ms | `supabase/demo/prueba_carga.sql` |
| P20 | SOS: pedir ayuda | *SOS: cualquier persona con sesión…* (SQL) y *SOS: pide ayuda…* (app) | Botón **SOS** → 5 s → en el panel suena la alarma y aparece la persona con su ubicación |
| P21 | SOS: cancelar y simulacro | *SOS: el botón rojo abre una cuenta regresiva…* y *el simulacro…* (app) | **CANCELAR** en la cuenta → no llega nada; *Ajustes → Modo emergencia → Simulacro* → no llega nada |
| P22 | SOS: ubicación en vivo | *SOS: la señal guarda el recorrido…* (SQL) y *simulador del panel* (`compartido`) | Caminar o ir en auto con el SOS activo y la pantalla apagada → el punto se mueve en el panel; la velocidad dice “en vehículo” |
| P23 | SOS: seguimiento | *SOS: el validador toma el caso…* (SQL), *validador: seguimiento en vivo* (app) y *SOS: alarma con banner rojo* (panel) | *Tomar el caso* y *Avisé al 911* → el teléfono dice “… ya te está siguiendo” y “La policía ya fue avisada” |
| P24 | SOS: privacidad | *SOS: nadie más ve la emergencia…* y *retención: las emergencias cerradas…* (SQL) | Con una cuenta ciudadana, `emergencias_panel` sale vacía; a los 30 días del cierre ya no hay recorrido ni video |
| P25 | SOS: evidencia | *SOS: la evidencia solo se sube…* (SQL) | Con el SOS abierto 30 s → en el panel aparecen 2 videos y se pueden ver |
| P26 | SOS: sin señal | *SOS: si el teléfono deja de mandar señal…* (SQL) | Activar el modo avión con el SOS abierto → a los 2 min llega “SOS · SIN SEÑAL” |
| P27 | SOS: sacudida | *detector de sacudidas* (`compartido`): caminar y correr no la disparan; *SOS: con la app abierta la sacudida pide ayuda aunque el servicio del modo protección no escuche* (app) | Con *Sacudir el teléfono* activado, 4 sacudidas fuertes → cuenta regresiva; con el modo protección, también con la app cerrada y el teléfono bloqueado |
| P28 | SOS: cancelar con PIN | *SOS: con la protección por PIN pero sin bloqueo…* (app): sin bloqueo no deja a la persona atrapada | Con bloqueo puesto, tocar CANCELAR o "Estoy a salvo" pide huella/PIN; otra persona no puede apagarlo |
| P29 | SOS: audio en vivo | el grabador se coordina con la cámara (no graban a la vez) | Con el SOS activo y la pantalla apagada, en el panel llegan segmentos de audio cada ~6 s |
| P30 | SOS: copia en el teléfono | *SOS: cada fragmento se copia al teléfono con su huella y el audio llega al servidor como audio* (app) | Tras un SOS, en *Descargas › ALERTA CERCA › SOS <fecha>* están los videos (también en la galería), los audios y `constancia.txt`; en el portal cada fragmento dice Video o Audio y *Reproducir todo seguido* los pasa en orden |
| P31 | SOS: huella SHA-256 | *SOS: la evidencia… con su huella SHA-256* (SQL): se guarda, una inválida se rechaza y un reintento no la cambia | En una computadora, `certutil -hashfile "archivo" SHA256` da la misma huella que muestra el portal |
| P32 | SOS: constancia para denuncia | *constancia…*, *bitácora…* y *mis evidencias…* (app): revisa cada archivo contra su huella y comparte todo | *Mis evidencias → Compartir para la denuncia* manda los archivos y la constancia; si se edita un archivo, la constancia dice “NO COINCIDE” |
| P33 | Asistente WhatsApp: flujo | *Asistente para reportar por WhatsApp* (SQL): menú con números, ubicación, frase y confirmación; la alerta queda igual que una de la app | Escribir «hola» al número del puente → 1 → mandar ubicación → 0 → 1: aparece el folio y el reporte en la app |
| P34 | Asistente WhatsApp: límites | *cada número puede reportar 3 veces por hora* y *quien escribe demasiado…* (SQL) | El cuarto reporte del mismo número se rechaza; el mensaje 31 de la hora no recibe respuesta |
| P35 | Asistente WhatsApp: privacidad | *la alerta no guarda el número…* y *la conversación caduca… se borran al día* (SQL) | La alerta no tiene número; a las 24 h no queda nada de la conversación |
| P36 | Puente: recepción | *entradaDeMensaje / telefonoDeJid* (puente-whatsapp): grupos, mensajes propios y reacciones se ignoran | Escribir desde otro WhatsApp al puente: contesta el asistente; un grupo no recibe nada |

## Además de la propuesta

- **Puente de WhatsApp** (`010_whatsapp_puente.sql`): el código queda en cola y la app ya no lo ve; cada mensaje se
  toma una sola vez; se reintenta lo atascado y se descarta lo vencido; el latido registra el número y activa el
  modo; sin el secreto de Vault nadie toma la cola. `puente-whatsapp/lib.test.mjs` prueba la configuración, los
  números de México (52 / 521) y las llamadas al servidor.
- **Verificación por WhatsApp** (`009_whatsapp.sql`): el hook guarda el código y solo se “recibe” en los 10 minutos
  siguientes y en modo simulado; sin modo simulado llama a la Edge Function `whatsapp` y no guarda el código; rechaza
  números inválidos; nadie más puede llamarlo ni leer los mensajes; retención de 1 día. La plantilla de WhatsApp
  Cloud API se prueba en `whatsapp_test.ts`, y el WhatsApp simulado de la demo en `compartido`.
- **Colmena** (`007_colmena.sql`): publicación automática a los 5 min sin revisión, segundo testigo que publica al
  instante, sin publicación automática para autores con reputación baja ni para lo regresado por votos, tope de 10 km
  con 6 confirmaciones, umbrales configurables en `config`, foto de personas oculta hasta confirmarse y teléfono
  verificado obligatorio para reportar, confirmar y subir fotos. Igual en el motor de demostración (`compartido`).
- **Reglas de confianza**: cuenta verificada para reportar; evacuación y fenómeno natural solo instituciones; título
  5–80 caracteres; foto ajena rechazada; consentimiento obligatorio para fotos de personas; reputación (+1 / −2),
  revisión con < −2 y suspensión en −6; bitácora con el autor de cada acción.
- **Privacidad**: quién confirmó qué no es público; perfiles privados; fotos de reportes en revisión invisibles para
  otros; borrar la cuenta elimina perfil, dispositivos y zonas.
- **Operación**: el seed es idempotente; las 5 tareas de pg_cron quedan programadas; sin secretos en Vault la alerta
  se guarda igual; `ampliar_radios()` y el ajuste manual de radio; retención (limpieza diaria y fotos por borrar);
  los scripts de `supabase/demo/` corren sin errores.
- **Edge Functions**: JWT de Google firmado con WebCrypto y verificado; un solo token de acceso para envíos en
  paralelo; autorización por secreto en tiempo constante; textos de push (contrato de la sección 7.2).
- **Interfaz**: bienvenida, inicio con alertas ordenadas y aviso del 911, detalle con acciones (app); acceso, cola de
  validación y verificación (panel), en modo demostración.
- **Modo emergencia (SOS)** (`011_emergencias.sql`, P20–P27): una emergencia abierta por persona y límite por hora;
  máximo un punto cada 3 s; solo su dueño manda señal; RLS (la persona ve la suya, los validadores todas, nadie
  escribe directo); evidencia solo en la carpeta de la emergencia propia y abierta (15 min de margen al cerrar); aviso
  único de “sin señal” que se rearma; retención de 30 días que nunca toca una emergencia abierta; textos de la alarma
  (`mensajes_test.ts`); detector de sacudidas, flujo completo y simulador en el motor de demostración; cuenta
  regresiva, cancelar, simulacro y “Estoy a salvo” (app); alarma, banner, recorrido y “Tomar el caso” (panel).
  Copia en el teléfono (`012_evidencia_huella.sql`, P30–P32): la huella SHA-256 se registra con cada fragmento (una
  inválida se rechaza y un reintento no la cambia); el audio se registra como audio; la constancia revisa cada archivo
  contra su huella; la bitácora se guarda completa y *Mis evidencias* agrupa y comparte por emergencia (app).

## Cómo ejecutarlas

```bash
cd supabase/pruebas && npm install && npm test     # 62 pruebas · PostgreSQL 17 + PostGIS reales (PGlite), sin Docker
cd puente-whatsapp && npm install && npm test      # puente de WhatsApp
cd supabase/functions && deno task probar          # 22 pruebas
cd supabase/functions && deno task revisar         # tipos, lint y formato
cd compartido && flutter test                      # geohash, radio, mensajes y motor de demostración
cd app && flutter test                             # pantallas (modo demostración)
cd panel && flutter test                           # panel (modo demostración)
cd web && npm install && npm run build             # portal web: sin escrituras directas, tipos y compilación
```

> En Windows con **Smart App Control** activado, `flutter test` puede fallar con “una directiva de Control de
> aplicaciones bloqueó este archivo” (bloquea `flutter_tester.exe`). Las pruebas corren igual en GitHub Actions.
