import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';
import 'verificar_telefono.dart';

/// 3. Detalle de alerta: encabezado del color del nivel, insignia de confianza, foto,
/// distancia, qué hacer y las acciones de la comunidad.
class PantallaDetalle extends StatefulWidget {
  const PantallaDetalle({super.key, required this.alertaId, this.inicial});

  final String alertaId;
  final Alerta? inicial;

  @override
  State<PantallaDetalle> createState() => _PantallaDetalleState();
}

class _PantallaDetalleState extends State<PantallaDetalle> {
  Alerta? _alerta;
  bool _cargando = true;
  bool _ocupado = false;
  Future<ImageProvider?>? _foto;
  StreamSubscription<Alerta>? _cambios;

  @override
  void initState() {
    super.initState();
    _alerta = widget.inicial;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargar();
      _cambios = AlcanceApp.leer(context).servicio.cambiosEnAlertas().where((a) => a.id == widget.alertaId).listen((_) {
        _cargar();
      });
    });
  }

  @override
  void dispose() {
    _cambios?.cancel();
    super.dispose();
  }

  Future<void> _cargar() async {
    final servicio = AlcanceApp.leer(context).servicio;
    try {
      final a = await servicio.obtenerAlerta(widget.alertaId);
      if (!mounted) return;
      setState(() {
        _alerta = a;
        _cargando = false;
        final ruta = a?.fotoPath;
        _foto = ruta == null ? null : servicio.imagenFoto(ruta);
      });
    } on ErrorServicio catch (e) {
      if (!mounted) return;
      setState(() => _cargando = false);
      mostrarMensaje(e.mensaje, error: true);
    }
  }

  /// Confirmar requiere cuenta verificada: si es anónima, primero se verifica el número.
  Future<void> _votar(TipoConfirmacion tipo) async {
    final estado = AlcanceApp.leer(context);
    if (estado.perfil?.esAnonimo ?? true) {
      final ok = await Navigator.push<bool>(
        context,
        MaterialPageRoute(builder: (_) => const PantallaVerificarTelefono(motivo: 'confirmar alertas')),
      );
      if (ok != true) return;
    }
    setState(() => _ocupado = true);
    await intentar(
      () => estado.servicio.confirmar(widget.alertaId, tipo),
      exito: switch (tipo) {
        TipoConfirmacion.confirmo => 'Gracias. Tu confirmación ayuda a que la alerta llegue más lejos.',
        TipoConfirmacion.yaNoEsta => 'Gracias por avisar.',
        TipoConfirmacion.pareceFalsa => 'Gracias. Si más vecinos coinciden, la alerta regresa a revisión.',
      },
    );
    if (mounted) setState(() => _ocupado = false);
    await _cargar();
    estado.programarRecarga();
  }

  Future<void> _accionValidador(AccionValidador accion) async {
    final estado = AlcanceApp.leer(context);
    String? motivo;
    int? radio;
    if (accion == AccionValidador.descartar || accion == AccionValidador.resolver) {
      motivo = await pedirTexto(
        context,
        titulo: accion == AccionValidador.resolver ? 'Marcar como resuelta' : 'Descartar alerta',
        etiqueta: 'Motivo',
        obligatorio: accion == AccionValidador.descartar,
        sugerencias: accion == AccionValidador.resolver
            ? const ['Localizado sano y salvo', 'Situación controlada', 'Ya no hay riesgo']
            : const ['No se pudo confirmar', 'Reporte duplicado', 'Información falsa'],
      );
      if (motivo == null) return;
    } else if (accion == AccionValidador.ajustarRadio) {
      radio = await showDialog<int>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Ajustar radio'),
          children: [
            for (final km in const [1, 3, 5, 10, 25])
              SimpleDialogOption(onPressed: () => Navigator.pop(context, km * 1000), child: Text('$km km')),
          ],
        ),
      );
      if (radio == null) return;
    }
    if (!mounted) return;
    setState(() => _ocupado = true);
    await intentar(
      () => estado.servicio.validar(widget.alertaId, accion, motivo: motivo, radioM: radio),
      exito: 'Listo: ${accion.texto.toLowerCase()}.',
    );
    if (mounted) setState(() => _ocupado = false);
    await _cargar();
    estado.programarRecarga();
  }

  Future<void> _resolverMiReporte() async {
    final motivo = await pedirTexto(
      context,
      titulo: 'Marcar como resuelta',
      etiqueta: '¿Qué pasó?',
      ayuda: 'Avisaremos a todas las personas que recibieron la alerta.',
      obligatorio: false,
      sugerencias: const ['Ya apareció', 'Situación controlada', 'Ya no hay riesgo'],
    );
    if (motivo == null || !mounted) return;
    final estado = AlcanceApp.leer(context);
    await intentar(
      () => estado.servicio.validar(widget.alertaId, AccionValidador.resolver, motivo: motivo),
      exito: 'Gracias. Avisamos que el caso se resolvió.',
    );
    await _cargar();
    estado.programarRecarga();
  }

  @override
  Widget build(BuildContext context) {
    final estado = AlcanceApp.of(context);
    final a = _alerta;
    if (a == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Alerta')),
        body: Center(
          child: _cargando
              ? const CircularProgressIndicator()
              : const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Esta alerta ya no está disponible.', textAlign: TextAlign.center),
                ),
        ),
      );
    }
    final cerrada = !a.estado.abierta;
    final color = cerrada ? Colores.gris : colorNivel(a.nivel);
    final distancia = estado.distanciaA(a);
    final cat = categoriaPorClave(a.categoria);
    final esValidador = estado.perfil?.rol.esValidador ?? false;
    final demo = estado.demo;
    final siguiente = siguienteEscalon(
      categoria: cat,
      estado: a.estado,
      publicadaEn: a.publicadaEn,
      ahora: DateTime.now(),
      radioManualM: a.radioManualM,
      factorTiempo: demo?.factorTiempo ?? 1,
    );

    return Scaffold(
      appBar: AppBar(
        backgroundColor: color,
        title: Text(a.nombreCorto.toUpperCase()),
        actions: [
          IconButton(
            tooltip: 'Compartir con contexto',
            icon: const Icon(Icons.share),
            onPressed: () => SharePlus.instance.share(ShareParams(text: textoParaCompartir(a))),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            Container(
              color: color,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      InsigniaEstado(a.estado),
                      const SizedBox(width: 8),
                      Text(
                        'Nivel ${a.nivel} · ${textoNivel(a.nivel)}',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(a.estado.explicacion, style: const TextStyle(color: Colors.white)),
                  if (a.validadaPor != null && a.estado == EstadoAlerta.verificada)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Validada por ${a.validadaPor}',
                        style: const TextStyle(color: Colors.white, fontStyle: FontStyle.italic),
                      ),
                    ),
                ],
              ),
            ),
            if (cerrada)
              _Aviso(
                icono: a.estado == EstadoAlerta.resuelta ? Icons.check_circle : Icons.block,
                color: a.estado == EstadoAlerta.resuelta ? Colores.verde : Colores.gris,
                texto:
                    '${a.estado.legible.toUpperCase()}'
                    '${a.cerradaEn != null ? ' · ${fechaHora(a.cerradaEn!)}' : ''}'
                    '${a.motivoCierre != null ? '\n${a.motivoCierre}' : ''}',
              ),
            if (a.estado == EstadoAlerta.pendiente && a.esMia)
              const _Aviso(
                icono: Icons.hourglass_top,
                color: Colores.morado,
                texto:
                    'Tu reporte está en revisión. Un validador lo revisará en minutos. '
                    'Mientras tanto no se difunde a nadie.',
              ),
            if (_foto != null)
              FutureBuilder<ImageProvider?>(
                future: _foto,
                builder: (context, snap) => snap.data == null
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(14),
                              child: Image(image: snap.data!, height: 240, width: double.infinity, fit: BoxFit.cover),
                            ),
                            if (cat.esDePersonas)
                              const Padding(
                                padding: EdgeInsets.only(top: 4),
                                child: Text(
                                  'Foto publicada con consentimiento del familiar o tutor.',
                                  style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                                ),
                              ),
                          ],
                        ),
                      ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    [
                      if (distancia != null)
                        'A ${formatoDistancia(distancia.metros)} ${distancia.zona == null ? 'de ti' : 'de ${distancia.zona}'}',
                      haceCuanto(a.creadaEn),
                    ].join(' · '),
                    style: TextStyle(color: color, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(a.titulo, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  if (a.descripcion != null) ...[
                    const SizedBox(height: 8),
                    Text(a.descripcion!, style: const TextStyle(fontSize: 15.5)),
                  ],
                  if (a.referencia != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.place_outlined, size: 18),
                        const SizedBox(width: 4),
                        Expanded(child: Text(a.referencia!)),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 16,
                    runSpacing: 6,
                    children: [
                      _Dato(Icons.radar, 'Radio actual: ${a.radioVisibleM > 0 ? formatoRadio(a.radioVisibleM) : '—'}'),
                      if (siguiente != null)
                        _Dato(
                          Icons.trending_up,
                          'Crece a ${formatoRadio(siguiente.radioM)} ${dentroDe(siguiente.falta)}',
                        ),
                      _Dato(
                        Icons.groups_outlined,
                        '${a.nConfirmo} ${a.nConfirmo == 1 ? 'vecino lo confirmó' : 'vecinos lo confirmaron'}',
                      ),
                      if (a.nYaNoEsta > 0)
                        _Dato(Icons.do_not_disturb_on_outlined, '${a.nYaNoEsta} dicen que ya no está'),
                    ],
                  ),
                ],
              ),
            ),
            if (a.instrucciones != null && !cerrada)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Card(
                  color: const Color(0xFFFFF4E5),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.tips_and_updates_outlined, color: Color(0xFF8A4B00)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Qué hacer', style: TextStyle(fontWeight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text(a.instrucciones!),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (a.estado.activa && !a.esMia) ...[
                    _BotonVoto(
                      tipo: TipoConfirmacion.confirmo,
                      seleccionado: a.miConfirmacion == 'confirmo',
                      principal: true,
                      alPresionar: _ocupado ? null : () => _votar(TipoConfirmacion.confirmo),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _BotonVoto(
                            tipo: TipoConfirmacion.yaNoEsta,
                            seleccionado: a.miConfirmacion == 'ya_no_esta',
                            alPresionar: _ocupado ? null : () => _votar(TipoConfirmacion.yaNoEsta),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _BotonVoto(
                            tipo: TipoConfirmacion.pareceFalsa,
                            seleccionado: a.miConfirmacion == 'parece_falsa',
                            alPresionar: _ocupado ? null : () => _votar(TipoConfirmacion.pareceFalsa),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
                    onPressed: llamar911,
                    icon: const Icon(Icons.call),
                    label: const Text('Llamar al 911'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => SharePlus.instance.share(ShareParams(text: textoParaCompartir(a))),
                    icon: const Icon(Icons.share_outlined),
                    label: const Text('Compartir con contexto'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => launchUrl(
                      Uri.parse('https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=17/${a.lat}/${a.lon}'),
                      mode: LaunchMode.externalApplication,
                    ),
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('Ver en el mapa'),
                  ),
                  if (a.esMia && a.estado.abierta) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: Colores.verde),
                      onPressed: _ocupado ? null : _resolverMiReporte,
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('Marcar como resuelta'),
                    ),
                  ],
                  if (esValidador && a.estado.abierta) ...[
                    const Seccion('Acciones de validador'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (a.estado != EstadoAlerta.verificada)
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: Colores.verde),
                            onPressed: _ocupado ? null : () => _accionValidador(AccionValidador.verificar),
                            child: const Text('Verificar'),
                          ),
                        OutlinedButton(
                          onPressed: _ocupado ? null : () => _accionValidador(AccionValidador.ajustarRadio),
                          child: const Text('Ajustar radio'),
                        ),
                        OutlinedButton(
                          onPressed: _ocupado ? null : () => _accionValidador(AccionValidador.resolver),
                          child: const Text('Resolver'),
                        ),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(foregroundColor: Colores.rojo),
                          onPressed: _ocupado ? null : () => _accionValidador(AccionValidador.descartar),
                          child: const Text('Descartar'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    'Publicada ${fechaHora(a.creadaEn)} · vence ${fechaHora(a.expiraEn)}.\n'
                    'ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.icono, required this.color, required this.texto});

  final IconData icono;
  final Color color;
  final String texto;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: color.withAlpha(24),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: color.withAlpha(90)),
    ),
    child: Row(
      children: [
        Icon(icono, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            texto,
            style: TextStyle(color: color, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _Dato extends StatelessWidget {
  const _Dato(this.icono, this.texto);

  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icono, size: 16, color: Colors.grey.shade700),
      const SizedBox(width: 4),
      Text(texto, style: TextStyle(fontSize: 13, color: Colors.grey.shade800)),
    ],
  );
}

class _BotonVoto extends StatelessWidget {
  const _BotonVoto({required this.tipo, required this.seleccionado, required this.alPresionar, this.principal = false});

  final TipoConfirmacion tipo;
  final bool seleccionado;
  final bool principal;
  final VoidCallback? alPresionar;

  @override
  Widget build(BuildContext context) {
    final icono = switch (tipo) {
      TipoConfirmacion.confirmo => Icons.visibility,
      TipoConfirmacion.yaNoEsta => Icons.do_not_disturb_on_outlined,
      TipoConfirmacion.pareceFalsa => Icons.report_gmailerrorred,
    };
    final texto = seleccionado ? '${tipo.texto} ✓' : tipo.texto;
    if (principal) {
      return FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: seleccionado ? Colores.verde : Colores.marino),
        onPressed: alPresionar,
        icon: Icon(icono),
        label: Text(texto),
      );
    }
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        backgroundColor: seleccionado ? Colores.marino.withAlpha(20) : null,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      onPressed: alPresionar,
      icon: Icon(icono, size: 18),
      label: FittedBox(child: Text(texto)),
    );
  }
}
