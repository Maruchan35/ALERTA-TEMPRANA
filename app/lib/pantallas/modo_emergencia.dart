import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../nucleo/copia_evidencia.dart';
import '../nucleo/emergencia.dart';
import '../nucleo/notificaciones.dart';
import '../nucleo/preferencias.dart';
import '../nucleo/proteccion.dart';
import '../nucleo/ubicacion.dart';
import '../widgets/comunes.dart';
import 'evidencias.dart';

/// Ajustes → Modo emergencia (SOS): cómo pedir ayuda, formas de activarlo, permisos y simulacro.
class PantallaModoEmergencia extends StatefulWidget {
  const PantallaModoEmergencia({super.key});

  @override
  State<PantallaModoEmergencia> createState() => _PantallaModoEmergenciaState();
}

class _PantallaModoEmergenciaState extends State<PantallaModoEmergencia> with WidgetsBindingObserver {
  bool? _proteccion;
  bool? _puedeAutenticar;
  var _pantallaCompleta = true;
  PermisoUbicacion? _ubicacion;
  bool? _notificaciones;
  bool? _camara;
  bool? _almacenamiento;
  var _puedeGuardar = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _revisar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Al volver de los ajustes del teléfono, se revisa otra vez.
  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado == AppLifecycleState.resumed) _revisar();
  }

  Future<void> _revisar() async {
    final c = AlcanceSos.leer(context);
    final proteccion = await c.proteccionActiva();
    final puedeAutenticar = await Autenticacion.disponible();
    c.puedeAutenticar = puedeAutenticar;
    final pantallaCompleta = await Proteccion.puedePantallaCompleta();
    PermisoUbicacion? ubicacion;
    try {
      ubicacion = await Ubicacion.estado();
    } catch (_) {}
    bool? notificaciones;
    try {
      notificaciones = await Notificaciones.permitidas();
    } catch (_) {}
    final almacenamiento = await CopiaEvidencia.permiso();
    final puedeGuardar = await CopiaEvidencia.puedeGuardar();
    if (!mounted) return;
    setState(() {
      _proteccion = proteccion;
      _puedeAutenticar = puedeAutenticar;
      _pantallaCompleta = pantallaCompleta;
      _ubicacion = ubicacion;
      _notificaciones = notificaciones;
      _almacenamiento = almacenamiento;
      _puedeGuardar = puedeGuardar;
    });
  }

  /// Abre la cámara un instante: así Android pide los permisos de cámara y micrófono AHORA,
  /// y no en medio de una emergencia.
  Future<void> _probarCamara() async {
    try {
      final camaras = await availableCameras();
      if (camaras.isEmpty) throw CameraException('sin_camara', 'No hay cámara');
      final prueba = CameraController(camaras.first, ResolutionPreset.low, enableAudio: true);
      await prueba.initialize();
      await prueba.dispose();
      setState(() => _camara = true);
      mostrarMensaje('Cámara y micrófono listos para grabar evidencia.');
    } catch (_) {
      setState(() => _camara = false);
      mostrarMensaje('Sin permiso de cámara o micrófono. Actívalo en los ajustes del teléfono.', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AlcanceSos.of(context);
    final ubicacionOk = _ubicacion == PermisoUbicacion.concedido || _ubicacion == PermisoUbicacion.siempre;
    return Scaffold(
      appBar: AppBar(title: const Text('Modo emergencia (SOS)')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          Card(
            margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            color: const Color(0xFFFFEBEE),
            child: const Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Si estás en peligro (asalto, secuestro, te siguen)',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colores.rojo),
                  ),
                  SizedBox(height: 8),
                  Text(
                    '• Toca el botón rojo SOS, arriba en el inicio.\n'
                    '• O mantén presionado el ícono de ALERTA CERCA y elige "SOS".\n'
                    '• O sacude el teléfono con fuerza (si lo activas abajo).',
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Tendrás 5 segundos para cancelar (con tu huella o PIN, para que nadie más lo apague). Después '
                    'avisamos a Protección Civil y a los validadores de guardia, compartimos tu ubicación en vivo '
                    '(también con la pantalla apagada), grabamos video mientras la pantalla del SOS está abierta y '
                    'audio todo el tiempo (aunque la pantalla esté apagada), guardamos una copia en tu teléfono para '
                    'una denuncia y puedes llamar al 911 con un toque.',
                  ),
                ],
              ),
            ),
          ),
          const Seccion('Formas de activarlo'),
          SwitchListTile(
            secondary: const Icon(Icons.vibration),
            title: const Text('Sacudir el teléfono con fuerza'),
            subtitle: const Text('Con la app abierta. Unas 4 sacudidas rápidas; caminar o correr no lo activan.'),
            value: c.sacudidaActivada,
            onChanged: c.configurarSacudida,
          ),
          if (Proteccion.disponible)
            SwitchListTile(
              secondary: const Icon(Icons.shield_outlined),
              title: const Text('Modo protección (con la app cerrada)'),
              subtitle: const Text(
                'Una notificación fija escucha la sacudida aunque la app esté cerrada o el teléfono bloqueado. '
                'Gasta batería: actívalo al caminar de noche o en un trayecto.',
              ),
              value: _proteccion ?? false,
              onChanged: _proteccion == null
                  ? null
                  : (si) async {
                      if (si) await Notificaciones.pedirPermiso();
                      await c.configurarProteccion(si);
                      await _revisar();
                    },
            ),
          SwitchListTile(
            secondary: const Icon(Icons.lock_outline),
            title: const Text('Pedir huella o PIN para cancelar'),
            subtitle: Text(
              _puedeAutenticar == false
                  ? 'Tu teléfono no tiene huella ni PIN. Actívalo en los ajustes del teléfono para que nadie más pueda quitar tu SOS.'
                  : 'Para que un ladrón no pueda apagar el SOS: cancelarlo o terminarlo pedirá tu huella o PIN.',
            ),
            value: (c.prefs.getBool(Claves.sosPinCancelar) ?? true) && (_puedeAutenticar ?? true),
            onChanged: (_puedeAutenticar ?? false)
                ? (si) async {
                    await c.prefs.setBool(Claves.sosPinCancelar, si);
                    setState(() {});
                  }
                : null,
          ),
          if (CopiaEvidencia.disponible) ...[
            const Seccion('Evidencia en tu teléfono (beta)'),
            SwitchListTile(
              secondary: const Icon(Icons.save_alt),
              title: const Text('Guardar una copia en mi teléfono'),
              subtitle: const Text(
                'Los videos y audios del SOS también se guardan en ${CopiaEvidencia.ubicacion} (los videos salen en '
                'tu galería) para que los presentes en una denuncia. La copia del servidor se borra 30 días después.',
              ),
              value: c.copiaActivada,
              onChanged: c.configurarCopia,
            ),
            ListTile(
              leading: const Icon(Icons.folder_shared_outlined),
              title: const Text('Mis evidencias (para denuncia)'),
              subtitle: const Text('Compártelas con su constancia: horas, lugares y la huella SHA-256 de cada archivo'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaEvidencias())),
            ),
          ],
          const Seccion('Permisos (revísalos antes de necesitarlos)'),
          _Permiso(
            icono: Icons.location_on_outlined,
            titulo: 'Ubicación',
            listo: ubicacionOk,
            detalle: ubicacionOk ? 'Lista' : 'Sin ella, Protección Civil no sabrá dónde estás',
            accion: () async {
              if (_ubicacion == PermisoUbicacion.denegadoParaSiempre) {
                await Ubicacion.abrirAjustes();
              } else {
                await Ubicacion.pedirPermiso();
              }
              await _revisar();
            },
          ),
          _Permiso(
            icono: Icons.notifications_active_outlined,
            titulo: 'Notificaciones',
            listo: _notificaciones ?? false,
            detalle: 'Para ver que el SOS sigue activo',
            accion: () async {
              await Notificaciones.pedirPermiso();
              await _revisar();
            },
          ),
          if (!kIsWeb)
            _Permiso(
              icono: Icons.videocam_outlined,
              titulo: 'Cámara y micrófono',
              listo: _camara ?? false,
              detalle: _camara == null ? 'Toca "Probar" para darlos ahora' : 'Para grabar video y audio de evidencia',
              textoAccion: 'Probar',
              accion: _probarCamara,
            ),
          if (Proteccion.disponible)
            _Permiso(
              icono: Icons.lock_open,
              titulo: 'Aparecer con el teléfono bloqueado',
              listo: _pantallaCompleta,
              detalle: 'Para que la cuenta regresiva salga sola, como una alarma',
              accion: Proteccion.abrirAjustePantallaCompleta,
            ),
          if (CopiaEvidencia.disponible)
            _Permiso(
              icono: Icons.sd_storage_outlined,
              titulo: 'Almacenamiento (leer y guardar)',
              listo: _almacenamiento ?? false,
              detalle: _puedeGuardar
                  ? 'La copia ya se guarda; con este permiso también encuentras la de antes de reinstalar la app'
                  : 'Sin él, la copia de la evidencia no se puede guardar en tu teléfono',
              accion: () async {
                await CopiaEvidencia.pedirPermiso();
                await _revisar();
              },
            ),
          const Seccion('Practica'),
          ListTile(
            leading: const Icon(Icons.science_outlined, color: Colores.morado),
            title: const Text('Hacer un simulacro'),
            subtitle: const Text('Igual que el de verdad, pero no avisa a nadie ni graba.'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => c.iniciarCuenta(OrigenEmergencia.boton, simulacro: true),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text(
              'Tu ubicación exacta, el video y el audio se comparten SOLO durante una emergencia que tú actives, '
              'solo con Protección Civil y los validadores del CCE (nunca con tus vecinos), y el servidor los borra '
              'a los 30 días. La copia en tu teléfono es tuya: solo tú decides con quién compartirla. '
              'ALERTA CERCA no sustituye al 911: si puedes, llama al 911.',
              style: TextStyle(fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _Permiso extends StatelessWidget {
  const _Permiso({
    required this.icono,
    required this.titulo,
    required this.listo,
    required this.detalle,
    required this.accion,
    this.textoAccion = 'Permitir',
  });

  final IconData icono;
  final String titulo;
  final bool listo;
  final String detalle;
  final VoidCallback accion;
  final String textoAccion;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icono, color: listo ? Colores.verde : Colores.naranja),
      title: Text(titulo),
      subtitle: Text(detalle),
      trailing: listo
          ? const Icon(Icons.check_circle, color: Colores.verde)
          : TextButton(onPressed: accion, child: Text(textoAccion)),
    );
  }
}
