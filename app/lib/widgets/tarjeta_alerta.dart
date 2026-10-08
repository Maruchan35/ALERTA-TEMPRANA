import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';

/// Elemento de la lista de inicio: "MENOR DESAPARECIDO · 450 m · hace 10 min · VERIFICADA".
class TarjetaAlerta extends StatelessWidget {
  const TarjetaAlerta({super.key, required this.alerta, required this.distancia, required this.alTocar});

  final Alerta alerta;
  final ({double metros, String? zona})? distancia;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final a = alerta;
    final cerrada = !a.estado.abierta;
    final color = cerrada ? Colores.gris : colorNivel(a.nivel);
    final lugar = distancia == null
        ? null
        : distancia!.zona == null
        ? formatoDistancia(distancia!.metros)
        : '${formatoDistancia(distancia!.metros)} de ${distancia!.zona}';
    return Card(
      color: Colors.white,
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
                      IconoCategoria(categoria: a.categoria, nivel: a.nivel, apagado: cerrada, tamano: 40),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              a.nombreCorto.toUpperCase(),
                              style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 13.5),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              a.titulo,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 8,
                              runSpacing: 4,
                              children: [
                                Text(
                                  [?lugar, haceCuanto(a.creadaEn)].join(' · '),
                                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
                                ),
                                InsigniaEstado(a.estado, compacta: true),
                                if (a.esMia)
                                  const Text(
                                    'TU REPORTE',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colores.marino),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right),
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
