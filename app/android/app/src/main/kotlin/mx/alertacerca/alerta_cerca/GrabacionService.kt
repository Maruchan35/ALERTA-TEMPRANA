package mx.alertacerca.alerta_cerca

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Mientras hay una emergencia SOS: mantiene permitido el micrófono con la pantalla apagada o el
 * teléfono en la bolsa (Android 14+ lo exige: un servicio en primer plano de tipo "microphone").
 * No graba por sí mismo; la grabación la hace la app (lib/nucleo/emergencia.dart). Siempre visible
 * con su notificación, y se apaga en cuanto termina la emergencia.
 */
class GrabacionService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        crearCanal()
        val abrir = PendingIntent.getActivity(
            this, 4,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val aviso = constructor()
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(getColor(R.color.rojo_alerta))
            .setContentTitle("SOS · grabando audio")
            .setContentText("El audio de la emergencia se envía a Protección Civil.")
            .setOngoing(true)
            .setContentIntent(abrir)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                startForeground(ID, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(ID, aviso)
            }
        } catch (e: Exception) {
            // Sin permiso de micrófono o iniciado desde segundo plano: el SOS sigue (ubicación y video)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun constructor(): Notification.Builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CANAL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CANAL, "SOS: audio", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Aviso fijo mientras se graba el audio de una emergencia"
                setShowBadge(false)
            },
        )
    }

    companion object {
        private const val CANAL = "sos_audio"
        private const val ID = 7303

        fun iniciar(contexto: Context) {
            val intent = Intent(contexto, GrabacionService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    contexto.startForegroundService(intent)
                } else {
                    contexto.startService(intent)
                }
            } catch (e: Exception) {
                // Android no dejó iniciarlo (p. ej. desde segundo plano): el audio sigue mientras la app esté abierta
            }
        }

        fun detener(contexto: Context) {
            contexto.stopService(Intent(contexto, GrabacionService::class.java))
        }
    }
}
