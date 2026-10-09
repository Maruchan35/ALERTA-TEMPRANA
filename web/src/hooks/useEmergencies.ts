import { useCallback, useEffect, useRef, useState } from 'react';
import { abierta, Emergencia, emergencyService } from '../services/emergencyService';
import { audioAlert } from '../services/audioAlert';

const TITULO = document.title;

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
      // Al entrar suenan las que nadie ha tomado; después, cada una que llegue
      const nuevas = conocidas.current === null
        ? abiertas.filter((e) => e.estado === 'activa')
        : abiertas.filter((e) => !conocidas.current!.has(e.id));
      if (nuevas.length > 0) audioAlert.playCriticalAlert();
      conocidas.current = new Set(lista.map((e) => e.id));
      document.title = abiertas.length > 0 ? `(${abiertas.length}) SOS · ${TITULO}` : TITULO;
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
      document.title = TITULO;
      return;
    }
    recargar();
    const programar = () => {
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(recargar, 400);
    };
    const dejar = emergencyService.suscribir(programar);
    // "Sin señal desde hace X" y los conteos cambian aunque nadie toque la fila
    const periodico = window.setInterval(recargar, 15000);
    return () => {
      dejar();
      window.clearInterval(periodico);
      window.clearTimeout(espera.current);
      document.title = TITULO;
    };
  }, [activo, recargar]);

  return { emergencias, abiertas: emergencias.filter(abierta), error, recargar };
}
