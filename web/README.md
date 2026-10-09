# ALERTA CERCA · Portal Web Comunitario y Consola de Mando CCE (React + Vite)

Portal web de alta fidelidad para el sistema **ALERTA CERCA (HackaITLAC 2026)**.

## ✨ Características Principales
- **Cartografía y Radar Territorial en Tiempo Real**: Visualización interactiva con Leaflet, dispersión anti-colisión (*spiderfy*) para incidentes en la misma coordenada, círculos de geocercas dinámicos (1 km, 3 km, 10 km, 25 km).
- **Consola de Operaciones del CCE (Modo Moderador)**: Tema oscuro ejecutivo (`zinc-950`), gestión y validación de alertas, ajuste de radio, cierre de incidentes y bitácora en vivo.
- **Acceso Comunitario y Reportes Ciudadanos**: Reporte de incidentes en 3 pasos con validación estricta, geolocalización en tiempo real y botón colaborativo *"Lo he visto"* para registrar avistamientos ciudadanos.
- **Sincronización Total con Supabase**: Subscripciones en tiempo real (`postgres_changes`), mapeo PostGIS, soporte multi-bucket para fotos y evidencias.
- **Emergencias SOS (Modo Moderador)**: alarma crítica y banner rojo en cualquier vista cuando alguien pide ayuda desde la app; recorrido en vivo en el mapa, velocidad, batería, video de evidencia y seguimiento (tomar el caso, aviso al 911, cerrar). Código: `services/emergencyService.ts`, `hooks/useEmergencies.ts`, `components/admin/EmergencyPanel.tsx`.

## 🚀 Puesta en marcha rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# O para exponerlo en la red local:
npx vite --host
```

## 🔐 Acceso de moderador

Solo entran cuentas reales de Supabase con rol `validador`, `institucion` o `admin` (el rol se asigna en Supabase:
[docs/panel-web.md](../docs/panel-web.md), paso 3). **Nunca escribas contraseñas en el código ni en este README**: el
repositorio y la página son públicos.

## 🧭 Reglas para hablar con el servidor

Todo pasa por [`src/services/alertService.ts`](src/services/alertService.ts):

| Para… | Usa | Nunca |
|---|---|---|
| Leer alertas | `alertas_panel` (con cuenta de validador) o `alertas` | — |
| Verificar, ajustar radio, resolver, descartar | `rpc('validar_alerta', …)` | `.from('alertas').update(…)` |
| Reportar o emitir una alerta oficial | `rpc('crear_reporte', …)` | `.from('alertas').insert(…)` |
| Confirmar (“yo también lo vi”) | `rpc('confirmar_alerta', …)` | sumar contadores a mano |
| Fotos | URL firmada de `storage.from('fotos')` (bucket privado) | `getPublicUrl` o hacer público el bucket |
| Emergencias SOS: leer | `emergencias_panel`, `emergencia_puntos`, `emergencia_evidencias` | — |
| Emergencias SOS: actuar | `rpc('atender_emergencia', …)` | `.from('emergencias').update(…)` |
| Video de evidencia | URL firmada de `storage.from('evidencias')` | hacer público el bucket |

Las funciones del servidor revisan el rol, dejan registro en la bitácora y avisan a los teléfonos. Una escritura
directa el servidor la rechaza (RLS) y la página mostraría algo que no pasó. Por eso `npm run build` (y GitHub
Actions en cada push) falla si alguien la agrega; `npm run revisar` dice en qué archivo y línea.
