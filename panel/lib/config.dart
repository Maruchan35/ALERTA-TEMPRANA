/// Configuración del panel de validadores (Flutter Web).
///
///   flutter run -d chrome --dart-define-from-file=config.json   (copia config.ejemplo.json)
///
/// Sin valores, el panel arranca en MODO DEMOSTRACIÓN con los 4 teléfonos de la demo
/// (A, B, C y D) simulados: sirve como plan B de la presentación.
abstract final class Config {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');

  /// "Publishable key" (sb_publishable_...) o, en proyectos con llaves antiguas, la "anon key".
  static const supabaseKey = _publicable == '' ? _anon : _publicable;
  static const _publicable = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  static const _anon = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get hayBackend => supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty;

  /// Centro del mapa: Lázaro Cárdenas, Michoacán.
  static const latInicial = 17.9581;
  static const lonInicial = -102.1942;
}
