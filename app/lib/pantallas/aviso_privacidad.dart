import 'package:flutter/material.dart';

import '../config.dart';

/// Aviso de privacidad (sección 12 de la propuesta). Borrador para el prototipo:
/// para un piloto real, el CCE debe revisarlo con un abogado.
class PantallaAvisoPrivacidad extends StatelessWidget {
  const PantallaAvisoPrivacidad({super.key});

  static const _secciones = <(String, String)>[
    (
      'Quién es el responsable',
      'ALERTA CERCA es un prototipo desarrollado en el HackaITLAC 2026 para el reto del Consejo Coordinador '
          'Empresarial (CCE) de Lázaro Cárdenas. Durante el piloto, el responsable del tratamiento de los datos '
          'sería el organismo que lo opere.',
    ),
    (
      'Qué datos usamos',
      '• Una celda de ~1.2 × 0.6 km donde está tu teléfono (nunca tu ubicación exacta, que solo vive en tu '
          'teléfono).\n'
          '• El identificador de notificaciones de tu teléfono (token), para poder avisarte.\n'
          '• Las celdas de tus zonas guardadas (casa, escuela, trabajo), si las agregas.\n'
          '• Solo si quieres reportar o confirmar: tu número de teléfono verificado.\n'
          '• En los reportes: la ubicación del suceso (un lugar, no una persona), la descripción y, si la '
          'agregas, una foto sin metadatos.',
    ),
    (
      'Para qué',
      'Únicamente para hacerte llegar alertas de lo que ocurre cerca de ti o de tus zonas, y para validar '
          'los reportes. No vendemos ni usamos tus datos para publicidad.',
    ),
    (
      'Qué NO guardamos',
      'Tu ubicación exacta, tu historial de recorridos ni los metadatos de tus fotos (GPS, modelo del '
          'teléfono). Nadie puede reconstruir tus recorridos aunque lea la base de datos completa.',
    ),
    (
      'Con quién se comparten',
      'Con nadie. Las alertas VERIFICADAS se publican en formato CAP para que Protección Civil u otras '
          'autoridades puedan retransmitirlas; esas alertas nunca incluyen datos de quien reportó.',
    ),
    (
      'Datos sensibles',
      'Fotos y datos de menores o personas vulnerables solo se publican con el consentimiento expreso del '
          'familiar o tutor, únicamente en alertas validadas, y dejan de mostrarse cuando el caso se resuelve.',
    ),
    (
      'Cuánto tiempo',
      '• A quién se envió cada alerta: 30 días.\n'
          '• Alertas cerradas: se anonimizan a los 90 días.\n'
          '• Teléfonos sin actividad: se desactivan a los 60 días.',
    ),
    (
      'Tus derechos (ARCO)',
      'Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos. En Ajustes está el botón '
          '"Borrar mi cuenta y mis datos", que elimina tu perfil, tus dispositivos, tus zonas y tus confirmaciones. '
          'También puedes escribir a ${Config.correoContacto}.',
    ),
    (
      'Importante',
      'ALERTA CERCA no sustituye al 911, a la Alerta Amber, al alertamiento sísmico ni a ningún sistema '
          'oficial. Es un mecanismo complementario de información comunitaria. En una emergencia, llama al 911.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Aviso de privacidad')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Aviso de privacidad simplificado', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text(
            'Prototipo · versión 1.0 · octubre de 2026',
            style: TextStyle(color: Colors.grey.shade700, fontSize: 12.5),
          ),
          for (final (titulo, texto) in _secciones) ...[
            const SizedBox(height: 18),
            Text(titulo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 4),
            Text(texto, style: const TextStyle(height: 1.4)),
          ],
          const SizedBox(height: 24),
          Text(
            'Borrador para el prototipo. Para un piloto real debe revisarse con un abogado conforme a la ley de '
            'protección de datos personales vigente.',
            style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: Colors.grey.shade700),
          ),
        ],
      ),
    );
  }
}
