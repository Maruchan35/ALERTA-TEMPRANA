import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'emergencia.dart';
import 'modelos.dart';

/// Error con un mensaje listo para mostrar a la persona.
class ErrorServicio implements Exception {
  const ErrorServicio(this.mensaje, {this.sinConexion = false});
  final String mensaje;

  /// No se pudo hablar con el servidor (vale la pena reintentar); si es false, el servidor respondió que no.
  final bool sinConexion;

  @override
  String toString() => mensaje;
}

/// Todo lo que la app y el panel necesitan del backend (contratos de la sección 7.2).
///
/// Hay dos implementaciones con el mismo comportamiento:
/// - [ServicioSupabase]: el backend real (PostgreSQL + PostGIS, Auth, Storage, Realtime).
/// - [ServicioDemo]: un motor en memoria que reproduce las mismas reglas (radio dinámico,
///   estados de confianza, duplicados, límites...). Sirve para desarrollar pantallas sin
///   backend y como plan B de la demostración.
abstract class ServicioAlertas {
  bool get esDemo;

  // ─── Sesión ───────────────────────────────────────────────────────────────
  ValueListenable<Perfil?> get perfil;

  /// Recibir alertas no requiere cuenta: se crea una sesión anónima.
  Future<void> iniciarSesionAnonima();
  Future<Perfil?> recargarPerfil();

  /// Envía un código por WhatsApp al número (10 dígitos de México) para verificar la cuenta.
  Future<void> enviarCodigo(String telefono);
  Future<void> verificarCodigo(String telefono, String codigo);

  /// WhatsApp SIMULADO: el último mensaje con código que "recibió" ese número en los últimos
  /// 10 minutos (null si no hay, o si el envío ya es por WhatsApp de verdad).
  Future<MensajeWhatsapp?> whatsappSimulado(String telefono);

  /// Cómo llega el código hoy: simulado, por el puente de WhatsApp (y desde qué número) o Business.
  Future<EstadoWhatsapp> estadoWhatsapp();

  /// Acceso con correo y contraseña (validadores e instituciones).
  Future<void> iniciarSesionCorreo(String correo, String contrasena);
  Future<void> cerrarSesion();

  /// Derecho de cancelación: borra la cuenta y sus datos.
  Future<void> borrarMiCuenta();

  // ─── Dispositivo y alertas ───────────────────────────────────────────────
  /// Registra el teléfono con su celda de ~1 km. NUNCA recibe coordenadas exactas.
  Future<void> registrarDispositivo({required String token, required String plataforma, required String celda});
  Future<List<Alerta>> alertasCercanas(String celda, {int radioM = 25000});
  Future<Alerta?> obtenerAlerta(String id);

  /// Foto de la alerta (enlace firmado de 10 min en Supabase).
  Future<ImageProvider?> imagenFoto(String path);

  /// Sube una foto YA comprimida y sin metadatos. Devuelve su ruta en Storage.
  Future<String> subirFoto(Uint8List jpeg);
  Future<ResultadoReporte> crearReporte(NuevoReporte reporte);
  Future<void> confirmar(String alertaId, TipoConfirmacion tipo);
  Future<void> validar(String alertaId, AccionValidador accion, {String? motivo, int? radioM});

  // ─── Mis zonas ───────────────────────────────────────────────────────────
  Future<List<Zona>> misZonas();
  Future<Zona> guardarZona(String nombre, String celda);
  Future<void> borrarZona(String id);

  // ─── Panel de validadores ────────────────────────────────────────────────
  /// Lista en vivo de alertas (se actualiza sola cuando entra un reporte).
  Stream<List<Alerta>> flujoPanel();
  Future<Metricas> metricas();
  Future<List<EntradaBitacora>> bitacora(String alertaId);

  /// Cambios de alertas en tiempo real (Realtime). Con la app abierta sirve para refrescar
  /// y, donde no hay push (web o sin Firebase), para avisar.
  Stream<Alerta> cambiosEnAlertas();

  // ─── Modo emergencia (SOS): la persona que pide ayuda ─────────────────────
  /// Pide ayuda. Funciona con cualquier sesión, incluso anónima. Si ya tiene una emergencia
  /// abierta la devuelve (otro toque u otra sacudida no la duplican).
  Future<EstadoMiEmergencia> iniciarEmergencia({
    required double lat,
    required double lon,
    double? precisionM,
    required OrigenEmergencia origen,
    int? bateria,
  });

  /// Señal cada ~5 s: ubicación (si hay GPS), velocidad y batería. Devuelve lo que ve la
  /// persona: si ya la están siguiendo, si avisaron al 911, si la cerraron.
  Future<EstadoMiEmergencia> senalEmergencia(
    String id, {
    double? lat,
    double? lon,
    double? precisionM,
    double? velocidadMs,
    int? bateria,
  });

  /// "Me asaltan", "Me llevan", "Me siguen" (un toque; avisa a los validadores).
  Future<EstadoMiEmergencia> tipoEmergencia(String id, TipoEmergencia tipo);

  /// "Estoy a salvo" o "Fue sin querer".
  Future<EstadoMiEmergencia> terminarEmergencia(String id, CierreEmergencia cierre);

  /// Sube un fragmento de evidencia (video con audio) y lo registra. Devuelve su ruta.
  /// [nombre] es estable (p. ej. `0003.mp4`): si se reintenta, no se duplica.
  Future<String> subirEvidencia(
    String emergenciaId,
    String nombre,
    Uint8List bytes, {
    String tipo = 'video',
    String contentType = 'video/mp4',
    int? duracionS,
  });

  /// Mi emergencia abierta (al volver a abrir la app), o null.
  Future<EstadoMiEmergencia?> miEmergenciaAbierta();

  // ─── Modo emergencia: validadores ────────────────────────────────────────
  /// Emergencias en vivo (abiertas primero). Se actualiza sola.
  Stream<List<Emergencia>> flujoEmergencias();

  /// Recorrido de una emergencia; crece en vivo mientras sigue abierta.
  Stream<List<PuntoEmergencia>> flujoRecorrido(String emergenciaId);
  Future<List<EvidenciaEmergencia>> evidenciasEmergencia(String emergenciaId);

  /// Enlace temporal (10 min) para ver o descargar una evidencia.
  Future<String?> urlEvidencia(String ruta);
  Future<void> atenderEmergencia(String id, AccionEmergencia accion, {String? nota, String? folio});

  void cerrar();
}
