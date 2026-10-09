package mx.alertacerca.alerta_cerca

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Si la persona tenía encendido el modo protección, se vuelve a encender al reiniciar el teléfono y
 * al actualizar la app (instalar una versión nueva cierra el servicio). Si un fabricante no deja
 * arrancarlo aquí, se reactiva al abrir la app (MainActivity.onResume).
 */
class ArranqueReceiver : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        ModoProteccionService.asegurar(contexto)
    }
}
