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

/**
 * Obtiene el radio geográfico de una alerta.
 * Si la alerta tiene un radio manual fijado por el moderador, lo utiliza.
 * Si no, usa el currentRadiusKm que puede venir del backend.
 */
export function getDynamicRadiusKm(alert: AlertUI): number {
  if (alert.manualRadiusMeters) {
    return alert.manualRadiusMeters / 1000;
  }

  const createdTime = new Date(alert.createdAt).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(0, (now - createdTime) / (1000 * 60));

  let computedRadius = alert.currentRadiusKm;

  if (elapsedMinutes >= 360) {
    computedRadius = Math.max(computedRadius, 10);
  } else if (elapsedMinutes >= 120) {
    computedRadius = Math.max(computedRadius, 5);
  } else if (elapsedMinutes >= 30) {
    computedRadius = Math.max(computedRadius, 3);
  }

  return Math.max(alert.currentRadiusKm, computedRadius);
}

