import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'firebase_options.dart';
import 'nucleo/emergencia.dart';
import 'nucleo/estado_app.dart';
import 'nucleo/notificaciones.dart';

/// En la web, `?a11y` activa el árbol de accesibilidad desde el inicio (lectores de
/// pantalla y pruebas automáticas en el navegador).
SemanticsHandle? manejadorAccesibilidad;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb && Uri.base.queryParameters.containsKey('a11y')) {
    manejadorAccesibilidad = SemanticsBinding.instance.ensureSemantics();
  }
  Intl.defaultLocale = 'es_MX';
  await initializeDateFormatting('es_MX');

  // Push con FCM (Android e iOS). Sin `flutterfire configure` la app funciona igual:
  // con la app abierta recibe las alertas en tiempo real.
  var firebaseListo = false;
  if (!kIsWeb) {
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      FirebaseMessaging.onBackgroundMessage(alRecibirEnSegundoPlano);
      firebaseListo = true;
    } catch (e) {
      debugPrint('ALERTA CERCA sin Firebase: $e');
    }
  }

  // Backend real (Supabase) o modo demostración (todo en memoria, sin cuentas)
  final ServicioAlertas servicio;
  if (Config.hayBackend) {
    await Supabase.initialize(url: Config.supabaseUrl, publishableKey: Config.supabaseKey);
    servicio = ServicioSupabase(Supabase.instance.client);
  } else {
    servicio = ServicioDemo();
  }

  final estado = EstadoApp(servicio: servicio, firebaseListo: firebaseListo);
  // Modo emergencia (SOS): disponible desde el primer segundo, aun sin terminar la bienvenida
  final sos = ControlEmergencia(servicio: servicio, prefs: await SharedPreferences.getInstance());
  WidgetsBinding.instance.addObserver(estado);
  runApp(AlertaCercaApp(estado: estado, sos: sos));
  await estado.iniciar();
}
