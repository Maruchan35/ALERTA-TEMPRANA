// ARCHIVO DE RELLENO. Lo reemplaza el comando (paso 1.7 de la propuesta):
//
//   flutterfire configure --project=TU-PROYECTO-FIREBASE --platforms=android,ios
//
// Mientras no exista la configuración real, la app funciona sin notificaciones push:
// con la app abierta sigue recibiendo las alertas en tiempo real.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform =>
      throw UnsupportedError('Firebase no está configurado. Ejecuta: flutterfire configure');
}
