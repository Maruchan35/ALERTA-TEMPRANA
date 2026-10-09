import { useCallback, useEffect, useRef, useState } from 'react';
import { abierta, Emergencia, emergencyService, SesionPerdidaError } from '../services/emergencyService';
import { audioAlert } from '../services/audioAlert';

const TITULO = 'ALERTA CERCA';

/**
 * Emergencias SOS en vivo para el moderador, en CUALQUIER vista del portal: cuando alguien pide
 * ayuda suena la alarma crítica y el título de la pestaña dice "(N) SOS".
 *
 * Tres vías para que ningún SOS se pierda: tiempo real (que se reabre solo si se cae), consulta
 * periódica cada 6 s y consulta inmediata al volver a la pestaña o recuperar internet. Si la
 * sesión de moderador se perdió se llama a `alPerderSesion` (y no se muestra una lista vacía).
 */
export function useEmergencies(activo: boolean, alPerderSesion?: (aviso: string) => void) {
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const conocidas = useRef<Set<string> | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const perdioSesion = useRef(alPerderSesion);
  perdioSesion.current = alPerderSesion;

  const recargar = useCallback(async () => {
    try {
      const lista = await emergencyService.listar();
      const abiertas = lista.filter(abierta);
      
      // Al recibir alertas SOS nuevas que nadie ha tomado, sonar alarma crítica
      const nuevas = conocidas.current === null
        ? abiertas.filter((e) => e.estado === 'activa')
        : abiertas.filter((e) => !conocidas.current!.has(e.id));
        
      if (nuevas.length > 0) {
        audioAlert.playCriticalAlert();
      }
      
      conocidas.current = new Set(lista.map((e) => e.id));
      if (typeof document !== 'undefined') {
        document.title = abiertas.length > 0 ? `(${abiertas.length}) 🚨 SOS · ${TITULO}` : TITULO;
      }
      setEmergencias(lista);
      setError(null);
    } catch (e) {
      if (e instanceof SesionPerdidaError) perdioSesion.current?.(e.message);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!activo) {
      setEmergencias([]);
      conocidas.current = null;
      if (typeof document !== 'undefined') {
        document.title = TITULO;
      }
      return;
    }
    recargar();
    const programar = () => {
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(recargar, 400);
    };
    const dejar = emergencyService.suscribir(programar);
    const periodico = window.setInterval(recargar, 6000);
    // Al volver a la pestaña o a internet no se espera al siguiente ciclo (los navegadores
    // frenan los temporizadores de las pestañas ocultas)
    const alVolver = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', recargar);
    window.addEventListener('focus', recargar);
    return () => {
      dejar();
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', recargar);
      window.removeEventListener('focus', recargar);
      window.clearInterval(periodico);
      window.clearTimeout(espera.current);
      if (typeof document !== 'undefined') {
        document.title = TITULO;
      }
    };
  }, [activo, recargar]);

  return { emergencias, abiertas: emergencias.filter(abierta), error, recargar };
}
