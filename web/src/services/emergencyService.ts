import { supabase, ensureAuthSession } from './supabase';

export type EstadoEmergencia = 'activa' | 'en_seguimiento' | 'cerrada';
export type TipoEmergencia = 'sos' | 'asalto' | 'secuestro' | 'me_siguen' | 'otra';
export type OrigenEmergencia = 'boton' | 'movimiento' | 'atajo';
export type CierreEmergencia = 'a_salvo' | 'localizada' | 'falsa_alarma';
export type AccionEmergencia = 'tomar' | 'policia' | 'nota' | 'localizada' | 'falsa_alarma';

export interface Emergencia {
  id: string;
  usuario_id: string;
  estado: EstadoEmergencia;
  tipo: TipoEmergencia;
  origen: OrigenEmergencia;
  lat: number;
  lon: number;
  precision_m: number | null;
  velocidad_ms: number | null;
  bateria: number | null;
  ultima_senal_en: string;
  sin_senal_avisada_en: string | null;
  creada_en: string;
  atendida_en: string | null;
  policia_avisada_en: string | null;
  folio_911: string | null;
  nota: string | null;
  cerrada_en: string | null;
  cierre: CierreEmergencia | null;
  cerrada_por_la_persona: boolean;
  /** Teléfono verificado de la persona (null si pidió ayuda sin verificar su número). */
  telefono: string | null;
  atendida_por_nombre: string | null;
  atendida_por_institucion: string | null;
  n_puntos: number;
  n_evidencias: number;
}

export interface PuntoEmergencia {
  id: number;
  lat: number;
  lon: number;
  precision_m: number | null;
  velocidad_ms: number | null;
  registrada_en: string;
}

export interface EvidenciaEmergencia {
  tipo: 'video' | 'audio' | 'foto';
  ruta: string;
  duracion_s: number | null;
  creada_en: string;
}

export const TIPO_LEGIBLE: Record<TipoEmergencia, string> = {
  sos: 'Emergencia SOS',
  asalto: 'Asalto en curso',
  secuestro: 'Posible secuestro',
  me_siguen: 'La están siguiendo',
  otra: 'Otra emergencia',
};

export const LO_QUE_INDICO: Record<TipoEmergencia, string> = {
  sos: 'Pidió ayuda',
  asalto: '«Me están asaltando»',
  secuestro: '«Me llevan»',
  me_siguen: '«Me están siguiendo»',
  otra: 'Otra emergencia',
};

export const ORIGEN_LEGIBLE: Record<OrigenEmergencia, string> = {
  boton: 'botón SOS',
  movimiento: 'sacudida fuerte del teléfono',
  atajo: 'atajo del teléfono',
};

export const CIERRE_LEGIBLE: Record<CierreEmergencia, string> = {
  a_salvo: 'La persona indicó que está a salvo',
  localizada: 'Localizada',
  falsa_alarma: 'Falsa alarma',
};

/** Sin señal desde hace 2 min o más (lo apagaron, sin batería o sin datos). */
export const MINUTOS_SIN_SENAL = 2;

export const abierta = (e: Emergencia) => e.estado !== 'cerrada';
export const velocidadKmh = (e: { velocidad_ms: number | null }) =>
  e.velocidad_ms == null ? null : Math.round(e.velocidad_ms * 3.6);
export const enVehiculo = (e: Emergencia) => (velocidadKmh(e) ?? 0) > 20;
export const segundosSinSenal = (e: Emergencia, ahora = Date.now()) =>
  Math.max(0, Math.round((ahora - Date.parse(e.ultima_senal_en)) / 1000));
export const sinSenal = (e: Emergencia, ahora = Date.now()) =>
  abierta(e) && segundosSinSenal(e, ahora) >= MINUTOS_SIN_SENAL * 60;
export const enlaceMapa = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;

/** "+52..." para marcar desde México. */
export function telefonoParaLlamar(e: Emergencia): string | null {
  const t = (e.telefono ?? '').replace(/\D/g, '');
  if (!t) return null;
  return t.startsWith('52') && t.length === 12 ? `+${t}` : t;
}

/** "12 s", "4 min", "1 h 05 min". */
export function tiempoCorto(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Abiertas primero (las que nadie ha tomado, arriba); luego las más nuevas. */
export function ordenarEmergencias(a: Emergencia, b: Emergencia): number {
  if (abierta(a) !== abierta(b)) return abierta(a) ? -1 : 1;
  const sinTomarA = a.estado === 'activa';
  const sinTomarB = b.estado === 'activa';
  if (sinTomarA !== sinTomarB) return sinTomarA ? -1 : 1;
  return Date.parse(b.creada_en) - Date.parse(a.creada_en);
}

function mensajeServidor(mensaje: string): string {
  if (/Solo validadores|row-level security|permission denied/i.test(mensaje)) {
    return 'Tu sesión no tiene permisos de validador. Vuelve a entrar con una cuenta de validador, institución o administrador.';
  }
  if (/JWT expired|invalid JWT/i.test(mensaje)) return 'Tu sesión venció: vuelve a entrar.';
  return mensaje;
}

export const emergencyService = {
  async listar(): Promise<Emergencia[]> {
    if (!supabase) return [];
    try {
      await ensureAuthSession();
      const { data, error } = await supabase
        .from('emergencias_panel')
        .select('*')
        .order('creada_en', { ascending: false })
        .limit(100);
      if (error) {
        console.warn('Error listando emergencias en Supabase:', error.message);
        return [];
      }
      return ((data ?? []) as Emergencia[]).sort(ordenarEmergencias);
    } catch (e) {
      console.warn('Excepción listando emergencias:', e);
      return [];
    }
  },

  /** Recorrido (los 5,000 puntos más recientes, en orden). */
  async recorrido(emergenciaId: string): Promise<PuntoEmergencia[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('emergencia_puntos')
        .select('id, lat, lon, precision_m, velocidad_ms, registrada_en')
        .eq('emergencia_id', emergenciaId)
        .order('registrada_en', { ascending: false })
        .limit(5000);
      if (error) throw new Error(mensajeServidor(error.message));
      return ((data ?? []) as PuntoEmergencia[]).reverse();
    } catch {
      return [];
    }
  },

  async evidencias(emergenciaId: string): Promise<EvidenciaEmergencia[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('emergencia_evidencias')
        .select('tipo, ruta, duracion_s, creada_en')
        .eq('emergencia_id', emergenciaId)
        .order('creada_en');
      if (error) throw new Error(mensajeServidor(error.message));
      return (data ?? []) as EvidenciaEmergencia[];
    } catch {
      return [];
    }
  },

  /** Enlace temporal (10 min) para ver o descargar una evidencia. */
  async urlEvidencia(ruta: string): Promise<string | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(ruta, 600);
      if (error) console.warn('Evidencia', ruta, error.message);
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  },

  /** tomar | policia (folio opcional) | nota | localizada | falsa_alarma. */
  async atender(id: string, accion: AccionEmergencia, opciones: { nota?: string; folio?: string } = {}) {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { error } = await supabase.rpc('atender_emergencia', {
      p_emergencia: id,
      p_accion: accion,
      p_nota: opciones.nota ?? null,
      p_folio: opciones.folio ?? null,
    });
    if (error) throw new Error(mensajeServidor(error.message));
  },

  /**
   * Tiempo real: cambios de emergencias, puntos nuevos del recorrido y evidencia.
   */
  suscribir(alCambiar: () => void): () => void {
    if (!supabase) return () => {};
    const cliente = supabase;
    try {
      const canal = cliente
        .channel('portal-emergencias-sos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'emergencias' }, () => alCambiar())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergencia_evidencias' }, () => alCambiar())
        .subscribe();
      return () => {
        cliente.removeChannel(canal);
      };
    } catch {
      return () => {};
    }
  },

  /** Cada punto nuevo del recorrido de UNA emergencia */
  suscribirRecorrido(emergenciaId: string, alNuevoPunto: (p: PuntoEmergencia) => void): () => void {
    if (!supabase) return () => {};
    const cliente = supabase;
    try {
      const canal = cliente
        .channel(`recorrido-${emergenciaId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'emergencia_puntos', filter: `emergencia_id=eq.${emergenciaId}` },
          (cambio) => alNuevoPunto(cambio.new as PuntoEmergencia),
        )
        .subscribe();
      return () => {
        cliente.removeChannel(canal);
      };
    } catch {
      return () => {};
    }
  },
};
