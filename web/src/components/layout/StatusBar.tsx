import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface StatusBarProps {
  totalActiveCount: number;
  inProximityCount: number;
  isAdminTheme?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  totalActiveCount,
  inProximityCount,
  isAdminTheme = false,
}) => {
  return (
    <div className={`w-full border-b text-xs py-2 px-4 sm:px-6 shadow-2xs transition-colors ${
      isAdminTheme ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700'
    }`}>
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Métricas en vivo */}
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className={isAdminTheme ? 'text-zinc-400' : 'text-slate-600'}>En tu cercanía inmediata:</span>
            <span className={`font-bold tabular-nums ${isAdminTheme ? 'text-white' : 'text-slate-900'}`}>{inProximityCount}</span>
            <span className={isAdminTheme ? 'text-zinc-500' : 'text-slate-500'}>de {totalActiveCount} activas</span>
          </div>

          <div className={`hidden md:flex items-center gap-1.5 border-l pl-4 ${
            isAdminTheme ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'
          }`}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Privacidad protegida: Cálculo perimetral local sin rastreo</span>
          </div>
        </div>
      </div>
    </div>
  );
};

