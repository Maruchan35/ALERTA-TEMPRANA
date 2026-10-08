import { useState, useEffect, useCallback, useRef } from 'react';
import { Coordinates, PresetLocation } from '../types/alert';

// Coordenadas centrales oficiales de Lázaro Cárdenas, Michoacán
export const LAZARO_CARDENAS_CENTRO: Coordinates = {
  lat: 17.9581,
  lng: -102.1942,
  address: 'Av. Lázaro Cárdenas, Centro, Lázaro Cárdenas',
  referencePoint: 'Presidencia Municipal de Lázaro Cárdenas',
  accuracyMeters: 10,
};

export const PRESETS_LAZARO_CARDENAS: PresetLocation[] = [
  {
    id: 'centro',
    name: 'Presidencia / Centro',
    coords: LAZARO_CARDENAS_CENTRO,
  },
  {
    id: 'malecon',
    name: 'Malecón de la Cultura',
    coords: {
      lat: 17.9442,
      lng: -102.2038,
      address: 'Malecón Costero, Río Balsas',
      referencePoint: 'Obelisco del Malecón',
      accuracyMeters: 10,
    },
  },
  {
    id: 'guacamayas',
    name: 'Las Guacamayas',
    coords: {
      lat: 17.9942,
      lng: -102.2155,
      address: 'Av. Circunvalación, Las Guacamayas',
      referencePoint: 'Glorieta de Las Guacamayas',
      accuracyMeters: 10,
    },
  },
  {
    id: 'puerto',
    name: 'Recinto Portuario ASIPONA',
    coords: {
      lat: 17.9312,
      lng: -102.1810,
      address: 'Isla del Cayacal, Recinto Portuario',
      referencePoint: 'Edificio Corporativo ASIPONA',
      accuracyMeters: 10,
    },
  },
  {
    id: 'playa_erendira',
    name: 'Playa Eréndira / Jardín',
    coords: {
      lat: 17.9698,
      lng: -102.2612,
      address: 'Blvd. Playero, Playa Eréndira',
      referencePoint: 'Zona Turística Playera',
      accuracyMeters: 10,
    },
  },
  {
    id: 'la_mira',
    name: 'La Mira',
    coords: {
      lat: 18.0402,
      lng: -102.3255,
      address: 'Carretera Costera, La Mira',
      referencePoint: 'Zona Minera / Poblado La Mira',
      accuracyMeters: 10,
    },
  },
];

// Geocodificación inversa real usando OpenStreetMap Nominatim
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'AlertaCerca-Web/1.0 (HackaITLAC)' } }
    );
    if (res.ok) {
      const data = await res.json();
      const road = data.address?.road || data.address?.pedestrian || '';
      const suburb = data.address?.suburb || data.address?.neighbourhood || '';
      const city = data.address?.city || data.address?.town || 'Lázaro Cárdenas';
      if (road && suburb) return `${road}, Col. ${suburb}, ${city}`;
      if (road) return `${road}, ${city}`;
      return data.display_name?.split(',').slice(0, 3).join(',') || `${city}, Mich.`;
    }
  } catch {
    // fallback
  }
  return `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Búsqueda de calles y lugares en Lázaro Cárdenas con Nominatim
export async function searchPlacesInLazaroCardenas(query: string): Promise<
  Array<{ name: string; lat: number; lng: number }>
> {
  if (!query || query.trim().length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query.trim() + ', Lázaro Cárdenas, Michoacán'
      )}&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'AlertaCerca-Web/1.0 (HackaITLAC)' } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.map((item: any) => ({
        name: item.display_name.split(',').slice(0, 3).join(','),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
    }
  } catch {
    // fallback
  }
  return [];
}

export type AccuracyLevel = 'satellite' | 'good' | 'moderate' | 'coarse';

export function getAccuracyLevel(accuracyMeters?: number): AccuracyLevel {
  if (!accuracyMeters) return 'coarse';
  if (accuracyMeters <= 25) return 'satellite';
  if (accuracyMeters <= 100) return 'good';
  if (accuracyMeters <= 1000) return 'moderate';
  return 'coarse';
}

export function useGeolocation() {
  const [coords, setCoords] = useState<Coordinates>(() => {
    return LAZARO_CARDENAS_CENTRO;
  });

  const [activePresetId, setActivePresetId] = useState<string | null>('centro');
  const [isGPSActive, setIsGPSActive] = useState<boolean>(false);
  const [isManualPin, setIsManualPin] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const bestAccuracyRef = useRef<number>(Infinity);

  // Detener el rastreo GPS
  const stopWatchingGPS = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Solicitar GPS Real del dispositivo con alta precisión y escucha activa
  const requestRealGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no está soportada por este navegador.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);
    stopWatchingGPS();
    bestAccuracyRef.current = Infinity;

    // Iniciar watchPosition con maximumAge: 0 para forzar lecturas frescas de satélite/sensores
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy);

        // Si la precisión es mejor o si es la primera lectura
        if (accuracy < bestAccuracyRef.current || bestAccuracyRef.current === Infinity) {
          bestAccuracyRef.current = accuracy;

          const address = await reverseGeocodeCoords(lat, lng);
          const accuracyDesc =
            accuracy <= 25
              ? `GPS Satelital Alta Precisión (±${accuracy} m)`
              : accuracy <= 100
              ? `GPS Bueno (±${accuracy} m)`
              : accuracy <= 1000
              ? `GPS Red Local (±${accuracy} m)`
              : `Ubicación Celular/IP aproximada (±${accuracy} m)`;

          setCoords({
            lat,
            lng,
            address,
            referencePoint: accuracyDesc,
            accuracyMeters: accuracy,
          });

          setIsGPSActive(true);
          setIsManualPin(false);
          setActivePresetId(null);
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        let errorMsg = 'No se pudo obtener la señal GPS.';
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = 'Permiso de ubicación denegado en el navegador.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = 'Señal GPS no disponible en este dispositivo.';
        } else if (err.code === err.TIMEOUT) {
          errorMsg = 'Tiempo de espera de GPS agotado.';
        }
        setGpsError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0, // Nunca usar caché vieja de IP/antena
      }
    );
  }, [stopWatchingGPS]);

  // Fijar manualmente la posición (por arrastre en mapa, clic o búsqueda de calle)
  const setLocationManually = useCallback(
    async (lat: number, lng: number, manualAddress?: string) => {
      stopWatchingGPS();
      setIsLocating(true);
      const fixedLat = Number(lat.toFixed(6));
      const fixedLng = Number(lng.toFixed(6));

      const address = manualAddress || (await reverseGeocodeCoords(fixedLat, fixedLng));

      setCoords({
        lat: fixedLat,
        lng: fixedLng,
        address,
        referencePoint: 'Fijado con precisión en el mapa',
        accuracyMeters: 5,
      });

      setIsGPSActive(false);
      setIsManualPin(true);
      setActivePresetId(null);
      setIsLocating(false);
      setGpsError(null);
    },
    [stopWatchingGPS]
  );

  // Seleccionar preset de Lázaro Cárdenas
  const selectPreset = useCallback(
    (preset: PresetLocation) => {
      stopWatchingGPS();
      setCoords(preset.coords);
      setActivePresetId(preset.id);
      setIsGPSActive(false);
      setIsManualPin(false);
      setGpsError(null);
    },
    [stopWatchingGPS]
  );

  // Centrar en Presidencia / Centro
  const centerInLazaroCardenas = useCallback(() => {
    stopWatchingGPS();
    setCoords(LAZARO_CARDENAS_CENTRO);
    setActivePresetId('centro');
    setIsGPSActive(false);
    setIsManualPin(false);
    setGpsError(null);
  }, [stopWatchingGPS]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopWatchingGPS();
    };
  }, [stopWatchingGPS]);

  return {
    currentCoords: coords,
    isUsingRealGPS: isGPSActive,
    isManualPin,
    isLocating,
    gpsError,
    accuracyLevel: getAccuracyLevel(coords.accuracyMeters),
    requestRealGPS,
    setLocationManually,
    stopWatchingGPS,
    centerInLazaroCardenas,
    presets: PRESETS_LAZARO_CARDENAS,
    activePresetId,
    selectPreset,
  };
}
