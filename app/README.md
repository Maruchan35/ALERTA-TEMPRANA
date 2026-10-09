# App móvil ALERTA CERCA (Flutter · Android, iOS y web)

Recibir alertas cercanas, ver el mapa, reportar en 3 pasos, confirmar (“Yo también lo vi”), guardar *mis zonas* y
compartir con contexto. Roles R3 (pantallas) y R4 (sistema) de la propuesta.

```bash
flutter run -d chrome                                   # modo demostración (sin backend)
flutter run --dart-define-from-file=config.json         # conectada a Supabase (copia config.ejemplo.json)
flutter build apk --release --dart-define-from-file=config.json
```

| Carpeta | Contenido |
|---|---|
| `lib/main.dart`, `lib/app.dart` | Arranque: Firebase (si está configurado), Supabase o modo demostración; navegación desde notificaciones |
| `lib/config.dart` | URL y publishable/anon key (públicas) por `--dart-define` |
| `lib/nucleo/` | `ubicacion.dart` (celda geohash, sin historial), `notificaciones.dart` (canales por nivel, FCM, distancia calculada en el teléfono, alarma SOS para validadores), `estado_app.dart`, `preferencias.dart`, `segundo_plano.dart`, `emergencia.dart` (SOS: cuenta regresiva, ubicación en vivo, cola de video), `proteccion.dart` (puente con Android y sacudida) |
| `lib/pantallas/` | bienvenida y permisos, inicio con mapa y botón **SOS**, detalle, reportar, verificar teléfono, mis zonas, ajustes, aviso de privacidad, acceso de validadores, `emergencia.dart` (pantalla del SOS), `modo_emergencia.dart` (ajustes y simulacro), `emergencias_validador.dart` (seguimiento en vivo) |
| `android/…/kotlin/` | `MainActivity.kt` (disparos del SOS y pantalla de bloqueo), `ModoProteccionService.kt` (sacudida con la app cerrada), `ArranqueReceiver.kt`; atajo del ícono en `res/xml/atajos.xml` |
| `test/` | pruebas de pantallas en modo demostración |

- **Push**: `flutterfire configure` reemplaza `lib/firebase_options.dart`. Sin Firebase, la app avisa con la app
  abierta usando Realtime.
- **Modo demostración**: *Ajustes → Demostración · ubicación simulada* (puntos A, B, C y D). Con `"DEMO": "true"` en
  `config.json` también aparece en compilaciones release.
- **Verificación por WhatsApp**: el código llega por WhatsApp. Mientras sea simulado, la app muestra el mensaje en la
  misma pantalla y escribe el código sola (en la demo sin servidor es `123456`).
- Para recibir alertas no se pide cuenta (sesión anónima); el número se verifica solo para reportar o confirmar.
- **Modo emergencia (SOS)**: botón rojo del inicio, sacudida fuerte o atajo del ícono → 5 s para cancelar → aviso a los
  validadores, ubicación en vivo (servicio en primer plano), video de evidencia por fragmentos de 15 s y 911 a un toque.
  *Ajustes → Modo emergencia* revisa permisos, activa el modo protección y hace un simulacro. Usa plugins nativos: se
  distribuye como versión nueva (1.1.0), no como parche.
