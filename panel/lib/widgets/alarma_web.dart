import 'dart:js_interop';

// Web Audio API: un tono de emergencia alternado (880/660 Hz) de 1.2 s, sin archivos de audio.
@JS('AudioContext')
extension type _ContextoAudio._(JSObject _) implements JSObject {
  external _ContextoAudio();
  external _Oscilador createOscillator();
  external _Ganancia createGain();
  external JSObject get destination;
  external double get currentTime;
  external JSPromise<JSAny?> resume();
}

extension type _Oscilador._(JSObject _) implements JSObject {
  external set type(String valor);
  external _Parametro get frequency;
  external void connect(JSObject destino);
  external void start(double cuando);
  external void stop(double cuando);
}

extension type _Ganancia._(JSObject _) implements JSObject {
  external _Parametro get gain;
  external void connect(JSObject destino);
}

extension type _Parametro._(JSObject _) implements JSObject {
  external void setValueAtTime(double valor, double cuando);
  external void exponentialRampToValueAtTime(double valor, double cuando);
}

_ContextoAudio? _contexto;

/// Suena aunque la pestaña esté en segundo plano (el navegador la deja sonar porque la persona
/// ya interactuó con el panel al iniciar sesión).
void sonarAlarmaSos() {
  try {
    final ctx = _contexto ??= _ContextoAudio();
    ctx.resume();
    final t = ctx.currentTime;
    final oscilador = ctx.createOscillator();
    final volumen = ctx.createGain();
    oscilador.type = 'sawtooth';
    for (var i = 0; i < 7; i++) {
      oscilador.frequency.setValueAtTime(i.isEven ? 880 : 660, t + i * 0.17);
    }
    volumen.gain.setValueAtTime(0.25, t);
    volumen.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    oscilador.connect(volumen);
    volumen.connect(ctx.destination);
    oscilador.start(t);
    oscilador.stop(t + 1.2);
  } catch (_) {
    // Sin Web Audio: queda el aviso visual (banner rojo y título de la pestaña)
  }
}
