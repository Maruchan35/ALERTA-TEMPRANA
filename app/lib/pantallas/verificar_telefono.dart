import 'dart:async';

import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../nucleo/estado_app.dart';
import '../nucleo/notificaciones.dart';
import '../widgets/comunes.dart';

const _verdeWhatsapp = Color(0xFF25D366);
const _verdeOscuroWhatsapp = Color(0xFF128C7E);

/// Verificación del número por WhatsApp. Convierte la cuenta anónima en verificada SIN perder su
/// id (ni sus zonas). Se pide solo para reportar o confirmar, nunca para recibir alertas.
/// Devuelve `true` al navegador si la verificación terminó bien.
///
/// Mientras no haya WhatsApp Business el envío es SIMULADO (009_whatsapp.sql): el mensaje con el
/// código aparece aquí mismo, como si hubiera llegado por WhatsApp.
class PantallaVerificarTelefono extends StatefulWidget {
  const PantallaVerificarTelefono({super.key, required this.motivo});

  /// "reportar" o "confirmar alertas".
  final String motivo;

  @override
  State<PantallaVerificarTelefono> createState() => _PantallaVerificarTelefonoState();
}

class _PantallaVerificarTelefonoState extends State<PantallaVerificarTelefono> {
  final _telefono = TextEditingController();
  final _codigo = TextEditingController();
  var _codigoEnviado = false;
  var _ocupado = false;

  /// Esperando a que "llegue" el WhatsApp simulado.
  var _esperando = false;
  MensajeWhatsapp? _mensaje;
  Timer? _consulta;

  /// Cómo llega hoy el código (simulado, puente de WhatsApp o Business).
  EstadoWhatsapp? _whatsapp;

  @override
  void initState() {
    super.initState();
    AlcanceApp.leer(context).servicio.estadoWhatsapp().then((e) {
      if (mounted) setState(() => _whatsapp = e);
    });
  }

  @override
  void dispose() {
    _consulta?.cancel();
    _telefono.dispose();
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final servicio = AlcanceApp.leer(context).servicio;
    final telefono = _telefono.text;
    setState(() {
      _ocupado = true;
      _mensaje = null;
    });
    // Lo que ya hubiera de antes no cuenta: solo un mensaje nuevo trae el código válido
    final anterior = await servicio.whatsappSimulado(telefono);
    final ok = await intentar(() => servicio.enviarCodigo(telefono));
    if (!mounted) return;
    setState(() {
      _ocupado = false;
      _codigoEnviado = ok;
    });
    // Solo el simulado se "recibe" aquí; con WhatsApp de verdad el código llega al teléfono
    if (ok && (_whatsapp?.simulado ?? true)) _esperarWhatsapp(servicio, telefono, desde: anterior?.enviadoEn);
  }

  /// WhatsApp simulado: se pregunta unos segundos hasta que "llega" el mensaje con el código.
  void _esperarWhatsapp(ServicioAlertas servicio, String telefono, {DateTime? desde}) {
    _consulta?.cancel();
    final inicio = DateTime.now();
    setState(() => _esperando = true);
    Future<void> revisar(Timer? t) async {
      final m = await servicio.whatsappSimulado(telefono);
      if (!mounted) return;
      if (m != null && (desde == null || m.enviadoEn.isAfter(desde))) {
        _consulta?.cancel();
        setState(() {
          _mensaje = m;
          _esperando = false;
          if (m.codigo != null) _codigo.text = m.codigo!;
        });
        unawaited(Notificaciones.mensajeWhatsapp(m.texto));
      } else if (DateTime.now().difference(inicio) > const Duration(seconds: 20)) {
        _consulta?.cancel();
        setState(() => _esperando = false);
      }
    }

    _consulta = Timer.periodic(const Duration(milliseconds: 1500), revisar);
    revisar(null);
  }

  Future<void> _verificar() async {
    setState(() => _ocupado = true);
    final estado = AlcanceApp.leer(context);
    final ok = await intentar(
      () => estado.servicio.verificarCodigo(_telefono.text, _codigo.text),
      exito: 'Número verificado. Ya puedes ${widget.motivo}.',
    );
    if (!mounted) return;
    setState(() => _ocupado = false);
    if (ok) {
      // El token del dispositivo ahora pertenece a la cuenta verificada
      estado.actualizarUbicacion(forzar: true);
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final estado = AlcanceApp.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Verifica tu número')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.verified_user, size: 56, color: _verdeOscuroWhatsapp),
          const SizedBox(height: 12),
          Text(
            'Para ${widget.motivo} verificamos tu número por WhatsApp',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text(
            'Te mandamos un código por WhatsApp. Así evitamos cuentas falsas: 1 número = 1 cuenta. Tu número '
            'nunca se muestra a otras personas. Para RECIBIR alertas no hace falta.',
            textAlign: TextAlign.center,
          ),
          if (_whatsapp != null && !_whatsapp!.simulado && !_whatsapp!.conectado)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Text(
                'El servicio de WhatsApp está desconectado en este momento: el código puede tardar en llegar.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colores.rojo, fontWeight: FontWeight.w700),
              ),
            ),
          const SizedBox(height: 24),
          TextField(
            controller: _telefono,
            enabled: !_codigoEnviado,
            keyboardType: TextInputType.phone,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Tu número de WhatsApp (10 dígitos)',
              prefixText: '+52 ',
              prefixIcon: Icon(Icons.phone_iphone),
            ),
          ),
          if (_codigoEnviado) ...[
            if (_mensaje != null) _BurbujaWhatsapp(mensaje: _mensaje!),
            if (_esperando)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    SizedBox(width: 10),
                    Text('Esperando tu WhatsApp…'),
                  ],
                ),
              ),
            if (_whatsapp != null && !_whatsapp!.simulado)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Te enviamos el código por WhatsApp'
                  '${_whatsapp!.numeroLegible == null ? '' : ' desde el número ${_whatsapp!.numeroLegible} (ALERTA CERCA)'}. '
                  'Ábrelo y escribe aquí el código de 6 dígitos.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              )
            else if (!_esperando && _mensaje == null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  '¿No te llegó? Revisa tu WhatsApp o pide otro código en 30 segundos.'
                  '${estado.herramientasDemo ? ' Si es un número de prueba (55 1111 1111 a 55 8888 8888), '
                            'el código es 123456.' : ''}',
                  textAlign: TextAlign.center,
                ),
              ),
            TextField(
              controller: _codigo,
              autofocus: _mensaje == null,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Código de 6 dígitos',
                helperText: 'Te lo enviamos por WhatsApp.',
                prefixIcon: Icon(Icons.sms_outlined),
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (!_codigoEnviado)
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: _verdeOscuroWhatsapp),
              onPressed: _ocupado || _telefono.text.length != 10 ? null : _enviar,
              icon: const Icon(Icons.send),
              label: const Text('Enviar código por WhatsApp'),
            )
          else ...[
            FilledButton(
              onPressed: _ocupado || _codigo.text.length != 6 ? null : _verificar,
              child: const Text('Verificar'),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(onPressed: _ocupado || _esperando ? null : _enviar, child: const Text('Reenviar código')),
                TextButton(
                  onPressed: _ocupado
                      ? null
                      : () {
                          _consulta?.cancel();
                          setState(() {
                            _codigoEnviado = false;
                            _esperando = false;
                            _mensaje = null;
                            _codigo.clear();
                          });
                        },
                  child: const Text('Cambiar número'),
                ),
              ],
            ),
          ],
          if (_ocupado)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}

/// El mensaje tal como se vería en WhatsApp. Es simulado mientras no haya WhatsApp Business.
class _BurbujaWhatsapp extends StatelessWidget {
  const _BurbujaWhatsapp({required this.mensaje});

  final MensajeWhatsapp mensaje;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 4, bottom: 12),
    padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
    decoration: BoxDecoration(
      color: const Color(0xFFDCF8C6),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _verdeWhatsapp.withAlpha(120)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.sms_outlined, size: 18, color: _verdeOscuroWhatsapp),
            const SizedBox(width: 6),
            const Expanded(
              child: Text(
                'WhatsApp · ALERTA CERCA',
                style: TextStyle(color: _verdeOscuroWhatsapp, fontWeight: FontWeight.w800),
              ),
            ),
            Text(DateFormat('HH:mm').format(mensaje.enviadoEn), style: const TextStyle(fontSize: 12)),
          ],
        ),
        const SizedBox(height: 6),
        Text(mensaje.texto, style: const TextStyle(fontSize: 15)),
        const SizedBox(height: 6),
        const Text(
          'Simulado: así llegará cuando se conecte WhatsApp Business. El código ya quedó escrito abajo.',
          style: TextStyle(fontSize: 11.5, fontStyle: FontStyle.italic, color: Colors.black54),
        ),
      ],
    ),
  );
}
