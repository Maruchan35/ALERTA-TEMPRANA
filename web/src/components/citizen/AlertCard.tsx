import React, { useState } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { formatDistance } from '../../services/geo';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { 
  MapPin, 
  Radio, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  AlertTriangle, 
  Flame, 
  ShieldAlert,
  MessageSquarePlus, 
  Maximize2,
  Share2,
  Check
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

  const [copiedShare, setCopiedShare] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareText = `🚨 ALERTA CERCA (CCE Lázaro Cárdenas):\n*${alert.title}*\n📍 Ubicación: ${alert.coordinates.address || 'Lázaro Cárdenas'}\n📡 Radio activo: ${alert.currentRadiusKm.toFixed(1)} km\nFolio: ${alert.folio}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Alerta Cerca: ${alert.title}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // ignore
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

  // Tema semántico de élite: borde fino con acento lateral sutil
  const getLevelTheme = () => {
    if (isResolved) {
      return {
        levelText: 'RESUELTA',
        levelBadge: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
        cardAccent: 'border-l-4 border-l-slate-400',
      };
    }

    switch (alert.level) {
      case 4:
        return {
          levelText: 'NIVEL 4 · CRÍTICA',
          levelBadge: 'bg-red-50 text-red-700 border-red-200',
          dotClass: 'bg-red-600 animate-pulse',
          cardAccent: 'border-l-4 border-l-red-600',
        };
      case 3:
        return {
          levelText: 'NIVEL 3 · PRIORIDAD',
          levelBadge: 'bg-amber-50 text-amber-800 border-amber-200',
          dotClass: 'bg-amber-600',
          cardAccent: 'border-l-4 border-l-amber-500',
        };
      case 2:
        return {
          levelText: 'NIVEL 2 · PREVENTIVA',
          levelBadge: 'bg-sky-50 text-sky-800 border-sky-200',
          dotClass: 'bg-sky-600',
          cardAccent: 'border-l-4 border-l-sky-500',
        };
      case 1:
      default:
        return {
          levelText: 'NIVEL 1 · AVISO',
          levelBadge: 'bg-slate-100 text-slate-700 border-slate-200',
          dotClass: 'bg-slate-500',
          cardAccent: 'border-l-4 border-l-slate-400',
        };
    }
  };

  const theme = getLevelTheme();

  return (
    <article
      className={`relative rounded-2xl bg-white text-slate-900 border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group ${theme.cardAccent}`}
    >
      <div>
        {/* ========================================================
            1. FOTOGRAFÍA O PLACEHOLDER MINIMALISTA
        ======================================================== */}
        {alert.photoUrl && !imageError ? (
          <div className="p-3 pb-0">
            <div 
              onClick={() => setShowImageModal(true)}
              className="relative w-full h-44 sm:h-48 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/60 flex items-center justify-center cursor-pointer select-none"
              title="Clic para ampliar imagen"
            >
              <img
                src={alert.photoUrl}
                alt={alert.title}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-medium backdrop-blur-xs flex items-center gap-1 opacity-90 transition-opacity">
                <Maximize2 className="w-3 h-3 text-slate-200" />
                <span>Ampliar</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 pb-0">
            <div className="w-full h-36 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden gap-1 text-slate-400">
              {alert.level === 4 ? (
                <AlertTriangle className="w-8 h-8 text-red-500/60" />
              ) : alert.level === 3 ? (
                <Flame className="w-8 h-8 text-amber-500/60" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-slate-400" />
              )}
              <span className="text-[11px] font-medium text-slate-400">Sin fotografía adjunta</span>
              <div className="absolute bottom-2 left-2.5 text-[10px] font-mono text-slate-400">
                {alert.folio}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            2. DETALLES Y TIPOGRAFÍA EDITORIAL
        ======================================================== */}
        <div className="p-4 space-y-3">
          {/* Fila 1: Píldora de Peligro y Distancia Geodésica */}
          <div className="flex items-center justify-between gap-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border ${theme.levelBadge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${theme.dotClass}`} />
              {theme.levelText}
            </span>

            {alert.isWithinCoverage ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-mono text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                {formatDistance(alert.distanceKm)}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-500">
                a {formatDistance(alert.distanceKm)}
              </span>
            )}
          </div>

          {/* Título de la Alerta */}
          <h3 className="text-sm font-semibold tracking-tight text-slate-900 leading-snug line-clamp-2">
            {alert.title}
          </h3>

          {/* Fila de Etiquetas de Metadatos */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200/60">
              {alert.categoryName}
            </span>

            {alert.adaptiveInfo?.isAdaptive ? (
              <span className={`px-2 py-0.5 rounded font-medium border flex items-center gap-1 ${
                alert.level === 4
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`} title={`Protocolo de expansión adaptativa: ${alert.adaptiveInfo.stageName} (⏱️ ${alert.adaptiveInfo.elapsedMinutes}m)`}>
                <Radio className="w-2.5 h-2.5 text-red-600 animate-pulse" />
                Radio {alert.adaptiveInfo.stageBadge}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200/60 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 text-slate-500" />
                {alert.currentRadiusKm} km
              </span>
            )}

            {alert.folio911 && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200/60">
                911: {alert.folio911}
              </span>
            )}

            {alert.verifiedBy && (
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                CCE
              </span>
            )}
          </div>

          {/* Caja de Descripción Limpia */}
          <div className="text-xs text-slate-600 space-y-1.5">
            <p className={`${!isExpanded ? 'line-clamp-2' : ''} leading-relaxed`}>
              {alert.description || 'Sin descripción adicional.'}
            </p>

            {alert.reference && (
              <div className="flex items-center gap-1 text-[11px] text-slate-800 font-medium pt-1">
                <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                <span className="truncate"><strong>Ref:</strong> {alert.reference}</span>
              </div>
            )}

            {alert.instructions && isExpanded && (
              <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px]">
                <strong className="text-slate-900">Protocolo CCE:</strong> {alert.instructions}
              </div>
            )}

            {(alert.description && alert.description.length > 80 || alert.instructions) && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-0.5 pt-0.5 cursor-pointer"
              >
                <span>{isExpanded ? 'Ver menos' : 'Ver más'}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          3. BARRA DE MÉTRICAS Y BOTONES TÁCTILES
      ======================================================== */}
      <div className="p-4 pt-0 space-y-3 border-t border-slate-100 mt-1">
        {/* Métricas Compactas */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-2">
          <span className="flex items-center gap-1" title="Ciudadanos que han confirmado">
            <Eye className={`w-3.5 h-3.5 ${hasVoted ? 'text-emerald-600' : 'text-slate-400'}`} />
            <strong className="text-slate-700">{alert.confirmedCount || 0}</strong> vistos
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600">
            {isResolved ? 'Cerrada' : alert.status === 'verificada' ? 'Verificada' : 'En Curso'}
          </span>
          <span className="text-slate-300">·</span>
          <span>{formatElapsed()}</span>
          <span className="text-slate-300">·</span>
          <span>{alert.currentRadiusKm} km</span>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 w-full">
          {!isResolved && (
            <>
              <button
                type="button"
                onClick={handleVoteConfirm}
                disabled={hasVoted || isVoting}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-[0.98] border ${
                  hasVoted
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                }`}
                title="Confirmar que has visto al menor o el incidente"
              >
                <Eye className={`w-3.5 h-3.5 ${hasVoted ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span className="truncate">{hasVoted ? 'Visto' : 'Lo he visto'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenSightingModal(alert)}
                className="p-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition-all flex items-center justify-center cursor-pointer active:scale-[0.98]"
                title="Aportar información de avistamiento"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {onSelectOnMap && (
            <button
              type="button"
              onClick={() => onSelectOnMap(alert.id)}
              className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-[0.98]"
            >
              <Radio className="w-3.5 h-3.5 text-slate-300" />
              <span>Ver Radar</span>
            </button>
          )}

          {/* Botón Compartir Alerta */}
          <button
            type="button"
            onClick={handleShare}
            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer active:scale-[0.98] ${
              copiedShare
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
            }`}
            title="Compartir alerta"
          >
            {copiedShare ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Modal Lightbox para imagen */}
      {showImageModal && alert.photoUrl && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setShowImageModal(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xl p-3 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600 border-b border-slate-100 mb-2">
              <span className="font-semibold text-slate-900">{alert.title}</span>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
              >
                Cerrar
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
