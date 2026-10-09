import React, { useState } from 'react';
import { 
  Radio, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  SlidersHorizontal, 
  Map, 
  RotateCcw, 
  Building2, 
  LogOut, 
  ShieldCheck, 
  Lock, 
  Settings,
  Loader2,
  AlertTriangle,
  Navigation,
  Siren
} from 'lucide-react';
import { audioAlert } from '../../services/audioAlert';
import { alertService } from '../../services/alertService';
import { ModeratorUser } from '../../types/auth';

export type AppView = 'citizen' | 'command' | 'map' | 'sos' | 'settings';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  activeLocationName: string;
  isRealGPS: boolean;
  isLocating: boolean;
  gpsError: string | null;
  onOpenReportModal: () => void;
  onOpenLocationModal?: () => void;
  proximityCount: number;
  sosCount?: number;
  isModerator: boolean;
  moderatorUser: ModeratorUser | null;
  onOpenModeratorLogin: () => void;
  onLogoutModerator: () => void;
  onRetryGPS?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  activeLocationName,
  isRealGPS,
  isLocating,
  gpsError,
  onOpenReportModal,
  onOpenLocationModal,
  proximityCount,
  sosCount = 0,
  isModerator,
  moderatorUser,
  onOpenModeratorLogin,
  onLogoutModerator,
  onRetryGPS,
}) => {
  const [isMuted, setIsMuted] = useState(() => audioAlert.getIsMuted());

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioAlert.setMuted(next);
  };

  const handleSyncData = () => {
    alertService.fetchAll();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md text-slate-900 transition-colors">
      {/* Nivel 1: Barra Principal Superior */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between gap-4">
        {/* Identidad Institucional */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-900 text-white shadow-xs shrink-0">
            <Radio className="w-5 h-5 text-red-500 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900">
                ALERTA CERCA
              </span>
              {isModerator ? (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-1 select-none">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Cabina CCE
                </span>
              ) : null}
            </div>
            <p className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-normal">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate max-w-[340px]">
                {isModerator && moderatorUser
                  ? `${moderatorUser.fullName} · ${moderatorUser.entity}`
                  : 'Consejo Coordinador Empresarial de Lázaro Cárdenas'}
              </span>
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Botón de GPS / Ubicación */}
          <button
            type="button"
            onClick={onOpenLocationModal || onRetryGPS}
            title={
              gpsError
                ? `${gpsError} Haz clic para calibrar o reintentar GPS.`
                : isRealGPS
                ? `GPS Satelital Activo: ${activeLocationName}. Haz clic para calibrar o cambiar.`
                : `Ubicación en Lázaro Cárdenas: ${activeLocationName}. Haz clic para calibrar calle o activar GPS.`
            }
            className={`hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-[0.98] select-none cursor-pointer group shadow-2xs ${
              gpsError 
                ? 'bg-amber-50 hover:bg-amber-100/80 border-amber-300 text-amber-900' 
                : isRealGPS
                ? 'bg-emerald-50/70 hover:bg-emerald-100/70 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
            ) : gpsError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            ) : isRealGPS ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            ) : (
              <Navigation className="w-3.5 h-3.5 text-slate-500" />
            )}
            
            <span className="max-w-[200px] truncate text-left">
              {isLocating ? 'Buscando GPS...' : activeLocationName}
            </span>
            
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200/80 text-slate-500 group-hover:text-slate-800">
              {isRealGPS ? 'GPS' : 'Ajustar'}
            </span>
          </button>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Activar sonido de alertas' : 'Silenciar sonido'}
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all active:scale-[0.98] select-none cursor-pointer shrink-0 shadow-2xs"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Sincronizar en vivo con Supabase (para moderador) */}
          {isModerator && (
            <button
              type="button"
              onClick={handleSyncData}
              title="Sincronizar en vivo con Supabase"
              className="hidden sm:flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-all active:scale-[0.98] select-none cursor-pointer shrink-0 shadow-2xs"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* CTA Dominante para reportar */}
          <button
            type="button"
            onClick={onOpenReportModal}
            className="whitespace-nowrap px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm shadow-xs hover:shadow transition-all cursor-pointer shrink-0"
          >
            {isModerator ? 'Emitir Alerta Oficial' : 'Reportar Incidente'}
          </button>

          {/* Acceso / Salida de Moderador */}
          {!isModerator ? (
            <button
              type="button"
              onClick={onOpenModeratorLogin}
              className="flex items-center gap-1.5 px-3 py-2 sm:py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold shadow-2xs transition-all active:scale-[0.98] cursor-pointer shrink-0 select-none"
              title="Acceso restringido para el Consejo Coordinador Empresarial"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Acceso CCE</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutModerator}
              className="flex items-center gap-1.5 px-3 py-2 sm:py-2.5 rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-slate-600 text-xs font-medium transition-all active:scale-[0.98] cursor-pointer shrink-0 select-none"
              title="Cerrar sesión de moderador"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          )}
        </div>
      </div>

      {/* Nivel 2: Barra de Pestañas Segmentada */}
      <div className="w-full border-t border-slate-200/80 bg-slate-50/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1800px] mx-auto py-1.5 flex items-center justify-between gap-4 overflow-x-auto">
          <nav className="inline-flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl border border-slate-200/70">
            {/* Pestaña 1: Alertas */}
            <button
              type="button"
              onClick={() => onViewChange('citizen')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 active:scale-[0.98] ${
                currentView === 'citizen'
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
              <span>Alertas Ciudadanas</span>
              {proximityCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-red-600 text-white tabular-nums">
                  {proximityCount}
                </span>
              )}
            </button>

            {/* Pestaña 2: Mapa */}
            <button
              type="button"
              onClick={() => onViewChange('map')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 active:scale-[0.98] ${
                currentView === 'map'
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Map className="w-3.5 h-3.5 text-blue-600" />
              <span>Mapa Radar</span>
            </button>

            {/* Pestañas exclusivas para Moderador */}
            {isModerator && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('sos')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 active:scale-[0.98] ${
                    currentView === 'sos'
                      ? 'bg-red-600 text-white shadow-xs font-bold'
                      : sosCount > 0
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'text-red-700 hover:text-red-800 hover:bg-red-50/60'
                  }`}
                >
                  <Siren className={`w-3.5 h-3.5 ${sosCount > 0 ? 'text-red-600 animate-pulse' : 'text-red-600'}`} />
                  <span>Emergencias SOS</span>
                  {sosCount > 0 ? (
                    <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-red-600 text-white tabular-nums">
                      {sosCount}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('command')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 active:scale-[0.98] ${
                    currentView === 'command'
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                  <span>Base de Datos</span>
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('settings')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 active:scale-[0.98] ${
                    currentView === 'settings'
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-slate-600" />
                  <span>Ajustes</span>
                </button>
              </>
            )}
          </nav>

          {/* Distintivo de conexión CCE */}
          <div className="hidden md:flex items-center gap-2 text-xs font-medium shrink-0 text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Monitoreo Activo · Lázaro Cárdenas, Mich.</span>
          </div>
        </div>
      </div>
    </header>
  );
};
