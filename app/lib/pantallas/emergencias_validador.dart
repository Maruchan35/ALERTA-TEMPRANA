import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../widgets/comunes.dart';

Future<void> _llamar(String telefono) async {
  if (!await launchUrl(Uri(scheme: 'tel', path: telefono))) mostrarMensaje('No se pudo abrir el marcador.');
}

Future<void> _abrir(String url) async {
  if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
    mostrarMensaje('No se pudo abrir el enlace.');
  }
}

/// Validadores en la app: emergencias SOS en vivo (abiertas primero).
class PantallaEmergencias extends StatefulWidget {
  const PantallaEmergencias({super.key, required this.servicio});

  final ServicioAlertas servicio;

  @override
  State<PantallaEmergencias> createState() => _PantallaEmergenciasState();
}

class _PantallaEmergenciasState extends State<PantallaEmergencias> {
  late final Stream<List<Emergencia>> _flujo = widget.servicio.flujoEmergencias();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Emergencias SOS')),
      body: StreamBuilder<List<Emergencia>>(
        stream: _flujo,
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('${snap.error}', textAlign: TextAlign.center));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final lista = snap.data!;
          if (lista.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Nadie ha pedido ayuda. Cuando alguien active el SOS te llegará una alarma.'),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: lista.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, i) => TarjetaEmergencia(
              emergencia: lista[i],
              alTocar: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => PantallaSeguimientoEmergencia(servicio: widget.servicio, emergenciaId: lista[i].id),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Seguimiento de una emergencia (al tocar la alarma o desde la lista): mapa en vivo y acciones.
class PantallaSeguimientoEmergencia extends StatefulWidget {
  const PantallaSeguimientoEmergencia({super.key, required this.servicio, required this.emergenciaId});

  final ServicioAlertas servicio;
  final String emergenciaId;

  @override
  State<PantallaSeguimientoEmergencia> createState() => _PantallaSeguimientoEmergenciaState();
}

class _PantallaSeguimientoEmergenciaState extends State<PantallaSeguimientoEmergencia> {
  late final Stream<List<Emergencia>> _flujo = widget.servicio.flujoEmergencias();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: Colores.rojo, title: const Text('Seguimiento SOS')),
      body: StreamBuilder<List<Emergencia>>(
        stream: _flujo,
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('${snap.error}', textAlign: TextAlign.center));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final e = snap.data!.where((x) => x.id == widget.emergenciaId).firstOrNull;
          if (e == null) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No se encontró la emergencia. Solo las cuentas de validador pueden darles seguimiento '
                  '(Ajustes → Acceso para validadores).',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return DetalleEmergencia(emergencia: e, servicio: widget.servicio, alLlamar: _llamar, alAbrirUrl: _abrir);
        },
      ),
    );
  }
}
