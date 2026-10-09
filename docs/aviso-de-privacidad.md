# Aviso de privacidad simplificado · ALERTA CERCA (prototipo)

> **Borrador para el prototipo del HackaITLAC 2026.** No es asesoría legal. Para un piloto real, el organismo que opere
> el sistema debe revisarlo con un abogado conforme a la ley de protección de datos personales vigente (si lo opera un
> particular como el CCE, la Ley Federal de Protección de Datos Personales en Posesión de los Particulares; si lo opera
> una institución pública, la ley general para sujetos obligados). El mismo texto aparece en la app
> (*Ajustes → Aviso de privacidad*).

**Responsable.** ALERTA CERCA es un prototipo desarrollado para el reto del Consejo Coordinador Empresarial de Lázaro
Cárdenas. Durante un piloto, el responsable sería el organismo que lo opere. Contacto: cce.lazarocardenas@gmail.com.

**Datos que usamos.**
- Una celda de ~1.2 × 0.6 km donde está tu teléfono. Tu ubicación exacta **nunca sale de tu teléfono**.
- El identificador de notificaciones de tu teléfono (token), para poder avisarte.
- Las celdas de tus zonas guardadas (casa, escuela, trabajo), si las agregas.
- Solo si quieres reportar o confirmar: tu número de teléfono, que verificamos con un código por WhatsApp. El
  registro de ese mensaje se borra al día siguiente.
- En los reportes: la ubicación del suceso (un lugar, no una persona), la descripción y, si la agregas, una foto sin
  metadatos.
- Si usas el bot de Telegram: tu identificador de chat y la celda de la ubicación que compartiste.
- **Solo si tú activas el modo emergencia (SOS)**: mientras la emergencia está abierta, tu ubicación exacta y su
  recorrido, tu velocidad, el nivel de batería, el video con audio que grabe tu teléfono mientras la pantalla del SOS
  está abierta, el audio que grabe con la pantalla apagada y la huella SHA-256 de cada archivo; si verificaste tu
  número, también se muestra a quienes te dan seguimiento.

**Finalidad.** Únicamente hacerte llegar alertas de lo que ocurre cerca de ti o de tus zonas, validar los reportes y,
si pides ayuda con el SOS, localizarte y avisar al 911. No vendemos ni usamos tus datos para publicidad.

**Modo emergencia (SOS).** Es la única excepción a la regla de no guardar tu ubicación exacta, y solo ocurre si tú pides
ayuda (con 5 segundos para cancelar). Los datos de la emergencia los ven únicamente Protección Civil y los validadores
que le dan seguimiento (nunca tus vecinos ni el público), para localizarte; pueden dárselos al 911. Al terminar se deja
de compartir tu ubicación, y la emergencia, su recorrido, el video y el audio se borran a los 30 días del cierre.

**Copia en tu teléfono (SOS).** Salvo que la desactives, la app guarda en tu propio teléfono (*Descargas › ALERTA
CERCA*) una copia de los videos y audios del SOS y una constancia (horas, ubicación al pedir ayuda y la última, lo que
indicaste y la huella SHA-256 de cada archivo) para que puedas presentarla en una denuncia. Esa copia no sale de tu
teléfono salvo que tú la compartas, y no se borra a los 30 días: tú decides cuándo borrarla. La app pide permiso de
almacenamiento para guardarla en Android 9 o anterior y para encontrar copias de antes de reinstalarla; solo busca en
esa carpeta.

**Lo que no guardamos.** Tu ubicación exacta, tu historial de recorridos ni los metadatos de tus fotos (GPS, modelo del
teléfono), salvo durante una emergencia SOS que tú actives, mientras está abierta.

**Transferencias.** Con nadie. Las alertas **verificadas** se publican en formato CAP para que Protección Civil u otras
autoridades puedan retransmitirlas; nunca incluyen datos de quien reportó. Durante un SOS, los validadores pueden dar
tu ubicación al 911 para que te ayuden.

**Datos sensibles.** Fotos y datos de menores o personas vulnerables solo se publican con el consentimiento expreso del
familiar o tutor, únicamente en alertas validadas, y dejan de mostrarse cuando el caso se resuelve.

**Conservación.** A quién se envió cada alerta: 30 días. Alertas cerradas: se anonimizan a los 90 días (y se borran sus
fotos). Teléfonos sin actividad: se desactivan a los 60 días. Emergencias SOS (ubicación, recorrido, video, audio y
huellas): se borran del servidor a los 30 días de cerrarse; la copia en tu teléfono la borras tú.

**Derechos ARCO.** Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos. En *Ajustes* está el botón
**Borrar mi cuenta y mis datos**, que elimina tu perfil, tus dispositivos, tus zonas y tus confirmaciones (tus reportes
se conservan sin tu nombre). En Telegram, `/baja` deja de enviarte alertas.

**Seguridad.** Reglas de acceso por fila (RLS) en todas las tablas, secretos fuera del código, HTTPS, mínimo privilegio
(las funciones internas no se pueden llamar desde la app) y bitácora de acciones.

**Importante.** ALERTA CERCA no sustituye al 911, a la Alerta Amber, al alertamiento sísmico ni a ningún sistema
oficial. En una emergencia, llama al 911.
