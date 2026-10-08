/// Configuración de la app.
///
/// La URL y la publishable/anon key de Supabase son PÚBLICAS (respetan las reglas RLS).
/// La service_role key NUNCA va en la app.
///
/// Se pasan al compilar:
///   flutter run --dart-define-from-file=config.json      (copia config.ejemplo.json)
///
/// Sin valores, la app arranca en MODO DEMOSTRACIÓN: funciona completa en memoria
/// (validador y vecinos simulados, factor de tiempo 30), sin backend ni cuentas.
abstract final class Config {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');

  /// "Publishable key" (sb_publishable_...) o, en proyectos con llaves antiguas, la "anon key".
  static const supabaseKey = _publicable == '' ? _anon : _publicable;
  static const _publicable = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  static const _anon = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// Muestra "Ubicación simulada" (puntos A, B, C y D de la demo) también en release.
  /// En compilaciones de depuración siempre está disponible.
  static const herramientasDemo = bool.fromEnvironment('DEMO');

  static bool get hayBackend => supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty;

  /// Centro por defecto del mapa: Lázaro Cárdenas, Michoacán.
  static const latInicial = 17.9581;
  static const lonInicial = -102.1942;

  static const correoContacto = 'cce.lazarocardenas@gmail.com';
}
