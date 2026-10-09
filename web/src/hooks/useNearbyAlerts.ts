import { useState, useEffect, useMemo, useRef } from 'react';
import { AlertUI, Coordinates } from '../types/alert';
import { alertService } from '../services/alertService';
import { calculateDistanceKm, getAdaptiveCoverageInfo, AdaptiveCoverageInfo } from '../services/geo';
import { audioAlert } from '../services/audioAlert';

export interface AlertWithDistance extends AlertUI {
  distanceKm: number;
  effectiveRadiusKm: number;
  effectiveRadiusMeters: number;
  isWithinCoverage: boolean;
  adaptiveInfo: AdaptiveCoverageInfo;
}

export function useNearbyAlerts(userCoords: Coordinates) {
  const [alerts, setAlerts] = useState<AlertUI[]>([]);
  const [ticker, setTicker] = useState<number>(0);
  const previousNearbyIdsRef = useRef<Set<string>>(new Set());
  const isFirstMountRef = useRef(true);

  // Recalcular periodicamente cada 30 segundos para actualización de etapas adaptativas
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Cargar alertas iniciales desde Supabase
    alertService.fetchAll();

    // 2. Suscribirse a cambios en vivo (Supabase Realtime + caché local)
    const unsubscribe = alertService.subscribe((updated) => {
      setAlerts([...updated]);
    });

    return unsubscribe;
  }, []);

  // Procesar distancia física y cobertura adaptativa para cada alerta
  const processedAlerts = useMemo<AlertWithDistance[]>(() => {
    return alerts.map((alert) => {
      const distanceKm = calculateDistanceKm(userCoords, alert.coordinates);
      const adaptiveInfo = getAdaptiveCoverageInfo(alert);
      const effectiveRadiusKm = adaptiveInfo.currentRadiusKm;
      const effectiveRadiusMeters = adaptiveInfo.currentRadiusMeters;
      const isWithinCoverage = distanceKm <= effectiveRadiusKm;

      return {
        ...alert,
        currentRadiusKm: effectiveRadiusKm,
        currentRadiusMeters: effectiveRadiusMeters,
        distanceKm,
        effectiveRadiusKm,
        effectiveRadiusMeters,
        isWithinCoverage,
        adaptiveInfo,
      };
    });
  }, [alerts, userCoords, ticker]);

  // Alertas activas que cubren al ciudadano (Ordenadas por NIVEL DE IMPORTANCIA primero)
  const nearbyActiveAlerts = useMemo(() => {
    return processedAlerts
      .filter((a) => a.isWithinCoverage && a.status !== 'resuelta' && a.status !== 'descartada' && a.status !== 'expirada')
      .sort((a, b) => {
        // 1. Mayor grado de importancia primero (4 > 3 > 2 > 1)
        if (b.level !== a.level) {
          return b.level - a.level;
        }
        // 2. Si tienen el mismo nivel, la más cercana a tu ubicación
        return a.distanceKm - b.distanceKm;
      });
  }, [processedAlerts]);

  // Alertas activas en otros puntos del municipio (Ordenadas por NIVEL DE IMPORTANCIA primero)
  const outOfRangeAlerts = useMemo(() => {
    return processedAlerts
      .filter((a) => !a.isWithinCoverage && a.status !== 'resuelta' && a.status !== 'descartada' && a.status !== 'expirada')
      .sort((a, b) => {
        if (b.level !== a.level) {
          return b.level - a.level;
        }
        return a.distanceKm - b.distanceKm;
      });
  }, [processedAlerts]);

  // Alertas pendientes que esperan validación del CCE
  const pendingValidationAlerts = useMemo(() => {
    return processedAlerts.filter((a) => a.status === 'pendiente');
  }, [processedAlerts]);

  // Alertas resueltas
  const nearbyResolvedAlerts = useMemo(() => {
    return processedAlerts
      .filter((a) => a.status === 'resuelta')
      .sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  }, [processedAlerts]);

  // Sonido de alerta automática si una alerta crítica entra al perímetro
  useEffect(() => {
    const currentNearbyIds = new Set(nearbyActiveAlerts.map((a) => a.id));

    if (isFirstMountRef.current) {
      previousNearbyIdsRef.current = currentNearbyIds;
      isFirstMountRef.current = false;
      return;
    }

    const newlyEnteredAlerts = nearbyActiveAlerts.filter(
      (a) => !previousNearbyIdsRef.current.has(a.id)
    );

    if (newlyEnteredAlerts.length > 0) {
      const hasCritical = newlyEnteredAlerts.some((a) => a.level === 4);
      const hasHigh = newlyEnteredAlerts.some((a) => a.level === 3);

      if (hasCritical) {
        audioAlert.playCriticalAlert();
      } else if (hasHigh) {
        audioAlert.playHighAlert();
      } else {
        audioAlert.playInfoAlert();
      }
    }

    previousNearbyIdsRef.current = currentNearbyIds;
  }, [nearbyActiveAlerts]);

  return {
    allAlerts: processedAlerts,
    nearbyActiveAlerts,
    outOfRangeAlerts,
    pendingValidationAlerts,
    nearbyResolvedAlerts,
    totalActiveCount: processedAlerts.filter((a) => a.status !== 'resuelta' && a.status !== 'descartada' && a.status !== 'expirada').length,
    inProximityCount: nearbyActiveAlerts.length,
    refresh: () => alertService.fetchAll(),
  };
}
