import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'catalogo.dart';
import 'emergencia.dart';
import 'modelos.dart';
import 'servicio.dart';

/// Backend real: Supabase (PostgreSQL + PostGIS, Auth, Storage y Realtime).
/// La app NUNCA escribe directo en `alertas`: todo pasa por funciones del servidor.
class ServicioSupabase implements ServicioAlertas {
  ServicioSupabase(this.cliente) {
    _sesion = cliente.auth.onAuthStateChange.listen((_) => recargarPerfil());
  }

  final SupabaseClient cliente;
  final _perfil = ValueNotifier<Perfil?>(null);
  late final StreamSubscription<AuthState> _sesion;
  OtpType _flujoOtp = OtpType.phoneChange;

  @override
  bool get esDemo => false;

  @override
  ValueListenable<Perfil?> get perfil => _perfil;

  // ─── Errores legibles ──────────────────────────────────────────────────────
  Future<T> _intentar<T>(Future<T> Function() accion) async {
    try {
      return await accion();
    } on PostgrestException catch (e) {
      throw ErrorServicio(_traducir(e.message));
    } on AuthException catch (e) {
      throw ErrorServicio(_traducir(e.message));
    } on StorageException catch (e) {
      throw ErrorServicio('No se pudo subir la foto: ${e.message}');
    } on ErrorServicio {
      rethrow;
    } catch (e) {
      throw const ErrorServicio(
        'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
        sinConexion: true,
      );
    }
  }

  static String _traducir(String m) {
    final t = m.toLowerCase();
    if (t.contains('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (t.contains('token has expired') || t.contains('otp') && t.contains('invalid')) {
      return 'El código es incorrecto o ya venció.';
    }
    final espera = RegExp(r'after (\d+) seconds').firstMatch(t);
    if (espera != null) return 'Por seguridad, espera ${espera.group(1)} segundos para pedir otro código.';
    if (t.contains('rate limit') || t.contains('too many')) return 'Demasiados intentos. Espera un momento.';
    if (t.contains('hook') || t.contains('error sending')) {
      return 'No se pudo enviar el código por WhatsApp. Intenta de nuevo en un momento.';
    }
    if (t.contains('phone') && t.contains('invalid')) return 'Número de teléfono inválido.';
    if (t.contains('email logins are disabled') || t.contains('email_provider_disabled')) {
      return 'El acceso con correo está apagado en el servidor (Supabase → Authentication → Sign In / Providers → Email).';
    }
    if (t.contains('email not confirmed')) {
      return 'Esta cuenta todavía no confirma su correo. En Supabase: Authentication → Users → la cuenta → Confirm email.';
    }
    if (t.contains('anonymous sign-ins are disabled')) {
      return 'El proyecto no tiene activados los usuarios anónimos (Authentication → Sign In / Providers).';
    }
    return m;
  }

  // ─── Sesión ────────────────────────────────────────────────────────────────
  @override
  Future<void> iniciarSesionAnonima() => _intentar(() async {
    if (cliente.auth.currentSession == null) await cliente.auth.signInAnonymously();
    await recargarPerfil();
  });

  @override
  Future<Perfil?> recargarPerfil() async {
    final u = cliente.auth.currentUser;
    if (u == null) {
      _perfil.value = null;
      return null;
    }
    Map<String, dynamic>? fila;
    try {
      fila = await cliente.from('perfiles').select().eq('id', u.id).maybeSingle();
    } catch (_) {
      // sin conexión: se conserva lo que sabemos de la sesión
    }
    _perfil.value = Perfil(
      id: u.id,
      rol: Rol.desde(fila?['rol'] as String?),
      esAnonimo: u.isAnonymous,
      nombre: fila?['nombre'] as String?,
      institucion: fila?['institucion'] as String?,
      reputacion: (fila?['reputacion'] as num?)?.toInt() ?? 0,
      telefono: u.phone,
      correo: u.email,
    );
    return _perfil.value;
  }

  /// El código lo genera Supabase Auth y lo entrega el Auth Hook `enviar_codigo_whatsapp`
  /// (009_whatsapp.sql) por WhatsApp, no por SMS.
  @override
  Future<void> enviarCodigo(String telefono) => _intentar(() async {
    final numero = '+52$telefono';
    try {
      // Convierte la cuenta anónima en verificada SIN perder su id (ni sus zonas)
      await cliente.auth.updateUser(UserAttributes(phone: numero));
      _flujoOtp = OtpType.phoneChange;
    } on AuthException catch (e) {
      // El número ya tiene cuenta (p. ej. reinstaló la app): se inicia sesión en ella
      if (!e.message.toLowerCase().contains('already') && e.code != 'phone_exists') rethrow;
      await cliente.auth.signInWithOtp(phone: numero, shouldCreateUser: false);
      _flujoOtp = OtpType.sms;
    }
  });

  @override
  Future<void> verificarCodigo(String telefono, String codigo) => _intentar(() async {
    await cliente.auth.verifyOTP(type: _flujoOtp, phone: '+52$telefono', token: codigo);
    await cliente.auth.refreshSession();
    await recargarPerfil();
  });

  @override
  Future<MensajeWhatsapp?> whatsappSimulado(String telefono) async {
    try {
      final filas = await cliente.rpc('whatsapp_simulado', params: {'p_telefono': '52$telefono'}) as List;
      return filas.isEmpty ? null : MensajeWhatsapp.desdeMapa(filas.first as Map<String, dynamic>);
    } catch (_) {
      return null; // sin conexión: la pantalla sigue esperando o permite reenviar
    }
  }

  @override
  Future<EstadoWhatsapp> estadoWhatsapp() async {
    try {
      final r = await cliente.rpc('estado_whatsapp');
      return r is Map<String, dynamic> ? EstadoWhatsapp.desdeMapa(r) : const EstadoWhatsapp();
    } catch (_) {
      return const EstadoWhatsapp(); // servidor sin 010: como antes
    }
  }

  @override
  Future<void> iniciarSesionCorreo(String correo, String contrasena) => _intentar(() async {
    await cliente.auth.signInWithPassword(email: correo.trim(), password: contrasena);
    final p = await recargarPerfil();
    if (p == null || !p.rol.esValidador) {
      await cliente.auth.signOut();
      throw const ErrorServicio(
        'Esta cuenta no tiene permisos de validador. Pide a un administrador que te asigne el rol.',
      );
    }
  });

  @override
  Future<void> cerrarSesion() => _intentar(() async {
    await cliente.auth.signOut();
    _perfil.value = null;
  });

  @override
  Future<void> borrarMiCuenta() => _intentar(() async {
    await cliente.rpc('borrar_mi_cuenta');
    await cliente.auth.signOut(scope: SignOutScope.local);
    _perfil.value = null;
  });

  // ─── Dispositivo y alertas ─────────────────────────────────────────────────
  @override
  Future<void> registrarDispositivo({required String token, required String plataforma, required String celda}) =>
      _intentar(
        () => cliente.rpc(
          'registrar_dispositivo',
          params: {'p_token': token, 'p_plataforma': plataforma, 'p_celda': celda},
        ),
      );

  @override
  Future<List<Alerta>> alertasCercanas(String celda, {int radioM = 25000}) => _intentar(() async {
    final filas = await cliente.rpc('alertas_cercanas', params: {'p_celda': celda, 'p_radio_m': radioM});
    return (filas as List).map((f) => Alerta.desdeMapa(f as Map<String, dynamic>)).toList();
  });

  @override
  Future<Alerta?> obtenerAlerta(String id) => _intentar(() async {
    final filas = await cliente.rpc('obtener_alerta', params: {'p_alerta': id}) as List;
    return filas.isEmpty ? null : Alerta.desdeMapa(filas.first as Map<String, dynamic>);
  });

  @override
  Future<ImageProvider?> imagenFoto(String path) async {
    try {
      final url = await cliente.storage.from('fotos').createSignedUrl(path, 600);
      // En la web, si el navegador no deja leer la imagen desde Flutter, se muestra con <img>
      return NetworkImage(url, webHtmlElementStrategy: WebHtmlElementStrategy.fallback);
    } catch (e) {
      debugPrint('Foto $path: $e');
      return null; // sin permiso (p. ej. la alerta ya se resolvió o la cuenta no es validadora) o sin conexión
    }
  }

  @override
  Future<String> subirFoto(Uint8List jpeg) => _intentar(() async {
    final uid = cliente.auth.currentUser!.id;
    final ruta = '$uid/${DateTime.now().millisecondsSinceEpoch}.jpg';
    await cliente.storage
        .from('fotos')
        .uploadBinary(ruta, jpeg, fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: false));
    return ruta;
  });

  @override
  Future<ResultadoReporte> crearReporte(NuevoReporte r) => _intentar(() async {
    final respuesta = await cliente.rpc(
      'crear_reporte',
      params: {
        'p_categoria': r.categoria,
        'p_titulo': r.titulo,
        'p_descripcion': r.descripcion,
        'p_referencia': r.referencia,
        'p_lat': r.lat,
        'p_lon': r.lon,
        'p_foto_path': r.fotoPath,
        'p_folio_911': r.folio911,
        'p_consentimiento': r.consentimiento,
      },
    );
    return ResultadoReporte.desdeMapa(respuesta as Map<String, dynamic>);
  });

  @override
  Future<void> confirmar(String alertaId, TipoConfirmacion tipo) =>
      _intentar(() => cliente.rpc('confirmar_alerta', params: {'p_alerta': alertaId, 'p_tipo': tipo.clave}));

  @override
  Future<void> validar(String alertaId, AccionValidador accion, {String? motivo, int? radioM}) => _intentar(
    () => cliente.rpc(
      'validar_alerta',
      params: {'p_alerta': alertaId, 'p_accion': accion.clave, 'p_motivo': motivo, 'p_radio_m': radioM},
    ),
  );

  // ─── Mis zonas ─────────────────────────────────────────────────────────────
  @override
  Future<List<Zona>> misZonas() => _intentar(() async {
    final filas = await cliente.from('zonas_usuario').select('id, nombre, celda').order('nombre');
    return filas.map(Zona.desdeMapa).toList();
  });

  @override
  Future<Zona> guardarZona(String nombre, String celda) => _intentar(() async {
    final fila = await cliente
        .from('zonas_usuario')
        .insert({'usuario_id': cliente.auth.currentUser!.id, 'nombre': nombre, 'celda': celda})
        .select('id, nombre, celda')
        .single();
    return Zona.desdeMapa(fila);
  });

  @override
  Future<void> borrarZona(String id) => _intentar(() => cliente.from('zonas_usuario').delete().eq('id', id));

  // ─── Panel ─────────────────────────────────────────────────────────────────
  @override
  Stream<List<Alerta>> flujoPanel() {
    late final StreamController<List<Alerta>> control;
    RealtimeChannel? canal;
    Timer? espera;
    Timer? periodico;

    Future<void> cargar() async {
      try {
        final filas = await cliente.from('alertas_panel').select().order('creada_en', ascending: false).limit(300);
        if (!control.isClosed) control.add(filas.map(Alerta.desdeMapa).toList());
      } catch (e) {
        if (!control.isClosed) control.addError(ErrorServicio('No se pudo cargar el panel: $e'));
      }
    }

    void programar() {
      espera?.cancel();
      espera = Timer(const Duration(milliseconds: 400), cargar);
    }

    control = StreamController<List<Alerta>>(
      onListen: () {
        cargar();
        canal = cliente
            .channel('panel-alertas')
            .onPostgresChanges(
              event: PostgresChangeEvent.all,
              schema: 'public',
              table: 'alertas',
              callback: (_) => programar(),
            )
            .subscribe();
        // Conteos (confirmaciones, entregas) cambian sin tocar la fila de la alerta
        periodico = Timer.periodic(const Duration(seconds: 20), (_) => cargar());
      },
      onCancel: () async {
        espera?.cancel();
        periodico?.cancel();
        if (canal != null) await cliente.removeChannel(canal!);
      },
    );
    return control.stream;
  }

  @override
  Future<Metricas> metricas() => _intentar(() async {
    final fila = await cliente.from('metricas').select().single();
    return Metricas.desdeMapa(fila);
  });

  @override
  Future<List<EntradaBitacora>> bitacora(String alertaId) => _intentar(() async {
    final filas = await cliente.from('bitacora').select().eq('alerta_id', alertaId).order('creada_en', ascending: true);
    return filas.map(EntradaBitacora.desdeMapa).toList();
  });

  @override
  Stream<Alerta> cambiosEnAlertas() {
    late final StreamController<Alerta> control;
    RealtimeChannel? canal;
    control = StreamController<Alerta>.broadcast(
      onListen: () {
        canal = cliente
            .channel('cambios-alertas')
            .onPostgresChanges(
              event: PostgresChangeEvent.all,
              schema: 'public',
              table: 'alertas',
              callback: (cambio) {
                final fila = cambio.newRecord;
                if (fila.isEmpty || control.isClosed) return;
                final cat = categoriaPorClave(fila['categoria'] as String);
                control.add(
                  Alerta.desdeMapa({
                    ...fila,
                    'nombre': cat.nombre,
                    'nombre_corto': cat.nombreCorto,
                    'nivel': cat.nivel,
                    'instrucciones': cat.instrucciones,
                  }),
                );
              },
            )
            .subscribe();
      },
      onCancel: () async {
        if (canal != null) await cliente.removeChannel(canal!);
      },
    );
    return control.stream;
  }

  // ─── Modo emergencia (SOS) ─────────────────────────────────────────────────
  Future<EstadoMiEmergencia> _sos(String funcion, Map<String, dynamic> params) => _intentar(() async {
    final r = await cliente.rpc(funcion, params: params);
    return EstadoMiEmergencia.desdeMapa(r as Map<String, dynamic>);
  });

  @override
  Future<EstadoMiEmergencia> iniciarEmergencia({
    required double lat,
    required double lon,
    double? precisionM,
    required OrigenEmergencia origen,
    int? bateria,
  }) => _sos('iniciar_emergencia', {
    'p_lat': lat,
    'p_lon': lon,
    'p_precision_m': precisionM,
    'p_origen': origen.clave,
    'p_bateria': bateria,
  });

  @override
  Future<EstadoMiEmergencia> senalEmergencia(
    String id, {
    double? lat,
    double? lon,
    double? precisionM,
    double? velocidadMs,
    int? bateria,
  }) => _sos('senal_emergencia', {
    'p_emergencia': id,
    'p_lat': lat,
    'p_lon': lon,
    'p_precision_m': precisionM,
    'p_velocidad_ms': velocidadMs,
    'p_bateria': bateria,
  });

  @override
  Future<EstadoMiEmergencia> tipoEmergencia(String id, TipoEmergencia tipo) =>
      _sos('tipo_emergencia', {'p_emergencia': id, 'p_tipo': tipo.clave});

  @override
  Future<EstadoMiEmergencia> terminarEmergencia(String id, CierreEmergencia cierre) =>
      _sos('terminar_emergencia', {'p_emergencia': id, 'p_cierre': cierre.clave});

  @override
  Future<String> subirEvidencia(
    String emergenciaId,
    String nombre,
    Uint8List bytes, {
    String tipo = 'video',
    String contentType = 'video/mp4',
    int? duracionS,
  }) async {
    final uid = cliente.auth.currentUser?.id;
    if (uid == null) throw const ErrorServicio('Sin sesión: la evidencia se queda en el teléfono.', sinConexion: true);
    final ruta = '$uid/$emergenciaId/$nombre';
    try {
      await cliente.storage
          .from('evidencias')
          .uploadBinary(ruta, bytes, fileOptions: FileOptions(contentType: contentType, upsert: false));
    } on StorageException catch (e) {
      // Un reintento de algo que ya había subido: basta con registrarlo
      final yaEstaba = e.statusCode == '409' || e.message.toLowerCase().contains('exists');
      if (!yaEstaba) throw ErrorServicio('No se pudo subir la evidencia: ${e.message}');
    } catch (_) {
      throw const ErrorServicio(
        'Sin conexión: la evidencia se queda en el teléfono y se reintenta.',
        sinConexion: true,
      );
    }
    await _intentar(
      () => cliente.rpc(
        'registrar_evidencia',
        params: {'p_emergencia': emergenciaId, 'p_tipo': tipo, 'p_ruta': ruta, 'p_duracion_s': duracionS},
      ),
    );
    return ruta;
  }

  @override
  Future<EstadoMiEmergencia?> miEmergenciaAbierta() async {
    final uid = cliente.auth.currentUser?.id;
    if (uid == null) return null;
    try {
      final fila = await cliente
          .from('emergencias')
          .select('id')
          .eq('usuario_id', uid)
          .neq('estado', 'cerrada')
          .maybeSingle();
      return fila == null ? null : await senalEmergencia(fila['id'] as String);
    } catch (_) {
      return null; // sin conexión: la app sigue con la que tiene guardada
    }
  }

  @override
  Stream<List<Emergencia>> flujoEmergencias() {
    late final StreamController<List<Emergencia>> control;
    RealtimeChannel? canal;
    Timer? espera;
    Timer? periodico;

    Future<void> cargar() async {
      try {
        final filas = await cliente.from('emergencias_panel').select().order('creada_en', ascending: false).limit(100);
        final lista = filas.map(Emergencia.desdeMapa).toList()..sort(compararEmergencias);
        if (!control.isClosed) control.add(lista);
      } catch (e) {
        if (!control.isClosed) control.addError(ErrorServicio('No se pudieron cargar las emergencias: $e'));
      }
    }

    void programar() {
      espera?.cancel();
      espera = Timer(const Duration(milliseconds: 400), cargar);
    }

    control = StreamController<List<Emergencia>>(
      onListen: () {
        cargar();
        canal = cliente
            .channel('panel-emergencias')
            .onPostgresChanges(
              event: PostgresChangeEvent.all,
              schema: 'public',
              table: 'emergencias',
              callback: (_) => programar(),
            )
            .onPostgresChanges(
              event: PostgresChangeEvent.insert,
              schema: 'public',
              table: 'emergencia_evidencias',
              callback: (_) => programar(),
            )
            .subscribe();
        // "Sin señal desde hace X" y los conteos cambian aunque nadie toque la fila
        periodico = Timer.periodic(const Duration(seconds: 15), (_) => cargar());
      },
      onCancel: () async {
        espera?.cancel();
        periodico?.cancel();
        if (canal != null) await cliente.removeChannel(canal!);
      },
    );
    return control.stream;
  }

  @override
  Stream<List<PuntoEmergencia>> flujoRecorrido(String emergenciaId) {
    late final StreamController<List<PuntoEmergencia>> control;
    RealtimeChannel? canal;
    Timer? periodico;
    var puntos = <PuntoEmergencia>[];

    Future<void> cargar() async {
      try {
        // Los más recientes (un recorrido de horas puede tener miles de puntos)
        final filas = await cliente
            .from('emergencia_puntos')
            .select('id, lat, lon, precision_m, velocidad_ms, registrada_en')
            .eq('emergencia_id', emergenciaId)
            .order('registrada_en', ascending: false)
            .limit(5000);
        puntos = filas.map(PuntoEmergencia.desdeMapa).toList().reversed.toList();
        if (!control.isClosed) control.add(List.unmodifiable(puntos));
      } catch (e) {
        if (!control.isClosed) control.addError(ErrorServicio('No se pudo cargar el recorrido: $e'));
      }
    }

    control = StreamController<List<PuntoEmergencia>>(
      onListen: () {
        cargar();
        canal = cliente
            .channel('recorrido-$emergenciaId')
            .onPostgresChanges(
              event: PostgresChangeEvent.insert,
              schema: 'public',
              table: 'emergencia_puntos',
              filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'emergencia_id',
                value: emergenciaId,
              ),
              callback: (cambio) {
                if (cambio.newRecord.isEmpty || control.isClosed) return;
                final p = PuntoEmergencia.desdeMapa(cambio.newRecord);
                if (puntos.any((x) => x.id == p.id)) return;
                puntos = [...puntos, p];
                control.add(List.unmodifiable(puntos));
              },
            )
            .subscribe();
        periodico = Timer.periodic(const Duration(seconds: 30), (_) => cargar());
      },
      onCancel: () async {
        periodico?.cancel();
        if (canal != null) await cliente.removeChannel(canal!);
      },
    );
    return control.stream;
  }

  @override
  Future<List<EvidenciaEmergencia>> evidenciasEmergencia(String emergenciaId) => _intentar(() async {
    final filas = await cliente
        .from('emergencia_evidencias')
        .select('tipo, ruta, duracion_s, creada_en')
        .eq('emergencia_id', emergenciaId)
        .order('creada_en');
    return filas.map(EvidenciaEmergencia.desdeMapa).toList();
  });

  @override
  Future<String?> urlEvidencia(String ruta) async {
    try {
      return await cliente.storage.from('evidencias').createSignedUrl(ruta, 600);
    } catch (e) {
      debugPrint('Evidencia $ruta: $e');
      return null;
    }
  }

  @override
  Future<void> atenderEmergencia(String id, AccionEmergencia accion, {String? nota, String? folio}) => _intentar(
    () => cliente.rpc(
      'atender_emergencia',
      params: {'p_emergencia': id, 'p_accion': accion.clave, 'p_nota': nota, 'p_folio': folio},
    ),
  );

  @override
  void cerrar() {
    _sesion.cancel();
    _perfil.dispose();
  }
}
