# alerta_compartido

Paquete Dart común de la app y el panel (la propuesta pide “mismo lenguaje y modelos que la app”).

| Archivo | Contenido |
|---|---|
| `src/modelos.dart` | `Alerta`, `EstadoAlerta`, `Categoria`, `Perfil`, `ResultadoReporte`, `Metricas`, `EntradaBitacora`… |
| `src/geohash.dart` | Mismo algoritmo que PostGIS y las Edge Functions (`geohash(17.9581, -102.1942) == '9epq4t'`) |
| `src/catalogo.dart` | Copia local de las 12 categorías y sus escalones (`supabase/seed.sql`) |
| `src/radio.dart` | Espejo de `radio_permitido()` y siguiente escalón |
| `src/mensajes.dart` | Espejo de los textos del push (contrato de la sección 7.2) |
| `src/servicio.dart` | Interfaz `ServicioAlertas` |
| `src/servicio_supabase.dart` | Implementación real (RPC, Storage, Realtime, Auth) |
| `src/demo/servicio_demo.dart` | Motor en memoria con las mismas reglas del backend (radio dinámico con margen de celda, estados, duplicados, límites, votos, cierre, expiración), validador y vecinos simulados y los teléfonos A, B, C y D |
| `src/estilo.dart`, `src/widgets/mapa_alertas.dart` | Colores por nivel y estado, insignias, íconos y el mapa de OpenStreetMap |

```bash
flutter test
```
