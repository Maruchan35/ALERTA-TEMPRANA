import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../config.dart';
import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';

/// Mis zonas (casa, escuela, trabajo; máximo 3): recibes alertas de ahí aunque no estés.
/// Al servidor solo viaja la celda de ~1 km; el punto exacto se queda en el teléfono.
class PantallaZonas extends StatelessWidget {
  const PantallaZonas({super.key});

  @override
  Widget build(BuildContext context) {
    final estado = AlcanceApp.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Mis zonas')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Recibe alertas de los lugares que te importan aunque no estés ahí: por ejemplo, la '
            'escuela de tus hijos mientras estás en el trabajo.',
          ),
          const SizedBox(height: 8),
          Text(
            'Privacidad: el servidor solo conoce el cuadro de ~1 km donde está cada zona, nunca el punto exacto.',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 16),
          for (final z in estado.zonas)
            Card(
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Colores.marino,
                  child: Icon(Icons.home, color: Colors.white),
                ),
                title: Text(z.nombre, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('Celda ${z.celda}'),
                trailing: IconButton(
                  tooltip: 'Borrar zona',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    if (await confirmar(
                      context,
                      titulo: 'Borrar zona',
                      texto: '¿Dejar de recibir alertas de "${z.nombre}"?',
                      accion: 'Borrar',
                    )) {
                      await intentar(() => estado.borrarZona(z), exito: 'Zona borrada');
                    }
                  },
                ),
              ),
            ),
          if (estado.zonas.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('Todavía no tienes zonas guardadas.')),
            ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: estado.zonas.length >= 3
                ? null
                : () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const _NuevaZona())),
            icon: const Icon(Icons.add_location_alt_outlined),
            label: Text(estado.zonas.length >= 3 ? 'Máximo 3 zonas' : 'Agregar zona'),
          ),
        ],
      ),
    );
  }
}

class _NuevaZona extends StatefulWidget {
  const _NuevaZona();

  @override
  State<_NuevaZona> createState() => _NuevaZonaState();
}

class _NuevaZonaState extends State<_NuevaZona> {
  final _mapa = MapController();
  final _nombre = TextEditingController();
  var _guardando = false;

  @override
  void dispose() {
    _nombre.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final estado = AlcanceApp.leer(context);
    final p = _mapa.camera.center;
    setState(() => _guardando = true);
    final ok = await intentar(
      () => estado.agregarZona(_nombre.text.trim(), p.latitude, p.longitude),
      exito: 'Zona guardada: recibirás alertas de "${_nombre.text.trim()}"',
    );
    if (!mounted) return;
    setState(() => _guardando = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final pos = AlcanceApp.of(context).miPosicion;
    final inicio = LatLng(pos?.lat ?? Config.latInicial, pos?.lon ?? Config.lonInicial);
    return Scaffold(
      appBar: AppBar(title: const Text('Nueva zona')),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(12),
            child: Text(
              'Mueve el mapa hasta que el pin quede sobre el lugar.',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                FlutterMap(
                  mapController: _mapa,
                  options: MapOptions(initialCenter: inicio, initialZoom: 15),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'mx.alertacerca.alerta_cerca',
                    ),
                    const SimpleAttributionWidget(source: Text('colaboradores de OpenStreetMap')),
                  ],
                ),
                const IgnorePointer(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: 40),
                    child: Icon(Icons.location_on, size: 48, color: Colores.marino),
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: _nombre,
                    maxLength: 40,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: 'Nombre', hintText: 'Casa, Escuela de Ana…'),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final s in const ['Casa', 'Escuela', 'Trabajo'])
                        ActionChip(label: Text(s), onPressed: () => setState(() => _nombre.text = s)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _guardando || _nombre.text.trim().isEmpty ? null : _guardar,
                      child: const Text('Guardar zona'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
