import 'dart:convert';
import 'dart:io' show Directory, File;
import 'dart:math' as math;

import 'package:alerta_cerca/app.dart';
import 'package:alerta_cerca/nucleo/bitacora_sos.dart';
import 'package:alerta_cerca/nucleo/copia_evidencia.dart';
import 'package:alerta_cerca/nucleo/emergencia.dart';
import 'package:alerta_cerca/nucleo/estado_app.dart';
import 'package:alerta_cerca/pantallas/detalle.dart';
import 'package:alerta_cerca/pantallas/emergencias_validador.dart';
import 'package:alerta_cerca/pantallas/evidencias.dart';
import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:crypto/crypto.dart' as crypto;
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
    Bitacoras.carpetaBase = () async => null; // sin path_provider: la bitácora vive en memoria
  });

  // Copia de la evidencia en el teléfono (CopiaEvidencia.kt): lo que hay en Descargas/ALERTA CERCA
  // y lo que la app le pidió
  var enTelefono = <Map<String, Object?>>[];
  final llamadasCopia = <MethodCall>[];

  // Los plugins nativos del SOS responden al instante (en las pruebas no hay Android)
  setUp(() {
    enTelefono = [];
    llamadasCopia.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(const MethodChannel('alerta_cerca/evidencia'), (llamada) async {
        llamadasCopia.add(llamada);
        final args = llamada.arguments is Map ? llamada.arguments as Map : const <Object?, Object?>{};
        return switch (llamada.method) {
          'listar' => enTelefono,
          'permiso' || 'puedeGuardar' || 'compartir' || 'abrir' => true,
          'guardar' => {'uri': 'content://media/external/downloads/${llamadasCopia.length}', 'nombre': args['nombre']},
          'guardarTexto' => {'uri': 'content://media/external/downloads/900', 'nombre': args['nombre']},
          'huella' => 'ab' * 32,
          _ => null,
        };
      })
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
      'alerta_cerca/evidencia',
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

  testWidgets('SOS: cada fragmento se copia al teléfono con su huella y el audio llega al servidor como audio', (
    tester,
  ) async {
    final estado = await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    final demo = estado.servicio as ServicioDemo;
    await tocar(tester, 'SOS');
    await esperarCuenta(tester);
    expect(sos.etapa, EtapaSos.activa);
    final b = sos.bitacora!;
    expect(b.carpeta, startsWith('SOS '));
    expect(b.carpeta, isNot(contains(':')), reason: 'la carpeta se puede copiar a una USB');

    final datos = utf8.encode('audio de prueba del SOS');
    await tester.runAsync(() async {
      final archivo = File('${Directory.systemTemp.path}/sos_prueba_${DateTime.now().microsecondsSinceEpoch}.m4a');
      await archivo.writeAsBytes(datos);
      await sos.agregarFragmento(
        archivo.path,
        const Duration(seconds: 6),
        tipo: 'audio',
        extension: 'm4a',
        contentType: 'audio/mp4',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300)); // la cola lo sube
    });
    final huella = crypto.sha256.convert(datos).toString();
    final copia = llamadasCopia.singleWhere((l) => l.method == 'guardar').arguments as Map;
    expect(copia['carpeta'], b.carpeta);
    expect(copia['nombre'], endsWith(' audio.m4a'));
    expect(copia['mime'], 'audio/mp4');
    expect(sos.copias, 1);
    expect(b.archivos.single.sha256, huella);
    expect(b.archivos.single.uri, isNotNull);
    final enServidor = (await demo.evidenciasEmergencia(sos.id!)).single;
    expect(enServidor.tipo, 'audio', reason: 'la versión 1.2 lo registraba como video');
    expect(enServidor.sha256, huella);

    await tocar(tester, 'ESTOY A SALVO');
    await tocar(tester, 'Sí, estoy a salvo');
    expect(b.fin, isNotNull);
    final constancia = llamadasCopia.lastWhere((l) => l.method == 'guardarTexto').arguments as Map;
    expect(constancia['carpeta'], b.carpeta, reason: 'al cerrar, la constancia queda junto a la evidencia');
    expect(constancia['texto'], contains(huella));
  });

  testWidgets('SOS: con la app abierta la sacudida pide ayuda aunque el servicio del modo protección no escuche', (
    tester,
  ) async {
    // Así quedaba al instalar una versión nueva: el modo protección "encendido" (es una preferencia),
    // Android había cerrado su servicio y la app no escuchaba porque creía que el servicio lo hacía
    final mensajero = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const metodoSensores = MethodChannel('dev.fluttercommunity.plus/sensors/method');
    const acelerometro = EventChannel('dev.fluttercommunity.plus/sensors/accelerometer');
    mensajero
      ..setMockMethodCallHandler(
        const MethodChannel('alerta_cerca/proteccion'),
        (llamada) async => switch (llamada.method) {
          'proteccionActiva' => true,
          'proteccionEscuchando' => false,
          _ => null,
        },
      )
      ..setMockMethodCallHandler(metodoSensores, (llamada) async => null);
    MockStreamHandlerEventSink? lecturas;
    mensajero.setMockStreamHandler(
      acelerometro,
      MockStreamHandler.inline(
        onListen: (_, sink) {
          lecturas = sink;
        },
      ),
    );
    addTearDown(() {
      mensajero
        ..setMockStreamHandler(acelerometro, null)
        ..setMockMethodCallHandler(metodoSensores, null);
    });

    await abrirApp(tester, {'bienvenida_vista': true, 'demo_punto': 'A'});
    expect(lecturas, isNotNull, reason: 'la app escucha el acelerómetro');
    // ~3 g: cuatro golpes fuertes en menos de un segundo (el detector mide con el reloj real)
    for (var i = 0; i < 4; i++) {
      lecturas!.success(<double>[0, 0, 30, DateTime.now().microsecondsSinceEpoch.toDouble()]);
      await tester.pump(); // entrega la lectura
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    }
    await tester.pump();
    expect(sos.etapa, EtapaSos.cuentaRegresiva);
    expect(sos.origen, OrigenEmergencia.movimiento);
    sos.cancelarCuenta();
    await tester.pump(const Duration(milliseconds: 400));
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

  // ─── Evidencia en el teléfono, para una denuncia ────────────────────────────

  BitacoraSos bitacoraDePrueba() {
    final b = BitacoraSos(id: 'e1', inicio: DateTime(2026, 10, 8, 14, 3, 5), origen: OrigenEmergencia.boton)
      ..lat = 17.9581
      ..lon = -102.1942
      ..precisionM = 12
      ..ultimaLat = 17.97
      ..ultimaLon = -102.21
      ..ultimaEn = DateTime(2026, 10, 8, 14, 39, 50)
      ..senales = 214
      ..tipo = TipoEmergencia.secuestro
      ..fin = DateTime(2026, 10, 8, 14, 40)
      ..cierre = 'La persona indicó que está a salvo'
      ..anotar('Pidió ayuda (Botón SOS)', DateTime(2026, 10, 8, 14, 3, 5))
      ..anotar('Indicó: Me llevan', DateTime(2026, 10, 8, 14, 4, 10));
    b.archivos.addAll([
      ArchivoSos(
        nombre: '14.03.12 video.mp4',
        tipo: 'video',
        inicio: DateTime(2026, 10, 8, 14, 3, 12),
        duracionS: 15,
        bytes: 3000000,
        sha256: 'a' * 64,
        uri: 'content://v/1',
      ),
      ArchivoSos(
        nombre: '14.05.40 audio.m4a',
        tipo: 'audio',
        inicio: DateTime(2026, 10, 8, 14, 5, 40),
        duracionS: 6,
        bytes: 48000,
        sha256: 'b' * 64,
        uri: 'content://a/2',
      ),
      ArchivoSos(
        nombre: '14.06.00 audio.m4a',
        tipo: 'audio',
        inicio: DateTime(2026, 10, 8, 14, 6),
        duracionS: 6,
        bytes: 48000,
        sha256: 'c' * 64,
        uri: 'content://a/3',
      ),
    ]);
    return b;
  }

  ArchivoGuardado guardado(
    String nombre,
    String uri, {
    String carpeta = 'SOS 2026-10-08 14.03.05',
    String mime = 'video/mp4',
  }) => ArchivoGuardado(
    uri: uri,
    nombre: nombre,
    carpeta: carpeta,
    mime: mime,
    bytes: 1000,
    fecha: DateTime(2026, 10, 8, 14, 3),
  );

  test('constancia: horas, lugares y la huella de cada archivo, revisada contra la de cuando se grabó', () {
    final texto = constanciaSos(
      carpeta: 'SOS 2026-10-08 14.03.05',
      bitacora: bitacoraDePrueba(),
      enTelefono: [
        guardado('14.03.12 video.mp4', 'content://v/1'),
        guardado('14.05.40 audio.m4a', 'content://a/2', mime: 'audio/mp4'),
        guardado('09.00.00 video.mp4', 'content://v/9'), // sin registro (p. ej. después de reinstalar)
        guardado('constancia.txt', 'content://d/5', mime: 'text/plain'),
      ],
      huellas: {'content://v/1': 'a' * 64, 'content://a/2': 'f' * 64, 'content://v/9': 'd' * 64},
      enServidor: {'a' * 64: DateTime(2026, 10, 8, 14, 3, 28), 'd' * 64: DateTime(2026, 10, 8, 9, 0, 20)},
      ahora: DateTime(2026, 10, 9, 10),
    );
    expect(texto, contains('Identificador: e1'));
    expect(texto, contains('Inicio: 08/10/2026 14:03:05 · Botón SOS'));
    expect(texto, contains('Lo que indicó la persona: Me llevan'));
    expect(texto, contains('17.958100, -102.194200 (± 12 m)'));
    expect(texto, contains(enlaceMapa(17.97, -102.21)));
    expect(texto, contains('14:04:10  Indicó: Me llevan'));
    expect(texto, contains('Fin: 08/10/2026 14:40:00 · La persona indicó que está a salvo'));
    expect(texto, contains('El servidor la registró a las 14:03:28'));
    expect(texto, contains('Revisado ahora: coincide'));
    expect(texto, contains('NO COINCIDE'), reason: 'el audio cambió después de grabarlo');
    expect(texto, contains('Ya no está en la carpeta'));
    expect(texto, contains('Coincide con la huella que el servidor registró a las 09:00:20'));
    expect(texto, isNot(contains('constancia.txt')), reason: 'la constancia no se lista a sí misma');
    expect(texto, contains('certutil -hashfile'));
  });

  test('bitácora: se guarda en la carpeta privada de la app y se lee igual', () async {
    final carpeta = await Directory.systemTemp.createTemp('bitacoras_');
    Bitacoras.carpetaBase = () async => carpeta;
    addTearDown(() async {
      Bitacoras.carpetaBase = () async => null;
      await carpeta.delete(recursive: true);
    });
    final b = bitacoraDePrueba();
    expect(b.carpeta, 'SOS 2026-10-08 14.03.05');
    expect(fechaDeCarpeta(b.carpeta), DateTime(2026, 10, 8, 14, 3, 5));
    await Bitacoras.guardar(b);
    b.senales++;
    await Bitacoras.guardar(b); // se reemplaza completa, sin dejar temporales
    expect((await Bitacoras.leer('e1'))!.aJson(), b.aJson());
    expect((await Bitacoras.todas()).single.id, 'e1');
    expect(carpeta.listSync().map((f) => f.uri.pathSegments.last), ['e1.json']);
  });

  test('mis evidencias: agrupa por emergencia (la más reciente primero) y separa la constancia', () {
    final grupos = agruparEvidencias(
      [
        guardado('14.05.40 audio.m4a', 'content://a/2', mime: 'audio/mp4'),
        guardado('14.03.12 video.mp4', 'content://v/1'),
        guardado('constancia.txt', 'content://d/5', mime: 'text/plain'),
        guardado('20.00.00 video.mp4', 'content://v/7', carpeta: 'SOS 2026-10-09 20.00.00'),
        guardado('foto.jpg', 'content://i/8', carpeta: 'Otra carpeta', mime: 'image/jpeg'),
      ],
      [bitacoraDePrueba(), BitacoraSos(id: 'e3', inicio: DateTime(2026, 10, 10, 8), origen: OrigenEmergencia.atajo)],
    );
    expect(grupos.map((g) => g.carpeta), [
      'SOS 2026-10-10 08.00.00',
      'SOS 2026-10-09 20.00.00',
      'SOS 2026-10-08 14.03.05',
    ]);
    expect(
      grupos.first.archivos,
      isEmpty,
      reason: 'con bitácora aunque no haya copia: la constancia se comparte igual',
    );
    final primera = grupos.last;
    expect((primera.videos, primera.audios), (1, 1));
    expect(primera.archivos.map((a) => a.nombre), ['14.03.12 video.mp4', '14.05.40 audio.m4a'], reason: 'en orden');
    expect(primera.constancia?.uri, 'content://d/5');
    expect(primera.bitacora?.id, 'e1');
  });

  testWidgets('mis evidencias: "Compartir para la denuncia" revisa las huellas, deja la constancia y comparte todo', (
    tester,
  ) async {
    final hora = DateTime(2026, 10, 8, 14, 3, 27).millisecondsSinceEpoch;
    enTelefono = [
      {
        'uri': 'content://v/1',
        'nombre': '14.03.12 video.mp4',
        'carpeta': 'SOS 2026-10-08 14.03.05',
        'mime': 'video/mp4',
        'bytes': 3000000,
        'fecha': hora,
      },
      {
        'uri': 'content://a/2',
        'nombre': '14.05.40 audio.m4a',
        'carpeta': 'SOS 2026-10-08 14.03.05',
        'mime': 'audio/mp4',
        'bytes': 48000,
        'fecha': hora,
      },
    ];
    SharedPreferences.setMockInitialValues({});
    final control = ControlEmergencia(
      servicio: ServicioDemo(iniciarReloj: false),
      prefs: await SharedPreferences.getInstance(),
    );
    await tester.pumpWidget(
      AlcanceSos(
        control: control,
        child: const MaterialApp(home: PantallaEvidencias()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('SOS 08/10/2026 14:03'), findsOneWidget);
    expect(find.textContaining('1 video · 1 audio'), findsOneWidget);

    await tester.tap(find.text('Compartir para la denuncia'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(llamadasCopia.where((l) => l.method == 'huella'), hasLength(2));
    final constancia = llamadasCopia.singleWhere((l) => l.method == 'guardarTexto').arguments as Map;
    expect(constancia['carpeta'], 'SOS 2026-10-08 14.03.05');
    expect(constancia['texto'], contains('CONSTANCIA DE EVIDENCIA'));
    final compartido = llamadasCopia.singleWhere((l) => l.method == 'compartir').arguments as Map;
    expect(compartido['uris'], ['content://v/1', 'content://a/2', 'content://media/external/downloads/900']);
  });
}
