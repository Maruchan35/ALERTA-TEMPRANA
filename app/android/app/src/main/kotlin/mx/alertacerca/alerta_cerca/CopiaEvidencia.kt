package mx.alertacerca.alerta_cerca

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileNotFoundException
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Copia de la evidencia del SOS en el propio teléfono (lib/nucleo/copia_evidencia.dart). El servidor
 * borra la suya 30 días después del cierre; esta es de la persona, para presentarla en una denuncia.
 *
 * Todo va junto a Descargas/ALERTA CERCA/<SOS fecha hora>/ (videos, audios y la constancia), para
 * llevar la carpeta completa a la Fiscalía; los videos también salen en la galería. Android 10+
 * guarda con MediaStore sin pedir permiso; Android 9 o menos necesita el de almacenamiento. Leer
 * copias de una instalación anterior de la app necesita el permiso de leer videos y audios.
 */
object CopiaEvidencia {
    const val CANAL = "alerta_cerca/evidencia"
    private const val CARPETA = "ALERTA CERCA"
    private val raiz = "${Environment.DIRECTORY_DOWNLOADS}/$CARPETA"

    /** Copiar y sacar huellas de varios MB: fuera del hilo de la pantalla, de uno en uno. */
    private val trabajo = Executors.newSingleThreadExecutor()
    private val principal = Handler(Looper.getMainLooper())

    /** Leer (y en Android 9 o menos, también escribir) en el almacenamiento compartido. */
    fun permisos(): Array<String> = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
            arrayOf(Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
    }

    fun tienePermiso(contexto: Context) =
        permisos().all { contexto.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    /** Android 10+ guarda sin permiso; Android 9 o menos lo necesita. */
    fun puedeGuardar(contexto: Context) = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || tienePermiso(contexto)

    fun atender(actividad: Activity, llamada: MethodCall, resultado: MethodChannel.Result) {
        when (llamada.method) {
            "guardar" -> enSegundoPlano(resultado) {
                val origen = File(llamada.argument<String>("ruta")!!)
                escribir(
                    actividad,
                    llamada.argument("carpeta")!!,
                    llamada.argument("nombre")!!,
                    llamada.argument("mime")!!,
                    reemplazar = null,
                ) { salida -> origen.inputStream().use { it.copyTo(salida) } }
            }
            "guardarTexto" -> enSegundoPlano(resultado) {
                val texto = llamada.argument<String>("texto")!!
                escribir(
                    actividad,
                    llamada.argument("carpeta")!!,
                    llamada.argument("nombre")!!,
                    "text/plain",
                    reemplazar = llamada.argument("reemplazar"),
                ) { it.write(texto.toByteArray(Charsets.UTF_8)) }
            }
            "listar" -> enSegundoPlano(resultado) { listar(actividad) }
            "huella" -> enSegundoPlano(resultado) { huella(actividad, Uri.parse(llamada.argument("uri")!!)) }
            "compartir" -> intentar(resultado) {
                compartir(actividad, llamada.argument<List<String>>("uris")!!, llamada.argument("titulo") ?: "Evidencia")
            }
            "abrir" -> intentar(resultado) {
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(Uri.parse(llamada.argument("uri")!!), llamada.argument("mime") ?: "*/*")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                actividad.startActivity(intent)
            }
            else -> resultado.notImplemented()
        }
    }

    private fun <T> enSegundoPlano(resultado: MethodChannel.Result, tarea: () -> T) {
        trabajo.execute {
            try {
                val valor = tarea()
                principal.post { resultado.success(valor) }
            } catch (e: Exception) {
                principal.post { resultado.error("copia", e.message ?: e.javaClass.simpleName, null) }
            }
        }
    }

    private fun intentar(resultado: MethodChannel.Result, tarea: () -> Unit) {
        try {
            tarea()
            resultado.success(true)
        } catch (e: Exception) {
            // Sin app para abrirlo o compartirlo, o el archivo ya no existe
            resultado.error("copia", e.message ?: e.javaClass.simpleName, null)
        }
    }

    /**
     * Crea Descargas/ALERTA CERCA/[carpeta]/[nombre] (o reescribe [reemplazar], la constancia de esta
     * misma instalación). Devuelve uri y nombre final: si ya había uno igual, Android le agrega "(1)".
     */
    private fun escribir(
        contexto: Context,
        carpeta: String,
        nombre: String,
        mime: String,
        reemplazar: String?,
        contenido: (OutputStream) -> Unit,
    ): Map<String, String> {
        val resolver = contexto.contentResolver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (reemplazar != null && reemplazar.startsWith("content://")) {
                try {
                    val uri = Uri.parse(reemplazar)
                    resolver.openOutputStream(uri, "wt")?.use(contenido) ?: throw FileNotFoundException(reemplazar)
                    return mapOf("uri" to reemplazar, "nombre" to (nombreDe(contexto, uri) ?: nombre))
                } catch (e: Exception) {
                    // Es de otra instalación o se borró: se crea otra
                }
            }
            val valores = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, nombre)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$raiz/$carpeta")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores)
                ?: throw IllegalStateException("No se pudo crear $nombre")
            try {
                resolver.openOutputStream(uri)?.use(contenido) ?: throw FileNotFoundException(nombre)
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            } catch (e: Exception) {
                resolver.delete(uri, null, null)
                throw e
            }
            return mapOf("uri" to uri.toString(), "nombre" to (nombreDe(contexto, uri) ?: nombre))
        }

        // Android 9 o menos: archivo normal (con permiso de almacenamiento) y se avisa a la galería
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "$CARPETA/$carpeta")
        if (!dir.isDirectory && !dir.mkdirs()) throw IllegalStateException("Sin permiso de almacenamiento")
        val destino = if (reemplazar != null) File(dir, nombre) else libre(dir, nombre)
        destino.outputStream().use(contenido)
        // El uri content:// (el file:// no se puede compartir) llega cuando la galería lo indexa
        val listo = CountDownLatch(1)
        var indexado: Uri? = null
        MediaScannerConnection.scanFile(contexto, arrayOf(destino.absolutePath), arrayOf(mime)) { _, uri ->
            indexado = uri
            listo.countDown()
        }
        listo.await(5, TimeUnit.SECONDS)
        return mapOf("uri" to (indexado ?: Uri.fromFile(destino)).toString(), "nombre" to destino.name)
    }

    private fun libre(dir: File, nombre: String): File {
        val base = nombre.substringBeforeLast('.')
        val extension = nombre.substringAfterLast('.', "")
        var archivo = File(dir, nombre)
        var n = 1
        while (archivo.exists()) {
            archivo = File(dir, if (extension.isEmpty()) "$base ($n)" else "$base ($n).$extension")
            n++
        }
        return archivo
    }

    private fun nombreDe(contexto: Context, uri: Uri): String? =
        contexto.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }

    /** Lo que hay en Descargas/ALERTA CERCA: lo de esta instalación siempre; lo de antes, con permiso. */
    @Suppress("DEPRECATION")
    private fun listar(contexto: Context): List<Map<String, Any?>> {
        val q = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val coleccion = MediaStore.Files.getContentUri("external")
        val ubicacion = if (q) MediaStore.MediaColumns.RELATIVE_PATH else MediaStore.MediaColumns.DATA
        val columnas = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            ubicacion,
        )
        val patron = if (q) "$raiz/%" else "%/$raiz/%"
        val lista = mutableListOf<Map<String, Any?>>()
        contexto.contentResolver.query(coleccion, columnas, "$ubicacion LIKE ?", arrayOf(patron), null)?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                // El uri de su colección: así las apps que lo reciben saben qué es
                val uri = when (c.getInt(5)) {
                    MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ->
                        ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                    MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO ->
                        ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                    else -> if (q) {
                        ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id)
                    } else {
                        ContentUris.withAppendedId(coleccion, id)
                    }
                }
                // RELATIVE_PATH: "Download/ALERTA CERCA/SOS …/"; DATA: "/storage/…/SOS …/archivo.mp4"
                val donde = c.getString(6) ?: ""
                val carpeta = if (q) donde.trimEnd('/').substringAfterLast('/') else File(donde).parentFile?.name ?: ""
                lista += mapOf(
                    "uri" to uri.toString(),
                    "nombre" to (c.getString(1) ?: ""),
                    "mime" to (c.getString(2) ?: "application/octet-stream"),
                    "bytes" to c.getLong(3),
                    "fecha" to c.getLong(4) * 1000,
                    "carpeta" to carpeta,
                )
            }
        }
        return lista
    }

    /** Huella SHA-256 (hex) del archivo tal como está ahora en el teléfono. */
    private fun huella(contexto: Context, uri: Uri): String {
        val sha = MessageDigest.getInstance("SHA-256")
        val entrada = if (uri.scheme == "file") {
            File(uri.path!!).inputStream()
        } else {
            contexto.contentResolver.openInputStream(uri) ?: throw FileNotFoundException(uri.toString())
        }
        entrada.use {
            val bloque = ByteArray(1 shl 16)
            while (true) {
                val n = it.read(bloque)
                if (n < 0) break
                sha.update(bloque, 0, n)
            }
        }
        return sha.digest().joinToString("") { b -> "%02x".format(b) }
    }

    private fun compartir(actividad: Activity, uris: List<String>, titulo: String) {
        // Un file:// haría fallar al que lo recibe (Android lo prohíbe): solo content://
        val lista = ArrayList(uris.filter { it.startsWith("content://") }.map(Uri::parse))
        if (lista.isEmpty()) throw FileNotFoundException("No hay archivos para compartir")
        val intent = Intent(if (lista.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
            type = "*/*"
            if (lista.size == 1) putExtra(Intent.EXTRA_STREAM, lista[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, lista)
            putExtra(Intent.EXTRA_SUBJECT, titulo)
            // La app que lo recibe necesita permiso de lectura para cada archivo
            clipData = ClipData.newRawUri(titulo, lista[0]).apply { lista.drop(1).forEach { addItem(ClipData.Item(it)) } }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        actividad.startActivity(Intent.createChooser(intent, titulo))
    }
}
