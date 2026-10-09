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
    <div className={`w-full border-b text-xs sm:text-sm py-2.5 px-4 sm:px-6 lg:px-8 shadow-2xs transition-colors ${
      isAdminTheme ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700'
    }`}>
      <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Métricas en vivo */}
        <div className="flex items-center flex-wrap gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <span className={isAdminTheme ? 'text-zinc-400' : 'text-slate-600'}>En tu cercanía inmediata:</span>
            <span className={`font-bold text-sm tabular-nums ${isAdminTheme ? 'text-white' : 'text-slate-900'}`}>{inProximityCount}</span>
            <span className={isAdminTheme ? 'text-zinc-500' : 'text-slate-500'}>de {totalActiveCount} activas</span>
          </div>

          <div className={`hidden md:flex items-center gap-2 border-l pl-4 sm:pl-6 ${
            isAdminTheme ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'
          }`}>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Privacidad protegida: Cálculo perimetral local sin rastreo</span>
          </div>
        </div>
      </div>
    </div>
  );
};

