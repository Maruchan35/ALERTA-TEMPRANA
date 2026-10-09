package mx.alertacerca.alerta_cerca

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Puente con el modo emergencia (lib/nucleo/proteccion.dart):
 *  - Recibe los disparos del SOS (sacudida con la app cerrada, botón de la notificación del modo
 *    protección y atajo del ícono) y se los pasa a Flutter, que muestra la cuenta regresiva.
 *  - Mientras hay una emergencia, la app se muestra sobre la pantalla de bloqueo (como una alarma).
 *  - Enciende el servicio de micrófono para que el audio del SOS siga con la pantalla apagada.
 *  - Guarda la copia de la evidencia en el teléfono y pide el permiso de almacenamiento
 *    (canal "alerta_cerca/evidencia", CopiaEvidencia.kt).
 * Es FlutterFragmentActivity porque el aviso de huella o PIN (local_auth) lo necesita.
 */
class MainActivity : FlutterFragmentActivity() {
    private var canal: MethodChannel? = null

    /** Disparo que llegó antes de que Flutter estuviera listo (lo pide con "pendiente"). */
    private var pendiente: String? = null

    /** Permiso de almacenamiento (Ajustes → Modo emergencia): la respuesta se le da a Flutter. */
    private var respuestaPermiso: MethodChannel.Result? = null
    private val pedirAlmacenamiento = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        respuestaPermiso?.success(CopiaEvidencia.tienePermiso(this))
        respuestaPermiso = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        canal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CANAL).apply {
            setMethodCallHandler { llamada, resultado ->
                when (llamada.method) {
                    "pendiente" -> {
                        resultado.success(pendiente)
                        pendiente = null
                    }
                    "activarProteccion" -> {
                        ModoProteccionService.iniciar(this@MainActivity)
                        resultado.success(true)
                    }
                    "desactivarProteccion" -> {
                        ModoProteccionService.detener(this@MainActivity)
                        resultado.success(true)
                    }
                    "proteccionActiva" -> resultado.success(ModoProteccionService.encendido(this@MainActivity))
                    "sobrePantallaBloqueada" -> {
                        sobrePantallaBloqueada(llamada.arguments as? Boolean ?: false)
                        resultado.success(null)
                    }
                    "puedePantallaCompleta" -> resultado.success(puedePantallaCompleta())
                    "abrirAjustePantallaCompleta" -> {
                        abrirAjustePantallaCompleta()
                        resultado.success(null)
                    }
                    "iniciarMicrofono" -> {
                        GrabacionService.iniciar(this@MainActivity)
                        resultado.success(null)
                    }
                    "detenerMicrofono" -> {
                        GrabacionService.detener(this@MainActivity)
                        resultado.success(null)
                    }
                    "vibrar" -> {
                        vibrar(this@MainActivity, (llamada.arguments as? Int ?: 300).toLong())
                        resultado.success(null)
                    }
                    else -> resultado.notImplemented()
                }
            }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CopiaEvidencia.CANAL).setMethodCallHandler { llamada, resultado ->
            when (llamada.method) {
                "permiso" -> resultado.success(CopiaEvidencia.tienePermiso(this))
                "puedeGuardar" -> resultado.success(CopiaEvidencia.puedeGuardar(this))
                "pedirPermiso" -> if (CopiaEvidencia.tienePermiso(this)) {
                    resultado.success(true)
                } else {
                    respuestaPermiso?.success(false) // una petición anterior que quedó sin respuesta
                    respuestaPermiso = resultado
                    pedirAlmacenamiento.launch(CopiaEvidencia.permisos())
                }
                else -> CopiaEvidencia.atender(this, llamada, resultado)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Flutter todavía no corre: el disparo queda pendiente hasta que lo pida
        recibir(intent, enArranque = true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        recibir(intent, enArranque = false)
    }

    private fun recibir(intent: Intent?, enArranque: Boolean) {
        val origen = intent?.getStringExtra(ModoProteccionService.EXTRA_ORIGEN) ?: return
        // Que una rotación o volver a la app no lo disparen otra vez
        intent.removeExtra(ModoProteccionService.EXTRA_ORIGEN)
        getSystemService(NotificationManager::class.java)?.cancel(ModoProteccionService.ID_DISPARO)
        sobrePantallaBloqueada(true)
        val c = canal
        if (enArranque || c == null) pendiente = origen else c.invokeMethod("disparo", origen)
    }

    private fun sobrePantallaBloqueada(si: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(si)
            setTurnScreenOn(si)
        } else {
            @Suppress("DEPRECATION")
            val banderas = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            if (si) window.addFlags(banderas) else window.clearFlags(banderas)
        }
    }

    /** Android 14+: el permiso de "notificaciones de pantalla completa" se puede apagar. */
    private fun puedePantallaCompleta(): Boolean {
        if (Build.VERSION.SDK_INT < 34) return true
        return getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false
    }

    private fun abrirAjustePantallaCompleta() {
        val intent = if (Build.VERSION.SDK_INT >= 34) {
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
        }
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    companion object {
        const val CANAL = "alerta_cerca/proteccion"

        fun vibrar(contexto: Context, ms: Long) {
            val v = contexto.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(ms)
            }
        }
    }
}
