import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';

import '../app.dart';

/// Acceso con correo y contraseña. Las cuentas las crea un administrador en Supabase
/// (Authentication → Add user) y se les asigna el rol con SQL (ver docs/despliegue.md).
class PantallaAcceso extends StatefulWidget {
  const PantallaAcceso({super.key, required this.servicio});

  final ServicioAlertas servicio;

  @override
  State<PantallaAcceso> createState() => _PantallaAccesoState();
}

class _PantallaAccesoState extends State<PantallaAcceso> {
  late final _correo = TextEditingController(text: widget.servicio.esDemo ? 'validador1@example.com' : '');
  late final _contrasena = TextEditingController(text: widget.servicio.esDemo ? 'demo' : '');
  var _ocupado = false;

  @override
  void dispose() {
    _correo.dispose();
    _contrasena.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    setState(() => _ocupado = true);
    await intentar(() => widget.servicio.iniciarSesionCorreo(_correo.text, _contrasena.text));
    if (mounted) setState(() => _ocupado = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colores.marino,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(Icons.radar, size: 52, color: Colores.marino),
                      const SizedBox(height: 8),
                      const Text(
                        'ALERTA CERCA',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 1.5),
                      ),
                      const Text('Panel de validadores', textAlign: TextAlign.center, style: TextStyle(fontSize: 16)),
                      const SizedBox(height: 4),
                      Text(
                        'CCE · Protección Civil · escuelas',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey.shade700),
                      ),
                      if (widget.servicio.esDemo) ...[
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEDE7F6),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            'MODO DEMOSTRACIÓN: datos simulados en este navegador, con los 4 teléfonos de la demo '
                            '(A, B, C y D). Cualquier correo y contraseña funcionan.',
                            style: TextStyle(color: Colores.morado, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      TextField(
                        controller: _correo,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(labelText: 'Correo', prefixIcon: Icon(Icons.alternate_email)),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _contrasena,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _entrar(),
                        decoration: const InputDecoration(
                          labelText: 'Contraseña',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _ocupado ? null : _entrar,
                        child: _ocupado
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Entrar'),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Solo personal autorizado. Todas las acciones quedan registradas en la bitácora.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
