# Panel de validadores ALERTA CERCA (Flutter Web)

Para CCE, Protección Civil y escuelas: métricas, mapa con el radio de cada alerta coloreado por estado, pestañas
*Por validar / Activas / Cerradas*, detalle con reputación del autor, confirmaciones, folio del 911 y bitácora;
acciones **Verificar, Ajustar radio, Resolver, Descartar** y **Emitir alerta oficial**. Rol R5 de la propuesta.

```bash
flutter run -d chrome                                       # modo demostración + simulador de 4 teléfonos
flutter run -d chrome --dart-define-from-file=config.json   # conectado a Supabase (copia config.ejemplo.json)
flutter build web --release --dart-define-from-file=config.json
```

- Solo entran cuentas con rol `validador`, `institucion` o `admin` (ver `supabase/demo/cuentas_validadores.sql`).
- Guía para conectarlo (o para hacer un panel propio con `supabase-js`): [docs/panel-web.md](../docs/panel-web.md).
- La lista se actualiza sola con Realtime (respeta RLS).
- **Emergencias SOS**: cuando alguien pide ayuda suena una alarma, aparece un banner rojo y la pestaña *SOS*; al abrirla,
  el mapa grande sigue el recorrido en vivo y el detalle permite tomar el caso, registrar el aviso al 911 (folio), ver el
  video y cerrarla. El simulador tiene *Persona pide ayuda (SOS)* (en un vehículo).
- **Simulador** (solo en modo demostración): botones para que “un ciudadano” reporte un menor o un incendio, y los
  teléfonos A, B, C y D mostrando las notificaciones con la distancia calculada como en la app. Es el plan B del pitch.
- `?a11y` en la URL activa el árbol de accesibilidad desde el inicio (lectores de pantalla y pruebas automáticas).
