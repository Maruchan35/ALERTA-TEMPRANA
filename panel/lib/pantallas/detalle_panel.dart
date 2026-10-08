import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';

import '../app.dart';
import '../widgets/elementos.dart';

/// Detalle de una alerta para el validador: foto, descripción, reputación del autor,
/// confirmaciones, folio del 911, entregas, acciones y bitácora.
class DetallePanel extends StatefulWidget {
  const DetallePanel({super.key, required this.alerta, required this.servicio, required this.alCerrar});

  final Alerta alerta;
  final ServicioAlertas servicio;
  final VoidCallback alCerrar;

  @override
  State<DetallePanel> createState() => _DetallePanelState();
}

class _DetallePanelState extends State<DetallePanel> {
  late Future<List<EntradaBitacora>> _bitacora;
  Future<ImageProvider?>? _foto;
  var _ocupado = false;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void didUpdateWidget(covariant DetallePanel anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.alerta.id != widget.alerta.id ||
        anterior.alerta.estado != widget.alerta.estado ||
        anterior.alerta.radioManualM != widget.alerta.radioManualM ||
        anterior.alerta.nConfirmo != widget.alerta.nConfirmo) {
      _cargar();
    }
  }

  void _cargar() {
    _bitacora = widget.servicio.bitacora(widget.alerta.id);
    final ruta = widget.alerta.fotoPath;
    _foto = ruta == null ? null : widget.servicio.imagenFoto(ruta);
  }

  Future<void> _accion(AccionValidador accion) async {
    String? motivo;
    int? radio;
    switch (accion) {
      case AccionValidador.descartar:
        motivo = await pedirMotivo(
          context,
          titulo: 'Descartar alerta',
          obligatorio: true,
          sugerencias: const ['No se pudo confirmar', 'Reporte duplicado', 'Información falsa', 'Sin folio del 911'],
        );
        if (motivo == null) return;
      case AccionValidador.resolver:
        motivo = await pedirMotivo(
          context,
          titulo: 'Resolver alerta',
          obligatorio: false,
          sugerencias: const [
            'Menor localizado sano y salvo',
            'Persona localizada',
            'Situación controlada',
            'Vehículo recuperado',
          ],
        );
        if (motivo == null) return;
      case AccionValidador.ajustarRadio:
        radio = await showDialog<int>(
          context: context,
          builder: (context) => SimpleDialog(
            title: const Text('Ajustar radio'),
            children: [
              for (final km in const [1, 3, 5, 10, 25])
                SimpleDialogOption(
                  onPressed: () => Navigator.pop(context, km * 1000),
                  child: Text('$km km', style: const TextStyle(fontSize: 16)),
                ),
            ],
          ),
        );
        if (radio == null) return;
      case AccionValidador.verificar:
        break;
    }
    setState(() => _ocupado = true);
    await intentar(
      () => widget.servicio.validar(widget.alerta.id, accion, motivo: motivo, radioM: radio),
      exito: switch (accion) {
        AccionValidador.verificar => 'Verificada: se envía a todos los escalones de radio.',
        AccionValidador.descartar => 'Descartada: se avisa a quienes la recibieron.',
        AccionValidador.resolver => 'Resuelta: se avisa "caso resuelto" a quienes la recibieron.',
        AccionValidador.ajustarRadio => 'Radio fijado en ${formatoRadio(radio!)}.',
      },
    );
    if (mounted) {
      setState(() {
        _ocupado = false;
        _cargar();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.alerta;
    final color = colorEstado(a.estado);
    final cat = categoriaPorClave(a.categoria);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          color: color,
          padding: const EdgeInsets.fromLTRB(8, 8, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    tooltip: 'Volver a la lista',
                    onPressed: widget.alCerrar,
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                  ),
                  Expanded(
                    child: Text(
                      '${a.estado.legible.toUpperCase()} · ${haceCuanto(a.creadaEn)}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                    ),
                  ),
                  InsigniaEstado(a.estado),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Text(
                  '${a.nombreCorto} — ${a.titulo}',
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_foto != null)
                FutureBuilder<ImageProvider?>(
                  future: _foto,
                  builder: (context, s) => s.data == null
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image(image: s.data!, height: 220, fit: BoxFit.cover),
                          ),
                        ),
                ),
              if (a.descripcion != null) Text(a.descripcion!, style: const TextStyle(fontSize: 15)),
              if (a.referencia != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 18),
                      const SizedBox(width: 4),
                      Expanded(child: Text(a.referencia!)),
                    ],
                  ),
                ),
              const SizedBox(height: 12),
              _Fila('Categoría', '${cat.nombre} · nivel ${a.nivel} (${textoNivel(a.nivel)})'),
              _Fila('Reporta', switch (a.autorRol) {
                'validador' ||
                'institucion' ||
                'admin' => 'Institución${a.autorInstitucion != null ? ' · ${a.autorInstitucion}' : ''}',
                _ =>
                  'Cuenta verificada · reputación ${(a.autorReputacion ?? 0) >= 0 ? '+' : ''}${a.autorReputacion ?? 0}',
              }),
              _Fila(
                'Comunidad',
                '${a.nConfirmo} lo confirman · ${a.nYaNoEsta} "ya no está" · ${a.nPareceFalsa} "parece falsa"',
              ),
              if (cat.esDePersonas) ...[
                _Fila(
                  'Folio 911',
                  a.folio911 == null ? 'no proporcionado (pídelo a quien reporta)' : 'sí · ${a.folio911}',
                ),
                _Fila(
                  'Foto',
                  a.fotoPath == null
                      ? 'sin foto'
                      : (a.consentimiento ? 'con consentimiento del tutor' : 'SIN consentimiento'),
                ),
              ],
              _Fila(
                'Radio',
                [
                  a.radioActualM > 0 ? 'enviado hasta ${formatoRadio(a.radioActualM)}' : 'aún no se envía',
                  if (a.radioManualM != null) 'fijado en ${formatoRadio(a.radioManualM!)}',
                  'máximo de la categoría ${formatoRadio(cat.radioMaximo)}',
                ].join(' · '),
              ),
              _Fila(
                'Entregas',
                '${a.nEntregas ?? 0} ${a.nEntregas == 1 ? 'teléfono' : 'teléfonos'} · ${a.nTelegram ?? 0} chats de Telegram',
              ),
              _Fila('Ubicación', '${a.lat.toStringAsFixed(5)}, ${a.lon.toStringAsFixed(5)}'),
              _Fila('Vigencia', 'vence ${fechaHora(a.expiraEn)}'),
              if (a.motivoCierre != null) _Fila('Motivo de cierre', a.motivoCierre!),
              if (cat.esDePersonas && a.estado == EstadoAlerta.pendiente)
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFFF4E5), borderRadius: BorderRadius.circular(10)),
                  child: const Text(
                    'Antes de verificar un caso de personas: contacta a quien reporta y pide el folio del 911 o de '
                    'la denuncia. Una alerta falsa puede usarse para encontrar a alguien que huyó de la violencia. '
                    'Nunca publiques domicilios.',
                  ),
                ),
              if (widget.servicio is ServicioDemo && a.estado.activa) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      avatar: const Icon(Icons.groups, size: 18),
                      label: const Text('Demo: 3 vecinos lo confirman'),
                      onPressed: () => setState(() {
                        (widget.servicio as ServicioDemo).simularVotos(a.id, TipoConfirmacion.confirmo, cuantos: 3);
                        _cargar();
                      }),
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.report_gmailerrorred, size: 18),
                      label: const Text('Demo: 3 dicen "parece falsa"'),
                      onPressed: () => setState(() {
                        (widget.servicio as ServicioDemo).simularVotos(a.id, TipoConfirmacion.pareceFalsa, cuantos: 3);
                        _cargar();
                      }),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 20),
              const Text('BITÁCORA', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1, fontSize: 12)),
              FutureBuilder<List<EntradaBitacora>>(
                future: _bitacora,
                builder: (context, s) {
                  final filas = s.data ?? const <EntradaBitacora>[];
                  if (filas.isEmpty) return const Padding(padding: EdgeInsets.all(8), child: Text('Sin registros'));
                  return Column(
                    children: [
                      for (final b in filas)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.history, size: 20),
                          title: Text(b.descripcion),
                          subtitle: Text(fechaHora(b.creadaEn) + (b.usuarioId == null ? ' · automático' : '')),
                        ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
        // Acciones siempre visibles (no hay que desplazarse para verificar o descartar)
        if (a.estado.abierta)
          Material(
            elevation: 8,
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (a.estado != EstadoAlerta.verificada)
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Colores.verde),
                      onPressed: _ocupado ? null : () => _accion(AccionValidador.verificar),
                      icon: const Icon(Icons.verified),
                      label: const Text('Verificar'),
                    ),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colores.marino),
                    onPressed: _ocupado ? null : () => _accion(AccionValidador.ajustarRadio),
                    icon: const Icon(Icons.radar),
                    label: const Text('Ajustar radio'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _ocupado ? null : () => _accion(AccionValidador.resolver),
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Resolver'),
                  ),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
                    onPressed: _ocupado ? null : () => _accion(AccionValidador.descartar),
                    icon: const Icon(Icons.block),
                    label: const Text('Descartar'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.etiqueta, this.valor);

  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            etiqueta,
            style: TextStyle(color: Colors.grey.shade700, fontWeight: FontWeight.w600),
          ),
        ),
        Expanded(child: Text(valor)),
      ],
    ),
  );
}
