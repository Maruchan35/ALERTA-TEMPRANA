import 'package:alerta_cerca/app.dart';
import 'package:alerta_cerca/nucleo/estado_app.dart';
import 'package:alerta_cerca/pantallas/detalle.dart';
import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pruebas de la app en MODO DEMOSTRACIÓN (sin backend, sin red: no se descargan mosaicos).
void main() {
  setUpAll(() async {
    await initializeDateFormatting('es_MX');
    MapaAlertas.mostrarMosaicos = false;
  });

  Future<EstadoApp> abrirApp(WidgetTester tester, Map<String, Object> preferencias) async {
    SharedPreferences.setMockInitialValues(preferencias);
    final estado = EstadoApp(servicio: ServicioDemo(iniciarReloj: false), firebaseListo: false);
    await tester.pumpWidget(AlertaCercaApp(estado: estado));
    await estado.iniciar();
    await tester.pump(const Duration(seconds: 1));
    return estado;
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
}
