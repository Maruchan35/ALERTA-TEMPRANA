package mx.alertacerca.alerta_cerca

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import kotlin.math.sqrt

/**
 * MODO PROTECCIÓN (opcional): con la app cerrada, escucha el acelerómetro y, ante una sacudida
 * fuerte (la misma regla que DetectorSacudida en compartido/lib/src/emergencia.dart), abre la
 * cuenta regresiva del SOS. Si el teléfono está bloqueado se muestra encima, como una alarma;
 * la persona tiene unos segundos para cancelar antes de que se pida ayuda.
 *
 * Siempre es visible (notificación fija con botón "Apagar") y gasta batería: se enciende y se
 * apaga desde Ajustes → Modo emergencia.
 */
class ModoProteccionService : Service(), SensorEventListener {
    private var sensores: SensorManager? = null
    private var despierto: PowerManager.WakeLock? = null
    private val golpes = ArrayDeque<Long>()
    private var ultimoDisparo = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        crearCanales()
        // El acelerómetro común no despierta al teléfono: sin esto, con la pantalla apagada se pierden lecturas
        despierto = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alerta_cerca:modo_proteccion")
            .apply { acquire() }
        sensores = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sensores?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensores?.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACCION_APAGAR) {
            detener(this)
            return START_NOT_STICKY
        }
        val aviso = notificacionFija()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_SERVICIO, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_SERVICIO, aviso)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        sensores?.unregisterListener(this)
        despierto?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onSensorChanged(evento: SensorEvent) {
        val x = evento.values[0]
        val y = evento.values[1]
        val z = evento.values[2]
        val g = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH
        if (g < UMBRAL_G) return
        val ahora = SystemClock.elapsedRealtime()
        if (ultimoDisparo != 0L && ahora - ultimoDisparo < ESPERA_MS) return
        if (golpes.isNotEmpty() && ahora - golpes.last() < SEPARACION_MS) return
        golpes.addLast(ahora)
        while (golpes.isNotEmpty() && ahora - golpes.first() > VENTANA_MS) golpes.removeFirst()
        if (golpes.size >= PICOS) {
            golpes.clear()
            ultimoDisparo = ahora
            disparar()
        }
    }

    /** Abre la cuenta regresiva del SOS (encima de la pantalla de bloqueo si hace falta). */
    private fun disparar() {
        MainActivity.vibrar(this, 600)
        val abrir = abrirApp("movimiento", 1)
        val aviso = constructor(CANAL_DISPARO)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(getColor(R.color.rojo_alerta))
            .setContentTitle("¿Necesitas ayuda?")
            .setContentText("Detectamos una sacudida fuerte. Toca para pedir ayuda o cancelar.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentIntent(abrir)
            .setFullScreenIntent(abrir, true)
            .setAutoCancel(true)
            .apply {
                @Suppress("DEPRECATION")
                setPriority(Notification.PRIORITY_MAX)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setTimeoutAfter(60_000)
            }
            .build()
        getSystemService(NotificationManager::class.java)?.notify(ID_DISPARO, aviso)
    }

    private fun notificacionFija(): Notification {
        val apagar = PendingIntent.getService(
            this, 3, Intent(this, ModoProteccionService::class.java).setAction(ACCION_APAGAR),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return constructor(CANAL_PROTECCION)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(getColor(R.color.rojo_alerta))
            .setContentTitle("Modo protección activo")
            .setContentText("Sacude fuerte el teléfono para pedir ayuda (tendrás 5 s para cancelar).")
            .setOngoing(true)
            .setContentIntent(abrirApp(null, 0))
            .addAction(Notification.Action.Builder(null as Icon?, "PEDIR AYUDA (SOS)", abrirApp("atajo", 2)).build())
            .addAction(Notification.Action.Builder(null as Icon?, "Apagar", apagar).build())
            .build()
    }

    private fun abrirApp(origen: String?, codigo: Int): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
        if (origen != null) intent.putExtra(EXTRA_ORIGEN, origen)
        return PendingIntent.getActivity(
            this, codigo, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun constructor(canal: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, canal)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

    private fun crearCanales() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CANAL_PROTECCION, "Modo protección", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Aviso fijo mientras el modo protección escucha la sacudida"
                setShowBadge(false)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CANAL_DISPARO, "SOS: ¿necesitas ayuda?", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Abre la cuenta regresiva del SOS al detectar una sacudida fuerte"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    companion object {
        const val EXTRA_ORIGEN = "sos_origen"
        const val ID_SERVICIO = 7301
        const val ID_DISPARO = 7302
        private const val CANAL_PROTECCION = "modo_proteccion"
        private const val CANAL_DISPARO = "sos_disparo"
        private const val ACCION_APAGAR = "mx.alertacerca.alerta_cerca.APAGAR_PROTECCION"
        private const val PREFERENCIAS = "alerta_cerca_proteccion"
        private const val CLAVE_ENCENDIDO = "encendido"

        // Misma regla que DetectorSacudida (Dart): 4 golpes de ≥ 2.5 g en 1 s
        private const val UMBRAL_G = 2.5f
        private const val PICOS = 4
        private const val VENTANA_MS = 1000L
        private const val SEPARACION_MS = 100L
        private const val ESPERA_MS = 10_000L

        fun iniciar(contexto: Context) {
            contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE).edit()
                .putBoolean(CLAVE_ENCENDIDO, true).apply()
            val intent = Intent(contexto, ModoProteccionService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                contexto.startForegroundService(intent)
            } else {
                contexto.startService(intent)
            }
        }

        fun detener(contexto: Context) {
            contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE).edit()
                .putBoolean(CLAVE_ENCENDIDO, false).apply()
            contexto.stopService(Intent(contexto, ModoProteccionService::class.java))
        }

        fun encendido(contexto: Context): Boolean =
            contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE).getBoolean(CLAVE_ENCENDIDO, false)
    }
}
