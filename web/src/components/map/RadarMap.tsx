import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { Coordinates, CATEGORIAS_OFICIALES } from '../../types/alert';
import { formatDistance, getAdaptiveCoverageInfo } from '../../services/geo';
import { Navigation, Crosshair, Radio, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

interface RadarMapProps {
  userCoords: Coordinates;
  alerts: AlertWithDistance[];
  selectedAlertId?: string | null;
  onSelectAlert?: (alertId: string | null) => void;
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
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const hasAutoFittedRef = useRef(false);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite' | 'dark'>('streets');

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

    // Capa base inicial
    const baseTile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    tileLayerRef.current = baseTile;

    const layerGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layerGroup;

    const poiLayerGroup = L.layerGroup().addTo(map);
    poiLayerGroupRef.current = poiLayerGroup;

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

  // Cambiar estilo de la capa del mapa (Calles, Satelital, Contraste Nocturno)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    let url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    let options: L.TileLayerOptions = { maxZoom: 19 };

    if (mapStyle === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      options = { maxZoom: 18 };
    } else if (mapStyle === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      options = { maxZoom: 19, subdomains: 'abcd' };
    }

    tileLayerRef.current = L.tileLayer(url, options).addTo(mapInstanceRef.current);
  }, [mapStyle]);

  // Renderizar Puntos de Interés Seguros (Hospitales, Comandancias, Bomberos, CCE)
  useEffect(() => {
    if (!poiLayerGroupRef.current) return;
    poiLayerGroupRef.current.clearLayers();
    if (!showPOIs) return;

    const POIS_SEGURIDAD = [
      { nombre: 'Hospital General de Lázaro Cárdenas', tipo: 'Hospital General', lat: 17.9654, lng: -102.2012, tel: '753-532-0118', emoji: '🏥', color: '#DC2626' },
      { nombre: 'Cruz Roja Delegación Lázaro Cárdenas', tipo: 'Servicio de Paramédicos', lat: 17.9602, lng: -102.1985, tel: '753-537-2244', emoji: '🚑', color: '#EF4444' },
      { nombre: 'Comandancia de Policía Municipal', tipo: 'Seguridad Pública', lat: 17.9712, lng: -102.2140, tel: '753-537-4004', emoji: '🚓', color: '#2563EB' },
      { nombre: 'Protección Civil & Bomberos Municipales', tipo: 'Bomberos & Rescate', lat: 17.9678, lng: -102.2085, tel: '753-532-1925', emoji: '🚒', color: '#D97706' },
      { nombre: 'SEMAR / Décima Cuarta Zona Naval', tipo: 'Armada de México', lat: 17.9350, lng: -102.1790, tel: '753-532-0158', emoji: '⚓', color: '#1E3A8A' },
      { nombre: 'Consejo Coordinador Empresarial (CCE)', tipo: 'Sede Operativa CCE', lat: 17.9641, lng: -102.2045, tel: '753-532-1200', emoji: '🏢', color: '#7C3AED' },
    ];

    POIS_SEGURIDAD.forEach((poi) => {
      const poiIcon = L.divIcon({
        className: 'poi-custom-marker',
        html: `
          <div style="background-color: ${poi.color}; width: 32px; height: 32px; border-radius: 10px; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer;">
            ${poi.emoji}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: poiIcon });
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 4px; min-width: 190px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">${poi.tipo}</div>
          <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-top: 2px;">${poi.nombre}</div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 700; font-family: monospace; color: #dc2626;">${poi.tel}</span>
            <a href="tel:${poi.tel.replace(/[^0-9]/g, '')}" style="background: #2563eb; color: white; padding: 2px 8px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 10px;">Llamar</a>
          </div>
        </div>
      `);
      poiLayerGroupRef.current?.addLayer(marker);
    });
  }, [showPOIs]);

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

    // 3. Dibujar Geocercas Adaptativas y Marcadores para cada Alerta
    const validCoords: L.LatLngExpression[] = [[userCoords.lat, userCoords.lng]];
    const coordOccurrences = new Map<string, number>();

    // Primero dibujar las geocercas concéntricas en el fondo (si están habilitadas)
    // REGLA CLAVE: Si una alerta está seleccionada, se dibuja EXCLUSIVAMENTE su rango de búsqueda.
    // Al deseleccionarla, se vuelven a mostrar todos los rangos automáticamente.
    if (showGeofences) {
      const alertsToRenderGeofences = selectedAlertId
        ? alerts.filter((a) => a.id === selectedAlertId)
        : alerts;

      alertsToRenderGeofences.forEach((alert) => {
        try {
          const lat = Number(alert.coordinates?.lat);
          const lng = Number(alert.coordinates?.lng);
          if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;

          const isResolved = alert.status === 'resuelta' || alert.status === 'descartada';
          const isSelected = selectedAlertId === alert.id;
          const isPrioritySearch =
            alert.category === 'menor_desaparecido' ||
            alert.category === 'persona_desaparecida' ||
            alert.category === 'persona_vulnerable' ||
            alert.level === 4;

          const adaptive = alert.adaptiveInfo || getAdaptiveCoverageInfo(alert);

          // Si es búsqueda prioritaria o está seleccionada, dibujar TODOS los anillos concéntricos del protocolo
          if (!isResolved && (isPrioritySearch || isSelected) && adaptive.allStages && adaptive.allStages.length > 1) {
            // Dibujar desde el anillo más grande al más pequeño
            const stagesReversed = [...adaptive.allStages].reverse();

            stagesReversed.forEach((stage) => {
              const isActive = stage.radiusKm === adaptive.currentRadiusKm;
              const isPastOrCurrent = stage.radiusKm <= adaptive.currentRadiusKm;

              const stageCircle = L.circle([lat, lng], {
                radius: stage.radiusMeters,
                color: stage.color,
                weight: isActive ? 2.5 : isSelected ? 1.8 : 1.2,
                opacity: isActive ? 0.8 : isPastOrCurrent ? 0.45 : 0.25,
                fillColor: stage.color,
                fillOpacity: isActive ? 0.09 : isPastOrCurrent ? 0.04 : 0.015,
                dashArray: isActive ? undefined : '5, 8',
                interactive: false,
              });

              layerGroup.addLayer(stageCircle);
            });
          } else {
            // Alerta estándar: dibujar su geocerca adaptativa activa
            const colorHex = isResolved
              ? '#64748b'
              : alert.level === 4
              ? '#dc2626'
              : alert.level === 3
              ? '#ea580c'
              : alert.level === 2
              ? '#eab308'
              : '#059669';

            const radiusMeters = Math.max(100, Number(alert.currentRadiusMeters) || adaptive.currentRadiusMeters || 1000);

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
          }
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
        // Nivel 2: Amarillo (#eab308)
        // Nivel 1: Esmeralda (#059669)
        const colorHex = isResolved
          ? '#64748b'
          : alert.level === 4
          ? '#dc2626'
          : alert.level === 3
          ? '#ea580c'
          : alert.level === 2
          ? '#eab308'
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

        const adaptive = alert.adaptiveInfo || getAdaptiveCoverageInfo(alert);

        const popupContent = `
          <div style="font-size: 12px; line-height: 1.4; min-width: 240px; font-family: sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 10px; font-weight: 700; color: ${colorHex}; text-transform: uppercase;">
                ${catConfig.nombre_corto} (Nivel ${alert.level})
              </span>
              <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600;">
                ${alert.status.toUpperCase()}
              </span>
            </div>
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px; font-size: 13px;">${alert.title}</div>
            
            ${
              adaptive.isAdaptive
                ? `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; font-size: 11px;">
                    <strong style="color: #92400e; display: flex; align-items: center; gap: 4px;">
                      🎯 Protocolo Adaptativo: ${adaptive.stageBadge}
                    </strong>
                    <span style="color: #78350f; font-size: 10px; display: block; margin-top: 2px;">
                      ${adaptive.stageName} (⏱️ ${adaptive.elapsedMinutes}m de evolución)
                    </span>
                   </div>`
                : `<div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
                    Folio: <strong style="color: #334155;">${alert.folio}</strong> | Radio: <strong style="color: ${colorHex};">${alert.currentRadiusKm} km</strong>
                   </div>`
            }
            
            <div style="color: #475569; margin-bottom: 6px;">${alert.description.substring(0, 110)}...</div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 6px; font-size: 11px;">
              <span style="color: #0284c7; font-weight: 600;">📍 A ${formatDistance(alert.distanceKm)} de ti</span>
              <span style="color: ${alert.isWithinCoverage ? colorHex : '#64748b'}; font-weight: 700;">
                ${alert.isWithinCoverage ? '● EN TU PERÍMETRO' : 'FUERA DE RANGO'}
              </span>
            </div>
          </div>
        `;

        alertMarker.bindPopup(popupContent);

        alertMarker.on('click', () => {
          if (onSelectAlert) {
            if (selectedAlertId === alert.id) {
              onSelectAlert(null); // Deseleccionar para volver a mostrar todos los rangos
            } else {
              onSelectAlert(alert.id);
            }
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

  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const selectedAlert = alerts.find((a) => a.id === selectedAlertId);

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div ref={mapContainerRef} className="w-full h-full min-h-[520px]" />

      {/* Indicador flotante cuando hay una emergencia seleccionada (Aislamiento de Rango) */}
      {selectedAlert && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/95 text-white backdrop-blur-md shadow-xl border border-amber-500/60 text-xs animate-fade-in max-w-[90%] sm:max-w-md">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="font-bold truncate">
            Rango enfocado: {selectedAlert.title}
          </span>
          <button
            type="button"
            onClick={() => onSelectAlert?.(null)}
            className="ml-auto px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-amber-300 hover:text-white text-[11px] font-bold border border-zinc-600 cursor-pointer transition-all shrink-0"
            title="Mostrar los rangos de todas las alertas"
          >
            ✕ Ver todos los rangos
          </button>
        </div>
      )}

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

        {/* Selector de Capa de Mapa */}
        <div className="flex items-center bg-white/95 backdrop-blur-md rounded-xl p-1 border border-slate-200 shadow-md text-xs">
          <button
            type="button"
            onClick={() => setMapStyle('streets')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              mapStyle === 'streets' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Mapa de calles OpenStreetMap"
          >
            Calles
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('satellite')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              mapStyle === 'satellite' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Fotografía satelital Esri World Imagery"
          >
            Satélite
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('dark')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              mapStyle === 'dark' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Modo táctico de contraste nocturno"
          >
            Noche
          </button>
        </div>

        {/* Toggle Puntos Seguros (Hospitales, Comandancia, Bomberos) */}
        <button
          type="button"
          onClick={() => setShowPOIs(!showPOIs)}
          className={`p-2.5 rounded-xl shadow-md border backdrop-blur-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
            showPOIs
              ? 'bg-emerald-50/95 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
              : 'bg-white/95 border-slate-200 text-slate-600 hover:bg-white'
          }`}
          title="Hospitales, Policía, Bomberos y Puestos de auxilio en Lázaro Cárdenas"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="hidden sm:inline">Puntos Seguros: {showPOIs ? 'ON' : 'OFF'}</span>
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

      {/* Indicador de Leyenda del Radar con Protocolo Adaptativo Oficial */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700 shadow-lg space-y-2 select-none max-w-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
          <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <span>Protocolo Adaptativo de Búsqueda</span>
          </div>
          <button
            type="button"
            onClick={() => setIsLegendExpanded(!isLegendExpanded)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            {isLegendExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {isLegendExpanded && (
          <div className="space-y-1.5 pt-0.5">
            <div className="p-2 rounded-lg bg-red-50/80 border border-red-200/80 space-y-1 text-[10px]">
              <div className="font-extrabold text-red-900 flex items-center justify-between">
                <span>Rango Adaptativo (Menores y Desaparecidos):</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-200 text-red-900">Prioridad</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-slate-700 pt-0.5">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                  <span><strong>min 0:</strong> radio 1 km</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                  <span><strong>min 15:</strong> radio 3 km</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  <span><strong>min 60:</strong> radio 10 km</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                  <span><strong>min 180:</strong> radio 25 km</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-[10px] pt-1 text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                <span>Nivel 3: Asalto / Robo / Incendio (1 km a 5 km)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                <span>Nivel 2: Accidente / Riesgo Ambiental (1 a 2 km)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                <span>Nivel 1: Resuelta / Aviso preventivo</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
