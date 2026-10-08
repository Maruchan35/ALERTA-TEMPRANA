import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';

Future<void> llamar911() async {
  final ok = await launchUrl(Uri.parse('tel:911'));
  if (!ok) mostrarMensaje('No se pudo abrir el marcador. Marca 911 desde tu teléfono.');
}

void mostrarMensaje(String texto, {bool error = false}) {
  mensajero.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(texto),
        backgroundColor: error ? Colores.rojo : null,
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

/// Pide un texto (motivo de cierre, nombre de zona...).
Future<String?> pedirTexto(
  BuildContext context, {
  required String titulo,
  required String etiqueta,
  String? ayuda,
  String? inicial,
  bool obligatorio = true,
  String accion = 'Aceptar',
  List<String> sugerencias = const [],
}) {
  final c = TextEditingController(text: inicial);
  return showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(titulo),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (ayuda != null) ...[Text(ayuda), const SizedBox(height: 12)],
            TextField(
              controller: c,
              autofocus: true,
              maxLength: 300,
              decoration: InputDecoration(labelText: etiqueta),
              onChanged: (_) => setState(() {}),
            ),
            if (sugerencias.isNotEmpty)
              Wrap(
                spacing: 6,
                children: [
                  for (final s in sugerencias) ActionChip(label: Text(s), onPressed: () => setState(() => c.text = s)),
                ],
              ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(
            onPressed: obligatorio && c.text.trim().isEmpty ? null : () => Navigator.pop(context, c.text.trim()),
            child: Text(accion),
          ),
        ],
      ),
    ),
  );
}

Future<bool> confirmar(
  BuildContext context, {
  required String titulo,
  required String texto,
  String accion = 'Sí',
}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(titulo),
      content: Text(texto),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(accion)),
      ],
    ),
  );
  return r ?? false;
}

/// Encabezado de sección en listas.
class Seccion extends StatelessWidget {
  const Seccion(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
    child: Text(
      texto.toUpperCase(),
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        letterSpacing: 1,
        color: Theme.of(context).colorScheme.primary,
      ),
    ),
  );
}

/// Aviso fijo del modo demostración.
class BannerDemo extends StatelessWidget {
  const BannerDemo({super.key, required this.texto, this.accion, this.alPresionar});

  final String texto;
  final String? accion;
  final VoidCallback? alPresionar;

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xFFEDE7F6),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
      child: Row(
        children: [
          const Icon(Icons.science_outlined, size: 18, color: Colores.morado),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(fontSize: 12.5, color: Colores.morado, fontWeight: FontWeight.w600),
            ),
          ),
          if (accion != null)
            TextButton(
              onPressed: alPresionar,
              style: TextButton.styleFrom(foregroundColor: Colores.morado),
              child: Text(accion!),
            ),
        ],
      ),
    ),
  );
}
