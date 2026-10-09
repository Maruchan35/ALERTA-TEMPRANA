import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../app.dart';
import '../nucleo/copia_evidencia.dart';
import '../nucleo/emergencia.dart';
import '../widgets/comunes.dart';

Route<void>? _rutaSos;
NavigatorState? _navegadorSos;

/// Muestra la pantalla del SOS encima de todo (si no está ya).
void abrirPantallaSos() {
  final nav = navegador.currentState;
  if (_rutaSos != null && identical(nav, _navegadorSos) && _rutaSos!.isActive) return;
  if (nav == null) {
    // La app apenas arranca (p. ej. la abrió una sacudida): en cuanto haya pantalla
    WidgetsBinding.instance.addPostFrameCallback((_) => abrirPantallaSos());
    return;
  }
  final ruta = MaterialPageRoute<void>(builder: (_) => const PantallaEmergencia(), fullscreenDialog: true);
  _rutaSos = ruta;
  _navegadorSos = nav;
  nav.push(ruta).whenComplete(() {
    if (identical(_rutaSos, ruta)) _rutaSos = null;
  });
}

void cerrarPantallaSos() {
  final ruta = _rutaSos;
  _rutaSos = null;
  if (ruta != null && ruta.isActive) navegador.currentState?.removeRoute(ruta);
}

/// MODO EMERGENCIA (SOS): la cuenta regresiva, la emergencia abierta y cómo terminó.
class PantallaEmergencia extends StatelessWidget {
  const PantallaEmergencia({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AlcanceSos.of(context);
    return switch (c.etapa) {
      EtapaSos.cuentaRegresiva => _Cuenta(control: c),
      EtapaSos.enviando || EtapaSos.activa => _Activa(control: c),
      EtapaSos.terminada => _Final(control: c),
      EtapaSos.inactiva => const Scaffold(backgroundColor: Colores.rojo),
    };
  }
}

class _Cuenta extends StatelessWidget {
  const _Cuenta({required this.control});

  final ControlEmergencia control;

  @override
  Widget build(BuildContext context) {
    final c = control;
    const blanco = TextStyle(color: Colors.white);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) c.cancelarCuenta();
      },
      child: Scaffold(
        backgroundColor: Colores.rojo,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Spacer(),
                Text(
                  c.simulacro ? 'SIMULACRO' : 'PEDIR AYUDA',
                  style: blanco.copyWith(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 3),
                ),
                if (c.origen == OrigenEmergencia.movimiento)
                  Text('Detectamos una sacudida fuerte', style: blanco.copyWith(fontSize: 15)),
                const SizedBox(height: 8),
                Semantics(
                  liveRegion: true,
                  label: 'Faltan ${c.restantes} segundos',
                  child: Text(
                    '${c.restantes}',
                    style: blanco.copyWith(fontSize: 140, fontWeight: FontWeight.w900, height: 1.1),
                  ),
                ),
                Text(
                  c.simulacro
                      ? 'Es un simulacro: no se avisará a nadie.'
                      : 'En ${c.restantes} s avisamos a Protección Civil y compartimos tu ubicación en vivo.',
                  textAlign: TextAlign.center,
                  style: blanco.copyWith(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 96,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colores.rojo,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    ),
                    onPressed: () async {
                      final ok = await c.intentarDetener(CierreEmergencia.falsaAlarma);
                      if (!ok) {
                        mostrarMensaje('Para cancelar, confirma con tu huella o PIN.', error: true);
                      }
                    },
                    child: Text(
                      c.pinActivado ? 'CANCELAR (HUELLA/PIN)' : 'CANCELAR',
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: c.activar,
                  child: Text(
                    'Pedir ayuda ya',
                    style: blanco.copyWith(
                      fontSize: 17,
                      decoration: TextDecoration.underline,
                      decorationColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Activa extends StatelessWidget {
  const _Activa({required this.control});

  final ControlEmergencia control;

  Future<void> _terminar(BuildContext context, CierreEmergencia cierre) async {
    final aSalvo = cierre == CierreEmergencia.aSalvo;
    // Con protección por PIN, la huella/PIN ES la confirmación; sin ella, se pregunta antes
    if (control.pinActivado) {
      final ok = await control.intentarDetener(cierre);
      if (!ok) mostrarMensaje('Para terminar el SOS, confirma con tu huella o PIN.', error: true);
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(aSalvo ? '¿Estás a salvo?' : '¿Fue sin querer?'),
        content: Text(
          control.simulacro
              ? 'Terminará el simulacro.'
              : aSalvo
              ? 'Dejaremos de compartir tu ubicación y avisaremos a los validadores que estás a salvo.'
              : 'Dejaremos de compartir tu ubicación y avisaremos que fue una falsa alarma.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No, seguir')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colores.verde),
            onPressed: () => Navigator.pop(context, true),
            child: Text(aSalvo ? 'Sí, estoy a salvo' : 'Sí, fue sin querer'),
          ),
        ],
      ),
    );
    if (ok ?? false) await control.intentarDetener(cierre);
  }

  @override
  Widget build(BuildContext context) {
    final c = control;
    final e = c.estado;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colores.rojo,
        foregroundColor: Colors.white,
        title: Text(c.simulacro ? 'SIMULACRO · SOS' : 'SOS ACTIVO'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _Estado(control: c),
          const SizedBox(height: 14),
          SizedBox(
            height: 64,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: Colores.rojo,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: llamar911,
              icon: const Icon(Icons.call, size: 28),
              label: const Text('LLAMAR AL 911', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(height: 14),
          _Evidencia(control: c),
          const SizedBox(height: 16),
          const Text('¿Qué está pasando? (un toque)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in TipoEmergencia.values.where((t) => t != TipoEmergencia.sos))
                ChoiceChip(
                  label: Text(t.enPrimeraPersona),
                  selected: e?.tipo == t,
                  selectedColor: Colores.rojo.withAlpha(40),
                  onSelected: e == null ? null : (_) => c.indicarTipo(t),
                ),
            ],
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => SharePlus.instance.share(ShareParams(text: c.textoParaCompartir())),
            icon: const Icon(Icons.share_location),
            label: const Text('Compartir mi ubicación con alguien de confianza'),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 56,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Colores.verde),
              onPressed: () => _terminar(context, CierreEmergencia.aSalvo),
              icon: const Icon(Icons.check_circle),
              label: const Text('ESTOY A SALVO', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(height: 4),
          TextButton(
            onPressed: () => _terminar(context, CierreEmergencia.falsaAlarma),
            child: const Text('Fue sin querer (falsa alarma)'),
          ),
          const SizedBox(height: 12),
          Text(
            'Tu ubicación exacta y el video solo los ven Protección Civil y los validadores del CCE (no tus vecinos). '
            'Al terminar se deja de compartir, y todo se borra a los 30 días.',
            style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
          ),
        ],
      ),
    );
  }
}

class _Estado extends StatelessWidget {
  const _Estado({required this.control});

  final ControlEmergencia control;

  @override
  Widget build(BuildContext context) {
    final c = control;
    final e = c.estado;
    final (IconData icono, Color color, String titulo, String detalle) = c.simulacro
        ? (
            Icons.science_outlined,
            Colores.morado,
            'Simulacro: así se vería',
            'No se avisó a nadie ni se graba nada. Practica dónde están los botones.',
          )
        : c.etapa == EtapaSos.enviando
        ? (
            Icons.cell_tower,
            Colores.naranja,
            c.error == null ? 'Enviando tu alerta…' : 'Sin conexión: seguimos intentando',
            c.error == null
                ? 'En un momento llega a los validadores de guardia.'
                : '${c.error}\nMientras tanto, llama al 911.',
          )
        : e?.atendidaPor != null
        ? (
            Icons.support_agent,
            Colores.verde,
            '${e!.atendidaPor} ya te está siguiendo',
            e.policiaAvisada
                ? 'La policía (911) ya fue avisada. Ven tu ubicación en vivo.'
                : 'Ven tu ubicación en vivo y pueden avisar al 911.',
          )
        : (
            Icons.notifications_active,
            Colores.rojo,
            'Tu alerta llegó',
            'Avisamos a los validadores de guardia. Tu ubicación se comparte en vivo.',
          );
    final senal = c.ultimaSenal == null
        ? null
        : 'Ubicación enviada ${haceCuanto(c.ultimaSenal!)}'
              '${c.precisionM == null ? '' : ' · ± ${c.precisionM!.round()} m'}';
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withAlpha(25),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color, width: 1.5),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (c.etapa == EtapaSos.enviando && c.error == null)
              const Padding(
                padding: EdgeInsets.all(4),
                child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3)),
              )
            else
              Icon(icono, color: color, size: 36),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: color),
                  ),
                  const SizedBox(height: 2),
                  Text(detalle),
                  if (senal != null && !c.simulacro) ...[
                    const SizedBox(height: 4),
                    Text(senal, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Evidencia: video con audio mientras esta pantalla está abierta, en fragmentos de 15 s
/// que se suben en cuanto terminan (si quitan el teléfono, lo grabado ya está a salvo).
class _Evidencia extends StatefulWidget {
  const _Evidencia({required this.control});

  final ControlEmergencia control;

  @override
  State<_Evidencia> createState() => _EvidenciaState();
}

class _EvidenciaState extends State<_Evidencia> with WidgetsBindingObserver {
  CameraController? _camara;
  List<CameraDescription> _camaras = const [];
  var _indice = 0;
  Timer? _corte;
  DateTime? _inicio;
  String? _problema;
  var _abriendo = false;

  ControlEmergencia get c => widget.control;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _preparar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cerrar();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado == AppLifecycleState.resumed) {
      if (c.visible) _abrir();
    } else if (estado == AppLifecycleState.inactive || estado == AppLifecycleState.paused) {
      // Al salir de la app (p. ej. al llamar al 911) se guarda el fragmento; la ubicación sigue
      _cerrar().then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  Future<void> _preparar() async {
    if (kIsWeb) {
      setState(() => _problema = 'El video de evidencia se graba en la app de Android.');
      return;
    }
    try {
      _camaras = await availableCameras();
    } catch (_) {
      _camaras = const [];
    }
    if (!mounted) return;
    if (_camaras.isEmpty) {
      setState(() => _problema = 'Cámara no disponible. Tu ubicación se sigue compartiendo.');
      return;
    }
    final trasera = _camaras.indexWhere((x) => x.lensDirection == CameraLensDirection.back);
    _indice = trasera < 0 ? 0 : trasera;
    await _abrir();
  }

  Future<void> _abrir() async {
    if (_abriendo || _camara != null || _camaras.isEmpty || !mounted) return;
    _abriendo = true;
    // 720p: se distinguen rostros y placas. El teléfono ya lo comprime (H.264, como WhatsApp) a un
    // bitrate fijo: ~3 MB cada 15 s, que se suben con datos móviles y el portal reproduce tal cual.
    final camara = CameraController(
      _camaras[_indice],
      ResolutionPreset.high,
      enableAudio: true,
      videoBitrate: 1500000,
      audioBitrate: 64000,
    );
    try {
      await camara.initialize();
      if (!mounted) {
        await camara.dispose();
        return;
      }
      _camara = camara;
      _problema = null;
      if (!c.simulacro) await _grabar();
    } on CameraException catch (e) {
      await camara.dispose();
      _problema = e.code.toLowerCase().contains('access') || e.code.toLowerCase().contains('permission')
          ? 'Sin permiso de cámara o micrófono. Tu ubicación se sigue compartiendo.'
          : 'No se pudo abrir la cámara. Tu ubicación se sigue compartiendo.';
    } finally {
      _abriendo = false;
      if (mounted) setState(() {});
    }
  }

  Future<void> _grabar() async {
    final camara = _camara;
    if (camara == null || camara.value.isRecordingVideo || !c.abierta) return;
    await camara.startVideoRecording();
    c.camaraActiva = true; // el video ya captura audio: el grabador de audio se pausa
    _inicio = DateTime.now();
    _corte?.cancel();
    _corte = Timer(const Duration(seconds: 15), _cortar);
  }

  /// Cierra el fragmento (se sube enseguida) y empieza el siguiente.
  Future<void> _cortar() async {
    final camara = _camara;
    if (camara == null || !camara.value.isRecordingVideo) return;
    try {
      final archivo = await camara.stopVideoRecording();
      await c.agregarFragmento(archivo.path, DateTime.now().difference(_inicio ?? DateTime.now()));
      if (mounted && identical(camara, _camara)) await _grabar();
    } on CameraException catch (e) {
      debugPrint('Video del SOS: ${e.description}');
    }
  }

  Future<void> _cerrar() async {
    _corte?.cancel();
    final camara = _camara;
    _camara = null;
    c.camaraActiva = false; // sin cámara grabando: el audio puede seguir con la pantalla apagada
    if (camara == null) return;
    if (camara.value.isRecordingVideo) {
      try {
        final archivo = await camara.stopVideoRecording();
        await c.agregarFragmento(archivo.path, DateTime.now().difference(_inicio ?? DateTime.now()));
      } catch (_) {}
    }
    await camara.dispose();
  }

  Future<void> _alternar() async {
    if (_camaras.length < 2) return;
    await _cerrar();
    _indice = (_indice + 1) % _camaras.length;
    await _abrir();
  }

  @override
  Widget build(BuildContext context) {
    final camara = _camara;
    final grabando = camara?.value.isRecordingVideo ?? false;
    final resumen = c.simulacro
        ? 'Simulacro: la cámara no graba.'
        : _problema ??
              (c.etapa == EtapaSos.enviando
                  ? 'El video empieza a subir en cuanto tu alerta llegue.'
                  : 'Evidencia enviada: ${c.enviados}${c.pendientes > 0 ? ' · por subir: ${c.pendientes}' : ''}'
                        '${c.copias > 0 ? ' · copia en tu teléfono: ${c.copias}' : ''}');
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (camara != null && camara.value.isInitialized)
            SizedBox(
              height: 230,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: Colors.black,
                    child: Center(child: CameraPreview(camara)),
                  ),
                  Positioned(
                    left: 10,
                    top: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: grabando ? Colores.rojo : Colors.black54,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        grabando ? '● GRABANDO EVIDENCIA' : 'CÁMARA',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
                      ),
                    ),
                  ),
                  if (_camaras.length > 1)
                    Positioned(
                      right: 6,
                      top: 4,
                      child: IconButton.filledTonal(
                        tooltip: 'Cambiar de cámara',
                        onPressed: _alternar,
                        icon: const Icon(Icons.cameraswitch),
                      ),
                    ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  _problema != null ? Icons.videocam_off : Icons.videocam,
                  color: _problema != null ? Colors.grey : Colores.rojo,
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(resumen)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Final extends StatelessWidget {
  const _Final({required this.control});

  final ControlEmergencia control;

  @override
  Widget build(BuildContext context) {
    final c = control;
    final r = c.cerrada;
    final texto = switch (r?.cierre) {
      CierreEmergencia.localizada => '${r?.atendidaPor ?? 'Protección Civil'} cerró tu emergencia: ya te localizaron.',
      CierreEmergencia.falsaAlarma =>
        r?.atendidaPor == null ? 'Marcaste que fue sin querer.' : 'Se cerró como falsa alarma.',
      _ => 'Marcaste que estás a salvo. Avisamos a los validadores.',
    };
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (hecho, _) {
        if (!hecho) c.descartarResumen();
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Emergencia cerrada'), automaticallyImplyLeading: false),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.check_circle, color: Colores.verde, size: 80),
              const SizedBox(height: 16),
              Text(
                texto,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                'Ya no compartimos tu ubicación. Si vuelves a estar en peligro, pide ayuda otra vez o llama al 911.',
                textAlign: TextAlign.center,
              ),
              if (c.pendientes > 0) ...[
                const SizedBox(height: 12),
                Text(
                  'Terminando de subir ${c.pendientes} ${c.pendientes == 1 ? 'archivo' : 'archivos'} de evidencia…',
                  textAlign: TextAlign.center,
                ),
              ],
              if (c.copias > 0) ...[
                const SizedBox(height: 12),
                Text(
                  'Guardamos una copia de la evidencia en tu teléfono (${CopiaEvidencia.ubicacion}) para que la '
                  'presentes si haces una denuncia. La encuentras en Ajustes › Modo emergencia › Mis evidencias.',
                  textAlign: TextAlign.center,
                ),
              ],
              if (c.error != null) ...[
                const SizedBox(height: 12),
                Text(
                  '${c.error} El aviso de que estás a salvo se enviará en cuanto haya conexión.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colores.naranja),
                ),
              ],
              const Spacer(),
              FilledButton(onPressed: c.descartarResumen, child: const Text('Cerrar')),
            ],
          ),
        ),
      ),
    );
  }
}
