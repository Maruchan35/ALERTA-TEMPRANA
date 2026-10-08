# Guion de la demostración y del pitch (7 minutos)

Basado en la sección 9 y el Anexo C de la propuesta. Hay **dos formas** de hacer la demo:

| | Demo real | Plan B: simulador |
|---|---|---|
| Qué se usa | 4 teléfonos (o emuladores) con la app, panel conectado a Supabase | Solo el panel web en modo demostración |
| Requiere | Despliegue completo ([despliegue.md](despliegue.md)) e internet | Un navegador. Funciona sin internet una vez cargado |
| Se ve | Notificaciones reales sonando en los teléfonos | Los 4 teléfonos dibujados en la pestaña **Simulador** del panel |

Ambas siguen exactamente el mismo guion: el motor de demostración aplica las mismas reglas que el backend
(mismo radio dinámico, mismo margen de celda, mismos textos de notificación).

## Teléfonos y ubicaciones (paso 5.3)

| Teléfono | Ubicación simulada | Coordenadas | Celda | Distancia | Recibe la alerta |
|---|---|---|---|---|---|
| Suceso | Centro de Lázaro Cárdenas | 17.9581, -102.1942 | `9epq4t` | — | — |
| A | 300 m al norte | 17.9608, -102.1942 | `9epq4t` | 0.3 km | Al instante (1 km) |
| B | 2.6 km al norte | 17.9815, -102.1942 | `9epq69` | 2.6 km | Al llegar a 3 km (~30 s) |
| C | 6 km al norte | 18.0121, -102.1942 | `9epq6x` | 6.0 km | Al llegar a 10 km (~2 min) |
| D | Zihuatanejo | 17.6417, -101.5517 | `9epu35` | 76.6 km | Nunca (máximo 25 km) |

Celdas y distancias verificadas por las pruebas automáticas contra PostGIS. En cada teléfono:
**Ajustes → Demostración · ubicación simulada**.

## 0:00 – 0:45 · La historia (R5)

> “Son las cinco de la tarde. Un niño de 8 años se separa de su mamá en el mercado. Ella pide ayuda y alguien lo
> publica en Facebook. En una hora, la publicación la vieron personas en Morelia, Uruapan y Guadalajara. La señora que
> vende jugos a 200 metros, la que vio pasar a un niño con playera roja, no se enteró. ALERTA CERCA existe para que la
> información le llegue primero a ella.”

## 0:45 – 1:30 · La idea y cómo funciona (R5)

Diapositiva con las 4 piezas: **app** (recibir, reportar, confirmar) · **backend** (PostgreSQL + PostGIS decide a quién
avisar) · **panel** (validadores) · **canales alternos** (Telegram y feed CAP para autoridades).

## 1:30 – 4:30 · Demo en vivo (R3, R4, R5)

1. Un ciudadano verificado reporta **menor desaparecido** frente al mercado → queda **EN REVISIÓN**: nadie lo recibe
   (en el simulador: botón *Ciudadano reporta un menor*). “Los casos de personas pasan primero por un validador; si
   en 5 minutos nadie lo revisa, o si otro testigo lo reporta, la comunidad lo recibe a 1 km sin la foto: la app
   funciona como una colmena, no depende de un administrador.”
2. El validador lo abre en *Por validar*: reputación del autor, folio del 911, consentimiento de la foto → **Verificar**.
3. **A suena**: “MENOR DESAPARECIDO · A 300 m de ti · Verificada”.
4. Unos 30 s después, **B**; unos 2 min después, **C**. Mientras tanto el panel muestra el círculo creciendo.
   **D nunca** la recibe: está a 76 km y no le sirve.
5. **Resolver** con el motivo “Menor localizado sano y salvo” → A, B y C reciben **RESUELTA**; la foto deja de
   mostrarse.

## 4:30 – 5:30 · Privacidad y confianza (R1)

- Abrir la tabla `dispositivos`: “no hay coordenadas, solo celdas de 1 km”. En la app: *Ajustes → Lo único que el
  servidor sabe de tu ubicación*.
- Estados de confianza: no confirmada (1 km) → corroborada por 3 vecinos (3 km; con 6, 10 km) → verificada (todos
  los escalones). La colmena avanza sola; el validador acelera y corrige.
- El riesgo que pocos ven: una alerta falsa de “persona desaparecida” puede usarse para encontrar a alguien que huyó de
  la violencia. Por eso se valida, se pide el folio del 911, nunca se publican domicilios y todo queda en la bitácora.

## 5:30 – 6:15 · ¿Y sin app? (R2)

Tabla de canales (Cell Broadcast, SMS, push, PWA, Telegram, WhatsApp). Invitar a un juez a escanear el QR del bot de
Telegram. Abrir el feed CAP en el navegador: “así Protección Civil puede retransmitir nuestras alertas verificadas,
incluso por Cell Broadcast”.

## 6:15 – 7:00 · Viabilidad y cierre (R5)

Costo del prototipo: $0 (planes gratuitos). Piloto con empresas del CCE, escuelas y comercios con QR. Cierre:
**“Si algo importante está ocurriendo cerca de ti, deberías poder saberlo.”**

## Preguntas difíciles

| Pregunta | Respuesta corta |
|---|---|
| ¿Y si alguien publica una alerta falsa? | Para reportar o confirmar se necesita un teléfono verificado; lo no confirmado viaja máximo 1 km; la foto de una persona solo se muestra cuando la alerta ya está confirmada; 3 votos de “parece falsa” la regresan a revisión; reputación (−2 por descarte, suspensión en −6) y bitácora. |
| ¿Por qué no SMS o una alerta sin app? | El único canal universal, Cell Broadcast, lo operan autoridades y operadores; el SMS cuesta. El feed CAP permite que una autoridad retransmita nuestras alertas verificadas. |
| ¿Cuánto cuesta? | Prototipo $0. Un piloto cabe en planes gratuitos o Supabase Pro (~25 USD/mes). El único costo variable es el SMS de verificación de quien reporta. |
| ¿Gasta batería? | No rastreamos continuamente: precisión media solo al abrir la app, al cambiar de celda o cada 15 min si la persona lo permite. |
| ¿Funciona en iPhone? | Mismo código Flutter; publicarlo requiere la cuenta de Apple Developer (99 USD/año). |
| ¿Quién valida a las 3 a. m.? | Nadie tiene que estar despierto para que funcione: la colmena publica sola los reportes en revisión a los 5 minutos (o al instante con un segundo testigo) y las confirmaciones de vecinos amplían el radio. Los validadores aceleran y corrigen; el panel mide su tiempo de respuesta. |
| ¿Y si no hay internet? | FCM entrega el mensaje al reconectarse mientras siga vigente. Para conectividad cero, Cell Broadcast vía autoridades (por eso CAP). |
| ¿Escala? | La búsqueda de destinatarios usa índices espaciales: con 5,000 teléfonos tarda ~2–3 ms (prueba P19). |

## Lista de verificación (Anexo C)

**Una hora antes**
- [ ] Proyecto de Supabase activo (alguien ejecutó una consulta hoy).
- [ ] `cron.job_run_details` con ejecuciones recientes.
- [ ] Ejecutar [`supabase/demo/preparar_demo.sql`](../supabase/demo/preparar_demo.sql) (expira pruebas, crea 2 alertas de fondo y pone `factor_tiempo = 30`).
- [ ] 4 teléfonos cargados, con la app, sesión iniciada y ubicaciones A, B, C y D.
- [ ] Notificaciones permitidas, volumen alto, “No molestar” apagado.
- [ ] Panel abierto con la sesión del validador; cuenta ciudadana verificada lista para reportar.
- [ ] Foto de ilustración (nunca una foto real de un menor).
- [ ] scrcpy probado con el proyector; hotspot de respaldo; video de respaldo en USB y en la nube.
- [ ] Panel de demostración abierto en otra pestaña como plan B.

**Al terminar**
- [ ] Ejecutar [`supabase/demo/terminar_demo.sql`](../supabase/demo/terminar_demo.sql) (`factor_tiempo = 1` y resolver lo abierto).
- [ ] Anotar las preguntas del jurado.
