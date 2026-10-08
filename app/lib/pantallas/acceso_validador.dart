import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';

import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';

/// Validadores (Protección Civil, CCE, escuelas) también pueden usar la app: reciben el
/// aviso "POR VALIDAR" de los reportes en revisión y pueden verificarlos desde el detalle.
class PantallaAccesoValidador extends StatefulWidget {
  const PantallaAccesoValidador({super.key});

  @override
  State<PantallaAccesoValidador> createState() => _PantallaAccesoValidadorState();
}

class _PantallaAccesoValidadorState extends State<PantallaAccesoValidador> {
  final _correo = TextEditingController();
  final _contrasena = TextEditingController();
  var _ocupado = false;

  @override
  void dispose() {
    _correo.dispose();
    _contrasena.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    setState(() => _ocupado = true);
    final ok = await intentar(
      () => AlcanceApp.leer(context).iniciarSesionValidador(_correo.text, _contrasena.text),
      exito: 'Sesión de validador iniciada',
    );
    if (!mounted) return;
    setState(() => _ocupado = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final demo = AlcanceApp.of(context).servicio.esDemo;
    return Scaffold(
      appBar: AppBar(title: const Text('Acceso para validadores')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.admin_panel_settings, size: 56, color: Colores.marino),
          const SizedBox(height: 12),
          const Text(
            'Solo para personas de instituciones que validan alertas. Las cuentas las crea un administrador.',
            textAlign: TextAlign.center,
          ),
          if (demo)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Demostración: cualquier correo y contraseña funcionan.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colores.morado),
              ),
            ),
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
            decoration: const InputDecoration(labelText: 'Contraseña', prefixIcon: Icon(Icons.lock_outline)),
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _ocupado ? null : _entrar, child: const Text('Entrar')),
        ],
      ),
    );
  }
}
