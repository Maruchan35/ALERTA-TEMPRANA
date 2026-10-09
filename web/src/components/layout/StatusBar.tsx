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
}) => {
  return (
    <div className="w-full border-b border-slate-200/70 bg-white/70 backdrop-blur-xs text-xs py-2 px-4 sm:px-6 lg:px-8 transition-colors text-slate-600">
      <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Métricas de perímetro en vivo */}
        <div className="flex items-center flex-wrap gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            <span className="text-slate-600">En perímetro inmediato:</span>
            <span className="font-semibold text-xs tabular-nums text-slate-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
              {inProximityCount}
            </span>
            <span className="text-slate-500 text-[11px]">de {totalActiveCount} registradas en el municipio</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 border-l border-slate-200 pl-4 sm:pl-6 text-slate-500 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Privacidad protegida: Cálculo perimetral local sin rastreo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
