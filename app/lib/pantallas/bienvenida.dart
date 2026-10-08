import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../nucleo/estado_app.dart';
import '../nucleo/notificaciones.dart';
import '../nucleo/ubicacion.dart';
import 'aviso_privacidad.dart';

/// Bienvenida en 3 pantallas + permisos con explicación previa (paso 3.8): primero una
/// pantalla propia que dice para qué sirve el permiso y después el cuadro del sistema.
class PantallaBienvenida extends StatefulWidget {
  const PantallaBienvenida({super.key});

  @override
  State<PantallaBienvenida> createState() => _PantallaBienvenidaState();
}

class _PantallaBienvenidaState extends State<PantallaBienvenida> {
  final _paginas = PageController();
  var _pagina = 0;
  var _pidiendo = false;

  static const _diapositivas = [
    (
      Icons.radar,
      'Si algo importante pasa cerca de ti, te avisamos',
      'Menores o personas desaparecidas, incendios, inundaciones, robos de vehículo y otras emergencias: '
          'la alerta llega primero a quienes están cerca, y la zona crece con el tiempo.',
    ),
    (
      Icons.lock_outline,
      'Tu ubicación exacta nunca sale de tu teléfono',
      'Solo usamos una zona de ~1 km. No guardamos tu historial de recorridos. Para recibir alertas no '
          'necesitas crear una cuenta.',
    ),
    (
      Icons.local_phone_outlined,
      'No sustituye al 911',
      'ALERTA CERCA complementa a los sistemas oficiales. En una emergencia, llama siempre al 911.',
    ),
  ];

  Future<void> _permisos() async {
    final estado = AlcanceApp.leer(context);
    setState(() => _pidiendo = true);
    await Notificaciones.pedirPermiso(conFirebase: estado.firebaseListo);
    if (!estado.servicio.esDemo || !kIsWeb) await Ubicacion.pedirPermiso();
    await estado.terminarBienvenida();
  }

  @override
  Widget build(BuildContext context) {
    final total = _diapositivas.length + 1;
    return Scaffold(
      backgroundColor: Colores.marino,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _paginas,
                onPageChanged: (i) => setState(() => _pagina = i),
                children: [
                  for (final (icono, titulo, texto) in _diapositivas)
                    _Diapositiva(icono: icono, titulo: titulo, texto: texto),
                  const _Diapositiva(
                    icono: Icons.notifications_active_outlined,
                    titulo: 'Dos permisos para avisarte',
                    texto:
                        '• Notificaciones: para que la alerta suene aunque tengas la app cerrada.\n\n'
                        '• Ubicación mientras usas la app: para saber en qué zona de ~1 km estás y calcular, en tu '
                        'teléfono, a qué distancia ocurrió algo.\n\n'
                        'La ubicación "todo el tiempo" es opcional y puedes activarla después en Ajustes.',
                  ),
                ],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < total; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.all(4),
                    width: i == _pagina ? 22 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: i == _pagina ? Colors.white : Colors.white38,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Colores.rojo, minimumSize: const Size.fromHeight(52)),
                  onPressed: _pidiendo
                      ? null
                      : _pagina < total - 1
                      ? () => _paginas.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut)
                      : _permisos,
                  child: Text(_pagina < total - 1 ? 'Siguiente' : 'Permitir y empezar'),
                ),
              ),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAvisoPrivacidad())),
              child: const Text('Aviso de privacidad', style: TextStyle(color: Colors.white70)),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _Diapositiva extends StatelessWidget {
  const _Diapositiva({required this.icono, required this.titulo, required this.texto});

  final IconData icono;
  final String titulo;
  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(28),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: const BoxDecoration(color: Colores.marinoClaro, shape: BoxShape.circle),
          child: Icon(icono, size: 72, color: Colors.white),
        ),
        const SizedBox(height: 32),
        Text(
          titulo,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, height: 1.2),
        ),
        const SizedBox(height: 16),
        Text(
          texto,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white70, fontSize: 16, height: 1.4),
        ),
      ],
    ),
  );
}
