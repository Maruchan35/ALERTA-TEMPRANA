import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';

import '../app.dart';

/// Lo que reciben los 4 teléfonos simulados de la demo (A, B, C, D) y el validador.
/// Vive mientras el panel está abierto, aunque se cambie de pestaña.
class RegistroAvisos extends ChangeNotifier {
  RegistroAvisos(this.demo) {
    _suscripcion = demo.avisos.listen((a) {
      porDispositivo.putIfAbsent(a.dispositivo, () => []).insert(0, a);
      notifyListeners();
    });
  }

  final ServicioDemo demo;
  final porDispositivo = <String, List<AvisoDemo>>{};
  late final StreamSubscription<AvisoDemo> _suscripcion;

  void limpiar() {
    porDispositivo.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _suscripcion.cancel();
    super.dispose();
  }
}

/// Simulador de la demostración (plan B del pitch, sin teléfonos ni internet):
/// el suceso ocurre en el centro de Lázaro Cárdenas y cada teléfono muestra la
/// notificación tal como la armaría la app (distancia calculada en el teléfono).
class PanelSimulador extends StatelessWidget {
  const PanelSimulador({super.key, required this.registro});

  final RegistroAvisos registro;

  ServicioDemo get demo => registro.demo;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: registro,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Text(
            'Factor de tiempo ${demo.factorTiempo.round()}: 1 minuto real = ${demo.factorTiempo.round()} minutos. '
            'Con un menor desaparecido verificado: A (300 m) al instante, B (2.6 km) a los ~30 s, '
            'C (6 km) a los ~2 min y D (Zihuatanejo, 76 km) nunca.',
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
                onPressed: () => intentar(
                  () => demo.simularReporteCiudadano(
                    categoria: 'menor_desaparecido',
                    titulo: 'Niño de 8 años, playera roja y short azul',
                    descripcion: 'Visto por última vez frente al mercado municipal. Datos ficticios.',
                  ),
                  exito: 'Un ciudadano reportó un menor desaparecido: queda EN REVISIÓN (pestaña "Por validar").',
                ),
                icon: const Icon(Icons.child_care),
                label: const Text('Ciudadano reporta un menor'),
              ),
              OutlinedButton.icon(
                onPressed: () => intentar(
                  () => demo.simularReporteCiudadano(
                    categoria: 'incendio',
                    titulo: 'Sale humo de una casa en la colonia Centro',
                    punto: puntosDemo.first,
                  ),
                  exito: 'Reporte ciudadano publicado como NO CONFIRMADO: llega máximo a 1 km.',
                ),
                icon: const Icon(Icons.local_fire_department),
                label: const Text('Ciudadano reporta un incendio'),
              ),
              TextButton.icon(
                onPressed: registro.limpiar,
                icon: const Icon(Icons.clear_all),
                label: const Text('Limpiar notificaciones'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, c) {
              final columnas = c.maxWidth > 560 ? 2 : 1;
              final ancho = (c.maxWidth - (columnas - 1) * 10) / columnas;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final p in puntosDemo)
                    SizedBox(
                      width: ancho,
                      child: _Telefono(punto: p, avisos: registro.porDispositivo[p.clave] ?? const []),
                    ),
                  SizedBox(
                    width: ancho,
                    child: _Telefono(punto: null, avisos: registro.porDispositivo['validador'] ?? const []),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Telefono extends StatelessWidget {
  const _Telefono({required this.punto, required this.avisos});

  /// null = el teléfono del validador.
  final PuntoDemo? punto;
  final List<AvisoDemo> avisos;

  @override
  Widget build(BuildContext context) {
    final p = punto;
    final distancia = p == null ? null : distanciaMetros(p.lat, p.lon, sucesoDemo.lat, sucesoDemo.lon);
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1B2A41),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.black, width: 3),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(p == null ? Icons.admin_panel_settings : Icons.smartphone, color: Colors.white, size: 18),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  p == null ? 'Validador' : 'Teléfono ${p.etiqueta}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
                ),
              ),
              if (distancia != null)
                Text(
                  '${formatoDistancia(distancia)} · ${p!.celda}',
                  style: const TextStyle(color: Colors.white60, fontSize: 11),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (avisos.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Text(
                'Sin notificaciones',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54),
              ),
            ),
          for (final a in avisos.take(4)) _Notificacion(aviso: a, punto: p),
        ],
      ),
    );
  }
}

class _Notificacion extends StatelessWidget {
  const _Notificacion({required this.aviso, required this.punto});

  final AvisoDemo aviso;
  final PuntoDemo? punto;

  @override
  Widget build(BuildContext context) {
    final d = aviso.datos;
    var nivel = int.tryParse(d['nivel'] ?? '') ?? 2;
    var cuerpo = d['cuerpo'] ?? '';
    // Igual que la app: la distancia se calcula en el teléfono
    if (aviso.tipo == 'nueva' && punto != null) {
      final m = distanciaMetros(punto!.lat, punto!.lon, double.parse(d['lat']!), double.parse(d['lon']!));
      if (m > (double.tryParse(d['radio_m'] ?? '') ?? 0)) nivel = nivel > 2 ? 2 : nivel;
      cuerpo = cuerpoConDistancia(distancia: formatoDistancia(m), estado: d['estado']!, cuerpo: cuerpo);
    } else if (aviso.tipo != 'nueva') {
      nivel = aviso.tipo == 'validacion' ? 3 : 2;
    }
    final color = aviso.tipo == 'cierre' ? Colores.verde : colorNivel(nivel);
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(width: 4, height: 38, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        d['titulo'] ?? '',
                        style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 12.5),
                      ),
                    ),
                    Text(haceCuanto(aviso.cuando), style: const TextStyle(fontSize: 10.5, color: Colors.black54)),
                  ],
                ),
                Text(cuerpo, style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
