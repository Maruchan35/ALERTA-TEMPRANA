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
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white text-slate-900 shadow-xs transition-colors duration-200">
      {/* Nivel 1: Barra Principal Superior (Identidad, CTA de Emergencia y Acceso) */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-22 flex items-center justify-between gap-4">
        {/* Logo e Identidad del Proyecto */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 shadow-xs shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-black text-xl sm:text-2xl tracking-tight text-slate-900">ALERTA CERCA</span>
              {isModerator ? (
                <span className="px-2.5 py-1 text-[11px] uppercase font-black tracking-wider rounded-lg bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Administrador CCE
                </span>
              ) : null}
            </div>
            <p className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 font-medium">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                {isModerator && moderatorUser
                  ? `${moderatorUser.fullName} (${moderatorUser.entity})`
                  : 'Consejo Coordinador Empresarial de Lázaro Cárdenas'}
              </span>
            </p>
          </div>
        </div>

        {/* Acciones Rápidas Superiores: Ubicación GPS en Vivo, Sonido, CTA y Moderador */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          {/* Botón de GPS / Ubicación en Tiempo Real */}
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
            className={`hidden md:flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-all active:scale-[0.98] cursor-pointer group shadow-2xs ${
              gpsError 
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900' 
                : isRealGPS
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900 ring-1 ring-emerald-200'
                : 'bg-blue-50/70 hover:bg-blue-100 border-blue-200 text-blue-900'
            }`}
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            ) : gpsError ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 group-hover:rotate-180 transition-transform duration-300" />
            ) : isRealGPS ? (
              <Navigation className="w-4 h-4 text-emerald-600 animate-pulse" />
            ) : (
              <Navigation className="w-4 h-4 text-blue-600" />
            )}
            
            <span className="max-w-[210px] truncate text-left">
              {isLocating ? 'Buscando GPS...' : activeLocationName}
            </span>
            
            <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white/80 border border-slate-200/80 text-slate-600 group-hover:text-blue-700 ml-0.5">
              {isRealGPS ? 'Satelital' : 'Calibrar'}
            </span>
          </button>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Activar sonido de alertas' : 'Silenciar sonido'}
            className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-transform active:scale-[0.98] select-none cursor-pointer shrink-0 shadow-2xs"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-slate-400" /> : <Volume2 className="w-5 h-5 text-emerald-600" />}
          </button>

          {/* Sincronizar en vivo con Supabase (para moderador) */}
          {isModerator && (
            <button
              type="button"
              onClick={handleSyncData}
              title="Sincronizar en vivo con Supabase"
              className="hidden sm:flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-800 transition-transform active:scale-[0.98] select-none cursor-pointer shrink-0 shadow-2xs"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>
          )}

          {/* CTA Dominante para reportar */}
          <button
            type="button"
            onClick={onOpenReportModal}
            className="whitespace-nowrap px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm md:text-base shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
          >
            {isModerator ? 'Emitir Alerta Oficial' : 'Reportar Incidente'}
          </button>

          {/* Botón arriba a la derecha: Iniciar Sesión Administrador o Cerrar Sesión */}
          {!isModerator ? (
            <button
              type="button"
              onClick={onOpenModeratorLogin}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-400 text-amber-900 text-xs sm:text-sm font-bold shadow-2xs transition-all active:scale-[0.98] cursor-pointer shrink-0"
              title="Acceso restringido para el Consejo Coordinador Empresarial"
            >
              <Lock className="w-4 h-4 text-amber-700" />
              <span>Administrador</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutModerator}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer shrink-0"
              title="Cerrar sesión de administrador"
            >
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </button>
          )}
        </div>
      </div>

      {/* Nivel 2: Barra de Pestañas Dedicada */}
      <div className="w-full border-t border-slate-200 bg-slate-50/90 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
        <div className="max-w-[1800px] mx-auto py-2 sm:py-2.5 flex items-center justify-between gap-4 overflow-x-auto">
          <nav className="flex items-center gap-2 sm:gap-3">
            {/* Pestaña 1: Alertas */}
            <button
              type="button"
              onClick={() => onViewChange('citizen')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                currentView === 'citizen'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300 ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ShieldAlert className="w-4.5 h-4.5 text-red-600" />
              <span>Alertas Ciudadanas</span>
              {proximityCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-black rounded-full bg-red-600 text-white tabular-nums">
                  {proximityCount}
                </span>
              )}
            </button>

            {/* Pestaña 2: Mapa */}
            <button
              type="button"
              onClick={() => onViewChange('map')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                currentView === 'map'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300 ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Map className="w-4.5 h-4.5 text-blue-600" />
              <span>Mapa en Vivo</span>
            </button>

            {/* Pestañas exclusivas para Moderador */}
            {isModerator && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('sos')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'sos'
                      ? 'bg-red-600 text-white shadow-xs border border-red-500 font-black ring-1 ring-red-400'
                      : sosCount > 0
                      ? 'bg-red-50 text-red-700 border border-red-300 animate-pulse font-bold'
                      : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                  }`}
                >
                  <Siren className={`w-4.5 h-4.5 ${sosCount > 0 ? 'text-red-600 animate-bounce' : 'text-red-500'}`} />
                  <span>Emergencias SOS</span>
                  {sosCount > 0 ? (
                    <span className="ml-1 px-2 py-0.5 text-xs font-black rounded-full bg-red-600 text-white tabular-nums shadow-xs">
                      {sosCount}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('command')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'command'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-300 font-bold ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <SlidersHorizontal className="w-4.5 h-4.5 text-amber-600" />
                  <span>Base de Datos</span>
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('settings')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'settings'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-300 ring-1 ring-slate-200 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Settings className="w-4.5 h-4.5 text-slate-500" />
                  <span>Ajustes</span>
                </button>
              </>
            )}
          </nav>

          {/* Distintivo de conexión CCE en la barra de navegación */}
          <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm font-medium shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500">
              Monitoreo Activo · Lázaro Cárdenas, Mich.
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
