import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../config.dart';
import '../widgets/alarma.dart';
import '../widgets/elementos.dart';
import 'detalle_panel.dart';
import 'emitir_alerta.dart';
import 'simulador.dart';

/// Panel de validadores (paso 3.6): métricas, mapa con el radio actual de cada alerta
/// coloreado por estado, pestañas Por validar / Activas / Cerradas, detalle con acciones
/// y bitácora, y "Emitir alerta oficial". Se actualiza solo (Realtime respeta RLS).
///
/// Modo emergencia (SOS): cuando alguien pide ayuda suena una alarma, aparece un banner rojo y
/// la pestaña SOS; al abrirla, el mapa grande sigue el recorrido de la persona en vivo.
class PantallaTablero extends StatefulWidget {
  const PantallaTablero({super.key, required this.servicio, required this.perfil});

  final ServicioAlertas servicio;
  final Perfil perfil;

  @override
  State<PantallaTablero> createState() => _PantallaTableroState();
}

class _PantallaTableroState extends State<PantallaTablero> with SingleTickerProviderStateMixin {
  late final Stream<List<Alerta>> _flujo = widget.servicio.flujoPanel();
  // La pestaña SOS va primero, pero el panel abre en "Por validar"
  late final TabController _pestanas = TabController(length: _demo == null ? 4 : 5, vsync: this, initialIndex: 1);
  final _mapa = MapController();
  RegistroAvisos? _registro;
  Metricas? _metricas;
  Timer? _reloj;
  String? _seleccionada;

  // Modo emergencia (SOS)
  StreamSubscription<List<Emergencia>>? _subSos;
  StreamSubscription<List<PuntoEmergencia>>? _subRecorrido;
  var _emergencias = <Emergencia>[];
  var _recorrido = <PuntoEmergencia>[];
  String? _sosSeleccionada;
  Set<String>? _conocidas; // null: todavía no llega la primera lista

  ServicioDemo? get _demo => widget.servicio is ServicioDemo ? widget.servicio as ServicioDemo : null;

  @override
  void initState() {
    super.initState();
    if (_demo != null) _registro = RegistroAvisos(_demo!);
    _cargarMetricas();
    _reloj = Timer.periodic(const Duration(seconds: 10), (_) => _cargarMetricas());
    _subSos = widget.servicio.flujoEmergencias().listen(_alCambiarEmergencias, onError: (Object _) {});
  }

  @override
  void dispose() {
    _subSos?.cancel();
    _subRecorrido?.cancel();
    _reloj?.cancel();
    _pestanas.dispose();
    _registro?.dispose();
    super.dispose();
  }

  Future<void> _cargarMetricas() async {
    try {
      final m = await widget.servicio.metricas();
      if (mounted) setState(() => _metricas = m);
    } catch (_) {
      // se reintenta en el siguiente ciclo
    }
  }

  /// Alguien pidió ayuda: alarma sonora, aviso y el título de la pestaña del navegador en rojo.
  void _alCambiarEmergencias(List<Emergencia> lista) {
    final abiertas = lista.where((e) => e.abierta).toList();
    final nuevas = _conocidas == null
        ? abiertas.where((e) => e.estado == EstadoEmergencia.activa) // al entrar: las que nadie ha tomado
        : abiertas.where((e) => !_conocidas!.contains(e.id));
    if (nuevas.isNotEmpty) {
      sonarAlarmaSos();
      mostrarMensaje(
        nuevas.length == 1
            ? 'Una persona pidió ayuda (SOS). Ábrela en el banner rojo o en la pestaña SOS.'
            : '${nuevas.length} personas pidieron ayuda (SOS). Ábrelas en la pestaña SOS.',
        error: true,
      );
    }
    _conocidas = {for (final e in lista) e.id};
    SystemChrome.setApplicationSwitcherDescription(
      ApplicationSwitcherDescription(
        label: abiertas.isEmpty ? 'ALERTA CERCA · Panel de validadores' : '(${abiertas.length}) SOS · ALERTA CERCA',
        primaryColor: (abiertas.isEmpty ? Colores.marino : Colores.rojo).toARGB32(),
      ),
    );
    if (mounted) setState(() => _emergencias = lista);
  }

  void _seleccionarSos(Emergencia e) {
    _subRecorrido?.cancel();
    setState(() {
      _sosSeleccionada = e.id;
      _seleccionada = null;
      _recorrido = const [];
    });
    _subRecorrido = widget.servicio.flujoRecorrido(e.id).listen((p) {
      if (mounted) setState(() => _recorrido = p);
    }, onError: (Object _) {});
    try {
      _mapa.move(LatLng(e.lat, e.lon), 15);
    } catch (_) {}
  }

  void _cerrarSos() {
    _subRecorrido?.cancel();
    setState(() {
      _sosSeleccionada = null;
      _recorrido = const [];
    });
  }

  /// Banner rojo → pestaña SOS con la emergencia abierta más urgente.
  void _verSos() {
    _pestanas.animateTo(0);
    final abierta = _emergencias.where((e) => e.abierta).firstOrNull;
    if (abierta != null) _seleccionarSos(abierta);
  }

  Future<void> _abrirUrl(String url) async {
    if (!await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank')) {
      mostrarMensaje('No se pudo abrir el enlace.', error: true);
    }
  }

  Future<void> _llamar(String telefono) async {
    if (!await launchUrl(Uri(scheme: 'tel', path: telefono))) mostrarMensaje('Marca al $telefono desde un teléfono.');
  }

  void _seleccionar(Alerta a) {
    _subRecorrido?.cancel();
    _sosSeleccionada = null;
    setState(() => _seleccionada = a.id);
    try {
      _mapa.move(LatLng(a.lat, a.lon), _mapa.camera.zoom < 12 ? 13 : _mapa.camera.zoom);
    } catch (_) {}
  }

  Future<void> _emitir() async {
    final id = await DialogoEmitirAlerta.mostrar(context, widget.servicio);
    if (id != null && mounted) {
      setState(() => _seleccionada = id);
      _cargarMetricas();
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.perfil;
    return Scaffold(
      appBar: AppBar(
        title: const Text('ALERTA CERCA · Panel de validadores'),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                '${p.institucion ?? 'Sin institución'} · ${p.nombre ?? p.correo ?? 'Validador'}',
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () => intentar(widget.servicio.cerrarSesion),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: Colores.rojo,
        foregroundColor: Colors.white,
        onPressed: _emitir,
        icon: const Icon(Icons.campaign),
        label: const Text('Emitir alerta oficial', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: StreamBuilder<List<Alerta>>(
        stream: _flujo,
        builder: (context, snap) {
          if (snap.hasError) {
            return Vacio('${snap.error}', icono: Icons.cloud_off);
          }
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final todas = snap.data!;
          final porValidar = todas.where((a) => a.estado == EstadoAlerta.pendiente).toList()
            ..sort((a, b) => a.nivel != b.nivel ? b.nivel.compareTo(a.nivel) : a.creadaEn.compareTo(b.creadaEn));
          final activas = todas.where((a) => a.estado.activa).toList()
            ..sort((a, b) => a.nivel != b.nivel ? b.nivel.compareTo(a.nivel) : b.creadaEn.compareTo(a.creadaEn));
          final cerradas = todas.where((a) => a.estado.cerrada).toList()
            ..sort((a, b) => (b.cerradaEn ?? b.creadaEn).compareTo(a.cerradaEn ?? a.creadaEn));
          final seleccionada = todas.where((a) => a.id == _seleccionada).firstOrNull;
          final abiertasSos = _emergencias.where((e) => e.abierta).toList();
          final sos = _emergencias.where((e) => e.id == _sosSeleccionada).firstOrNull;
          final ahora = DateTime.now();

          final mapa = MapaAlertas(
            controlador: _mapa,
            alertas: [...porValidar, ...activas],
            centro: const LatLng(Config.latInicial, Config.lonInicial),
            zoom: 12.5,
            colorPorEstado: true,
            seleccionada: _seleccionada,
            alTocarAlerta: _seleccionar,
            // El recorrido en vivo de la emergencia que se está siguiendo
            capasExtra: sos == null ? const [] : capasRecorrido(sos, _recorrido, ahora: ahora),
            puntos: [
              for (final e in abiertasSos)
                if (e.id != _sosSeleccionada)
                  PuntoMapa(
                    punto: LatLng(e.lat, e.lon),
                    icono: Icons.sos,
                    color: colorEmergencia(e, ahora),
                    etiqueta: 'SOS',
                  ),
              if (_demo != null)
                for (final t in puntosDemo.take(3))
                  PuntoMapa(
                    punto: LatLng(t.lat, t.lon),
                    icono: Icons.smartphone,
                    color: Colores.marino,
                    etiqueta: t.clave,
                  ),
            ],
          );

          final lateral = sos != null
              ? Material(
                  color: Colors.white,
                  child: DetalleEmergencia(
                    key: ValueKey(sos.id),
                    emergencia: sos,
                    servicio: widget.servicio,
                    alLlamar: _llamar,
                    alAbrirUrl: _abrirUrl,
                    conMapa: false,
                    alCerrar: _cerrarSos,
                  ),
                )
              : seleccionada != null
              ? DetallePanel(
                  alerta: seleccionada,
                  servicio: widget.servicio,
                  alCerrar: () => setState(() => _seleccionada = null),
                )
              : Column(
                  children: [
                    Material(
                      color: Colors.white,
                      child: TabBar(
                        controller: _pestanas,
                        isScrollable: true,
                        tabAlignment: TabAlignment.start,
                        labelStyle: const TextStyle(fontWeight: FontWeight.w800),
                        tabs: [
                          Tab(
                            child: Text(
                              'SOS (${abiertasSos.length})',
                              style: TextStyle(color: abiertasSos.isEmpty ? null : Colores.rojo),
                            ),
                          ),
                          Tab(text: 'Por validar (${porValidar.length})'),
                          Tab(text: 'Activas (${activas.length})'),
                          const Tab(text: 'Cerradas'),
                          if (_demo != null) const Tab(icon: Icon(Icons.phone_android, size: 18), text: 'Simulador'),
                        ],
                      ),
                    ),
                    Expanded(
                      child: TabBarView(
                        controller: _pestanas,
                        children: [
                          _listaSos(),
                          _lista(porValidar, 'Nada por validar. Los reportes de personas y menores llegan aquí.'),
                          _lista(activas, 'Sin alertas activas.'),
                          _lista(cerradas.take(100).toList(), 'Sin alertas cerradas.'),
                          if (_demo != null) PanelSimulador(registro: _registro!),
                        ],
                      ),
                    ),
                  ],
                );

          return Column(
            children: [
              if (abiertasSos.isNotEmpty) BannerEmergencias(abiertas: abiertasSos, alTocar: _verSos),
              if (_demo != null)
                Material(
                  color: const Color(0xFFEDE7F6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    child: Row(
                      children: [
                        const Icon(Icons.science_outlined, size: 18, color: Colores.morado),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'MODO DEMOSTRACIÓN · datos simulados en este navegador · factor de tiempo '
                            '${_demo!.factorTiempo.round()} (1 min real = ${_demo!.factorTiempo.round()} min). '
                            'Pestaña "Simulador": los 4 teléfonos de la demo.',
                            style: const TextStyle(color: Colores.morado, fontWeight: FontWeight.w600, fontSize: 12.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, c) {
                    final ancho = c.maxWidth >= 1000;
                    if (!ancho) {
                      // Pantallas angostas: métricas + mapa arriba, lista o detalle abajo
                      return Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(12),
                            child: FilaMetricas(metricas: _metricas),
                          ),
                          SizedBox(height: c.maxHeight * .32, child: mapa),
                          Expanded(child: lateral),
                        ],
                      );
                    }
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          flex: 3,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                FilaMetricas(metricas: _metricas),
                                const SizedBox(height: 12),
                                Expanded(
                                  child: ClipRRect(borderRadius: BorderRadius.circular(14), child: mapa),
                                ),
                              ],
                            ),
                          ),
                        ),
                        SizedBox(
                          width: (c.maxWidth * .38).clamp(420, 640),
                          child: Material(color: Colores.fondo, elevation: 2, child: lateral),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _listaSos() {
    if (_emergencias.isEmpty) {
      return const Vacio(
        'Nadie ha pedido ayuda. Cuando alguien active el SOS sonará una alarma y aparecerá aquí con su '
        'ubicación en vivo.',
        icono: Icons.sos,
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      itemCount: _emergencias.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) => TarjetaEmergencia(
        emergencia: _emergencias[i],
        seleccionada: _emergencias[i].id == _sosSeleccionada,
        alTocar: () => _seleccionarSos(_emergencias[i]),
      ),
    );
  }

  Widget _lista(List<Alerta> alertas, String vacio) {
    if (alertas.isEmpty) return Vacio(vacio);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      itemCount: alertas.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) => TarjetaPanel(
        alerta: alertas[i],
        seleccionada: alertas[i].id == _seleccionada,
        alTocar: () => _seleccionar(alertas[i]),
      ),
    );
  }
}
