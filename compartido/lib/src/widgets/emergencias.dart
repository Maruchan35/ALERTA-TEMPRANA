import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../emergencia.dart';
import '../estilo.dart';
import '../formato.dart';
import '../servicio.dart';
import 'mapa_alertas.dart';

// ─── Modo emergencia (SOS): lo que ven los validadores en el panel y en la app ──

/// Rojo: nadie la ha tomado. Naranja: en seguimiento. Morado: el teléfono no responde.
Color colorEmergencia(Emergencia e, DateTime ahora) {
  if (!e.abierta) return Colores.gris;
  if (e.sinSenalDesde(ahora)) return Colores.morado;
  return e.estado == EstadoEmergencia.activa ? Colores.rojo : Colores.naranja;
}

/// "12 s", "4 min", "1 h 05 min".
String tiempoCorto(Duration d) {
  if (d.inSeconds < 60) return '${d.inSeconds} s';
  if (d.inMinutes < 60) return '${d.inMinutes} min';
  return '${d.inHours} h ${(d.inMinutes % 60).toString().padLeft(2, '0')} min';
}

String _resumen(Emergencia e, DateTime ahora) {
  final partes = <String>['Hace ${tiempoCorto(ahora.difference(e.creadaEn))}', e.origen.texto.toLowerCase()];
  if (e.abierta && e.velocidadKmh != null && e.velocidadKmh! > 3) partes.add('${e.velocidadKmh} km/h');
  if (e.bateria != null) partes.add('batería ${e.bateria} %');
  return partes.join(' · ');
}

/// Enlace para dar la ubicación por teléfono o abrirla en otra app.
String enlaceMapa(double lat, double lon) =>
    'https://www.google.com/maps/search/?api=1&query=${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)}';

/// Banner rojo "N emergencias SOS abiertas" (encima de todo en el panel).
class BannerEmergencias extends StatelessWidget {
  const BannerEmergencias({super.key, required this.abiertas, required this.alTocar});

  final List<Emergencia> abiertas;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final sinTomar = abiertas.where((e) => e.estado == EstadoEmergencia.activa).length;
    final n = abiertas.length;
    return Material(
      color: sinTomar > 0 ? Colores.rojo : Colores.naranja,
      child: InkWell(
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.sos, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${n == 1 ? '1 emergencia SOS abierta' : '$n emergencias SOS abiertas'}'
                  '${sinTomar > 0 ? ' · $sinTomar sin tomar' : ' · en seguimiento'}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15),
                ),
              ),
              const Text(
                'VER',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TarjetaEmergencia extends StatelessWidget {
  const TarjetaEmergencia({super.key, required this.emergencia, this.seleccionada = false, this.alTocar});

  final Emergencia emergencia;
  final bool seleccionada;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final e = emergencia;
    final ahora = DateTime.now();
    final color = colorEmergencia(e, ahora);
    final estado = !e.abierta
        ? (e.cierre?.texto ?? 'Cerrada')
        : e.sinSenalDesde(ahora)
        ? 'SIN SEÑAL · ${tiempoCorto(e.sinSenal(ahora))}'
        : e.estado.etiqueta;
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: seleccionada ? color : Colors.transparent, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: alTocar,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 6, color: color),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: color,
                        child: const Icon(Icons.sos, color: Colors.white),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e.tipo.nombre.toUpperCase(),
                              style: TextStyle(fontWeight: FontWeight.w900, color: color),
                            ),
                            const SizedBox(height: 2),
                            Text(_resumen(e, ahora), style: const TextStyle(fontSize: 12.5)),
                            if (e.atendidaPor != null && e.abierta)
                              Text(
                                'Lo sigue: ${e.atendidaPor}',
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: color.withAlpha(30), borderRadius: BorderRadius.circular(8)),
                        child: Text(
                          estado,
                          style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Capas del recorrido para cualquier mapa (el del panel o el de [MapaEmergencia]):
/// la línea del recorrido, dónde empezó, la última posición y su margen de error.
List<Widget> capasRecorrido(Emergencia e, List<PuntoEmergencia> puntos, {DateTime? ahora}) {
  final color = colorEmergencia(e, ahora ?? DateTime.now());
  final actual = LatLng(e.lat, e.lon);
  final linea = [for (final p in puntos) LatLng(p.lat, p.lon)];
  return [
    if (linea.length > 1)
      PolylineLayer(
        polylines: [
          Polyline(points: linea, color: color, strokeWidth: 4, borderColor: Colors.white, borderStrokeWidth: 1.5),
        ],
      ),
    if ((e.precisionM ?? 0) > 0)
      CircleLayer(
        circles: [
          CircleMarker(
            point: actual,
            radius: e.precisionM!,
            useRadiusInMeter: true,
            color: color.withAlpha(35),
            borderColor: color,
            borderStrokeWidth: 1,
          ),
        ],
      ),
    MarkerLayer(
      markers: [
        if (linea.length > 1)
          Marker(
            point: linea.first,
            width: 18,
            height: 18,
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 4),
              ),
            ),
          ),
        Marker(
          point: actual,
          width: 44,
          height: 44,
          child: Semantics(
            label: 'Última ubicación de la persona',
            child: Container(
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 6)],
              ),
              child: const Icon(Icons.sos, color: Colors.white, size: 22),
            ),
          ),
        ),
      ],
    ),
  ];
}

/// Mapa propio de una emergencia (app del validador): sigue a la persona mientras se mueve.
class MapaEmergencia extends StatefulWidget {
  const MapaEmergencia({super.key, required this.emergencia, required this.puntos});

  final Emergencia emergencia;
  final List<PuntoEmergencia> puntos;

  @override
  State<MapaEmergencia> createState() => _MapaEmergenciaState();
}

class _MapaEmergenciaState extends State<MapaEmergencia> {
  final _mapa = MapController();
  var _seguir = true;

  @override
  void didUpdateWidget(MapaEmergencia anterior) {
    super.didUpdateWidget(anterior);
    final e = widget.emergencia;
    if (_seguir && (e.lat != anterior.emergencia.lat || e.lon != anterior.emergencia.lon)) {
      try {
        _mapa.move(LatLng(e.lat, e.lon), _mapa.camera.zoom);
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.emergencia;
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapa,
          options: MapOptions(
            initialCenter: LatLng(e.lat, e.lon),
            initialZoom: 16,
            minZoom: 4,
            maxZoom: 18,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            // Si el validador mueve el mapa, deja de seguir a la persona (hasta que toque "Seguir")
            onPositionChanged: (_, gesto) {
              if (gesto && _seguir) setState(() => _seguir = false);
            },
          ),
          children: [
            if (MapaAlertas.mostrarMosaicos)
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'mx.alertacerca.alerta_cerca',
                maxZoom: 19,
              ),
            ...capasRecorrido(e, widget.puntos),
            const SimpleAttributionWidget(source: Text('colaboradores de OpenStreetMap')),
          ],
        ),
        if (!_seguir)
          Positioned(
            right: 10,
            top: 10,
            child: FloatingActionButton.small(
              heroTag: 'seguir-${e.id}',
              tooltip: 'Seguir a la persona',
              backgroundColor: Colors.white,
              foregroundColor: Colores.rojo,
              onPressed: () {
                setState(() => _seguir = true);
                try {
                  _mapa.move(LatLng(e.lat, e.lon), 16);
                } catch (_) {}
              },
              child: const Icon(Icons.my_location),
            ),
          ),
      ],
    );
  }
}

/// Detalle y seguimiento de una emergencia. Lo usan el panel (con el recorrido en su mapa
/// grande, `conMapa: false`) y la app del validador (con su propio mapa).
class DetalleEmergencia extends StatefulWidget {
  const DetalleEmergencia({
    super.key,
    required this.emergencia,
    required this.servicio,
    required this.alLlamar,
    required this.alAbrirUrl,
    this.conMapa = true,
    this.alCerrar,
  });

  final Emergencia emergencia;
  final ServicioAlertas servicio;
  final ValueChanged<String> alLlamar;
  final ValueChanged<String> alAbrirUrl;
  final bool conMapa;
  final VoidCallback? alCerrar;

  @override
  State<DetalleEmergencia> createState() => _DetalleEmergenciaState();
}

class _DetalleEmergenciaState extends State<DetalleEmergencia> {
  late Stream<List<PuntoEmergencia>> _recorrido = widget.servicio.flujoRecorrido(widget.emergencia.id);
  Future<List<EvidenciaEmergencia>>? _evidencias;
  Timer? _reloj;
  var _ocupado = false;

  Emergencia get e => widget.emergencia;

  @override
  void initState() {
    super.initState();
    _cargarEvidencias();
    // "Última señal hace 12 s" debe correr solo
    _reloj = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(DetalleEmergencia anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.emergencia.id != e.id) {
      _recorrido = widget.servicio.flujoRecorrido(e.id);
      _cargarEvidencias();
    } else if (anterior.emergencia.nEvidencias != e.nEvidencias) {
      _cargarEvidencias();
    }
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  void _cargarEvidencias() => _evidencias = widget.servicio.evidenciasEmergencia(e.id);

  void _avisar(String texto, {bool error = false}) {
    ScaffoldMessenger.maybeOf(context)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(texto), backgroundColor: error ? Colores.rojo : null));
  }

  Future<void> _atender(AccionEmergencia accion, {String? nota, String? folio, String? exito}) async {
    setState(() => _ocupado = true);
    try {
      await widget.servicio.atenderEmergencia(e.id, accion, nota: nota, folio: folio);
      if (exito != null) _avisar(exito);
    } on ErrorServicio catch (x) {
      _avisar(x.mensaje, error: true);
    } catch (x) {
      _avisar('Algo salió mal: $x', error: true);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  /// Pide un texto opcional u obligatorio. null = canceló.
  Future<String?> _pedir({
    required String titulo,
    required String etiqueta,
    String? ayuda,
    String accion = 'Guardar',
    bool obligatorio = false,
    Color? color,
  }) {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
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
              decoration: InputDecoration(labelText: etiqueta, border: const OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(
            style: color == null ? null : FilledButton.styleFrom(backgroundColor: color),
            onPressed: () {
              final t = c.text.trim();
              if (obligatorio && t.isEmpty) return;
              Navigator.pop(context, t);
            },
            child: Text(accion),
          ),
        ],
      ),
    );
  }

  Future<void> _copiarUbicacion() async {
    final texto =
        'Emergencia SOS (ALERTA CERCA): ${e.tipo.nombre}. Última ubicación ${e.lat.toStringAsFixed(6)}, '
        '${e.lon.toStringAsFixed(6)} (±${(e.precisionM ?? 0).round()} m) ${enlaceMapa(e.lat, e.lon)}';
    await Clipboard.setData(ClipboardData(text: texto));
    _avisar('Ubicación copiada: pégala o díctala al 911.');
  }

  Future<void> _verEvidencia(EvidenciaEmergencia v) async {
    final url = await widget.servicio.urlEvidencia(v.ruta);
    if (url == null) {
      _avisar(
        widget.servicio.esDemo
            ? 'En la demostración la evidencia no se guarda en ningún servidor.'
            : 'No se pudo abrir la evidencia. Revisa la conexión.',
        error: !widget.servicio.esDemo,
      );
      return;
    }
    widget.alAbrirUrl(url);
  }

  @override
  Widget build(BuildContext context) {
    final ahora = DateTime.now();
    final color = colorEmergencia(e, ahora);
    final sinSenal = e.sinSenalDesde(ahora);
    final tel = e.telefonoParaLlamar;

    final datos = <Widget>[
      _Dato(
        icono: sinSenal ? Icons.signal_cellular_connected_no_internet_0_bar : Icons.cell_tower,
        titulo: sinSenal ? 'SIN SEÑAL desde hace ${tiempoCorto(e.sinSenal(ahora))}' : 'Última señal',
        valor: sinSenal ? 'Última posición conocida en el mapa' : 'hace ${tiempoCorto(e.sinSenal(ahora))}',
        color: sinSenal ? Colores.morado : null,
      ),
      _Dato(
        icono: e.enVehiculo ? Icons.directions_car : Icons.directions_walk,
        titulo: 'Velocidad',
        valor: e.velocidadKmh == null
            ? 'sin dato'
            : e.enVehiculo
            ? '${e.velocidadKmh} km/h · probablemente en un vehículo'
            : '${e.velocidadKmh} km/h',
        color: e.enVehiculo && e.abierta ? Colores.rojo : null,
      ),
      _Dato(
        icono: Icons.battery_alert,
        titulo: 'Batería',
        valor: e.bateria == null ? 'sin dato' : '${e.bateria} %',
        color: (e.bateria ?? 100) <= 15 ? Colores.rojo : null,
      ),
      _Dato(
        icono: Icons.gps_fixed,
        titulo: 'Precisión',
        valor: e.precisionM == null ? 'sin dato' : '± ${e.precisionM!.round()} m · ${e.nPuntos} puntos',
      ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: color,
              child: const Icon(Icons.sos, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.tipo.nombre.toUpperCase(),
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: color),
                  ),
                  Text(
                    '${e.abierta ? e.estado.etiqueta : 'CERRADA'} · pidió ayuda ${fechaHora(e.creadaEn)} '
                    '(hace ${tiempoCorto(ahora.difference(e.creadaEn))})',
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ],
              ),
            ),
            if (widget.alCerrar != null)
              IconButton(tooltip: 'Cerrar detalle', onPressed: widget.alCerrar, icon: const Icon(Icons.close)),
          ],
        ),
        const SizedBox(height: 12),
        if (widget.conMapa)
          SizedBox(
            height: 300,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: StreamBuilder<List<PuntoEmergencia>>(
                stream: _recorrido,
                builder: (context, snap) => MapaEmergencia(emergencia: e, puntos: snap.data ?? const []),
              ),
            ),
          ),
        if (widget.conMapa) const SizedBox(height: 12),
        if (e.abierta)
          Card(
            color: const Color(0xFFFFF4E5),
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                e.estado == EstadoEmergencia.activa
                    ? '1. Toma el caso.  2. Llama al 911 y dales la ubicación en vivo (botón "Copiar ubicación").  '
                          '3. Registra el folio.  Antes de llamar a la persona, piensa si una llamada puede ponerla en riesgo.'
                    : 'Sigue el recorrido hasta que la localicen y cierra la emergencia al terminar. '
                          'Antes de llamar a la persona, piensa si una llamada puede ponerla en riesgo.',
                style: const TextStyle(fontSize: 13),
              ),
            ),
          ),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: datos),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _copiarUbicacion,
              icon: const Icon(Icons.copy),
              label: const Text('Copiar ubicación'),
            ),
            OutlinedButton.icon(
              onPressed: () => widget.alAbrirUrl(enlaceMapa(e.lat, e.lon)),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Abrir en mapas'),
            ),
            if (tel != null)
              OutlinedButton.icon(
                onPressed: () => widget.alLlamar(tel),
                icon: const Icon(Icons.call),
                label: Text('Llamar a la persona ($tel)'),
              )
            else
              const Chip(
                avatar: Icon(Icons.phone_disabled, size: 18),
                label: Text('Pidió ayuda sin número verificado'),
              ),
          ],
        ),
        if (e.abierta) ...[
          const SizedBox(height: 16),
          const Text('Seguimiento', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (e.estado == EstadoEmergencia.activa)
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
                  onPressed: _ocupado
                      ? null
                      : () => _atender(
                          AccionEmergencia.tomar,
                          exito: 'Tomaste el caso. La persona ya lo ve en su pantalla.',
                        ),
                  icon: const Icon(Icons.front_hand),
                  label: const Text('Tomar el caso'),
                ),
              FilledButton.tonalIcon(
                onPressed: _ocupado
                    ? null
                    : () async {
                        final folio = await _pedir(
                          titulo: 'Aviso al 911',
                          etiqueta: 'Folio del 911 (opcional)',
                          ayuda: 'Registra que ya avisaste al 911 o a la policía. La persona verá "La policía ya fue avisada".',
                          accion: 'Registrar aviso',
                        );
                        if (folio != null) {
                          await _atender(AccionEmergencia.policia, folio: folio, exito: 'Aviso al 911 registrado.');
                        }
                      },
                icon: const Icon(Icons.local_police),
                label: Text(e.policiaAvisadaEn == null ? 'Avisé al 911' : 'Folio del 911'),
              ),
              OutlinedButton.icon(
                onPressed: _ocupado
                    ? null
                    : () async {
                        final nota = await _pedir(
                          titulo: 'Nota del seguimiento',
                          etiqueta: 'Nota',
                          ayuda: 'Por ejemplo: "Patrulla 12 en camino por Av. Lázaro Cárdenas".',
                          obligatorio: true,
                        );
                        if (nota != null) await _atender(AccionEmergencia.nota, nota: nota, exito: 'Nota guardada.');
                      },
                icon: const Icon(Icons.edit_note),
                label: const Text('Nota'),
              ),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Colores.verde),
                onPressed: _ocupado
                    ? null
                    : () async {
                        final nota = await _pedir(
                          titulo: '¿La localizaron?',
                          etiqueta: 'Qué pasó (opcional)',
                          accion: 'Cerrar: localizada',
                          color: Colores.verde,
                        );
                        if (nota != null) {
                          await _atender(
                            AccionEmergencia.localizada,
                            nota: nota,
                            exito: 'Emergencia cerrada: localizada.',
                          );
                        }
                      },
                icon: const Icon(Icons.check_circle),
                label: const Text('Localizada / a salvo'),
              ),
              TextButton.icon(
                onPressed: _ocupado
                    ? null
                    : () async {
                        final nota = await _pedir(
                          titulo: '¿Fue una falsa alarma?',
                          etiqueta: 'Cómo lo confirmaste',
                          ayuda: 'Ciérrala solo si confirmaste que la persona está bien.',
                          accion: 'Cerrar: falsa alarma',
                          obligatorio: true,
                          color: Colores.gris,
                        );
                        if (nota != null) {
                          await _atender(
                            AccionEmergencia.falsaAlarma,
                            nota: nota,
                            exito: 'Emergencia cerrada: falsa alarma.',
                          );
                        }
                      },
                icon: const Icon(Icons.do_not_disturb_on_outlined),
                label: const Text('Falsa alarma'),
              ),
            ],
          ),
        ],
        const SizedBox(height: 16),
        const Text('Línea de tiempo', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        const SizedBox(height: 4),
        _Paso(fecha: e.creadaEn, texto: 'Pidió ayuda · ${e.origen.texto}'),
        if (e.tipo != TipoEmergencia.sos) _Paso(texto: 'Indicó: «${e.tipo.enPrimeraPersona}»'),
        if (e.atendidaEn != null) _Paso(fecha: e.atendidaEn, texto: 'Tomada por ${e.atendidaPor ?? 'un validador'}'),
        if (e.policiaAvisadaEn != null)
          _Paso(fecha: e.policiaAvisadaEn, texto: 'Aviso al 911${e.folio911 == null ? '' : ' · folio ${e.folio911}'}'),
        if (e.nota != null) _Paso(texto: 'Nota: ${e.nota}'),
        if (e.cerradaEn != null)
          _Paso(
            fecha: e.cerradaEn,
            texto: 'Cerrada · ${e.cierre?.texto ?? ''}${e.cerradaPorLaPersona ? ' (la cerró la persona)' : ''}',
          ),
        const SizedBox(height: 16),
        Text('Evidencia (${e.nEvidencias})', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        const SizedBox(height: 4),
        FutureBuilder<List<EvidenciaEmergencia>>(
          future: _evidencias,
          builder: (context, snap) {
            final lista = snap.data ?? const <EvidenciaEmergencia>[];
            if (lista.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'Todavía no llega video. El teléfono graba mientras la pantalla del SOS está abierta y sube '
                  'cada fragmento en cuanto termina.',
                  style: TextStyle(fontSize: 13),
                ),
              );
            }
            return Column(
              children: [
                for (final (i, v) in lista.indexed)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(v.tipo == 'video' ? Icons.videocam : Icons.mic),
                    title: Text('${v.tipo == 'video' ? 'Video' : 'Audio'} ${i + 1}'),
                    subtitle: Text('${fechaHora(v.creadaEn)}${v.duracionS == null ? '' : ' · ${v.duracionS} s'}'),
                    trailing: TextButton(onPressed: () => _verEvidencia(v), child: const Text('Ver')),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato({required this.icono, required this.titulo, required this.valor, this.color});

  final IconData icono;
  final String titulo;
  final String valor;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colores.marino;
    return Container(
      constraints: const BoxConstraints(minWidth: 150, maxWidth: 260),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: c.withAlpha(18),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.withAlpha(60)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, color: c, size: 20),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(fontSize: 11.5, color: c, fontWeight: FontWeight.w700),
                ),
                Text(valor, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Paso extends StatelessWidget {
  const _Paso({required this.texto, this.fecha});

  final String texto;
  final DateTime? fecha;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 5),
            child: Icon(Icons.circle, size: 8, color: Colores.marino),
          ),
          const SizedBox(width: 8),
          if (fecha != null) ...[
            Text(fechaHora(fecha!), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(width: 8),
          ],
          Expanded(child: Text(texto, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
