import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:sensors_plus/sensors_plus.dart';

/// Puente con Android para el modo emergencia (MainActivity.kt y ModoProteccionService.kt).
/// En la web, en iOS y en las pruebas no hay canal: todo responde "no disponible" sin fallar.
abstract final class Proteccion {
  static const _canal = MethodChannel('alerta_cerca/proteccion');

  /// Disparos del SOS que llegan de Android con la app abierta: sacudida (modo protección),
  /// botón de la notificación fija o atajo del ícono.
  static final disparos = StreamController<OrigenEmergencia>.broadcast();
  static var _escuchando = false;

  static bool get disponible => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static void escucharDisparos() {
    if (!disponible || _escuchando) return;
    _escuchando = true;
    _canal.setMethodCallHandler((llamada) async {
      if (llamada.method == 'disparo') disparos.add(OrigenEmergencia.desde(llamada.arguments as String?));
    });
  }

  static Future<T?> _llamar<T>(String metodo, [Object? argumentos]) async {
    if (!disponible) return null;
    try {
      return await _canal.invokeMethod<T>(metodo, argumentos);
    } on MissingPluginException {
      return null;
    } on PlatformException catch (e) {
      debugPrint('Protección: $metodo falló: ${e.message}');
      return null;
    }
  }

  /// El disparo con el que se abrió la app (sacudida con la app cerrada o atajo), si hubo.
  static Future<OrigenEmergencia?> pendiente() async {
    final o = await _llamar<String>('pendiente');
    return o == null ? null : OrigenEmergencia.desde(o);
  }

  /// Modo protección: detectar la sacudida con la app cerrada (servicio con notificación fija).
  static Future<bool> activarProteccion() async => await _llamar<bool>('activarProteccion') ?? false;
  static Future<void> desactivarProteccion() => _llamar<bool>('desactivarProteccion');
  static Future<bool> proteccionActiva() async => await _llamar<bool>('proteccionActiva') ?? false;

  /// Mientras hay una emergencia, la app se muestra encima de la pantalla de bloqueo.
  static Future<void> sobrePantallaBloqueada(bool si) => _llamar<void>('sobrePantallaBloqueada', si);

  /// Android 14+: sin este permiso la cuenta regresiva no aparece sola con el teléfono bloqueado.
  static Future<bool> puedePantallaCompleta() async => await _llamar<bool>('puedePantallaCompleta') ?? true;
  static Future<void> abrirAjustePantallaCompleta() => _llamar<void>('abrirAjustePantallaCompleta');

  /// Vibra aunque la persona haya apagado la vibración al tocar la pantalla.
  static Future<void> vibrar([int ms = 300]) async {
    if (disponible) {
      await _llamar<void>('vibrar', ms);
    } else {
      await HapticFeedback.heavyImpact();
    }
  }

  /// Servicio de micrófono: deja grabar el audio del SOS con la pantalla apagada (Android 14+).
  static Future<void> iniciarMicrofono() => _llamar<void>('iniciarMicrofono');
  static Future<void> detenerMicrofono() => _llamar<void>('detenerMicrofono');
}

/// Huella o PIN del teléfono para detener un SOS: así un ladrón no lo puede cancelar.
abstract final class Autenticacion {
  static final _auth = LocalAuthentication();

  /// El teléfono tiene huella, PIN, patrón o contraseña configurados.
  static Future<bool> disponible() async {
    if (kIsWeb) return false;
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  /// Pide huella o PIN. true = es la persona dueña. Un error o un "cancelar" devuelven false.
  static Future<bool> confirmar(String razon) async {
    if (kIsWeb) return true;
    try {
      return await _auth.authenticate(localizedReason: razon, biometricOnly: false, persistAcrossBackgrounding: true);
    } on PlatformException catch (e) {
      debugPrint('Autenticación: ${e.message}');
      return false;
    } catch (_) {
      return false;
    }
  }
}

/// Con la app abierta: escucha el acelerómetro y avisa cuando hay una sacudida fuerte.
class EscuchaSacudidas {
  EscuchaSacudidas(this.alSacudir);

  final VoidCallback alSacudir;
  final _detector = DetectorSacudida();
  StreamSubscription<AccelerometerEvent>? _suscripcion;

  bool get activa => _suscripcion != null;

  void iniciar() {
    if (_suscripcion != null || kIsWeb) return;
    try {
      _suscripcion = accelerometerEventStream(samplingPeriod: SensorInterval.gameInterval).listen(
        (e) {
          if (_detector.agregar(e.x, e.y, e.z, DateTime.now())) alSacudir();
        },
        onError: (Object _) => detener(),
        cancelOnError: true,
      );
    } catch (_) {
      _suscripcion = null; // el teléfono no tiene acelerómetro (o es una prueba)
    }
  }

  void detener() {
    _suscripcion?.cancel();
    _suscripcion = null;
  }
}
