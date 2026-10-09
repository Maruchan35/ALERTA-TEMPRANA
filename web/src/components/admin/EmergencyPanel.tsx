import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  BatteryLow,
  Car,
  CheckCircle,
  Clock,
  Copy,
  Crosshair,
  ExternalLink,
  Footprints,
  Gauge,
  Hand,
  Mic,
  PhoneCall,
  Play,
  ShieldCheck,
  SignalZero,
  Siren,
  StickyNote,
  Video,
  XCircle,
  MessageCircle,
  FlaskConical,
  Send,
  Radio,
} from 'lucide-react';
import {
  abierta,
  CIERRE_LEGIBLE,
  Emergencia,
  emergencyService,
  enlaceMapa,
  enVehiculo,
  EvidenciaEmergencia,
  LO_QUE_INDICO,
  ORIGEN_LEGIBLE,
  PuntoEmergencia,
  segundosSinSenal,
  sinSenal,
  telefonoParaLlamar,
  tiempoCorto,
  TIPO_LEGIBLE,
  velocidadKmh,
} from '../../services/emergencyService';

interface EmergencyPanelProps {
  emergencias: Emergencia[];
  error: string | null;
  onRecargar: () => void;
}

/** Rojo: nadie la ha tomado. Ámbar: en seguimiento. Morado: el teléfono no responde. Gris: cerrada. */
function colorDe(e: Emergencia, ahora: number) {
  if (!abierta(e)) return { borde: 'border-slate-300', texto: 'text-slate-500', fondo: 'bg-slate-400', hex: '#64748B' };
  if (sinSenal(e, ahora)) return { borde: 'border-purple-400', texto: 'text-purple-800', fondo: 'bg-purple-600', hex: '#7B2CBF' };
  if (e.estado === 'activa') return { borde: 'border-red-500', texto: 'text-red-700', fondo: 'bg-red-600', hex: '#D62828' };
  return { borde: 'border-amber-400', texto: 'text-amber-800', fondo: 'bg-amber-600', hex: '#F77F00' };
}

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/** Reloj de 1 s para "última señal hace 12 s". */
function useAhora() {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return ahora;
}

const SIMULACRO_DEMO: Emergencia = {
  id: 'simulacro-capacitacion-cce',
  usuario_id: 'usr-sim-001',
  tipo: 'sos',
  estado: 'activa',
  origen: 'boton',
  lat: 17.9624,
  lon: -102.2038,
  velocidad_ms: 3.8,
  precision_m: 6,
  bateria: 79,
  ultima_senal_en: new Date().toISOString(),
  sin_senal_avisada_en: null,
  creada_en: new Date().toISOString(),
  atendida_en: null,
  atendida_por_nombre: null,
  atendida_por_institucion: null,
  policia_avisada_en: null,
  folio_911: '911-SIM-2026',
  cerrada_en: null,
  cierre: null,
  cerrada_por_la_persona: false,
  nota: 'SIMULACRO OPERATIVO CCE: Práctica de intercepción y despacho táctico',
  telefono: '7531234567',
  n_puntos: 12,
  n_evidencias: 1,
};

/**
 * Centro de emergencias SOS del moderador: lista en vivo, recorrido en el mapa, datos de la señal,
 * evidencia y seguimiento (tomar el caso, aviso al 911, cerrar). Todo con rpc('atender_emergencia').
 */
export const EmergencyPanel: React.FC<EmergencyPanelProps> = ({ emergencias, error, onRecargar }) => {
  const [simulacroActivo, setSimulacroActivo] = useState(false);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const ahora = useAhora();

  const listaEmergencias = simulacroActivo ? [SIMULACRO_DEMO, ...emergencias] : emergencias;
  const seleccionada =
    listaEmergencias.find((e) => e.id === seleccionadaId) ?? listaEmergencias.find(abierta) ?? listaEmergencias[0] ?? null;

  return (
    <div className="w-full space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-600 animate-pulse" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">Emergencias SOS · en vivo</h2>
            {simulacroActivo && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider animate-pulse">
                Modo Simulacro Activo
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Personas que pidieron auxilio desde la red (asalto, secuestro, persecución). Ubicación exacta, ruta en vivo y video con custodia digital.
          </p>
          {error && <p className="mt-2 text-xs text-red-600 font-semibold">{error}</p>}
        </div>

        <button
          type="button"
          onClick={() => {
            setSimulacroActivo(!simulacroActivo);
            if (!simulacroActivo) setSeleccionadaId(SIMULACRO_DEMO.id);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs ${
            simulacroActivo
              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
          <span>{simulacroActivo ? 'Finalizar Simulacro' : '🧪 Iniciar Simulacro de Capacitación'}</span>
        </button>
      </div>

      {listaEmergencias.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500 shadow-sm">
          Nadie ha pedido ayuda. Cuando alguien active el SOS sonará una alarma y aparecerá aquí con su ubicación en vivo.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="space-y-2">
            {listaEmergencias.map((e) => {
              const c = colorDe(e, ahora);
              const kmh = velocidadKmh(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSeleccionadaId(e.id)}
                  className={`w-full text-left p-3 rounded-xl bg-white border-2 transition shadow-2xs cursor-pointer ${
                    seleccionada?.id === e.id ? c.borde + ' shadow-sm' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-black uppercase ${c.texto}`}>{TIPO_LEGIBLE[e.tipo]}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${c.fondo}`}>
                      {!abierta(e)
                        ? 'CERRADA'
                        : sinSenal(e, ahora)
                        ? `SIN SEÑAL · ${tiempoCorto(segundosSinSenal(e, ahora))}`
                        : e.estado === 'activa'
                        ? 'SIN TOMAR'
                        : 'EN SEGUIMIENTO'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Hace {tiempoCorto(Math.round((ahora - Date.parse(e.creada_en)) / 1000))} · {ORIGEN_LEGIBLE[e.origen]}
                    {abierta(e) && kmh != null && kmh > 3 ? ` · ${kmh} km/h` : ''}
                    {e.bateria != null ? ` · batería ${e.bateria} %` : ''}
                  </p>
                  {e.atendida_por_institucion || e.atendida_por_nombre ? (
                    <p className="text-xs text-slate-700 font-semibold mt-0.5">
                      Lo sigue: {e.atendida_por_institucion ?? e.atendida_por_nombre}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
          {seleccionada && (
            <DetalleEmergencia key={seleccionada.id} emergencia={seleccionada} ahora={ahora} onRecargar={onRecargar} />
          )}
        </div>
      )}
    </div>
  );
};

const DetalleEmergencia: React.FC<{ emergencia: Emergencia; ahora: number; onRecargar: () => void }> = ({
  emergencia: e,
  ahora,
  onRecargar,
}) => {
  const [puntos, setPuntos] = useState<PuntoEmergencia[]>([]);
  const [evidencias, setEvidencias] = useState<EvidenciaEmergencia[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const c = colorDe(e, ahora);
  const kmh = velocidadKmh(e);
  const tel = telefonoParaLlamar(e);

  // Recorrido: carga inicial + cada punto nuevo en vivo
  useEffect(() => {
    let vivo = true;
    emergencyService.recorrido(e.id).then((p) => vivo && setPuntos(p)).catch(() => {});
    const dejar = emergencyService.suscribirRecorrido(e.id, (p) =>
      setPuntos((antes) => (antes.some((x) => x.id === p.id) ? antes : [...antes, p])),
    );
    return () => {
      vivo = false;
      dejar();
    };
  }, [e.id]);

  useEffect(() => {
    emergencyService.evidencias(e.id).then(setEvidencias).catch(() => {});
  }, [e.id, e.n_evidencias]);

  // Bitácora Táctica de Despacho sincronizada en Supabase con los demás validadores
  const [nuevaNota, setNuevaNota] = useState('');
  const [isSavingNota, setIsSavingNota] = useState(false);

  // Parsea las notas del servidor para que todos los validadores vean las mismas anotaciones
  const bitacoraNotas = React.useMemo(() => {
    const lista: Array<{ id: string; hora: string; texto: string; sincronizada: boolean }> = [];
    if (e.nota && e.nota.trim()) {
      const rawLineas = e.nota.split('\n').filter(Boolean);
      rawLineas.forEach((linea, index) => {
        const match = linea.match(/^\[(.*?)\]\s*(.*)$/);
        if (match) {
          lista.push({
            id: `srv-${e.id}-${index}`,
            hora: match[1],
            texto: match[2],
            sincronizada: true,
          });
        } else {
          lista.push({
            id: `srv-${e.id}-${index}`,
            hora: 'Despacho',
            texto: linea,
            sincronizada: true,
          });
        }
      });
    }
    return lista;
  }, [e.id, e.nota]);

  const agregarNotaBitacora = async (texto: string) => {
    if (!texto.trim() || isSavingNota) return;
    setIsSavingNota(true);
    const horaActual = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const nuevaEntrada = `[${horaActual}] ${texto.trim()}`;
    const notasPrevias = (e.nota || '').trim();
    const textoCombinado = notasPrevias ? `${notasPrevias}\n${nuevaEntrada}` : nuevaEntrada;
    // Respetar restricción de longitud de PostgreSQL (char_length(nota) <= 500)
    const notaFinal = textoCombinado.length > 490 ? textoCombinado.slice(-490) : textoCombinado;

    try {
      if (e.id !== SIMULACRO_DEMO.id) {
        // Enviar a Supabase para que todos los operadores reciban la actualización
        await emergencyService.atender(e.id, 'nota', { nota: notaFinal });
        onRecargar();
      } else {
        e.nota = notaFinal;
      }
      setNuevaNota('');
    } catch (err: any) {
      console.warn('Error al persistir nota en Supabase:', err);
    } finally {
      setIsSavingNota(false);
    }
  };

  const atender = async (accion: Parameters<typeof emergencyService.atender>[1], opciones?: { nota?: string; folio?: string }) => {
    setOcupado(true);
    try {
      await emergencyService.atender(e.id, accion, opciones);
      onRecargar();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const copiarUbicacion = async () => {
    const texto =
      `Emergencia SOS (ALERTA CERCA): ${TIPO_LEGIBLE[e.tipo]}. Última ubicación ${e.lat.toFixed(6)}, ${e.lon.toFixed(6)}` +
      ` (±${Math.round(e.precision_m ?? 0)} m) ${enlaceMapa(e.lat, e.lon)}`;
    try {
      await navigator.clipboard.writeText(texto);
      window.alert('Ubicación copiada: pégala o díctala al 911.');
    } catch {
      window.prompt('Copia la ubicación:', texto);
    }
  };

  const verEvidencia = async (v: EvidenciaEmergencia) => {
    const url = await emergencyService.urlEvidencia(v.ruta);
    if (url) window.open(url, '_blank', 'noopener');
    else window.alert('No se pudo abrir la evidencia. Revisa la conexión.');
  };

  const boton = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-2xs';

  return (
    <div className={`rounded-2xl bg-white border-2 ${c.borde} text-slate-900 shadow-sm overflow-hidden`}>
      <div className="p-4 flex items-center gap-3 bg-slate-50/80 border-b border-slate-200">
        <span className={`w-10 h-10 rounded-full ${c.fondo} flex items-center justify-center shadow-xs`}>
          <Siren className="w-5 h-5 text-white" />
        </span>
        <div>
          <h3 className={`text-lg font-black uppercase ${c.texto}`}>{TIPO_LEGIBLE[e.tipo]}</h3>
          <p className="text-xs text-slate-500">
            {abierta(e) ? (e.estado === 'activa' ? 'ACTIVA · nadie la ha tomado' : 'EN SEGUIMIENTO') : 'CERRADA'} · pidió ayuda{' '}
            {hora(e.creada_en)} ({ORIGEN_LEGIBLE[e.origen]})
          </p>
        </div>
      </div>

      <MapaRecorrido emergencia={e} puntos={puntos} color={c.hex} />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Dato
            icono={sinSenal(e, ahora) ? <SignalZero className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            titulo={sinSenal(e, ahora) ? 'SIN SEÑAL' : 'Última señal'}
            valor={`hace ${tiempoCorto(segundosSinSenal(e, ahora))}`}
            alerta={sinSenal(e, ahora)}
          />
          <Dato
            icono={enVehiculo(e) ? <Car className="w-4 h-4" /> : <Footprints className="w-4 h-4" />}
            titulo="Velocidad"
            valor={kmh == null ? 'sin dato' : enVehiculo(e) ? `${kmh} km/h · en vehículo` : `${kmh} km/h`}
            alerta={enVehiculo(e) && abierta(e)}
          />
          <Dato
            icono={<BatteryLow className="w-4 h-4" />}
            titulo="Batería"
            valor={e.bateria == null ? 'sin dato' : `${e.bateria} %`}
            alerta={(e.bateria ?? 100) <= 15}
          />
          <Dato
            icono={<Gauge className="w-4 h-4" />}
            titulo="Precisión"
            valor={e.precision_m == null ? 'sin dato' : `± ${Math.round(e.precision_m)} m · ${e.n_puntos} puntos`}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
          <button type="button" onClick={copiarUbicacion} className={`${boton} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200`}>
            <Copy className="w-3.5 h-3.5" /> Copiar ubicación para el 911
          </button>
          <a href={enlaceMapa(e.lat, e.lon)} target="_blank" rel="noopener noreferrer" className={`${boton} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200`}>
            <ExternalLink className="w-3.5 h-3.5" /> Abrir en mapas
          </a>
          {tel ? (
            <>
              <a href={`tel:${tel}`} className={`${boton} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200`}>
                <PhoneCall className="w-3.5 h-3.5 text-blue-600" /> Llamar ({tel})
              </a>
              <a
                href={`https://wa.me/52${tel.replace(/\D/g, '')}?text=${encodeURIComponent(
                  'Alerta Oficial CCE Lázaro Cárdenas: Hemos recibido tu activación de auxilio SOS. Tu ubicación en tiempo real está siendo canalizada a corporaciones de seguridad. ¿Te encuentras a salvo?'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${boton} bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Directo
              </a>
            </>
          ) : (
            <span className={`${boton} bg-slate-50 text-slate-400 border border-slate-200`}>Pidió ayuda sin número verificado</span>
          )}
        </div>

        {abierta(e) && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
            {e.estado === 'activa' && (
              <button type="button" disabled={ocupado} onClick={() => atender('tomar')} className={`${boton} bg-red-600 hover:bg-red-700 text-white font-bold`}>
                <Hand className="w-3.5 h-3.5" /> Tomar el caso
              </button>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const folio = window.prompt('Aviso al 911 · folio (opcional). La persona verá "La policía ya fue avisada".', e.folio_911 ?? '');
                if (folio !== null) atender('policia', { folio });
              }}
              className={`${boton} bg-blue-600 hover:bg-blue-700 text-white font-bold`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {e.policia_avisada_en ? 'Folio del 911' : 'Avisé al 911'}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const nota = window.prompt('Nota del seguimiento (p. ej. "Patrulla 12 en camino por Av. Lázaro Cárdenas"):');
                if (nota?.trim()) atender('nota', { nota });
              }}
              className={`${boton} bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200`}
            >
              <StickyNote className="w-3.5 h-3.5" /> Nota
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const nota = window.prompt('¿La localizaron? Qué pasó (opcional):');
                if (nota !== null) atender('localizada', { nota });
              }}
              className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white font-bold`}
            >
              <CheckCircle className="w-3.5 h-3.5" /> Localizada / a salvo
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const nota = window.prompt('Ciérrala como falsa alarma solo si confirmaste que la persona está bien. ¿Cómo lo confirmaste?');
                if (nota?.trim()) atender('falsa_alarma', { nota });
              }}
              className={`${boton} bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200`}
            >
              <XCircle className="w-3.5 h-3.5" /> Falsa alarma
            </button>
          </div>
        )}

        {/* Bitácora de Despacho Táctico CCE */}
        <div className="pt-3 border-t border-slate-200 text-xs space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <p className="font-bold text-slate-800 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-red-600 animate-pulse" />
              <span>Bitácora de Despacho Táctico y Comunicaciones en Vivo</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                🌐 Sincronizado en Servidor
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{bitacoraNotas.length} registros</span>
            </div>
          </div>

          {/* Presets Rápidos de Despacho */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              '🚓 Patrulla 104 enviada a sector',
              '🚑 Ambulancia Cruz Roja en ruta',
              '📞 Contacto con familiar registrado',
              '🌐 Retransmitido a C5i',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => agregarNotaBitacora(preset)}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold border border-slate-200 cursor-pointer"
              >
                + {preset}
              </button>
            ))}
          </div>

          {/* Formulario para Nota Manual */}
          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              placeholder="Escribe actualización de cabina (ej. 'Contacto visual por cámara 4')..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (nuevaNota.trim()) agregarNotaBitacora(nuevaNota.trim());
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (nuevaNota.trim()) agregarNotaBitacora(nuevaNota.trim());
              }}
              className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Anotar</span>
            </button>
          </div>

          {/* Lista de Entradas de Bitácora */}
          <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
            {bitacoraNotas.length === 0 ? (
              <p className="text-slate-400 text-[11px] italic">Sin notas de despacho registradas aún.</p>
            ) : (
              bitacoraNotas.map((n) => (
                <div key={n.id} className="p-1.5 rounded bg-slate-50 border border-slate-100 flex items-start gap-2 text-[11px]">
                  <span className="font-mono text-slate-400 font-bold shrink-0">{n.hora}</span>
                  <span className="text-slate-700 flex-1">{n.texto}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
          <p className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">Línea de tiempo</p>
          <p><span className="text-slate-400">{hora(e.creada_en)}</span> Pidió ayuda · {ORIGEN_LEGIBLE[e.origen]}</p>
          {e.tipo !== 'sos' && <p>Indicó: {LO_QUE_INDICO[e.tipo]}</p>}
          {e.atendida_en && (
            <p><span className="text-slate-400">{hora(e.atendida_en)}</span> Tomada por {e.atendida_por_institucion ?? e.atendida_por_nombre ?? 'un validador'}</p>
          )}
          {e.policia_avisada_en && (
            <p><span className="text-slate-400">{hora(e.policia_avisada_en)}</span> Aviso al 911{e.folio_911 ? ` · folio ${e.folio_911}` : ''}</p>
          )}
          {e.nota && <p>Nota: {e.nota}</p>}
          {e.cerrada_en && (
            <p>
              <span className="text-slate-400">{hora(e.cerrada_en)}</span> Cerrada · {e.cierre ? CIERRE_LEGIBLE[e.cierre] : ''}
              {e.cerrada_por_la_persona ? ' (la cerró la persona)' : ''}
            </p>
          )}
        </div>

        <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
          <p className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">Evidencia ({e.n_evidencias})</p>
          {evidencias.length === 0 ? (
            <p className="text-slate-400">
              Todavía no llega evidencia. El teléfono graba video mientras la pantalla del SOS está abierta (y audio cuando
              está apagada) y sube cada fragmento al terminarlo.
            </p>
          ) : (
            <>
              <ReproductorEvidencia evidencias={evidencias} />
              {evidencias.some((v) => v.sha256) && (
                <p className="text-slate-400">
                  La huella SHA-256 la calculó el teléfono al grabar: con ella se comprueba que la copia que la persona guardó
                  en su teléfono (para una denuncia) no se editó.
                </p>
              )}
              {evidencias.map((v, i) => (
                <div key={v.ruta} className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5 text-slate-700 font-medium">
                    {v.tipo === 'audio' ? <Mic className="w-3.5 h-3.5 text-red-600" /> : <Video className="w-3.5 h-3.5 text-red-600" />}
                    {v.tipo === 'audio' ? 'Audio' : 'Video'} {numeroPorTipo(evidencias, i)} · {hora(v.creada_en)}
                    {v.duracion_s != null ? ` · ${v.duracion_s} s` : ''}
                    {v.sha256 && (
                      <button
                        type="button"
                        title={`SHA-256 ${v.sha256} (clic para copiar)`}
                        onClick={() => copiarHuella(v.sha256!)}
                        className="font-mono text-[10px] font-normal text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        SHA-256 {v.sha256.slice(0, 12)}…
                      </button>
                    )}
                  </span>
                  <button type="button" onClick={() => verEvidencia(v)} className="text-red-600 hover:underline font-semibold cursor-pointer">
                    Ver
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** Video 1, 2…; Audio 1, 2… (se numeran por tipo). */
const numeroPorTipo = (lista: EvidenciaEmergencia[], i: number) =>
  lista.slice(0, i + 1).filter((x) => x.tipo === lista[i].tipo).length;

const copiarHuella = async (sha256: string) => {
  try {
    await navigator.clipboard.writeText(sha256);
    window.alert('Huella SHA-256 copiada.');
  } catch {
    window.prompt('Copia la huella SHA-256:', sha256);
  }
};

/**
 * Todos los fragmentos seguidos (video y audio, en el orden en que se grabaron), como una sola
 * grabación. Cada enlace firmado se pide al momento de reproducirlo (duran 10 min). El navegador
 * reproduce el MP4 (H.264/AAC) que manda el teléfono tal cual: ya viene comprimido.
 */
const ReproductorEvidencia: React.FC<{ evidencias: EvidenciaEmergencia[] }> = ({ evidencias }) => {
  const [indice, setIndice] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Depende de la ruta, no de la lista: si llegan fragmentos nuevos, el actual no se reinicia
  const ruta = indice === null ? null : (evidencias[indice]?.ruta ?? null);

  useEffect(() => {
    if (ruta === null) return;
    let vivo = true;
    setUrl(null);
    emergencyService.urlEvidencia(ruta).then((u) => {
      if (!vivo) return;
      if (u) setUrl(u);
      else setError('No se pudo abrir la evidencia. Revisa la conexión.');
    });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  const siguiente = () => setIndice((i) => (i !== null && i + 1 < evidencias.length ? i + 1 : null));

  if (indice === null) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIndice(0);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-white font-semibold cursor-pointer"
      >
        <Play className="w-3.5 h-3.5" /> Reproducir todo seguido
      </button>
    );
  }
  const actual = evidencias[indice];
  return (
    <div className="space-y-1">
      <p className="text-slate-600 font-medium">
        {actual.tipo === 'audio' ? 'Audio' : 'Video'} · fragmento {indice + 1} de {evidencias.length} · {hora(actual.creada_en)}
      </p>
      {url && (
        <video
          key={url}
          src={url}
          controls
          autoPlay
          playsInline
          onEnded={siguiente}
          onError={siguiente}
          className="w-full max-h-72 rounded-lg bg-black"
        />
      )}
      {error && <p className="text-red-600">{error}</p>}
      <button type="button" onClick={() => setIndice(null)} className="text-slate-500 hover:underline cursor-pointer">
        Cerrar reproductor
      </button>
    </div>
  );
};

const Dato: React.FC<{ icono: React.ReactNode; titulo: string; valor: string; alerta?: boolean }> = ({
  icono,
  titulo,
  valor,
  alerta = false,
}) => (
  <div className={`p-2.5 rounded-xl border ${alerta ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
    <div className={`flex items-center gap-1.5 ${alerta ? 'text-red-700' : 'text-slate-500'}`}>
      {icono}
      <span className="font-semibold text-[11px]">{titulo}</span>
    </div>
    <p className="font-bold text-slate-900 mt-0.5">{valor}</p>
  </div>
);

/** Mapa del recorrido: línea, inicio, última posición y margen de error. Sigue a la persona. */
const MapaRecorrido: React.FC<{ emergencia: Emergencia; puntos: PuntoEmergencia[]; color: string }> = ({
  emergencia: e,
  puntos,
  color,
}) => {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capas = useRef<L.LayerGroup | null>(null);
  const [seguir, setSeguir] = useState(true);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { center: [e.lat, e.lon], zoom: 16, attributionControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
    capas.current = L.layerGroup().addTo(m);
    m.on('dragstart', () => setSeguir(false));
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const grupo = capas.current;
    if (!grupo) return;
    grupo.clearLayers();
    const linea = puntos.map((p) => [p.lat, p.lon] as [number, number]);
    if (linea.length > 1) {
      L.polyline(linea, { color, weight: 4 }).addTo(grupo);
      L.circleMarker(linea[0], { radius: 6, color, fillColor: '#ffffff', fillOpacity: 1, weight: 3 }).addTo(grupo);
    }
    if ((e.precision_m ?? 0) > 0) {
      L.circle([e.lat, e.lon], { radius: e.precision_m!, color, weight: 1, fillOpacity: 0.12 }).addTo(grupo);
    }
    L.circleMarker([e.lat, e.lon], { radius: 10, color: '#ffffff', fillColor: color, fillOpacity: 1, weight: 3 })
      .bindTooltip('Última ubicación de la persona')
      .addTo(grupo);
    if (seguir) mapa.current?.panTo([e.lat, e.lon]);
  }, [puntos, e.lat, e.lon, e.precision_m, color, seguir]);

  return (
    <div className="relative">
      <div ref={contenedor} className="h-80 w-full isolate z-0" />
      {!seguir && (
        <button
          type="button"
          onClick={() => setSeguir(true)}
          className="absolute top-3 right-3 z-[400] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-700 text-xs font-bold shadow cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" /> Seguir a la persona
        </button>
      )}
    </div>
  );
};
