import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../nucleo/estado_app.dart';
import '../nucleo/notificaciones.dart';
import '../nucleo/preferencias.dart';
import '../nucleo/segundo_plano.dart';
import '../nucleo/ubicacion.dart';
import '../widgets/comunes.dart';
import 'acceso_validador.dart';
import 'aviso_privacidad.dart';
import 'modo_emergencia.dart';
import 'verificar_telefono.dart';
import 'zonas.dart';

class PantallaAjustes extends StatefulWidget {
  const PantallaAjustes({super.key});

  @override
  State<PantallaAjustes> createState() => _PantallaAjustesState();
}

class _PantallaAjustesState extends State<PantallaAjustes> {
  PermisoUbicacion? _permiso;
  bool? _notificaciones;

  @override
  void initState() {
    super.initState();
    _revisarPermisos();
  }

  Future<void> _revisarPermisos() async {
    final p = await Ubicacion.estado();
    final n = await Notificaciones.permitidas();
    if (mounted) {
      setState(() {
        _permiso = p;
        _notificaciones = n;
      });
    }
  }

  Future<void> _segundoPlano(EstadoApp estado, bool activar) async {
    if (activar) {
      final ok = await confirmar(
        context,
        titulo: 'Ubicación en segundo plano',
        texto:
            'Cada 15 minutos la app revisará en qué zona de ~1 km estás (solo envía la celda si cambió), '
            'para avisarte aunque no la abras. Necesita el permiso de ubicación "Permitir todo el tiempo".',
        accion: 'Activar',
      );
      if (!ok) return;
      if (!await Ubicacion.pedirPermisoSiempre()) {
        mostrarMensaje('Elige "Permitir todo el tiempo" en los ajustes de ubicación de la app.');
        await Ubicacion.abrirAjustes();
        return;
      }
      await SegundoPlano.activar();
    } else {
      await SegundoPlano.desactivar();
    }
    await estado.prefs.setBool(Claves.segundoPlano, activar);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final estado = AlcanceApp.of(context);
    final perfil = estado.perfil;
    final segundoPlano = estado.prefs.getBool(Claves.segundoPlano) ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Ajustes')),
      body: ListView(
        children: [
          const Seccion('Emergencia'),
          ListTile(
            leading: const Icon(Icons.sos, color: Colores.rojo),
            title: const Text('Modo emergencia (SOS)'),
            subtitle: const Text('Cómo pedir ayuda, sacudida, modo protección y simulacro'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaModoEmergencia())),
          ),
          if (estado.herramientasDemo) ...[
            const Seccion('Demostración · ubicación simulada'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Elige en qué punto de la demo está este teléfono (el suceso es el centro de Lázaro Cárdenas). '
                '${estado.servicio.esDemo ? 'Con el factor de tiempo 30, un minuto real equivale a 30 minutos.' : ''}',
                style: const TextStyle(fontSize: 13),
              ),
            ),
            RadioGroup<String?>(
              groupValue: estado.puntoDemo,
              onChanged: (v) => estado.usarPuntoDemo(v),
              child: Column(
                children: [
                  for (final p in puntosDemo)
                    RadioListTile<String?>(
                      value: p.clave,
                      title: Text(p.etiqueta),
                      subtitle: Text('Celda ${p.celda} · ${p.lat}, ${p.lon}'),
                    ),
                  const RadioListTile<String?>(value: null, title: Text('Ubicación real (GPS)')),
                ],
              ),
            ),
          ],
          const Seccion('Cuenta'),
          ListTile(
            leading: Icon(
              perfil?.esAnonimo ?? true ? Icons.person_outline : Icons.verified_user,
              color: Colores.marino,
            ),
            title: Text(
              perfil == null
                  ? 'Sin sesión'
                  : perfil.rol.esValidador
                  ? '${perfil.nombre ?? 'Validador'} · ${perfil.institucion ?? perfil.rol.clave}'
                  : perfil.esAnonimo
                  ? 'Anónima: recibes alertas sin cuenta'
                  : 'Verificada${perfil.telefono != null ? ' · +${perfil.telefono}' : ''}',
            ),
            subtitle: Text(
              perfil?.rol.esValidador ?? false
                  ? 'Puedes verificar, descartar y cerrar alertas'
                  : perfil?.esAnonimo ?? true
                  ? 'Verifica tu número solo si quieres reportar o confirmar'
                  : 'Reputación: ${perfil!.reputacion}',
            ),
          ),
          if (perfil?.esAnonimo ?? true)
            ListTile(
              leading: const Icon(Icons.phone_iphone),
              title: const Text('Verificar mi número'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute<void>(builder: (_) => const PantallaVerificarTelefono(motivo: 'reportar')),
              ),
            ),
          if (!(perfil?.rol.esValidador ?? false))
            ListTile(
              leading: const Icon(Icons.admin_panel_settings_outlined),
              title: const Text('Acceso para validadores'),
              subtitle: const Text('Protección Civil, CCE, escuelas'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAccesoValidador())),
            )
          else
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Cerrar sesión de validador'),
              onTap: () => intentar(estado.cerrarSesion, exito: 'Sesión cerrada'),
            ),
          const Seccion('Alertas'),
          ListTile(
            leading: const Icon(Icons.home_work_outlined),
            title: const Text('Mis zonas'),
            subtitle: Text(
              estado.zonas.isEmpty ? 'Casa, escuela, trabajo (máx. 3)' : estado.zonas.map((z) => z.nombre).join(', '),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaZonas())),
          ),
          ListTile(
            leading: Icon(
              _notificaciones ?? true ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
            ),
            title: const Text('Notificaciones'),
            subtitle: Text(
              !estado.firebaseListo
                  ? 'Sin push configurado: recibes alertas con la app abierta'
                  : (_notificaciones ?? true)
                  ? 'Activadas'
                  : 'Desactivadas: no podremos avisarte',
            ),
            onTap: () async {
              await Notificaciones.pedirPermiso(conFirebase: estado.firebaseListo);
              await _revisarPermisos();
            },
          ),
          ListTile(
            leading: const Icon(Icons.location_on_outlined),
            title: const Text('Ubicación'),
            subtitle: Text(switch (_permiso) {
              PermisoUbicacion.siempre => 'Permitida todo el tiempo',
              PermisoUbicacion.concedido => 'Permitida mientras usas la app',
              PermisoUbicacion.servicioApagado => 'La ubicación del teléfono está apagada',
              PermisoUbicacion.denegadoParaSiempre => 'Denegada: actívala en los ajustes del teléfono',
              PermisoUbicacion.denegado => 'Sin permiso: toca para permitir',
              null => '…',
            }),
            onTap: () async {
              if (_permiso == PermisoUbicacion.denegadoParaSiempre) {
                await Ubicacion.abrirAjustes();
              } else {
                await Ubicacion.pedirPermiso();
              }
              await _revisarPermisos();
              await estado.actualizarUbicacion(forzar: true);
            },
          ),
          if (estado.firebaseListo) ...[
            ListTile(
              leading: Icon(
                estado.listoParaRecibir ? Icons.verified_user_outlined : Icons.wifi_off,
                color: !estado.listoParaRecibir
                    ? Colores.rojo
                    : estado.sinUbicacion
                    ? Colores.ambar
                    : Colores.verde,
              ),
              title: const Text('Registro para recibir alertas'),
              subtitle: Text(
                !estado.listoParaRecibir
                    ? (estado.tokenPush == null
                          ? 'Falta la conexión con Google (Firebase). Revisa tu internet y toca para reintentar'
                          : 'Todavía no se registra en el servidor: toca para reintentar')
                    : estado.sinUbicacion
                    ? 'Listo, pero sin tu ubicación: te avisamos de lo que pase cerca de '
                          '${estado.zonas.isEmpty ? 'el centro de la ciudad' : '"${estado.zonas.first.nombre}"'}. '
                          'Permite la ubicación para que te avisemos de lo que pase donde estés.'
                    : 'Listo: te avisamos aunque la app esté cerrada'
                          '${estado.registradoEn != null ? ' · actualizado ${haceCuanto(estado.registradoEn!)}' : ''}',
              ),
              onTap: () async {
                await estado.actualizarUbicacion(forzar: true);
                if (!context.mounted) return;
                mostrarMensaje(
                  estado.listoParaRecibir
                      ? 'Teléfono registrado para recibir alertas'
                      : (estado.error ?? 'Aún no se pudo registrar: revisa permisos e internet'),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.notifications_active_outlined),
              title: const Text('Probar una notificación'),
              subtitle: const Text('Así se verá una alerta (no se envía a nadie)'),
              onTap: () async {
                if (!(_notificaciones ?? true)) {
                  await Notificaciones.pedirPermiso(conFirebase: true);
                  await _revisarPermisos();
                }
                await Notificaciones.probar();
              },
            ),
            if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android)
              ListTile(
                leading: const Icon(Icons.tips_and_updates_outlined),
                title: const Text('Avisos con la app cerrada'),
                subtitle: const Text(
                  'En Xiaomi, Redmi, POCO, Huawei, Oppo, Vivo o Samsung: en los ajustes de la app activa '
                  '"Inicio automático" y en Batería elige "Sin restricciones". Si no, el teléfono puede '
                  'bloquear las alertas cuando cierras la app.',
                ),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: Ubicacion.abrirAjustes,
              ),
          ],
          if (SegundoPlano.disponible)
            SwitchListTile(
              secondary: const Icon(Icons.update),
              title: const Text('Actualizar mi zona en segundo plano'),
              subtitle: const Text('Opcional. Cada 15 min, solo la celda de ~1 km.'),
              value: segundoPlano,
              onChanged: (v) => _segundoPlano(estado, v),
            ),
          if ((estado.celdaRegistrada ?? estado.miCelda) != null)
            ListTile(
              leading: const Icon(Icons.grid_on),
              title: const Text('Lo único que el servidor sabe de tu ubicación'),
              subtitle: Text('Celda ${estado.celdaRegistrada ?? estado.miCelda} (~1.2 × 0.6 km)'),
            ),
          const Seccion('Privacidad'),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: const Text('Aviso de privacidad'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const PantallaAvisoPrivacidad())),
          ),
          ListTile(
            leading: const Icon(Icons.delete_forever_outlined, color: Colores.rojo),
            title: const Text('Borrar mi cuenta y mis datos', style: TextStyle(color: Colores.rojo)),
            subtitle: const Text('Elimina tu perfil, tus dispositivos, tus zonas y tus confirmaciones'),
            onTap: () async {
              final ok = await confirmar(
                context,
                titulo: 'Borrar mi cuenta',
                texto:
                    'Se eliminarán tu perfil, tus dispositivos, tus zonas y tus confirmaciones. '
                    'Los reportes que hayas hecho se conservan sin tu nombre. Esta acción no se puede deshacer.',
                accion: 'Borrar',
              );
              if (ok) await intentar(estado.borrarCuenta, exito: 'Tu cuenta y tus datos fueron borrados.');
            },
          ),
          const Seccion('Acerca de'),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('ALERTA CERCA · prototipo 1.1'),
            subtitle: Text(
              'Sistema Inteligente de Alertamiento Comunitario por Proximidad. HackaITLAC 2026 · '
              'Reto del Consejo Coordinador Empresarial de Lázaro Cárdenas.',
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 32),
            child: Text(
              '"Si algo importante está ocurriendo cerca de ti, deberías poder saberlo."\n\n'
              'ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales de alertamiento.',
              style: TextStyle(fontStyle: FontStyle.italic),
            ),
          ),
        ],
      ),
    );
  }
}
