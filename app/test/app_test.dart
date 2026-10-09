import 'dart:math' as math;

import 'package:alerta_cerca/app.dart';
import 'package:alerta_cerca/nucleo/emergencia.dart';
import 'package:alerta_cerca/nucleo/estado_app.dart';
import 'package:alerta_cerca/pantallas/detalle.dart';
import 'package:alerta_cerca/pantallas/emergencias_validador.dart';
import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pruebas de la app en MODO DEMOSTRACIÓN (sin backend, sin red: no se descargan mosaicos).
void main() {
  setUpAll(() async {
    await initializeDateFormatting('es_MX');
    MapaAlertas.mostrarMosaicos = false;
  });

  // Los plugins nativos del SOS responden al instante (en las pruebas no hay Android)
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(const MethodChannel('alerta_cerca/proteccion'), (llamada) async => null)
      ..setMockMethodCallHandler(const MethodChannel('dev.fluttercommunity.plus/battery'), (llamada) async => 80)
      // Sin cámaras: el SOS sigue (ubicación y 911) y lo dice en pantalla
      ..setMockMethodCallHandler(const MethodChannel('plugins.flutter.io/camera'), (llamada) async => null)
      // Micrófono (record): sin permiso en las pruebas, así el grabador de audio no arranca
      ..setMockMethodCallHandler(const MethodChannel('com.llfbandit.record/messages'), (llamada) async {
        if (llamada.method == 'hasPermission' || llamada.method == 'isRecording') return false;
        return null;
      });
  });

  tearDown(() {
    for (final canal in [
      'alerta_cerca/proteccion',
      'dev.fluttercommunity.plus/battery',
      'plugins.flutter.io/camera',
      'com.llfbandit.record/messages',
    ]) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(canal),
        null,
      );
    }
  });

  late ControlEmergencia sos;

  Future<EstadoApp> abrirApp(WidgetTester tester, Map<String, Object> preferencias) async {
    SharedPreferences.setMockInitialValues(preferencias);
    final servicio = ServicioDemo(iniciarReloj: false);
    final estado = EstadoApp(servicio: servicio, firebaseListo: false);
    sos = ControlEmergencia(servicio: servicio, prefs: await SharedPreferences.getInstance());
    await tester.pumpWidget(AlertaCercaApp(estado: estado, sos: sos));
    await estado.iniciar();
    await tester.pump(const Duration(seconds: 1));
    return estado;
  }

  /// Deja correr la cuenta regresiva (5 s) y el envío.
  Future<void> esperarCuenta(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Toca un texto aunque esté más abajo en la lista (la desplaza hasta que aparece).
  Future<void> tocar(WidgetTester tester, String texto) async {
    final f = find.text(texto, skipOffstage: false);
    if (f.evaluate().isEmpty) {
      // Sin gestos: en el seguimiento, el arrastre caería sobre el mapa
      final lista = tester.state<ScrollableState>(find.byType(Scrollable).first);
      for (var i = 0; i < 20 && f.evaluate().isEmpty; i++) {
        lista.position.jumpTo(math.min(lista.position.pixels + 200, lista.position.maxScrollExtent));
        await tester.pump();
      }
    }
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('la primera vez muestra la bienvenida con el aviso del 911', (tester) async {
    await abrirApp(tester, {});
    expect(find.text('Si algo importante pasa cerca de ti, te avisamos'), findsOneWidget);
    expect(find.text('Siguiente'), findsOneWidget);
    expect(find.text('Aviso de privacidad'), findsOneWidget);
  });

  testWidgets('inicio: alertas cercanas ordenadas, aviso fijo del 911 y botón Reportar', (tester) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    expect(estado.miCelda, '9epq4t', reason: 'el punto A cae en la celda 9epq4t');
    expect(find.textContaining('Recibes alertas: aquí'), findsOneWidget);
    expect(find.textContaining('Modo demostración'), findsOneWidget);
    expect(find.text('Humo en una bodega de la colonia Centro'), findsOneWidget);
    expect(find.text('Nissan Versa gris, placas DEMO-123'), findsOneWidget);
    expect(find.text('NO CONFIRMADA'), findsWidgets);
    expect(find.text('VERIFICADA'), findsWidgets);
    expect(find.text('ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales.'), findsOneWidget);
    expect(find.text('Reportar'), findsOneWidget);
  });

  testWidgets('detalle: insignia, qué hacer y acciones de la comunidad', (tester) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    final incendio = estado.alertas.firstWhere((a) => a.categoria == 'incendio');
    await tester.pumpWidget(
      AlcanceApp(
        estado: estado,
        child: MaterialApp(
          home: PantallaDetalle(alertaId: incendio.id, inicial: incendio),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('INCENDIO'), findsOneWidget);
    expect(find.text('Reporte ciudadano sin confirmar'), findsOneWidget);
    expect(find.text('Qué hacer'), findsOneWidget);
    expect(find.text('Yo también lo vi'), findsOneWidget);
    expect(find.text('Llamar al 911'), findsOneWidget);
    expect(find.text('Compartir con contexto'), findsOneWidget);
  });

  // ─── Modo emergencia (SOS) ────────────────────────────────────────────────

  testWidgets('SOS: el botón rojo abre una cuenta regresiva de 5 s que se puede cancelar', (tester) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    await tocar(tester, 'SOS');
    expect(find.text('PEDIR AYUDA'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('4'), findsOneWidget);
    await tocar(tester, 'CANCELAR');
    expect(sos.etapa, EtapaSos.inactiva);
    expect(find.text('PEDIR AYUDA'), findsNothing);
    expect(await (estado.servicio as ServicioDemo).flujoEmergencias().first, isEmpty, reason: 'no avisó a nadie');
  });

  testWidgets('SOS: pide ayuda, la persona indica qué pasa y termina "Estoy a salvo"', (tester) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    final demo = estado.servicio as ServicioDemo;
    await tocar(tester, 'SOS');
    await esperarCuenta(tester);
    expect(sos.etapa, EtapaSos.activa);
    expect(find.text('SOS ACTIVO'), findsOneWidget);
    expect(find.text('LLAMAR AL 911'), findsOneWidget);
    expect(find.text('Tu alerta llegó'), findsOneWidget);
    expect(find.textContaining('Cámara no disponible'), findsOneWidget, reason: 'en las pruebas no hay cámara');
    final abierta = (await demo.flujoEmergencias().first).single;
    expect(abierta.origen, OrigenEmergencia.boton);
    expect(abierta.lat, puntosDemo.first.lat, reason: 'la ubicación (simulada) del punto A');

    await tocar(tester, 'Me llevan');
    expect((await demo.flujoEmergencias().first).single.tipo, TipoEmergencia.secuestro);

    await tocar(tester, 'ESTOY A SALVO');
    await tocar(tester, 'Sí, estoy a salvo');
    expect(find.textContaining('Marcaste que estás a salvo'), findsOneWidget);
    final cerrada = (await demo.flujoEmergencias().first).single;
    expect(cerrada.cierre, CierreEmergencia.aSalvo);
    await tocar(tester, 'Cerrar');
    expect(sos.etapa, EtapaSos.inactiva);
    expect(find.text('Emergencia cerrada'), findsNothing);
  });

  testWidgets('SOS: con la protección por PIN pero sin bloqueo en el teléfono, no deja a la persona atrapada', (
    tester,
  ) async {
    // sos_pin_cancelar está activado por defecto, pero Autenticacion.disponible() es false en las
    // pruebas (sin huella/PIN): la persona debe poder cancelar igual (confirmando en el diálogo).
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    expect(sos.pinActivado, isFalse, reason: 'sin bloqueo en el teléfono, no se exige PIN');
    await tocar(tester, 'SOS');
    await esperarCuenta(tester);
    expect(sos.etapa, EtapaSos.activa);
    await tocar(tester, 'ESTOY A SALVO');
    await tocar(tester, 'Sí, estoy a salvo');
    expect(sos.etapa, EtapaSos.terminada, reason: 'se terminó sin pedir PIN (no hay bloqueo)');
    final e = (await (estado.servicio as ServicioDemo).flujoEmergencias().first).single;
    expect(e.cierre, CierreEmergencia.aSalvo);
  });

  testWidgets('SOS: el simulacro se ve igual pero no avisa a nadie', (tester) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    sos.iniciarCuenta(OrigenEmergencia.boton, simulacro: true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('SIMULACRO'), findsOneWidget);
    await esperarCuenta(tester);
    expect(find.text('SIMULACRO · SOS'), findsOneWidget);
    expect(await (estado.servicio as ServicioDemo).flujoEmergencias().first, isEmpty);
    await tocar(tester, 'ESTOY A SALVO');
    await tocar(tester, 'Sí, estoy a salvo');
    expect(sos.etapa, EtapaSos.inactiva);
    expect(find.text('SIMULACRO · SOS'), findsNothing);
  });

  testWidgets('validador: seguimiento en vivo, toma el caso y registra el aviso al 911', (tester) async {
    final servicio = ServicioDemo(escenario: EscenarioDemo.panel, iniciarReloj: false, sembrar: false);
    // El acceso de la demo espera 300 ms de verdad: fuera del reloj simulado de la prueba
    await tester.runAsync(() => servicio.iniciarSesionCorreo('validador1@example.com', 'demo'));
    final id = servicio.simularEmergencia();
    await tester.pumpWidget(
      MaterialApp(
        home: PantallaSeguimientoEmergencia(servicio: servicio, emergenciaId: id),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('EMERGENCIA SOS'), findsOneWidget);
    expect(find.textContaining('Llamar a la persona (+520000000000)', skipOffstage: false), findsOneWidget);
    await tocar(tester, 'Tomar el caso');
    expect((await servicio.flujoEmergencias().first).single.estado, EstadoEmergencia.enSeguimiento);
    expect(find.text('Tomar el caso'), findsNothing);

    await tocar(tester, 'Avisé al 911');
    await tester.enterText(find.byType(TextField), 'F-911-42');
    await tocar(tester, 'Registrar aviso');
    final e = (await servicio.flujoEmergencias().first).single;
    expect(e.folio911, 'F-911-42');
    expect(e.policiaAvisadaEn, isNotNull);
    servicio.cerrar();
  });
}
