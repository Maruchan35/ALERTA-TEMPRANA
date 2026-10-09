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
  Siren
} from 'lucide-react';
import { Button } from '../ui/Button';
import { audioAlert } from '../../services/audioAlert';
import { alertService } from '../../services/alertService';
import { ModeratorUser } from '../../types/auth';

export type AppView = 'citizen' | 'command' | 'map' | 'settings' | 'sos';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  activeLocationName: string;
  isRealGPS: boolean;
  isLocating: boolean;
  gpsError: string | null;
  onOpenReportModal: () => void;
  proximityCount: number;
  isModerator: boolean;
  moderatorUser: ModeratorUser | null;
  onOpenModeratorLogin: () => void;
  onLogoutModerator: () => void;
  isModSection?: boolean;
  /** Emergencias SOS abiertas (solo moderador): insignia roja en su pestaña. */
  sosCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  activeLocationName,
  isRealGPS,
  isLocating,
  gpsError,
  onOpenReportModal,
  proximityCount,
  isModerator,
  moderatorUser,
  onOpenModeratorLogin,
  onLogoutModerator,
  isModSection = false,
  sosCount = 0,
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
    <header className={`sticky top-0 z-40 w-full border-b transition-colors duration-200 ${
      isModSection 
        ? 'bg-zinc-900 border-zinc-800 text-zinc-100 shadow-md' 
        : 'bg-white border-slate-200 text-slate-900 shadow-xs'
    }`}>
      {/* Nivel 1: Barra Principal Superior (Identidad, CTA de Emergencia y Acceso) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo e Identidad del Proyecto */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-600 shadow-xs shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-slate-900">ALERTA CERCA</span>
              {isModerator ? (
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-600" /> Moderador CCE
                </span>
              ) : null}
            </div>
            <p className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                {isModerator && moderatorUser
                  ? `${moderatorUser.fullName} (${moderatorUser.entity})`
                  : 'Consejo Coordinador Empresarial de Lázaro Cárdenas'}
              </span>
            </p>
          </div>
        </div>

        {/* Acciones Rápidas Superiores: Ubicación, Sonido, CTA y Moderador */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Ubicación Actual */}
          <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
            gpsError 
              ? 'bg-red-50 border-red-200 text-red-700' 
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            ) : gpsError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            )}
            
            <span className="max-w-[140px] truncate" title={gpsError || activeLocationName}>
              {isLocating ? 'Buscando GPS...' : gpsError ? gpsError : activeLocationName}
            </span>
            {isRealGPS && !isLocating && !gpsError && <span className="text-[10px] text-slate-500 font-mono">(GPS)</span>}
          </div>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Activar sonido de alertas' : 'Silenciar sonido'}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-transform active:scale-[0.98] select-none cursor-pointer shrink-0"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
          </button>

          {/* Sincronizar en vivo con Supabase (para moderador) */}
          {isModerator && (
            <button
              type="button"
              onClick={handleSyncData}
              title="Sincronizar en vivo con Supabase"
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-800 transition-transform active:scale-[0.98] select-none cursor-pointer shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* CTA Dominante para reportar - Con ancho fijo flexible, nunca se deforma ni desfasa */}
          <Button
            variant="danger"
            size="md"
            onClick={onOpenReportModal}
            className="whitespace-nowrap px-4 py-2 shrink-0 font-bold text-xs sm:text-sm shadow-xs"
          >
            {isModerator ? 'Emitir Alerta Oficial' : 'Reportar Incidente'}
          </Button>

          {/* Botón arriba a la derecha: Iniciar Sesión Moderador o Cerrar Sesión */}
          {!isModerator ? (
            <button
              type="button"
              onClick={onOpenModeratorLogin}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-400 text-amber-900 text-xs font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer shrink-0"
              title="Acceso restringido para el Consejo Coordinador Empresarial"
            >
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>Moderador</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutModerator}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer shrink-0"
              title="Cerrar sesión de moderador"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          )}
        </div>
      </div>

      {/* Nivel 2: Barra de Pestañas Dedicada (Ubicada abajo con amplio espacio) */}
      <div className={`w-full border-t px-4 sm:px-6 transition-colors duration-200 ${
        isModSection ? 'bg-zinc-950/80 border-zinc-800' : 'bg-slate-50/90 border-slate-200'
      }`}>
        <div className="max-w-6xl mx-auto py-1.5 flex items-center justify-between gap-3 overflow-x-auto">
          <nav className="flex items-center gap-1.5 sm:gap-2">
            {/* Pestaña 1: Alertas */}
            <button
              type="button"
              onClick={() => onViewChange('citizen')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                currentView === 'citizen'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300 ring-1 ring-slate-200'
                  : isModSection
                  ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>Alertas Ciudadanas</span>
              {proximityCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white tabular-nums">
                  {proximityCount}
                </span>
              )}
            </button>

            {/* Pestaña 2: Mapa */}
            <button
              type="button"
              onClick={() => onViewChange('map')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                currentView === 'map'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300 ring-1 ring-slate-200'
                  : isModSection
                  ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Map className="w-4 h-4 text-blue-600" />
              <span>Mapa en Vivo</span>
            </button>

            {/* Pestañas exclusivas para Moderador */}
            {isModerator && (
              <>
                <button
                  type="button"
                  onClick={() => onViewChange('sos')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'sos'
                      ? 'bg-red-600/20 text-red-300 shadow-xs border border-red-500/60 font-bold ring-1 ring-red-500/30'
                      : isModSection
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Siren className="w-4 h-4 text-red-500" />
                  <span>Emergencias SOS</span>
                  {sosCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white tabular-nums animate-pulse">
                      {sosCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('command')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'command'
                      ? 'bg-amber-500/20 text-amber-300 shadow-xs border border-amber-500/50 font-bold ring-1 ring-amber-500/30'
                      : isModSection
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  <span>Base de Datos</span>
                </button>

                <button
                  type="button"
                  onClick={() => onViewChange('settings')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 select-none cursor-pointer shrink-0 ${
                    currentView === 'settings'
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700 ring-1 ring-zinc-600'
                      : isModSection
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Settings className="w-4 h-4 text-zinc-400" />
                  <span>Ajustes</span>
                </button>
              </>
            )}
          </nav>

          {/* Distintivo de conexión CCE en la barra de navegación */}
          <div className="hidden md:flex items-center gap-2 text-[11px] font-medium shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={isModSection ? 'text-zinc-400' : 'text-slate-500'}>
              Monitoreo Activo · Lázaro Cárdenas, Mich.
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
