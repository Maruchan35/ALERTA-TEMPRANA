import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'catalogo.dart';
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
      throw ErrorServicio('Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    }
  }

  static String _traducir(String m) {
    final t = m.toLowerCase();
    if (t.contains('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (t.contains('token has expired') || t.contains('otp') && t.contains('invalid')) {
      return 'El código es incorrecto o ya venció.';
    }
    if (t.contains('rate limit') || t.contains('too many')) return 'Demasiados intentos. Espera un momento.';
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
      return NetworkImage(url);
    } catch (_) {
      return null; // sin permiso (p. ej. la alerta ya se resolvió) o sin conexión
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

  @override
  void cerrar() {
    _sesion.cancel();
    _perfil.dispose();
  }
}
