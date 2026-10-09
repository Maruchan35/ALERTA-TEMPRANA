import React, { useState } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { formatDistance } from '../../services/geo';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { 
  MapPin, 
  Radio, 
  Eye, 
  BarChart2, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  AlertTriangle, 
  Flame, 
  ShieldAlert,
  MessageSquarePlus, 
  Maximize2 
} from 'lucide-react';

interface AlertCardProps {
  alert: AlertWithDistance;
  onOpenSightingModal: (alert: AlertWithDistance) => void;
  onSelectOnMap?: (alertId: string) => void;
  isAdminTheme?: boolean;
}

export const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onOpenSightingModal,
  onSelectOnMap,
}) => {
  const [imageError, setImageError] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`alerta_voto_${alert.id}`) !== null;
    } catch {
      return false;
    }
  });

  const isResolved = alert.status === 'resuelta' || alert.status === 'descartada';

  const handleVoteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasVoted || isVoting) return;
    setIsVoting(true);
    try {
      await alertService.voteConfirmation(alert.id, 'confirmo');
      setHasVoted(true);
      try {
        localStorage.setItem(`alerta_voto_${alert.id}`, 'true');
      } catch {
        // ignore
      }
      audioAlert.playInfoAlert();
    } catch (err) {
      console.warn('Error al registrar voto:', err);
    } finally {
      setIsVoting(false);
    }
  };

  // Cálculo de tiempo transcurrido
  const elapsedMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(alert.createdAt).getTime()) / 60000)
  );

  const formatElapsed = () => {
    if (elapsedMinutes < 60) return `Hace ${elapsedMinutes}m`;
    const hours = Math.floor(elapsedMinutes / 60);
    return `Hace ${hours}h ${elapsedMinutes % 60}m`;
  };

  // Configuración de estilo sobrio con tarjetas blancas, bordes gruesos y badges en colores sólidos
  const getLevelTheme = () => {
    if (isResolved) {
      return {
        levelText: 'RESUELTA',
        levelBadge: 'bg-slate-700 text-white font-black border-transparent shadow-xs',
        dotClass: 'bg-white',
        cardBorder: 'border-2 border-slate-300 hover:border-slate-400',
      };
    }

    switch (alert.level) {
      case 4:
        return {
          levelText: 'NIVEL 4 · CRÍTICA',
          levelBadge: 'bg-red-600 text-white font-black border-transparent shadow-xs',
          dotClass: 'bg-white animate-pulse',
          cardBorder: 'border-2 border-red-500 hover:border-red-600 shadow-sm',
        };
      case 3:
        return {
          levelText: 'NIVEL 3 · PRIORIDAD',
          levelBadge: 'bg-orange-500 text-white font-black border-transparent shadow-xs',
          dotClass: 'bg-white',
          cardBorder: 'border-2 border-orange-500 hover:border-orange-600 shadow-sm',
        };
      case 2:
        return {
          levelText: 'NIVEL 2 · PREVENTIVA',
          levelBadge: 'bg-amber-500 text-white font-black border-transparent shadow-xs',
          dotClass: 'bg-white',
          cardBorder: 'border-2 border-amber-400 hover:border-amber-500 shadow-sm',
        };
      case 1:
      default:
        return {
          levelText: 'NIVEL 1 · AVISO',
          levelBadge: 'bg-emerald-600 text-white font-black border-transparent shadow-xs',
          dotClass: 'bg-white',
          cardBorder: 'border-2 border-emerald-500 hover:border-emerald-600 shadow-sm',
        };
    }
  };

  const theme = getLevelTheme();

  return (
    <article
      className={`relative rounded-2xl overflow-hidden bg-white text-slate-900 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ${theme.cardBorder}`}
    >
      <div>
        {/* ========================================================
            1. CONTENEDOR DE FOTO UNIFORME Y CONSISTENTE (FONDO CLARO)
        ======================================================== */}
        {alert.photoUrl && !imageError ? (
          <div className="p-1.5 pb-0">
            <div 
              onClick={() => setShowImageModal(true)}
              className="relative w-full h-48 sm:h-52 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer group"
              title="Clic para ampliar foto en alta resolución"
            >
              {/* Foto con proporción y encuadre uniforme */}
              <img
                src={alert.photoUrl}
                alt={alert.title}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />

              {/* Overlay sutil al hover */}
              <div className="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Botón sutil en esquina para ver pantalla completa */}
              <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 text-white text-[11px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity shadow-sm">
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Ampliar</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-1.5 pb-0">
            <div className="w-full h-48 sm:h-52 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden gap-1.5">
              <div className="text-center opacity-30">
                {alert.level === 4 ? (
                  <AlertTriangle className="w-12 h-12 mx-auto text-red-600" />
                ) : alert.level === 3 ? (
                  <Flame className="w-12 h-12 mx-auto text-amber-600" />
                ) : (
                  <ShieldAlert className="w-12 h-12 mx-auto text-blue-600" />
                )}
              </div>
              <span className="text-[11px] font-semibold text-slate-400">Sin fotografía adjunta</span>
              <div className="absolute bottom-2 left-2.5 text-[10px] font-mono text-slate-400 font-bold">
                {alert.folio}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            2. DETALLES Y CONTENIDO DE LA ALERTA (FONDO BLANCO SOBRIO)
        ======================================================== */}
        <div className="p-3.5 space-y-2.5">
          {/* Fila 1: Nivel de Peligro y Distancia GPS */}
          <div className="flex items-center justify-between gap-1 text-xs">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide ${theme.levelBadge}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${theme.dotClass}`} />
              {theme.levelText}
            </span>

            {alert.isWithinCoverage ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] animate-pulse">
                {formatDistance(alert.distanceKm)}
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-slate-500">
                A {formatDistance(alert.distanceKm)}
              </span>
            )}
          </div>

          {/* Título de la Alerta */}
          <h3 className="text-sm sm:text-base font-bold tracking-tight leading-snug line-clamp-2 text-slate-900">
            {alert.title}
          </h3>

          {/* Fila de Tags / Píldoras Discretas */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded-md font-bold border border-slate-200 bg-slate-100 text-slate-800">
              {alert.categoryName}
            </span>

            {alert.adaptiveInfo?.isAdaptive ? (
              <span className={`px-2 py-0.5 rounded-md font-black border flex items-center gap-1 ${
                alert.level === 4
                  ? 'bg-red-50 text-red-800 border-red-300'
                  : 'bg-orange-50 text-orange-800 border-orange-300'
              }`} title={`Protocolo de expansión adaptativa: ${alert.adaptiveInfo.stageName} (⏱️ ${alert.adaptiveInfo.elapsedMinutes}m)`}>
                <Radio className="w-2.5 h-2.5 animate-pulse text-red-600" />
                Radio Adaptativo: {alert.adaptiveInfo.stageBadge}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md font-bold border border-slate-200 bg-slate-100 text-slate-800 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 text-blue-600" />
                Radio {alert.currentRadiusKm} km
              </span>
            )}

            {alert.folio911 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 font-black border border-amber-300">
                911: {alert.folio911}
              </span>
            )}

            {alert.verifiedBy && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 font-black border border-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                CCE
              </span>
            )}
          </div>

          {/* Caja de Descripción / Sinopsis */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs space-y-1.5">
            <p className={`${!isExpanded ? 'line-clamp-2' : ''} leading-relaxed`}>
              {alert.description || 'Sin descripción adicional.'}
            </p>

            {alert.reference && (
              <div className="flex items-center gap-1 text-[11px] text-slate-900 font-bold pt-1.5 border-t border-slate-200">
                <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                <span className="truncate"><strong>Ref:</strong> {alert.reference}</span>
              </div>
            )}

            {alert.instructions && isExpanded && (
              <div className="mt-1 p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-medium">
                <strong>Protocolo CCE:</strong> {alert.instructions}
              </div>
            )}

            {(alert.description && alert.description.length > 80 || alert.instructions) && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[10px] text-slate-600 hover:text-slate-900 font-bold flex items-center gap-0.5 pt-1 cursor-pointer"
              >
                <span>{isExpanded ? 'Ver menos' : 'Ver más'}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          3. BARRA DE ESTADÍSTICAS Y BOTONES DE ACCIÓN
      ======================================================== */}
      <div className="p-3 pt-0 space-y-2.5 border-t border-slate-100 mt-1">
        {/* Estadísticas Compactas: Ojito (Eye) para vistos y Radar (Radio) para alcance */}
        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] select-none pt-2">
          {/* 1. Ojito (Eye) para confirmaciones / vistos */}
          <div className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
            <Eye className={`w-3.5 h-3.5 mx-auto ${hasVoted ? 'text-blue-600' : 'text-slate-500'}`} />
            <span className="font-bold">{alert.confirmedCount || 0}</span>
            <div className="text-[8px] text-slate-400 font-semibold">Vistos</div>
          </div>

          {/* 2. Estado de validación */}
          <div className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
            <BarChart2 className="w-3.5 h-3.5 mx-auto text-emerald-600" />
            <span className="font-bold truncate block">
              {isResolved ? 'Cerrada' : alert.status === 'verificada' ? 'Oficial' : 'En Curso'}
            </span>
            <div className="text-[8px] text-slate-400 font-semibold">Estado</div>
          </div>

          {/* 3. Año */}
          <div className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
            <Calendar className="w-3.5 h-3.5 mx-auto text-slate-500" />
            <span className="font-bold">2026</span>
            <div className="text-[8px] text-slate-400 font-semibold">{formatElapsed()}</div>
          </div>

          {/* 4. Radar (Radio) para el radio de cobertura */}
          <div className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
            <Radio className="w-3.5 h-3.5 mx-auto text-blue-600" />
            <span className="font-bold">{alert.currentRadiusKm}k</span>
            <div className="text-[8px] text-slate-400 font-semibold">Radar</div>
          </div>
        </div>

        {/* Botones de Acción: Ojito (Eye) en "Lo he visto" y Radar (Radio) en "Ver Radar" */}
        <div className="flex items-center gap-1.5 w-full">
          {!isResolved && (
            <>
              <button
                type="button"
                onClick={handleVoteConfirm}
                disabled={hasVoted || isVoting}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 border ${
                  hasVoted
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 hover:text-slate-900'
                }`}
                title="Confirmar que has visto al menor o el incidente"
              >
                <Eye className={`w-3.5 h-3.5 ${hasVoted ? 'text-emerald-600' : 'text-blue-600'}`} />
                <span className="truncate">{hasVoted ? 'Visto' : 'Lo he visto'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenSightingModal(alert)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                title="Aportar información detallada de avistamiento"
              >
                <MessageSquarePlus className="w-3.5 h-3.5 text-blue-600" />
              </button>
            </>
          )}

          {onSelectOnMap && (
            <button
              type="button"
              onClick={() => onSelectOnMap(alert.id)}
              className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95"
            >
              <Radio className="w-3.5 h-3.5 text-white" />
              <span>Ver Radar</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL LIGHTBOX PARA AMPLIAR LA FOTO EN PANTALLA COMPLETA
      ======================================================== */}
      {showImageModal && alert.photoUrl && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl p-3 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-400 border-b border-zinc-800 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">[{theme.levelText}]</span>
                <span className="font-semibold text-zinc-200">{alert.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer transition-colors"
              >
                ✕ Cerrar
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
              <img
                src={alert.photoUrl}
                alt={alert.title}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
