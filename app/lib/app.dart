import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'nucleo/estado_app.dart';
import 'nucleo/notificaciones.dart';
import 'pantallas/bienvenida.dart';
import 'pantallas/detalle.dart';
import 'pantallas/inicio.dart';

final navegador = GlobalKey<NavigatorState>();
final mensajero = GlobalKey<ScaffoldMessengerState>();

class AlertaCercaApp extends StatefulWidget {
  const AlertaCercaApp({super.key, required this.estado});

  final EstadoApp estado;

  @override
  State<AlertaCercaApp> createState() => _AlertaCercaAppState();
}

class _AlertaCercaAppState extends State<AlertaCercaApp> {
  final _suscripciones = <StreamSubscription<Object?>>[];

  @override
  void initState() {
    super.initState();
    _suscripciones
      ..add(Notificaciones.alTocar.stream.listen(abrirAlerta))
      ..add(Notificaciones.enPantalla.stream.listen(_mostrarAviso));
    widget.estado.addListener(_alIniciar);
  }

  void _alIniciar() {
    if (!widget.estado.iniciado) return;
    widget.estado.removeListener(_alIniciar);
    final pendiente = Notificaciones.pendiente;
    if (pendiente != null) {
      Notificaciones.pendiente = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => abrirAlerta(pendiente));
    }
  }

  void abrirAlerta(String id) {
    navegador.currentState?.push(MaterialPageRoute<void>(builder: (_) => PantallaDetalle(alertaId: id)));
  }

  /// En la web (o sin notificaciones del sistema) el aviso aparece como banner.
  void _mostrarAviso(AvisoVisible aviso) {
    final m = mensajero.currentState;
    if (m == null) return;
    m
      ..clearMaterialBanners()
      ..showMaterialBanner(
        MaterialBanner(
          backgroundColor: colorNivel(aviso.nivel),
          leading: const Icon(Icons.notifications_active, color: Colors.white),
          content: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                aviso.titulo,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 2),
              Text(aviso.cuerpo, style: const TextStyle(color: Colors.white)),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                m.hideCurrentMaterialBanner();
                abrirAlerta(aviso.alertaId);
              },
              child: const Text(
                'VER',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
              ),
            ),
            IconButton(
              tooltip: 'Cerrar',
              onPressed: m.hideCurrentMaterialBanner,
              icon: const Icon(Icons.close, color: Colors.white),
            ),
          ],
        ),
      );
    Timer(const Duration(seconds: 12), () => m.mounted ? m.hideCurrentMaterialBanner() : null);
  }

  @override
  void dispose() {
    for (final s in _suscripciones) {
      s.cancel();
    }
    widget.estado.removeListener(_alIniciar);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlcanceApp(
      estado: widget.estado,
      child: MaterialApp(
        title: 'ALERTA CERCA',
        debugShowCheckedModeBanner: false,
        navigatorKey: navegador,
        scaffoldMessengerKey: mensajero,
        theme: temaAlertaCerca(),
        locale: const Locale('es', 'MX'),
        supportedLocales: const [Locale('es', 'MX'), Locale('es')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: ListenableBuilder(
          listenable: widget.estado,
          builder: (context, _) {
            if (!widget.estado.iniciado) return const _Arranque();
            return widget.estado.bienvenidaVista ? const PantallaInicio() : const PantallaBienvenida();
          },
        ),
      ),
    );
  }
}

class _Arranque extends StatelessWidget {
  const _Arranque();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colores.marino,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.radar, size: 72, color: Colors.white),
            SizedBox(height: 16),
            Text(
              'ALERTA CERCA',
              style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 2),
            ),
            SizedBox(height: 24),
            SizedBox(width: 28, height: 28, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3)),
          ],
        ),
      ),
    );
  }
}
