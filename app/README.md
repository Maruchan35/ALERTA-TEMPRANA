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
| `lib/nucleo/` | `ubicacion.dart` (celda geohash, sin historial), `notificaciones.dart` (canales por nivel, FCM, distancia calculada en el teléfono), `estado_app.dart`, `preferencias.dart`, `segundo_plano.dart` |
| `lib/pantallas/` | bienvenida y permisos, inicio con mapa, detalle, reportar, verificar teléfono, mis zonas, ajustes, aviso de privacidad, acceso de validadores |
| `test/` | pruebas de pantallas en modo demostración |

- **Push**: `flutterfire configure` reemplaza `lib/firebase_options.dart`. Sin Firebase, la app avisa con la app
  abierta usando Realtime.
- **Modo demostración**: *Ajustes → Demostración · ubicación simulada* (puntos A, B, C y D). El código de verificación
  es `123456`. Con `"DEMO": "true"` en `config.json` también aparece en compilaciones release.
- Para recibir alertas no se pide cuenta (sesión anónima); el número se verifica solo para reportar o confirmar.
