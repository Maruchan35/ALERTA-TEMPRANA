import React, { useState } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { CategoryBadge, StatusBadge, LevelBadge } from '../ui/Badge';
import { formatDistance } from '../../services/geo';
import { Button } from '../ui/Button';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { 
  MapPin, 
  Clock, 
  Radio, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Info,
  Camera,
  Loader2
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
  isAdminTheme = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`alerta_voto_${alert.id}`) !== null;
    } catch {
      return false;
    }
  });

  const isResolved = alert.status === 'resuelta' || alert.status === 'descartada';

  const handleVoteConfirm = async () => {
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
      window.alert((err as Error).message);
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
    if (elapsedMinutes < 60) return `Hace ${elapsedMinutes} min`;
    const hours = Math.floor(elapsedMinutes / 60);
    return `Hace ${hours}h ${elapsedMinutes % 60}m`;
  };

  // Estilo visual exacto según el NIVEL de importancia y TEMA (admin / usuario)
  const getSeverityStyle = () => {
    if (isResolved) {
      return {
        cardBorder: isAdminTheme
          ? 'bg-zinc-900 border-zinc-800 opacity-70 text-zinc-300'
          : 'bg-slate-50 border-slate-200 opacity-80 text-slate-700',
        headerBg: isAdminTheme
          ? 'bg-zinc-950/60 border-zinc-800 text-zinc-400'
          : 'bg-slate-100 border-slate-200 text-slate-500',
        dotClass: 'bg-slate-400',
        proximityText: 'text-slate-500',
        perimeterBadge: 'bg-slate-200 text-slate-700 border-slate-300',
      };
    }

    switch (alert.level) {
      case 4: // ÚNICA ROJA
        return {
          cardBorder: isAdminTheme
            ? 'bg-zinc-900 border-red-500/90 ring-1 ring-red-500/40 text-zinc-100 shadow-md'
            : 'bg-white border-red-500 ring-2 ring-red-200 hover:border-red-600 shadow-md text-slate-900',
          headerBg: isAdminTheme
            ? 'bg-red-950/40 border-red-900/60 text-red-200'
            : 'bg-red-50 border-red-200 text-red-950',
          dotClass: 'bg-red-600 animate-pulse',
          proximityText: 'text-red-500 font-extrabold',
          perimeterBadge: 'bg-red-600 text-white border-red-700',
        };
      case 3: // NARANJA / ÁMBAR
        return {
          cardBorder: isAdminTheme
            ? 'bg-zinc-900 border-amber-500/80 hover:border-amber-400 shadow-xs text-zinc-100'
            : 'bg-white border-amber-400 hover:border-amber-500 shadow-xs text-slate-900',
          headerBg: isAdminTheme
            ? 'bg-amber-950/30 border-amber-900/50 text-amber-200'
            : 'bg-amber-50/80 border-amber-200 text-amber-950',
          dotClass: 'bg-amber-500 animate-pulse',
          proximityText: 'text-amber-500 font-bold',
          perimeterBadge: 'bg-amber-500 text-white border-amber-600',
        };
      case 2: // AZUL
        return {
          cardBorder: isAdminTheme
            ? 'bg-zinc-900 border-blue-500/70 hover:border-blue-400 shadow-xs text-zinc-100'
            : 'bg-white border-blue-300 hover:border-blue-400 shadow-xs text-slate-900',
          headerBg: isAdminTheme
            ? 'bg-blue-950/30 border-blue-900/50 text-blue-200'
            : 'bg-blue-50/70 border-blue-200 text-blue-950',
          dotClass: 'bg-blue-500',
          proximityText: 'text-blue-400 font-bold',
          perimeterBadge: 'bg-blue-600 text-white border-blue-700',
        };
      case 1: // SLATE / NEUTRAL
      default:
        return {
          cardBorder: isAdminTheme
            ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-600 shadow-xs text-zinc-100'
            : 'bg-white border-slate-300 hover:border-slate-400 shadow-xs text-slate-900',
          headerBg: isAdminTheme
            ? 'bg-zinc-800/60 border-zinc-700 text-zinc-300'
            : 'bg-slate-100/80 border-slate-200 text-slate-800',
          dotClass: 'bg-slate-500',
          proximityText: isAdminTheme ? 'text-zinc-300' : 'text-slate-700',
          perimeterBadge: 'bg-slate-600 text-white border-slate-700',
        };
    }
  };

  const style = getSeverityStyle();

  return (
    <article
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden ${style.cardBorder}`}
    >
      {/* Barra superior de estado y nivel de cobertura */}
      <div
        className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-semibold ${style.headerBg}`}
      >
        <div className="flex items-center gap-2">
          {isResolved ? (
            <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              SITUACIÓN RESUELTA
            </span>
          ) : alert.isWithinCoverage ? (
            <span className={`flex items-center gap-1.5 ${style.proximityText}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${style.dotClass}`} />
              EN TU PERÍMETRO ({formatDistance(alert.distanceKm)})
            </span>
          ) : (
            <span className="text-slate-600 font-medium">
              A {formatDistance(alert.distanceKm)} de tu GPS
            </span>
          )}
          <span className="font-mono text-slate-500 text-[11px] font-normal">({alert.folio})</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatElapsed()}</span>
          </span>
          {!isResolved && (
            <span className="inline-flex items-center gap-1 text-slate-700 bg-white/80 px-2 py-0.5 rounded text-[10px] border border-slate-300 font-bold">
              <Radio className="w-3 h-3 text-slate-600" />
              Radio {alert.currentRadiusKm} km
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Encabezado: Badges y Título */}
        <div className="flex flex-wrap items-center gap-2 mb-2.5">
          <CategoryBadge category={alert.category} />
          <StatusBadge status={alert.status} verifiedBy={alert.verifiedBy} />
          <LevelBadge level={alert.level} />
          {alert.folio911 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-bold">
              Folio 911: {alert.folio911}
            </span>
          )}
        </div>

        <h3 className={`text-base sm:text-lg font-bold tracking-tight mb-2 ${isAdminTheme ? 'text-white' : 'text-slate-900'}`}>
          {alert.title}
        </h3>

        {/* Contenido y descripción */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          {alert.photoUrl && (
            <>
              <div 
                onClick={() => !imageError && setShowImageModal(true)}
                className={`sm:w-36 h-36 shrink-0 rounded-lg overflow-hidden border relative group cursor-pointer ${
                  isAdminTheme ? 'border-zinc-800 bg-zinc-950' : 'border-slate-200 bg-slate-100'
                }`}
                title="Clic para ampliar foto"
              >
                {!imageError ? (
                  <>
                    <img
                      src={alert.photoUrl}
                      alt={alert.title}
                      onError={() => setImageError(true)}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-medium gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ampliar</span>
                    </div>
                  </>
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center p-3 text-center ${
                    isAdminTheme ? 'bg-zinc-950 text-zinc-400' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Camera className="w-6 h-6 mb-1 text-slate-400" />
                    <span className="text-[10px] font-semibold">Evidencia adjunta</span>
                    <a
                      href={alert.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-blue-500 underline mt-1"
                    >
                      Abrir enlace
                    </a>
                  </div>
                )}
              </div>

              {/* Lightbox / Modal para ampliar foto en alta resolución */}
              {showImageModal && !imageError && (
                <div 
                  className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                  onClick={() => setShowImageModal(false)}
                >
                  <div 
                    className="relative max-w-3xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl p-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-400 border-b border-zinc-800 mb-2">
                      <span className="font-semibold text-zinc-200">{alert.title}</span>
                      <button
                        type="button"
                        onClick={() => setShowImageModal(false)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer font-bold"
                      >
                        ✕ Cerrar
                      </button>
                    </div>
                    <img
                      src={alert.photoUrl}
                      alt={alert.title}
                      className="max-h-[75vh] w-auto mx-auto object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex-1 space-y-2.5">
            <p className={`text-sm leading-relaxed ${isAdminTheme ? 'text-zinc-300' : 'text-slate-700'}`}>
              {alert.description}
            </p>

            {alert.reference && (
              <div className={`flex items-center gap-1.5 text-xs p-2 rounded-lg border ${
                isAdminTheme ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span><strong>Referencia:</strong> {alert.reference}</span>
              </div>
            )}

            {/* Instrucción oficial comunitaria */}
            {alert.instructions && (
              <div className={`flex items-start gap-1.5 text-xs p-2.5 rounded-lg border ${
                isAdminTheme ? 'bg-blue-950/30 border-blue-900/50 text-blue-200' : 'bg-blue-50/80 border-blue-200 text-blue-900'
              }`}>
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span><strong>Qué hacer:</strong> {alert.instructions}</span>
              </div>
            )}
          </div>
        </div>

        {/* Barra de acciones al pie */}
        <div className={`pt-3 border-t flex flex-wrap items-center justify-between gap-3 ${
          isAdminTheme ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-3 text-xs">
            <span className={`flex items-center gap-1 font-semibold ${isAdminTheme ? 'text-zinc-300' : 'text-slate-700'}`}>
              <Eye className="w-3.5 h-3.5 text-blue-500" />
              <span>{alert.confirmedCount} confirmaciones</span>
            </span>
            {alert.disputeCount > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{alert.disputeCount} reportes de falsa</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onSelectOnMap && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectOnMap(alert.id)}
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  isAdminTheme ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800' : ''
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                <span>Ver en Mapa</span>
              </Button>
            )}

            {!isResolved && (
              <>
                {hasVoted ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold shadow-2xs select-none">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>¡Confirmaste avistamiento!</span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleVoteConfirm}
                    disabled={isVoting}
                    className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                    title="Confirmar que la alerta es verídica"
                  >
                    {isVoting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>{isVoting ? 'Registrando...' : 'Lo he visto'}</span>
                  </Button>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenSightingModal(alert)}
                  className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  <span>Aportar Pista</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
