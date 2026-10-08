import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';

/// `?a11y` activa el árbol de accesibilidad desde el inicio (lectores de pantalla y pruebas).
SemanticsHandle? manejadorAccesibilidad;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb && Uri.base.queryParameters.containsKey('a11y')) {
    manejadorAccesibilidad = SemanticsBinding.instance.ensureSemantics();
  }
  Intl.defaultLocale = 'es_MX';
  await initializeDateFormatting('es_MX');

  final ServicioAlertas servicio;
  if (Config.hayBackend) {
    await Supabase.initialize(url: Config.supabaseUrl, publishableKey: Config.supabaseKey);
    servicio = ServicioSupabase(Supabase.instance.client);
    await servicio.recargarPerfil();
  } else {
    servicio = ServicioDemo(escenario: EscenarioDemo.panel);
  }
  runApp(PanelApp(servicio: servicio));
}
