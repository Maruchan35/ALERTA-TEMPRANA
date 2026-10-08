import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

final _miles = NumberFormat.decimalPattern('es_MX');

/// Encabezado con métricas: activas, por validar, tiempo medio de validación, entregas de hoy y
/// teléfonos registrados (si son pocos, las alertas no tienen a quién llegar).
class FilaMetricas extends StatelessWidget {
  const FilaMetricas({super.key, required this.metricas});

  final Metricas? metricas;

  @override
  Widget build(BuildContext context) {
    final m = metricas;
    final tarjetas = [
      ('${m?.activas ?? '—'}', 'activas', Icons.campaign_outlined, Colores.naranja),
      ('${m?.porValidar ?? '—'}', 'por validar', Icons.hourglass_top, Colores.morado),
      (
        m?.segundosValidacion == null ? '—' : duracionLegible(m!.segundosValidacion!),
        'tiempo medio de validación',
        Icons.timer_outlined,
        Colores.verde,
      ),
      (m == null ? '—' : _miles.format(m.entregasHoy), 'entregas hoy', Icons.send_to_mobile_outlined, Colores.azul),
      (
        m?.dispositivosActivos == null ? '—' : _miles.format(m!.dispositivosActivos),
        'teléfonos registrados',
        Icons.smartphone,
        Colores.marino,
      ),
    ];
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        for (final (valor, etiqueta, icono, color) in tarjetas)
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 150),
            child: Card(
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icono, color: color),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(valor, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        Text(etiqueta, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Elemento de las listas del panel.
class TarjetaPanel extends StatelessWidget {
  const TarjetaPanel({super.key, required this.alerta, required this.seleccionada, required this.alTocar});

  final Alerta alerta;
  final bool seleccionada;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) {
    final a = alerta;
    final color = colorEstado(a.estado);
    final detalles = <String>[
      if (a.estado == EstadoAlerta.pendiente) 'hace ${haceCuanto(a.creadaEn).replaceFirst('hace ', '')}',
      if (a.radioVisibleM > 0) formatoRadio(a.radioVisibleM),
      if (a.nConfirmo > 0) '${a.nConfirmo} confirmaciones',
      if (a.nPareceFalsa > 0) '${a.nPareceFalsa} "parece falsa"',
      if ((a.nEntregas ?? 0) > 0) '${a.nEntregas} entregas',
      if (a.estado.cerrada && a.motivoCierre != null) a.motivoCierre!,
    ];
    return Card(
      color: seleccionada ? color.withAlpha(30) : Colors.white,
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
              Container(width: 5, color: color),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${a.nombreCorto.toUpperCase()} · ${a.estado.legible.toUpperCase()}',
                        style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 12.5),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        a.titulo,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      if (detalles.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(detalles.join(' · '), style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: IconoCategoria(categoria: a.categoria, nivel: a.nivel, apagado: a.estado.cerrada, tamano: 32),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class Vacio extends StatelessWidget {
  const Vacio(this.texto, {super.key, this.icono = Icons.inbox_outlined});

  final String texto;
  final IconData icono;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, size: 48, color: Colors.grey.shade400),
          const SizedBox(height: 8),
          Text(
            texto,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade700),
          ),
        ],
      ),
    ),
  );
}

/// Pide un motivo (descartar o resolver).
Future<String?> pedirMotivo(
  BuildContext context, {
  required String titulo,
  required bool obligatorio,
  required List<String> sugerencias,
}) {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(titulo),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: c,
                autofocus: true,
                maxLength: 300,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: obligatorio ? 'Motivo (obligatorio)' : 'Motivo'),
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final s in sugerencias) ActionChip(label: Text(s), onPressed: () => setState(() => c.text = s)),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(
            onPressed: obligatorio && c.text.trim().isEmpty ? null : () => Navigator.pop(context, c.text.trim()),
            child: const Text('Aceptar'),
          ),
        ],
      ),
    ),
  );
}
