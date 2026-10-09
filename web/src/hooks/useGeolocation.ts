import { useState, useEffect, useCallback, useRef } from 'react';
import { Coordinates } from '../types/alert';
import { calculateDistanceKm } from '../services/geo';

// Coordenadas centrales oficiales para Lázaro Cárdenas, Michoacán
export const LAZARO_CARDENAS_CENTRO: Coordinates = {
  lat: 17.9581,
  lng: -102.1942,
  address: 'Centro, Lázaro Cárdenas, Michoacán',
  referencePoint: 'Centro',
  accuracyMeters: 10,
};

const STORAGE_COORDS_KEY = 'alerta_cerca_user_coords';

// Colonias y avenidas de referencia rápida en el municipio de Lázaro Cárdenas
export const PUNTOS_REFERENCIA_LC: Array<{ name: string; lat: number; lng: number; desc: string }> = [
  { name: 'Centro / Palacio Municipal', lat: 17.9581, lng: -102.1942, desc: 'Av. Lázaro Cárdenas, Primer Sector' },
  { name: 'Las Guacamayas', lat: 17.9985, lng: -102.2156, desc: 'Tenencia Las Guacamayas' },
  { name: 'Buenos Aires', lat: 17.9712, lng: -102.2084, desc: 'Col. Buenos Aires / Libramiento' },
  { name: 'Primer Sector', lat: 17.9620, lng: -102.1980, desc: 'Sector Residencial / Malecón' },
  { name: 'Segundo Sector', lat: 17.9530, lng: -102.2050, desc: 'Col. Segundo Sector' },
  { name: 'Colonia 600 Casas', lat: 17.9655, lng: -102.2025, desc: 'Zona Habitacional Magisterial' },
  { name: 'La Mira', lat: 18.0432, lng: -102.3256, desc: 'Tenencia La Mira' },
  { name: 'Playa Azul', lat: 17.9824, lng: -102.3512, desc: 'Costera Playa Azul' },
  { name: 'Caleta de Campos', lat: 18.0734, lng: -102.7541, desc: 'Bahía de Caleta de Campos' },
  { name: 'Puerto Interior / Isla del Cayacal', lat: 17.9350, lng: -102.1720, desc: 'Zona Portuaria ASIPONA' },
];

export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { 
        headers: { 'User-Agent': 'AlertaCerca-Web/1.0 (HackaITLAC-LazaroCardenas)' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const road = data.address?.road || data.address?.pedestrian || '';
      const suburb = data.address?.suburb || data.address?.neighbourhood || data.address?.residential || '';
      const city = data.address?.city || data.address?.town || data.address?.municipality || 'Lázaro Cárdenas';
      if (road && suburb) return `${road}, Col. ${suburb}, ${city}`;
      if (road) return `${road}, ${city}`;
      if (suburb) return `Col. ${suburb}, ${city}`;
      return data.display_name?.split(',').slice(0, 3).join(',') || `${city}, Mich.`;
    }
  } catch {
    // fallback
  }
  return `Lázaro Cárdenas (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

export type AccuracyLevel = 'satellite' | 'good' | 'moderate' | 'coarse';

export function getAccuracyLevel(accuracyMeters?: number): AccuracyLevel {
  if (!accuracyMeters) return 'good';
  if (accuracyMeters <= 25) return 'satellite';
  if (accuracyMeters <= 100) return 'good';
  if (accuracyMeters <= 1000) return 'moderate';
  return 'coarse';
}

export function useGeolocation() {
  // 1. Inicializar desde localStorage si ya se calibró previamente
  const [coords, setCoords] = useState<Coordinates>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_COORDS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lat && parsed.lng) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return LAZARO_CARDENAS_CENTRO;
  });

  const [isGPSActive, setIsGPSActive] = useState<boolean>(false);
  const [isManualPin, setIsManualPin] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_COORDS_KEY) !== null;
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Detener escucha de GPS
  const stopWatchingGPS = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Procesar posición validando que pertenezca a Lázaro Cárdenas (Anti-Salto ISP a Morelia/CDMX)
  const handlePositionSuccess = useCallback(async (pos: GeolocationPosition) => {
    if (isCancelledRef.current) return;
    const lat = Number(pos.coords.latitude.toFixed(6));
    const lng = Number(pos.coords.longitude.toFixed(6));
    const accuracy = Math.round(pos.coords.accuracy) || 15;

    // Protección Geodésica Haversine:
    // Si la distancia a Lázaro Cárdenas es > 65km (ej: Morelia está a ~220km),
    // es un salto de nodo ISP en laptop. No saltar a Morelia; mantener en Lázaro Cárdenas.
    const distanceKmToLC = calculateDistanceKm(
      { lat, lng, address: '', referencePoint: '' },
      LAZARO_CARDENAS_CENTRO
    );

    if (distanceKmToLC > 65) {
      console.warn(
        `[GPS-Protection] Se detectó IP de red a ${distanceKmToLC.toFixed(0)}km (Morelia/CDMX). Manteniendo anclaje en Lázaro Cárdenas.`
      );
      setLocationNotice('Red de laptop detectada en Morelia. Se mantuvo tu ubicación en Lázaro Cárdenas.');
      setIsLocating(false);
      setIsGPSActive(false);
      return;
    }

    // Coordenadas locales genuinas dentro de Lázaro Cárdenas
    const address = await reverseGeocodeCoords(lat, lng);
    const newCoords: Coordinates = {
      lat,
      lng,
      address,
      referencePoint: `GPS en Vivo (±${accuracy}m)`,
      accuracyMeters: accuracy,
    };

    setCoords(newCoords);
    try {
      localStorage.setItem(STORAGE_COORDS_KEY, JSON.stringify(newCoords));
    } catch {
      // ignore
    }

    setIsGPSActive(true);
    setIsManualPin(false);
    setIsLocating(false);
    setGpsError(null);
    setLocationNotice(null);
  }, []);

  // Solicitar y activar GPS en tiempo real
  const requestRealGPS = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Navegador sin API de ubicación. Usando ubicación calibrada.');
      setIsLocating(false);
      return;
    }

    isCancelledRef.current = false;
    setIsLocating(true);
    setGpsError(null);
    setLocationNotice(null);
    stopWatchingGPS();

    // Iniciar escucha con watchPosition (excelente para teléfonos/móviles con chip satelital)
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          handlePositionSuccess(pos);
        },
        (err) => {
          if (err.code === 1) {
            setGpsError('Permiso de GPS bloqueado. Permítelo en el ícono de candado del navegador.');
            setIsLocating(false);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        }
      );
    } catch (e) {
      console.warn('Error al iniciar watchPosition:', e);
    }

    // Obtener primera posición inmediata
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePositionSuccess(pos);
      },
      (err) => {
        console.info('GPS de alta precisión no devolvió datos inmediatos (común en laptops), probando red...', err.message);
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            handlePositionSuccess(pos2);
          },
          () => {
            // En laptops sin chip GPS satelital esto es normal
            setIsLocating(false);
            // No congelamos la app en error rojo; garantizamos que el usuario esté en Lázaro Cárdenas
            setIsGPSActive(false);
          },
          {
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 60000,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 5000,
      }
    );
  }, [handlePositionSuccess, stopWatchingGPS]);

  // Calibración manual o arrastre en mapa
  const setLocationManually = useCallback(
    async (lat: number, lng: number, manualAddress?: string) => {
      isCancelledRef.current = true;
      stopWatchingGPS();
      setIsLocating(true);

      const fixedLat = Number(lat.toFixed(6));
      const fixedLng = Number(lng.toFixed(6));
      const address = manualAddress || (await reverseGeocodeCoords(fixedLat, fixedLng));

      const newCoords: Coordinates = {
        lat: fixedLat,
        lng: fixedLng,
        address,
        referencePoint: 'Posición calibrada',
        accuracyMeters: 5,
      };

      setCoords(newCoords);
      try {
        localStorage.setItem(STORAGE_COORDS_KEY, JSON.stringify(newCoords));
      } catch {
        // ignore
      }

      setIsGPSActive(false);
      setIsManualPin(true);
      setIsLocating(false);
      setGpsError(null);
      setLocationNotice(null);
    },
    [stopWatchingGPS]
  );

  // Reintento de GPS
  const retryGeolocation = useCallback(() => {
    requestRealGPS();
  }, [requestRealGPS]);

  useEffect(() => {
    // Solicitar GPS automáticamente al cargar
    requestRealGPS();

    return () => {
      isCancelledRef.current = true;
      stopWatchingGPS();
    };
  }, [requestRealGPS, stopWatchingGPS]);

  return {
    currentCoords: coords,
    isUsingRealGPS: isGPSActive,
    isManualPin,
    isLocating,
    gpsError,
    locationNotice,
    accuracyLevel: getAccuracyLevel(coords.accuracyMeters),
    requestRealGPS,
    retryGeolocation,
    setLocationManually,
    stopWatchingGPS,
  };
}

