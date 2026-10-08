import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'modelos.dart';

/// Error con un mensaje listo para mostrar a la persona.
class ErrorServicio implements Exception {
  const ErrorServicio(this.mensaje);
  final String mensaje;

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

  /// Envía un código por SMS al número (10 dígitos de México) para verificar la cuenta.
  Future<void> enviarCodigo(String telefono);
  Future<void> verificarCodigo(String telefono, String codigo);

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

  void cerrar();
}
