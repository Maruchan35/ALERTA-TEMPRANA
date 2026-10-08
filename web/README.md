# ALERTA CERCA · Portal Web Comunitario y Consola de Mando CCE (React + Vite)

Portal web de alta fidelidad para el sistema **ALERTA CERCA (HackaITLAC 2026)**.

## ✨ Características Principales
- **Cartografía y Radar Territorial en Tiempo Real**: Visualización interactiva con Leaflet, dispersión anti-colisión (*spiderfy*) para incidentes en la misma coordenada, círculos de geocercas dinámicos (1 km, 3 km, 10 km, 25 km).
- **Consola de Operaciones del CCE (Modo Moderador)**: Tema oscuro ejecutivo (`zinc-950`), gestión y validación de alertas, ajuste de radio, cierre de incidentes y bitácora en vivo.
- **Acceso Comunitario y Reportes Ciudadanos**: Reporte de incidentes en 3 pasos con validación estricta, geolocalización en tiempo real y botón colaborativo *"Lo he visto"* para registrar avistamientos ciudadanos.
- **Sincronización Total con Supabase**: Subscripciones en tiempo real (`postgres_changes`), mapeo PostGIS, soporte multi-bucket para fotos y evidencias.

## 🚀 Puesta en marcha rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# O para exponerlo en la red local:
npx vite --host
```

## 🔐 Credenciales del Validador Oficial (CCE)
- **Usuario:** `admin123@gmail.com`
- **Contraseña:** `admin123`
