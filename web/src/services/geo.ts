import { Coordinates, AlertUI } from '../types/alert';

/**
 * Radio terrestre medio en kilómetros (WGS84 aproximado)
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convierte grados sexagesimales a radianes
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcula la distancia ortodrómica en kilómetros entre dos coordenadas
 * utilizando la fórmula de Haversine.
 */
export function calculateDistanceKm(coord1: Coordinates, coord2: Coordinates): number {
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const lat1 = toRadians(coord1.lat);
  const lat2 = toRadians(coord2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Determina si el usuario se encuentra dentro del radio geográfico de cobertura
 */
export function isWithinRadius(
  userCoord: Coordinates,
  alertCoord: Coordinates,
  radiusKm: number
): boolean {
  const distance = calculateDistanceKm(userCoord, alertCoord);
  return distance <= radiusKm;
}

/**
 * Formatea una distancia en kilómetros a formato humano de alta legibilidad
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

// Estructura de cada anillo concéntrico de expansión adaptativa
export interface AdaptiveRing {
  stageNumber: number;
  minElapsed: number;
  radiusKm: number;
  radiusMeters: number;
  color: string;
  label: string;
  badge: string;
  desc: string;
}

// Protocolo Oficial de Expansión por Proximidad Adaptativa (Diagrama Oficial de Búsqueda de Personas)
export const ADAPTIVE_STAGES_PRIORITY: AdaptiveRing[] = [
  {
    stageNumber: 1,
    minElapsed: 0,
    radiusKm: 1,
    radiusMeters: 1000,
    color: '#dc2626', // Rojo
    label: 'min 0 → radio 1 km',
    badge: '1 km · Inmediato',
    desc: 'Notificación instantánea a personas en el perímetro inmediato (300 m)',
  },
  {
    stageNumber: 2,
    minElapsed: 15,
    radiusKm: 3,
    radiusMeters: 3000,
    color: '#ea580c', // Naranja
    label: 'min 15 → radio 3 km',
    badge: '3 km · Expansión 15m',
    desc: 'Expansión a colonias y cuadrantes aledaños (2.6 km)',
  },
  {
    stageNumber: 3,
    minElapsed: 60,
    radiusKm: 10,
    radiusMeters: 10000,
    color: '#eab308', // Amarillo / Ámbar
    label: 'min 60 → radio 10 km',
    badge: '10 km · Expansión 60m',
    desc: 'Expansión a tenencias y sectores de todo el municipio (6 km)',
  },
  {
    stageNumber: 4,
    minElapsed: 180,
    radiusKm: 25,
    radiusMeters: 25000,
    color: '#ca8a04', // Dorado / Cobertura Máxima
    label: 'min 180 → radio 25 km',
    badge: '25 km · Cobertura Máxima',
    desc: 'Cobertura máxima de la categoría (salidas carreteras y límites municipales)',
  },
];

export interface AdaptiveCoverageInfo {
  currentRadiusKm: number;
  currentRadiusMeters: number;
  activeStage: AdaptiveRing;
  allStages: AdaptiveRing[];
  elapsedMinutes: number;
  isAdaptive: boolean;
  isPriority: boolean;
  stageName: string;
  stageBadge: string;
  colorHex: string;
}

/**
 * Calcula la información completa de cobertura adaptativa por tiempo
 * aplicando máxima prioridad a menores desaparecidos, personas desaparecidas y vulnerables.
 */
export function getAdaptiveCoverageInfo(alert: AlertUI): AdaptiveCoverageInfo {
  // 1. Si el moderador forzó un radio manual, respetarlo
  if (alert.manualRadiusMeters) {
    const km = alert.manualRadiusMeters / 1000;
    const manualStage: AdaptiveRing = {
      stageNumber: 0,
      minElapsed: 0,
      radiusKm: km,
      radiusMeters: alert.manualRadiusMeters,
      color: alert.level === 4 ? '#dc2626' : alert.level === 3 ? '#ea580c' : '#2563eb',
      label: `Manual: ${km} km`,
      badge: `${km} km Fijo`,
      desc: 'Fijado manualmente por el Validador CCE',
    };
    return {
      currentRadiusKm: km,
      currentRadiusMeters: alert.manualRadiusMeters,
      activeStage: manualStage,
      allStages: [manualStage],
      elapsedMinutes: 0,
      isAdaptive: false,
      isPriority: alert.level >= 3,
      stageName: 'Radio Manual CCE',
      stageBadge: `${km} km`,
      colorHex: manualStage.color,
    };
  }

  // 2. Determinar si es categoría de máxima prioridad de búsqueda
  const isPrioritySearch =
    alert.category === 'menor_desaparecido' ||
    alert.category === 'persona_desaparecida' ||
    alert.category === 'persona_vulnerable' ||
    alert.level === 4;

  const createdTime = new Date(alert.createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdTime) / (1000 * 60)));

  // Alertas de Alta Prioridad / Menor Desaparecido / Persona Desaparecida
  if (isPrioritySearch) {
    let activeStage = ADAPTIVE_STAGES_PRIORITY[0];

    if (elapsedMinutes >= 180) {
      activeStage = ADAPTIVE_STAGES_PRIORITY[3]; // 25 km
    } else if (elapsedMinutes >= 60) {
      activeStage = ADAPTIVE_STAGES_PRIORITY[2]; // 10 km
    } else if (elapsedMinutes >= 15) {
      activeStage = ADAPTIVE_STAGES_PRIORITY[1]; // 3 km
    } else {
      activeStage = ADAPTIVE_STAGES_PRIORITY[0]; // 1 km
    }

    return {
      currentRadiusKm: activeStage.radiusKm,
      currentRadiusMeters: activeStage.radiusMeters,
      activeStage,
      allStages: ADAPTIVE_STAGES_PRIORITY,
      elapsedMinutes,
      isAdaptive: true,
      isPriority: true,
      stageName: activeStage.label,
      stageBadge: activeStage.badge,
      colorHex: activeStage.color,
    };
  }

  // Alertas de Nivel 3 generales (ej. robo de vehículo, asalto, incendio, inundación)
  if (alert.level === 3) {
    const generalStages: AdaptiveRing[] = [
      { stageNumber: 1, minElapsed: 0, radiusKm: 1, radiusMeters: 1000, color: '#ea580c', label: 'min 0 → 1 km', badge: '1 km · Inmediato', desc: 'Cuadrante inicial' },
      { stageNumber: 2, minElapsed: 15, radiusKm: 2.5, radiusMeters: 2500, color: '#ea580c', label: 'min 15 → 2.5 km', badge: '2.5 km · Expansión', desc: 'Perímetro barrial' },
      { stageNumber: 3, minElapsed: 60, radiusKm: 5, radiusMeters: 5000, color: '#ea580c', label: 'min 60 → 5 km', badge: '5 km · Cobertura Urbana', desc: 'Zona urbana' },
    ];

    let activeStage = generalStages[0];
    if (elapsedMinutes >= 60) {
      activeStage = generalStages[2];
    } else if (elapsedMinutes >= 15) {
      activeStage = generalStages[1];
    }

    return {
      currentRadiusKm: activeStage.radiusKm,
      currentRadiusMeters: activeStage.radiusMeters,
      activeStage,
      allStages: generalStages,
      elapsedMinutes,
      isAdaptive: true,
      isPriority: false,
      stageName: activeStage.label,
      stageBadge: activeStage.badge,
      colorHex: activeStage.color,
    };
  }

  // Alertas de Nivel 2 y 1 (Avisos locales y preventivos)
  const defaultKm = alert.currentRadiusKm || (alert.level === 2 ? 2 : 1);
  const defaultStage: AdaptiveRing = {
    stageNumber: 1,
    minElapsed: 0,
    radiusKm: defaultKm,
    radiusMeters: defaultKm * 1000,
    color: alert.level === 2 ? '#eab308' : '#059669',
    label: `Local: ${defaultKm} km`,
    badge: `${defaultKm} km Local`,
    desc: 'Cobertura focalizada puntual',
  };

  return {
    currentRadiusKm: defaultKm,
    currentRadiusMeters: defaultKm * 1000,
    activeStage: defaultStage,
    allStages: [defaultStage],
    elapsedMinutes,
    isAdaptive: false,
    isPriority: false,
    stageName: `${defaultKm} km Local`,
    stageBadge: `${defaultKm} km`,
    colorHex: defaultStage.color,
  };
}

/**
 * Obtiene el radio geográfico dinámico en kilómetros de una alerta
 */
export function getDynamicRadiusKm(alert: AlertUI): number {
  return getAdaptiveCoverageInfo(alert).currentRadiusKm;
}


