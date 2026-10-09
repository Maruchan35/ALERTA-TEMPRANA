import { useCallback, useEffect, useRef, useState } from 'react';
import { abierta, Emergencia, emergencyService } from '../services/emergencyService';
import { audioAlert } from '../services/audioAlert';

const TITULO = 'ALERTA CERCA';

/**
 * Emergencias SOS en vivo para el moderador, en CUALQUIER vista del portal: cuando alguien pide
 * ayuda suena la alarma crítica y el título de la pestaña dice "(N) SOS".
 */
export function useEmergencies(activo: boolean) {
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const conocidas = useRef<Set<string> | null>(null);
  const espera = useRef<number | undefined>(undefined);

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
      setError((e as Error).message);
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
    const periodico = window.setInterval(recargar, 15000);
    return () => {
      dejar();
      window.clearInterval(periodico);
      window.clearTimeout(espera.current);
      if (typeof document !== 'undefined') {
        document.title = TITULO;
      }
    };
  }, [activo, recargar]);

  return { emergencias, abiertas: emergencias.filter(abierta), error, recargar };
}
