import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../app.dart';
import '../config.dart';

/// Emitir alerta oficial: el mismo reporte que en la app, pero como lo emite un
/// validador o institución, sale VERIFICADA (y puede fijar el radio, p. ej. 2 km exactos
/// para una evacuación).
class DialogoEmitirAlerta extends StatefulWidget {
  const DialogoEmitirAlerta({super.key, required this.servicio});

  final ServicioAlertas servicio;

  static Future<String?> mostrar(BuildContext context, ServicioAlertas servicio) => showDialog<String>(
    context: context,
    builder: (_) => DialogoEmitirAlerta(servicio: servicio),
  );

  @override
  State<DialogoEmitirAlerta> createState() => _DialogoEmitirAlertaState();
}

class _DialogoEmitirAlertaState extends State<DialogoEmitirAlerta> {
  final _mapa = MapController();
  final _titulo = TextEditingController();
  final _descripcion = TextEditingController();
  final _referencia = TextEditingController();
  Categoria _categoria = categoriaPorClave('evacuacion');
  int? _radioFijo;
  var _enviando = false;

  @override
  void dispose() {
    _titulo.dispose();
    _descripcion.dispose();
    _referencia.dispose();
    super.dispose();
  }

  Future<void> _emitir() async {
    final centro = _mapa.camera.center;
    setState(() => _enviando = true);
    String? id;
    final ok = await intentar(() async {
      final r = await widget.servicio.crearReporte(
        NuevoReporte(
          categoria: _categoria.clave,
          titulo: _titulo.text,
          descripcion: _descripcion.text,
          referencia: _referencia.text,
          lat: centro.latitude,
          lon: centro.longitude,
        ),
      );
      id = r.alertaId;
      if (id != null && _radioFijo != null) {
        await widget.servicio.validar(id!, AccionValidador.ajustarRadio, radioM: _radioFijo);
      }
    }, exito: 'Alerta oficial emitida: sale VERIFICADA hacia las personas cercanas.');
    if (!mounted) return;
    setState(() => _enviando = false);
    if (ok) Navigator.pop(context, id);
  }

  @override
  Widget build(BuildContext context) {
    final listo = _titulo.text.trim().length >= 5 && !_enviando;
    return AlertDialog(
      title: const Text('Emitir alerta oficial'),
      content: SizedBox(
        width: 720,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _categoria.clave,
                decoration: const InputDecoration(labelText: 'Categoría'),
                items: [
                  for (final c in catalogo)
                    DropdownMenuItem(
                      value: c.clave,
                      child: Row(
                        children: [
                          Icon(iconoCategoria(c.clave), color: colorNivel(c.nivel), size: 20),
                          const SizedBox(width: 8),
                          Text('${c.nombre} · nivel ${c.nivel}'),
                        ],
                      ),
                    ),
                ],
                onChanged: (v) => setState(() => _categoria = categoriaPorClave(v!)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _titulo,
                maxLength: 80,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Título *',
                  hintText: 'Ej. Evacuación preventiva por fuga de gas',
                ),
              ),
              TextField(
                controller: _descripcion,
                maxLength: 1000,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Descripción e indicaciones'),
              ),
              TextField(
                controller: _referencia,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Referencia', hintText: 'Ej. colonia Centro, calle E'),
              ),
              const SizedBox(height: 8),
              const Text(
                'Ubicación: mueve el mapa hasta que el pin quede sobre el lugar.',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 260,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      FlutterMap(
                        mapController: _mapa,
                        options: const MapOptions(
                          initialCenter: LatLng(Config.latInicial, Config.lonInicial),
                          initialZoom: 14,
                        ),
                        children: [
                          TileLayer(
                            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'mx.alertacerca.panel_validadores',
                          ),
                          const SimpleAttributionWidget(source: Text('colaboradores de OpenStreetMap')),
                        ],
                      ),
                      const IgnorePointer(
                        child: Padding(
                          padding: EdgeInsets.only(bottom: 40),
                          child: Icon(Icons.location_on, size: 44, color: Colores.rojo),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Radio: '),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Wrap(
                      spacing: 6,
                      children: [
                        ChoiceChip(
                          label: Text(
                            'Escalones (${_categoria.escalones.map((e) => formatoRadio(e.radioM)).join(' → ')})',
                          ),
                          selected: _radioFijo == null,
                          onSelected: (_) => setState(() => _radioFijo = null),
                        ),
                        for (final km in const [1, 2, 3, 5, 10])
                          ChoiceChip(
                            label: Text('$km km'),
                            selected: _radioFijo == km * 1000,
                            onSelected: (_) => setState(() => _radioFijo = km * 1000),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
          onPressed: listo ? _emitir : null,
          icon: const Icon(Icons.campaign),
          label: const Text('Emitir alerta verificada'),
        ),
      ],
    );
  }
}
