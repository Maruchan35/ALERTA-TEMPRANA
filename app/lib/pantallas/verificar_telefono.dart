import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';

/// Convierte la cuenta anónima en verificada SIN perder su id (ni sus zonas).
/// Se pide solo para reportar o confirmar, nunca para recibir alertas.
/// Devuelve `true` al navegador si la verificación terminó bien.
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

  @override
  void dispose() {
    _telefono.dispose();
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    setState(() => _ocupado = true);
    final ok = await intentar(() => AlcanceApp.leer(context).servicio.enviarCodigo(_telefono.text));
    if (mounted) {
      setState(() {
        _ocupado = false;
        _codigoEnviado = ok;
      });
    }
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
    final demo = AlcanceApp.of(context).servicio.esDemo;
    return Scaffold(
      appBar: AppBar(title: const Text('Verifica tu número')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.verified_user, size: 56, color: Colores.marino),
          const SizedBox(height: 12),
          Text(
            'Para ${widget.motivo} necesitamos verificar tu número',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text(
            'Así evitamos cuentas falsas: 1 número = 1 cuenta. Tu número nunca se muestra a otras '
            'personas. Para RECIBIR alertas no hace falta.',
            textAlign: TextAlign.center,
          ),
          if (AlcanceApp.of(context).herramientasDemo && !demo)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Pruebas: usa un número de 55 1111 1111 a 55 8888 8888 (código 123456), uno distinto en cada '
                'teléfono. Cada número es una persona: con el mismo número, todos los teléfonos serían "el autor" '
                'y nadie podría confirmar.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colores.morado, fontWeight: FontWeight.w600),
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
              labelText: 'Número celular (10 dígitos)',
              prefixText: '+52 ',
              prefixIcon: Icon(Icons.phone_iphone),
            ),
          ),
          if (_codigoEnviado) ...[
            const SizedBox(height: 8),
            TextField(
              controller: _codigo,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Código de 6 dígitos',
                helperText: demo ? 'En la demostración el código es 123456.' : 'Te lo enviamos por SMS.',
                prefixIcon: const Icon(Icons.sms_outlined),
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (!_codigoEnviado)
            FilledButton(
              onPressed: _ocupado || _telefono.text.length != 10 ? null : _enviar,
              child: const Text('Enviar código'),
            )
          else ...[
            FilledButton(
              onPressed: _ocupado || _codigo.text.length != 6 ? null : _verificar,
              child: const Text('Verificar'),
            ),
            TextButton(
              onPressed: _ocupado ? null : () => setState(() => _codigoEnviado = false),
              child: const Text('Cambiar número'),
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
