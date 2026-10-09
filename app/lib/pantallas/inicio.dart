import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../config.dart';
import '../nucleo/emergencia.dart';
import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';
import '../widgets/tarjeta_alerta.dart';
import 'ajustes.dart';
import 'detalle.dart';
import 'emergencia.dart';
import 'emergencias_validador.dart';
import 'reportar.dart';
import 'zonas.dart';

/// 1. Inicio con mapa: "Recibes alertas: aquí + N zonas", círculos con el radio actual,
/// lista ordenada por nivel y distancia, botón rojo "Reportar" y aviso fijo del 911.
class PantallaInicio extends StatefulWidget {
  const PantallaInicio({super.key});

  @override
  State<PantallaInicio> createState() => _PantallaInicioState();
}

class _PantallaInicioState extends State<PantallaInicio> {
  final _mapa = MapController();
  Timer? _reloj;
  String? _centrado;

  @override
  void initState() {
    super.initState();
    // Refresca "hace X min" y el radio que crece
    _reloj = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted) AlcanceApp.leer(context).cargarAlertas();
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  void _abrir(Alerta a) => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => PantallaDetalle(alertaId: a.id, inicial: a),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final estado = AlcanceApp.of(context);
    final sos = AlcanceSos.of(context);
    final pos = estado.miPosicion;
    final centro = LatLng(pos?.lat ?? Config.latInicial, pos?.lon ?? Config.lonInicial);
    final alertas = estado.alertasOrdenadas;
    final activas = alertas.where((a) => a.estado.activa).length;

    // Recentra el mapa cuando cambia la ubicación (p. ej. al elegir otro punto de la demo)
    final clave = '${centro.latitude},${centro.longitude}';
    if (_centrado != null && _centrado != clave) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _mapa.move(centro, 13.5);
        } catch (_) {}
      });
    }
    _centrado = clave;

    final zonasTexto = estado.zonas.isEmpty
        ? 'aquí'
        : 'aquí + ${estado.zonas.length} ${estado.zonas.length == 1 ? 'zona' : 'zonas'}';

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('ALERTA CERCA'),
            Text(
              'Recibes alertas: $zonasTexto',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Colors.white70),
            ),
          ],
        ),
        actions: [
          const _BotonSos(),
          if (estado.perfil?.rol.esValidador ?? false)
            IconButton(
              tooltip: 'Emergencias SOS (validadores)',
              icon: const Icon(Icons.emergency_share),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(builder: (_) => PantallaEmergencias(servicio: estado.servicio)),
              ),
            ),
          IconButton(
            tooltip: 'Mis zonas',
            icon: const Icon(Icons.home_work_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaZonas())),
          ),
          IconButton(
            tooltip: 'Ajustes',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAjustes())),
          ),
        ],
      ),
      body: Column(
        children: [
          if (sos.abierta)
            MaterialBanner(
              backgroundColor: Colores.rojo,
              leading: const Icon(Icons.sos, color: Colors.white),
              content: Text(
                sos.simulacro ? 'SIMULACRO EN CURSO' : 'SOS ACTIVO · compartiendo tu ubicación en vivo',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
              ),
              actions: [
                TextButton(
                  onPressed: abrirPantallaSos,
                  child: const Text(
                    'ABRIR',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
          if (estado.servicio.esDemo)
            BannerDemo(
              texto: 'Modo demostración · ${_ubicacionDemo(estado)}',
              accion: 'Cambiar',
              alPresionar: () =>
                  Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAjustes())),
            ),
          if (estado.error != null)
            MaterialBanner(
              backgroundColor: const Color(0xFFFFEBEE),
              content: Text(estado.error!),
              leading: const Icon(Icons.wifi_off, color: Colores.rojo),
              actions: [TextButton(onPressed: estado.actualizarUbicacion, child: const Text('Reintentar'))],
            ),
          if (estado.error == null && estado.ubicacionRevisada && !estado.listoParaRecibir)
            MaterialBanner(
              backgroundColor: const Color(0xFFFFF4E5),
              leading: const Icon(Icons.notifications_off_outlined, color: Colores.naranja),
              content: const Text('Este teléfono aún no está registrado para recibir alertas con la app cerrada.'),
              actions: [
                TextButton(
                  onPressed: () =>
                      Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAjustes())),
                  child: const Text('Revisar'),
                ),
              ],
            ),
          Expanded(
            flex: 5,
            child: Stack(
              children: [
                MapaAlertas(
                  controlador: _mapa,
                  alertas: alertas,
                  centro: centro,
                  puntos: [
                    for (final z in estado.zonas)
                      PuntoMapa(
                        punto: LatLng(z.lat, z.lon),
                        icono: Icons.home,
                        color: Colores.marino,
                        etiqueta: z.nombre,
                      ),
                    if (pos != null)
                      PuntoMapa(punto: LatLng(pos.lat, pos.lon), icono: Icons.person, color: Colores.azul),
                  ],
                  alTocarAlerta: _abrir,
                ),
                Positioned(
                  right: 12,
                  top: 12,
                  child: FloatingActionButton.small(
                    heroTag: 'centrar',
                    tooltip: 'Centrar en mi ubicación',
                    backgroundColor: Colors.white,
                    foregroundColor: Colores.marino,
                    onPressed: () {
                      _mapa.move(centro, 14);
                      estado.actualizarUbicacion();
                    },
                    child: const Icon(Icons.my_location),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 6,
            child: RefreshIndicator(
              onRefresh: () => estado.actualizarUbicacion(forzar: true),
              child: alertas.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 32),
                        Icon(Icons.verified_user_outlined, size: 56, color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        Text(
                          estado.cargando ? 'Buscando alertas cerca de ti…' : 'No hay alertas cerca de ti',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text(
                            'Si algo importante pasa cerca de ti o de tus zonas, te avisaremos.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
                      itemCount: alertas.length + 1,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        if (i == 0) {
                          return Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Text(
                              activas == 0
                                  ? 'Sin alertas activas · ${alertas.length} recientes'
                                  : '$activas ${activas == 1 ? 'alerta activa' : 'alertas activas'} a menos de 25 km',
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          );
                        }
                        final a = alertas[i - 1];
                        return TarjetaAlerta(alerta: a, distancia: estado.distanciaA(a), alTocar: () => _abrir(a));
                      },
                    ),
            ),
          ),
          const LeyendaNo911(alLlamar: llamar911),
        ],
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 48),
        child: FloatingActionButton.extended(
          heroTag: 'reportar',
          backgroundColor: Colores.rojo,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_alert),
          label: const Text('Reportar', style: TextStyle(fontWeight: FontWeight.w800)),
          onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaReportar())),
        ),
      ),
    );
  }

  String _ubicacionDemo(EstadoApp estado) {
    final p = puntosDemo.where((x) => x.clave == estado.puntoDemo).firstOrNull;
    return p == null ? 'ubicación real (GPS)' : 'estás en el punto ${p.etiqueta}';
  }
}

/// Botón rojo SOS: abre la cuenta regresiva (5 s para cancelar) y después pide ayuda.
class _BotonSos extends StatelessWidget {
  const _BotonSos();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Tooltip(
        message: 'Pedir ayuda (SOS)',
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Colores.rojo,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            shape: const StadiumBorder(side: BorderSide(color: Colors.white, width: 2)),
          ),
          onPressed: () => AlcanceSos.leer(context).iniciarCuenta(OrigenEmergencia.boton),
          child: const Text('SOS', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        ),
      ),
    );
  }
}
