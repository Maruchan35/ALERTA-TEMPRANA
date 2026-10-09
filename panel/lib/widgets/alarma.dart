/// Alarma sonora del panel cuando alguien pide ayuda (SOS). Solo suena en el navegador.
library;

export 'alarma_nula.dart' if (dart.library.js_interop) 'alarma_web.dart';
