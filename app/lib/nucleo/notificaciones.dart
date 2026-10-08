import 'dart:async';
import 'dart:math';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../firebase_options.dart';
import 'preferencias.dart';

final _plugin = FlutterLocalNotificationsPlugin();

const _ajustes = InitializationSettings(
  android: AndroidInitializationSettings('@drawable/ic_notificacion'),
  iOS: DarwinInitializationSettings(
    requestAlertPermission: false,
    requestBadgePermission: false,
    requestSoundPermission: false,
  ),
);

/// Un canal por nivel (paso 2.7). Android los crea una sola vez: si cambian la importancia
/// de un canal, desinstalen la app para verlo.
const canales = {
  4: AndroidNotificationChannel(
    'nivel4',
    'Alertas críticas',
    description: 'Menores desaparecidos, evacuaciones y fenómenos naturales',
    importance: Importance.max,
  ),
  3: AndroidNotificationChannel(
    'nivel3',
    'Alertas altas',
    description: 'Incendios, inundaciones, robos de vehículo, personas desaparecidas',
    importance: Importance.high,
  ),
  2: AndroidNotificationChannel(
    'nivel2',
    'Alertas y actualizaciones',
    description: 'Accidentes, riesgos ambientales, cierres y actualizaciones',
    importance: Importance.defaultImportance,
  ),
  1: AndroidNotificationChannel(
    'nivel1',
    'Informativas',
    description: 'Avisos de baja prioridad',
    importance: Importance.low,
  ),
};

/// Aviso que se muestra dentro de la app (web, o con la app abierta).
class AvisoVisible {
  const AvisoVisible({required this.alertaId, required this.titulo, required this.cuerpo, required this.nivel});

  final String alertaId;
  final String titulo;
  final String cuerpo;
  final int nivel;
}

abstract final class Notificaciones {
  /// La persona tocó una notificación: id de la alerta que hay que abrir.
  static final alTocar = StreamController<String>.broadcast();

  /// Avisos para mostrar como banner dentro de la app (web).
  static final enPantalla = StreamController<AvisoVisible>.broadcast();

  /// Llegó una alerta con la app abierta: hay que refrescar la lista.
  static final recibidaEnPrimerPlano = StreamController<String>.broadcast();

  /// Si la app se abrió desde una notificación, la alerta que hay que mostrar.
  static String? pendiente;

  static bool _listo = false;

  static Future<void> inicializar({bool segundoPlano = false}) async {
    if (kIsWeb || _listo) return;
    await _plugin.initialize(
      settings: _ajustes,
      onDidReceiveNotificationResponse: (r) {
        if (r.payload != null) alTocar.add(r.payload!);
      },
    );
    _listo = true;
    if (segundoPlano) return;
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    for (final c in canales.values) {
      await android?.createNotificationChannel(c);
    }
    final lanzamiento = await _plugin.getNotificationAppLaunchDetails();
    if (lanzamiento?.didNotificationLaunchApp ?? false) {
      pendiente = lanzamiento!.notificationResponse?.payload;
    }
  }

  /// Pide permiso de notificaciones (Android 13+ e iOS). Devuelve si se concedió.
  static Future<bool> pedirPermiso({bool conFirebase = false}) async {
    if (kIsWeb) return true;
    if (conFirebase) await FirebaseMessaging.instance.requestPermission();
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) return await android.requestNotificationsPermission() ?? false;
    final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
  }

  /// Notificación de prueba en el canal de alertas altas: confirma permiso, canal y sonido
  /// sin pasar por el servidor (no abre ninguna alerta al tocarla).
  static Future<void> probar() async {
    const titulo = 'PRUEBA · ALERTA CERCA';
    const cuerpo = 'Así se verá una alerta cerca de ti. No es real.';
    if (kIsWeb) {
      enPantalla.add(const AvisoVisible(alertaId: '', titulo: titulo, cuerpo: cuerpo, nivel: 3));
      return;
    }
    final canal = canales[3]!;
    await _plugin.show(
      id: 7,
      title: titulo,
      body: cuerpo,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          canal.id,
          canal.name,
          channelDescription: canal.description,
          importance: canal.importance,
          priority: Priority.max,
          color: colorNivel(3),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  /// WhatsApp simulado: el código "llega" como notificación, igual que llegaría un mensaje.
  static Future<void> mensajeWhatsapp(String texto) async {
    if (kIsWeb || !_listo) return;
    final canal = canales[3]!;
    await _plugin.show(
      id: 8,
      title: 'WhatsApp · ALERTA CERCA (simulado)',
      body: texto,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          canal.id,
          canal.name,
          channelDescription: canal.description,
          importance: canal.importance,
          priority: Priority.high,
          color: const Color(0xFF25D366),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  static Future<bool> permitidas() async {
    if (kIsWeb) return true;
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    return await android?.areNotificationsEnabled() ?? true;
  }
}

/// Arma y muestra la notificación a partir del campo `data` del push (contrato 7.2).
/// La DISTANCIA se calcula aquí, en el teléfono: el servidor nunca supo dónde estoy.
/// Se usa igual para FCM (abierta, cerrada o en segundo plano), Realtime y la demo.
Future<void> procesarAlerta(Map<String, dynamic> d, {bool enPrimerPlano = true}) async {
  final alertaId = d['alerta_id']?.toString();
  if (alertaId == null) return;
  final prefs = await SharedPreferences.getInstance();
  var nivel = int.tryParse('${d['nivel']}') ?? 2;
  final titulo = '${d['titulo'] ?? 'ALERTA CERCA'}';
  var cuerpo = '${d['cuerpo'] ?? ''}';

  switch (d['tipo']) {
    case 'nueva':
      final lat = double.tryParse('${d['lat']}');
      final lon = double.tryParse('${d['lon']}');
      final cercana = lat == null || lon == null ? null : distanciaMasCercana(prefs, lat, lon);
      if (cercana != null) {
        final radio = double.tryParse('${d['radio_m']}') ?? 0;
        // Llegó por el margen de celda (+700 m) pero estoy fuera del radio: aviso normal, sin alarma
        if (cercana.metros > radio) nivel = min(nivel, 2);
        final lugar = cercana.zona == null ? 'de ti' : 'de "${cercana.zona}"';
        cuerpo =
            'A ${formatoDistancia(cercana.metros)} $lugar · '
            '${EstadoAlerta.desde('${d['estado']}').legible} · $cuerpo';
      } else {
        cuerpo = '${EstadoAlerta.desde('${d['estado']}').legible} · $cuerpo';
      }
    case 'validacion':
      nivel = 3;
    default: // actualizacion, cierre: informan, no alarman
      nivel = min(nivel, 2);
  }

  // En la web (sin notificaciones del sistema) el aviso se muestra dentro de la app
  if (kIsWeb) {
    Notificaciones.enPantalla.add(AvisoVisible(alertaId: alertaId, titulo: titulo, cuerpo: cuerpo, nivel: nivel));
    return;
  }
  if (enPrimerPlano) Notificaciones.recibidaEnPrimerPlano.add(alertaId);
  final canal = canales[nivel.clamp(1, 4)]!;
  await _plugin.show(
    id: alertaId.hashCode & 0x7fffffff, // la misma alerta reemplaza su notificación (p. ej. RESUELTA)
    title: titulo,
    body: cuerpo,
    payload: alertaId,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        canal.id,
        canal.name,
        channelDescription: canal.description,
        importance: canal.importance,
        priority: nivel >= 3 ? Priority.max : Priority.defaultPriority,
        color: colorNivel(nivel),
        category: nivel >= 4 ? AndroidNotificationCategory.alarm : AndroidNotificationCategory.event,
        styleInformation: BigTextStyleInformation(cuerpo),
        ticker: titulo,
      ),
      iOS: DarwinNotificationDetails(
        interruptionLevel: nivel >= 4 ? InterruptionLevel.timeSensitive : InterruptionLevel.active,
      ),
    ),
  );
}

/// Con la app cerrada o en segundo plano (Android). Debe ser una función de primer nivel.
@pragma('vm:entry-point')
Future<void> alRecibirEnSegundoPlano(RemoteMessage m) async {
  // En iOS el sistema ya mostró la notificación del campo `notification`
  if (m.notification != null && defaultTargetPlatform == TargetPlatform.iOS) return;
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await Notificaciones.inicializar(segundoPlano: true);
  await procesarAlerta(m.data, enPrimerPlano: false);
}
