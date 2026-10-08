import 'package:flutter/material.dart';

import 'modelos.dart';

/// Colores de la propuesta (paso 2.7 y sección 4.4).
abstract final class Colores {
  static const marino = Color(0xFF13294B); // encabezados y marca
  static const marinoClaro = Color(0xFF1F3B66);
  static const rojo = Color(0xFFD62828); // nivel 4 y botón "Reportar"
  static const naranja = Color(0xFFF77F00); // nivel 3
  static const ambar = Color(0xFFE09F1F); // nivel 2 y "no confirmada"
  static const azul = Color(0xFF3A86FF); // nivel 1
  static const azulConfianza = Color(0xFF1D4ED8); // "corroborada"
  static const verde = Color(0xFF2A9D8F); // "verificada"
  static const morado = Color(0xFF7B2CBF); // "en revisión"
  static const gris = Color(0xFF6B7280); // cerradas
  static const fondo = Color(0xFFF4F6FA);
}

Color colorNivel(int nivel) => switch (nivel) {
  4 => Colores.rojo,
  3 => Colores.naranja,
  2 => Colores.ambar,
  _ => Colores.azul,
};

String textoNivel(int nivel) => switch (nivel) {
  4 => 'Crítica',
  3 => 'Alta',
  2 => 'Media',
  _ => 'Informativa',
};

Color colorEstado(EstadoAlerta e) => switch (e) {
  EstadoAlerta.pendiente => Colores.morado,
  EstadoAlerta.noConfirmada => Colores.ambar,
  EstadoAlerta.corroborada => Colores.azulConfianza,
  EstadoAlerta.verificada => Colores.verde,
  _ => Colores.gris,
};

IconData iconoCategoria(String clave) => switch (clave) {
  'menor_desaparecido' => Icons.child_care,
  'persona_desaparecida' => Icons.person_search,
  'persona_vulnerable' => Icons.elderly,
  'robo_vehiculo' => Icons.directions_car,
  'asalto' => Icons.report,
  'incendio' => Icons.local_fire_department,
  'inundacion' => Icons.flood,
  'accidente' => Icons.car_crash,
  'riesgo_ambiental' => Icons.air,
  'evacuacion' => Icons.directions_run,
  'fenomeno_natural' => Icons.thunderstorm,
  _ => Icons.priority_high,
};

/// Tema común de la app y del panel.
ThemeData temaAlertaCerca({Brightness brillo = Brightness.light}) {
  final esquema = ColorScheme.fromSeed(
    seedColor: Colores.marino,
    brightness: brillo,
    primary: brillo == Brightness.light ? Colores.marino : const Color(0xFF9CB8E8),
    error: Colores.rojo,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: esquema,
    scaffoldBackgroundColor: brillo == Brightness.light ? Colores.fondo : null,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colores.marino,
      foregroundColor: Colors.white,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: .5, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      margin: EdgeInsets.zero,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// Insignia del estado de confianza: "VERIFICADA", "NO CONFIRMADA"...
class InsigniaEstado extends StatelessWidget {
  const InsigniaEstado(this.estado, {super.key, this.compacta = false});

  final EstadoAlerta estado;
  final bool compacta;

  @override
  Widget build(BuildContext context) {
    final color = colorEstado(estado);
    return Semantics(
      label: 'Estado: ${estado.legible}',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: compacta ? 6 : 10, vertical: compacta ? 2 : 4),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(20)),
        child: Text(
          estado.legible.toUpperCase(),
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: compacta ? 10 : 11.5,
            letterSpacing: .6,
          ),
        ),
      ),
    );
  }
}

/// Icono circular de la categoría con el color de su nivel (marcadores del mapa y listas).
class IconoCategoria extends StatelessWidget {
  const IconoCategoria({
    super.key,
    required this.categoria,
    required this.nivel,
    this.tamano = 36,
    this.apagado = false,
  });

  final String categoria;
  final int nivel;
  final double tamano;
  final bool apagado;

  @override
  Widget build(BuildContext context) {
    final color = apagado ? Colores.gris : colorNivel(nivel);
    return Container(
      width: tamano,
      height: tamano,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: tamano / 14),
        boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Icon(iconoCategoria(categoria), color: Colors.white, size: tamano * .55),
    );
  }
}

/// Leyenda obligatoria (sección 12): "ALERTA CERCA no sustituye al 911".
class LeyendaNo911 extends StatelessWidget {
  const LeyendaNo911({super.key, this.alLlamar});

  final VoidCallback? alLlamar;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFFF4E5),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
          child: Row(
            children: [
              const Icon(Icons.info_outline, size: 18, color: Color(0xFF8A4B00)),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'ALERTA CERCA no sustituye al 911 ni a los sistemas oficiales.',
                  style: TextStyle(fontSize: 12.5, color: Color(0xFF8A4B00), fontWeight: FontWeight.w600),
                ),
              ),
              if (alLlamar != null)
                TextButton.icon(
                  onPressed: alLlamar,
                  icon: const Icon(Icons.call, size: 18),
                  label: const Text('911'),
                  style: TextButton.styleFrom(foregroundColor: Colores.rojo),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
