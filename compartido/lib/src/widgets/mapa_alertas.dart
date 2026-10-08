import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../estilo.dart';
import '../modelos.dart';

/// Un punto extra en el mapa (mi ubicación, mis zonas, teléfonos de la demo).
class PuntoMapa {
  const PuntoMapa({required this.punto, required this.icono, this.color = Colores.azul, this.etiqueta});

  final LatLng punto;
  final IconData icono;
  final Color color;
  final String? etiqueta;
}

/// Mapa de OpenStreetMap (sin llave ni costo) con el radio actual de cada alerta.
/// Lo comparten la app (color por nivel) y el panel (color por estado).
class MapaAlertas extends StatelessWidget {
  const MapaAlertas({
    super.key,
    required this.alertas,
    required this.centro,
    this.zoom = 13.5,
    this.controlador,
    this.puntos = const [],
    this.colorPorEstado = false,
    this.seleccionada,
    this.alTocarAlerta,
    this.alTocarMapa,
    this.alMantenerMapa,
    this.capasExtra = const [],
  });

  final List<Alerta> alertas;
  final LatLng centro;
  final double zoom;
  final MapController? controlador;
  final List<PuntoMapa> puntos;
  final bool colorPorEstado;
  final String? seleccionada;
  final ValueChanged<Alerta>? alTocarAlerta;
  final ValueChanged<LatLng>? alTocarMapa;
  final ValueChanged<LatLng>? alMantenerMapa;
  final List<Widget> capasExtra;

  /// En las pruebas automáticas no se descargan mosaicos de OpenStreetMap.
  static bool mostrarMosaicos = true;

  Color _color(Alerta a) => !a.estado.abierta
      ? Colores.gris
      : colorPorEstado
      ? colorEstado(a.estado)
      : colorNivel(a.nivel);

  @override
  Widget build(BuildContext context) {
    final conRadio = alertas.where((a) => a.radioVisibleM > 0 && a.estado.activa).toList();
    return FlutterMap(
      mapController: controlador,
      options: MapOptions(
        initialCenter: centro,
        initialZoom: zoom,
        minZoom: 4,
        maxZoom: 18,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onTap: alTocarMapa == null ? null : (_, p) => alTocarMapa!(p),
        onLongPress: alMantenerMapa == null ? null : (_, p) => alMantenerMapa!(p),
      ),
      children: [
        if (mostrarMosaicos)
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            // Lo exige la política de uso de los mosaicos de OpenStreetMap
            userAgentPackageName: 'mx.alertacerca.alerta_cerca',
            maxZoom: 19,
          ),
        CircleLayer(
          circles: [
            for (final a in conRadio)
              CircleMarker(
                point: LatLng(a.lat, a.lon),
                radius: a.radioVisibleM.toDouble(),
                useRadiusInMeter: true,
                color: _color(a).withAlpha(a.id == seleccionada ? 60 : 32),
                borderColor: _color(a),
                borderStrokeWidth: a.id == seleccionada ? 3 : 1.5,
              ),
          ],
        ),
        MarkerLayer(
          markers: [
            for (final p in puntos)
              Marker(
                point: p.punto,
                width: p.etiqueta == null ? 26 : 110,
                height: p.etiqueta == null ? 26 : 46,
                child: _MarcadorPunto(p),
              ),
            for (final a in alertas)
              Marker(
                point: LatLng(a.lat, a.lon),
                width: a.id == seleccionada ? 46 : 38,
                height: a.id == seleccionada ? 46 : 38,
                child: Semantics(
                  button: true,
                  label: '${a.nombreCorto}, ${a.estado.legible}',
                  child: GestureDetector(
                    onTap: alTocarAlerta == null ? null : () => alTocarAlerta!(a),
                    child: IconoCategoria(
                      categoria: a.categoria,
                      nivel: a.nivel,
                      apagado: !a.estado.abierta,
                      tamano: a.id == seleccionada ? 46 : 38,
                    ),
                  ),
                ),
              ),
          ],
        ),
        ...capasExtra,
        const SimpleAttributionWidget(source: Text('colaboradores de OpenStreetMap')),
      ],
    );
  }
}

class _MarcadorPunto extends StatelessWidget {
  const _MarcadorPunto(this.p);

  final PuntoMapa p;

  @override
  Widget build(BuildContext context) {
    final icono = Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: p.color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 4)],
      ),
      child: Icon(p.icono, size: 13, color: Colors.white),
    );
    if (p.etiqueta == null) return icono;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
          child: Text(
            p.etiqueta!,
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: p.color),
          ),
        ),
        const SizedBox(height: 2),
        icono,
      ],
    );
  }
}
