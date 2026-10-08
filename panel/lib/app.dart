import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'pantallas/acceso.dart';
import 'pantallas/tablero.dart';

final mensajero = GlobalKey<ScaffoldMessengerState>();

void mostrarMensaje(String texto, {bool error = false}) {
  mensajero.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(texto),
        backgroundColor: error ? Colores.rojo : null,
        width: 520,
        duration: Duration(seconds: error ? 6 : 4),
      ),
    );
}

/// Ejecuta una acción mostrando el error de forma legible si falla.
Future<bool> intentar(Future<void> Function() accion, {String? exito}) async {
  try {
    await accion();
    if (exito != null) mostrarMensaje(exito);
    return true;
  } on ErrorServicio catch (e) {
    mostrarMensaje(e.mensaje, error: true);
  } catch (e) {
    mostrarMensaje('Algo salió mal: $e', error: true);
  }
  return false;
}

class PanelApp extends StatelessWidget {
  const PanelApp({super.key, required this.servicio});

  final ServicioAlertas servicio;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ALERTA CERCA · Panel de validadores',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: mensajero,
      theme: temaAlertaCerca(),
      locale: const Locale('es', 'MX'),
      supportedLocales: const [Locale('es', 'MX'), Locale('es')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      // Solo validadores, instituciones o admin: si no, de vuelta al acceso
      home: ValueListenableBuilder<Perfil?>(
        valueListenable: servicio.perfil,
        builder: (context, perfil, _) => perfil != null && perfil.rol.esValidador
            ? PantallaTablero(servicio: servicio, perfil: perfil)
            : PantallaAcceso(servicio: servicio),
      ),
    );
  }
}
