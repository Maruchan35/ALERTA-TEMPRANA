package mx.alertacerca.alerta_cerca

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Si la persona tenía encendido el modo protección, se vuelve a encender al reiniciar el teléfono. */
class ArranqueReceiver : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (ModoProteccionService.encendido(contexto)) {
            try {
                ModoProteccionService.iniciar(contexto)
            } catch (e: Exception) {
                // Algunos fabricantes no dejan arrancar servicios al encender: se reactiva al abrir la app
            }
        }
    }
}
