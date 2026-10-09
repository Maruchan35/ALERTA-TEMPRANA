import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:panel_validadores/app.dart';

/// Panel de validadores en MODO DEMOSTRACIÓN (sin backend, sin red).
void main() {
  setUpAll(() async {
    await initializeDateFormatting('es_MX');
    MapaAlertas.mostrarMosaicos = false;
  });

  testWidgets('acceso → cola de validación → verificar el reporte del menor', (tester) async {
    tester.view.physicalSize = const Size(1440, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final servicio = ServicioDemo(escenario: EscenarioDemo.panel, iniciarReloj: false);
    await tester.pumpWidget(PanelApp(servicio: servicio));
    await tester.pump();

    expect(find.text('Panel de validadores'), findsOneWidget);
    expect(find.textContaining('MODO DEMOSTRACIÓN'), findsOneWidget);
    await tester.tap(find.text('Entrar'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('ALERTA CERCA · Panel de validadores'), findsOneWidget);
    expect(find.text('Por validar (1)'), findsOneWidget);
    expect(find.text('Activas (4)'), findsOneWidget);
    expect(find.text('Emitir alerta oficial'), findsOneWidget);

    await tester.tap(find.text('Niño de 8 años, playera roja y short azul'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Verificar'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.textContaining('911-2026-04817'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.textContaining('911-2026-04817'), findsOneWidget);

    await tester.tap(find.text('Verificar'));
    await tester.pump(const Duration(seconds: 1));
    final lista = await servicio.flujoPanel().first;
    final menor = lista.firstWhere((a) => a.categoria == 'menor_desaparecido');
    expect(menor.estado, EstadoAlerta.verificada);
    expect(menor.nEntregas, 1, reason: 'el teléfono A (300 m) la recibe al instante');

    // Se desmonta la interfaz antes de cerrar el servicio (sus notificadores siguen escuchados)
    await tester.pumpWidget(const SizedBox());
    servicio.cerrar();
  });

  testWidgets('SOS: alarma con banner rojo, recorrido en el mapa y tomar el caso', (tester) async {
    tester.view.physicalSize = const Size(1440, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final servicio = ServicioDemo(escenario: EscenarioDemo.panel, iniciarReloj: false);
    await tester.pumpWidget(PanelApp(servicio: servicio));
    await tester.pump();
    await tester.tap(find.text('Entrar'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('SOS (0)'), findsOneWidget);
    expect(find.byType(BannerEmergencias), findsNothing);

    // Una persona pide ayuda (simulador): banner rojo y aviso
    servicio.simularEmergencia();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('1 emergencia SOS abierta · 1 sin tomar'), findsOneWidget);
    expect(find.text('SOS (1)'), findsOneWidget);
    expect(find.textContaining('Una persona pidió ayuda (SOS)'), findsOneWidget);

    // Banner → seguimiento: el detalle reemplaza a la lista y el mapa grande dibuja el recorrido
    await tester.tap(find.byType(BannerEmergencias));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Tomar el caso'), findsOneWidget);
    expect(find.text('Copiar ubicación'), findsOneWidget);
    expect(
      find.descendant(of: find.byType(FlutterMap), matching: find.byIcon(Icons.sos)),
      findsOneWidget,
      reason: 'la última ubicación de la persona, en el mapa grande',
    );

    await tester.tap(find.text('Tomar el caso'));
    await tester.pump(const Duration(milliseconds: 500));
    expect((await servicio.flujoEmergencias().first).single.estado, EstadoEmergencia.enSeguimiento);
    expect(find.text('1 emergencia SOS abierta · en seguimiento'), findsOneWidget);
    expect(find.text('Tomar el caso'), findsNothing);

    await tester.pumpWidget(const SizedBox());
    servicio.cerrar();
  });
}
