import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:workmanager/workmanager.dart';

import '../config.dart';
import '../firebase_options.dart';
import 'ubicacion.dart';

/// Actualización en segundo plano (paso 4.4, opcional): solo si la persona eligió la
/// ubicación "todo el tiempo". Cada 15 minutos (el mínimo de Android) revisa su celda y
/// la sube solo si cambió.
@pragma('vm:entry-point')
void tareaEnSegundoPlano() {
  Workmanager().executeTask((tarea, datos) async {
    if (!Config.hayBackend) return true;
    try {
      await Supabase.initialize(url: Config.supabaseUrl, publishableKey: Config.supabaseKey);
      String? token;
      try {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
        token = await FirebaseMessaging.instance.getToken();
      } catch (_) {
        // sin Firebase no hay push: no tiene caso actualizar en segundo plano
        return true;
      }
      await Ubicacion.actualizarMiCelda(servicio: ServicioSupabase(Supabase.instance.client), token: token);
      return true;
    } catch (e) {
      debugPrint('Tarea en segundo plano falló: $e');
      return false;
    }
  });
}

abstract final class SegundoPlano {
  /// Solo Android: en iOS requeriría configurar BGTaskScheduler (fuera del prototipo).
  static bool get disponible => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> activar() async {
    await Workmanager().initialize(tareaEnSegundoPlano);
    await Workmanager().registerPeriodicTask(
      'celda',
      'actualizar-celda',
      frequency: const Duration(minutes: 15),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
      constraints: Constraints(networkType: NetworkType.connected),
    );
  }

  static Future<void> desactivar() async {
    await Workmanager().initialize(tareaEnSegundoPlano);
    await Workmanager().cancelByUniqueName('celda');
  }
}
