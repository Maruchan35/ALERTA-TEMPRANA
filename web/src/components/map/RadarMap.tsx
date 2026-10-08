import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { Coordinates, CATEGORIAS_OFICIALES } from '../../types/alert';
import { formatDistance } from '../../services/geo';
import { Navigation, Crosshair, Radio } from 'lucide-react';

interface RadarMapProps {
  userCoords: Coordinates;
  alerts: AlertWithDistance[];
  selectedAlertId?: string | null;
  onSelectAlert?: (alertId: string) => void;
  onUpdateUserCoords?: (lat: number, lng: number) => void;
  onMapClickCoordinates?: (coords: { lat: number; lng: number }) => void;
}

export const RadarMap: React.FC<RadarMapProps> = ({
  userCoords,
  alerts,
  selectedAlertId,
  onSelectAlert,
  onUpdateUserCoords,
  onMapClickCoordinates,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const hasAutoFittedRef = useRef(false);
  const [showGeofences, setShowGeofences] = useState(true);

  // Inicializar mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Crear mapa centrado en coordenadas iniciales
    const map = L.map(mapContainerRef.current, {
      center: [userCoords.lat, userCoords.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    // Capa oficial de OpenStreetMap (100% gratuita, libre, sin requerir API keys ni marcas de agua)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    // Listener de clic en el mapa para situar pines
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lng = Number(e.latlng.lng.toFixed(6));
      if (onMapClickCoordinates) {
        onMapClickCoordinates({ lat, lng });
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Centrar suavemente en el usuario al cambiar sus coordenadas
  const handleRecenterUser = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([userCoords.lat, userCoords.lng], 15, { duration: 0.8 });
    }
  };

  // Actualizar marcador de usuario y círculos de alerta
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layersGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Si hay precisión de GPS real, dibujar círculo de precisión
    if (userCoords.accuracyMeters && userCoords.accuracyMeters < 5000) {
      const accuracyCircle = L.circle([userCoords.lat, userCoords.lng], {
        radius: userCoords.accuracyMeters,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        weight: 1,
        dashArray: '3, 4',
      });
      layerGroup.addLayer(accuracyCircle);
    }

    // 2. Marcador del Usuario (Punto azul con halo y ARRASTRABLE para precisión)
    const userHtml = `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: grab;">
        <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: rgba(37, 99, 235, 0.25); animation: pulse-ring 2s infinite;"></div>
        <div style="width: 18px; height: 18px; border-radius: 50%; background: #2563eb; border: 3px solid #ffffff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userHtml,
      className: 'user-radar-pin',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const userMarker = L.marker([userCoords.lat, userCoords.lng], {
      icon: userIcon,
      draggable: true,
      autoPan: true,
    });

    // Evento de arrastre de marcador para calibración milimétrica
    userMarker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      const lat = Number(newPos.lat.toFixed(6));
      const lng = Number(newPos.lng.toFixed(6));
      if (onUpdateUserCoords) {
        onUpdateUserCoords(lat, lng);
      }
    });

    userMarker.bindPopup(
      `<div style="font-size: 12px; padding: 4px; max-width: 220px; font-family: sans-serif;">
        <strong style="color: #1e40af; display: block; margin-bottom: 2px;">📍 Tu Posición Geográfica</strong>
        <span style="color: #475569; display: block; font-size: 11px; margin-bottom: 4px;">${userCoords.address || 'Lázaro Cárdenas, Michoacán'}</span>
        <div style="background: #eff6ff; color: #1d4ed8; padding: 4px 6px; border-radius: 6px; font-size: 10px; font-weight: 600;">
          🖐️ Puedes arrastrar este marcador azul directamente a tu calle.
        </div>
      </div>`
    );

    layerGroup.addLayer(userMarker);
    userMarkerRef.current = userMarker;

    // 3. Dibujar Geocercas y Marcadores para cada Alerta con Anti-Solapamiento
    const validCoords: L.LatLngExpression[] = [[userCoords.lat, userCoords.lng]];
    const coordOccurrences = new Map<string, number>();

    // Primero dibujar las geocercas en el fondo (si están habilitadas)
    if (showGeofences) {
      alerts.forEach((alert) => {
        try {
          const lat = Number(alert.coordinates?.lat);
          const lng = Number(alert.coordinates?.lng);
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

          const isResolved = alert.status === 'resuelta' || alert.status === 'descartada';
          const isSelected = selectedAlertId === alert.id;

          const colorHex = isResolved
            ? '#64748b'
            : alert.level === 4
            ? '#dc2626'
            : alert.level === 3
            ? '#ea580c'
            : alert.level === 2
            ? '#2563eb'
            : '#059669';

          const radiusMeters = Math.max(100, Number(alert.currentRadiusMeters) || 1000);

          // Geocerca de fondo sutil y no bloqueante (interactive: false para no tapar clics)
          const dynamicCircle = L.circle([lat, lng], {
            radius: radiusMeters,
            color: colorHex,
            weight: isSelected ? 2.5 : 1.2,
            opacity: isResolved ? 0.25 : 0.6,
            fillColor: colorHex,
            fillOpacity: isResolved ? 0.02 : isSelected ? 0.12 : 0.05,
            dashArray: alert.status === 'no_confirmada' ? '4, 6' : undefined,
            interactive: false,
          });

          layerGroup.addLayer(dynamicCircle);
        } catch {
          // ignore
        }
      });
    }

    // Segundo: Dibujar los marcadores de cada alerta con dispersión radial si coinciden en coordenadas
    alerts.forEach((alert) => {
      try {
        const lat = Number(alert.coordinates?.lat);
        const lng = Number(alert.coordinates?.lng);

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
          return;
        }

        validCoords.push([lat, lng]);

        // Detectar si hay múltiples alertas en el mismo punto para separarlas visualmente
        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        const count = coordOccurrences.get(coordKey) || 0;
        coordOccurrences.set(coordKey, count + 1);

        // Desplazamiento radial inteligente (Spiderfy) para que NUNCA queden encimadas
        let displayLat = lat;
        let displayLng = lng;
        if (count > 0) {
          const angle = count * ((2 * Math.PI) / 6); // distribuir en flor hexagonal
          const distanceOffset = 0.00032 * Math.ceil(count / 6); // ~35 metros
          displayLat = lat + Math.sin(angle) * distanceOffset;
          displayLng = lng + Math.cos(angle) * distanceOffset;
        }

        const isResolved = alert.status === 'resuelta' || alert.status === 'descartada';
        const catConfig = CATEGORIAS_OFICIALES[alert.category] || CATEGORIAS_OFICIALES['otro'] || {
          nombre_corto: 'Alerta',
          icono: '⚠️',
          color: '#2563eb'
        };
        const isCritical = alert.level === 4;

        // Color estricto según nivel de importancia:
        // Nivel 4: Única en Rojo (#dc2626)
        // Nivel 3: Naranja/Ámbar (#ea580c)
        // Nivel 2: Azul (#2563eb)
        // Nivel 1: Esmeralda (#059669)
        const colorHex = isResolved
          ? '#64748b'
          : alert.level === 4
          ? '#dc2626'
          : alert.level === 3
          ? '#ea580c'
          : alert.level === 2
          ? '#2563eb'
          : '#059669';

        // Marcador de la Alerta con icono representativo
        const markerHtml = `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${
              !isResolved && isCritical
                ? `<div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: pulse-ring 1.8s infinite;"></div>`
                : ''
            }
            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${colorHex}; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 13px; font-weight: bold; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4); transition: transform 0.2s;">
              ${catConfig.icono || '⚠️'}
            </div>
          </div>
        `;

        const alertIcon = L.divIcon({
          html: markerHtml,
          className: 'alert-radar-pin',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const alertMarker = L.marker([displayLat, displayLng], {
          icon: alertIcon,
          zIndexOffset: alert.level * 250 + (isCritical ? 1000 : 0),
        });

        const popupContent = `
          <div style="font-size: 12px; line-height: 1.4; min-width: 220px; font-family: sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 10px; font-weight: 700; color: ${colorHex}; text-transform: uppercase;">
                ${catConfig.nombre_corto} (Nivel ${alert.level})
              </span>
              <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600;">
                ${alert.status.toUpperCase()}
              </span>
            </div>
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px; font-size: 13px;">${alert.title}</div>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
              Folio: <strong style="color: #334155;">${alert.folio}</strong> | Radio: <strong style="color: ${colorHex};">${alert.currentRadiusKm} km</strong>
            </div>
            <div style="color: #475569; margin-bottom: 6px;">${alert.description.substring(0, 110)}...</div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 6px; font-size: 11px;">
              <span style="color: #0284c7; font-weight: 600;">📍 A ${formatDistance(alert.distanceKm)} de ti</span>
              <span style="color: ${alert.isWithinCoverage ? colorHex : '#64748b'}; font-weight: 700;">
                ${alert.isWithinCoverage ? '● EN PERÍMETRO' : 'FUERA DE RANGO'}
              </span>
            </div>
          </div>
        `;

        alertMarker.bindPopup(popupContent);

        alertMarker.on('click', () => {
          if (onSelectAlert) {
            onSelectAlert(alert.id);
          }
        });

        layerGroup.addLayer(alertMarker);
      } catch (err) {
        console.warn('Error dibujando alerta en radar:', err);
      }
    });
  }, [userCoords, alerts, selectedAlertId, showGeofences, onSelectAlert, onUpdateUserCoords, onMapClickCoordinates]);

  // Si se selecciona una alerta, centrar el mapa suavemente
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedAlertId) return;

    const alert = alerts.find((a) => a.id === selectedAlertId);
    if (alert && alert.coordinates) {
      const lat = Number(alert.coordinates.lat);
      const lng = Number(alert.coordinates.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 15, {
          duration: 0.8,
        });
      }
    }
  }, [selectedAlertId, alerts]);

  // Al cargar las alertas, ajustar la vista para verlas todas automáticamente
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || alerts.length === 0 || hasAutoFittedRef.current) return;

    const points: [number, number][] = [[userCoords.lat, userCoords.lng]];
    alerts.forEach((a) => {
      const lat = Number(a.coordinates?.lat);
      const lng = Number(a.coordinates?.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        points.push([lat, lng]);
      }
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
      hasAutoFittedRef.current = true;
    }
  }, [alerts, userCoords]);

  // Ajustar la vista para mostrar todas las alertas del municipio
  const handleFitAllAlerts = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const points: [number, number][] = [[userCoords.lat, userCoords.lng]];
    alerts.forEach((a) => {
      const lat = Number(a.coordinates?.lat);
      const lng = Number(a.coordinates?.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        points.push([lat, lng]);
      }
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.flyTo([userCoords.lat, userCoords.lng], 14);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div ref={mapContainerRef} className="w-full h-full min-h-[520px]" />

      {/* Botones flotantes de navegación cartográfica */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRecenterUser}
          className="p-2.5 rounded-xl bg-white/95 hover:bg-white text-slate-700 hover:text-blue-600 shadow-md border border-slate-200 backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="Centrar en mi ubicación actual"
        >
          <Crosshair className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">Centrar en Mí</span>
        </button>

        <button
          type="button"
          onClick={handleFitAllAlerts}
          className="p-2.5 rounded-xl bg-white/95 hover:bg-white text-slate-700 hover:text-emerald-700 shadow-md border border-slate-200 backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="Ver todas las geocercas activas en el municipio"
        >
          <Navigation className="w-4 h-4 text-emerald-600" />
          <span className="hidden sm:inline">Ver Todas ({alerts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setShowGeofences(!showGeofences)}
          className={`p-2.5 rounded-xl shadow-md border backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
            showGeofences
              ? 'bg-blue-50/95 border-blue-300 text-blue-700 hover:bg-blue-100'
              : 'bg-white/95 border-slate-200 text-slate-600 hover:bg-white'
          }`}
          title="Activar o desactivar círculos de geocercas en el mapa"
        >
          <Radio className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">
            {showGeofences ? 'Geocercas: ON' : 'Geocercas: OFF'}
          </span>
        </button>
      </div>

      {/* Sugerencia de arrastre flotante */}
      <div className="absolute top-3 left-14 z-[1000] hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-md text-[11px] text-slate-700">
        <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>💡 Arrastra el marcador azul para calibrar tu calle exacta.</span>
      </div>

      {/* Indicador de Leyenda del Radar con colores por Nivel */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-700 shadow-md space-y-1.5 select-none max-w-xs">
        <div className="font-bold text-slate-900 text-[12px] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <span>Radar Territorial Lázaro Cárdenas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span className="font-bold text-red-700">Nivel 4: Menor Desaparecido / Evacuación</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="font-semibold text-orange-800">Nivel 3: Asalto / Robo / Incendio</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <span className="text-blue-800 font-semibold">Nivel 2: Accidente / Riesgo Ambiental</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
          <span className="text-emerald-800">Nivel 1: Preventivo / Otro</span>
        </div>
      </div>
    </div>
  );
};
