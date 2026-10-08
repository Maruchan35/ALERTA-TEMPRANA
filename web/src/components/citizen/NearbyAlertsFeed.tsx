import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { AlertCard } from './AlertCard';
import { ShieldCheck, Filter, Radio, CheckCircle2 } from 'lucide-react';
import { CategoriaAlerta, CATEGORIAS_OFICIALES } from '../../types/alert';

interface NearbyAlertsFeedProps {
  nearbyActiveAlerts: AlertWithDistance[];
  allAlerts: AlertWithDistance[];
  nearbyResolvedAlerts: AlertWithDistance[];
  onOpenSightingModal: (alert: AlertWithDistance) => void;
  onSelectOnMap?: (alertId: string) => void;
  isAdminTheme?: boolean;
}

type TabType = 'nearby' | 'all' | 'resolved';

export const NearbyAlertsFeed: React.FC<NearbyAlertsFeedProps> = ({
  nearbyActiveAlerts,
  allAlerts,
  nearbyResolvedAlerts,
  onOpenSightingModal,
  onSelectOnMap,
  isAdminTheme = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('nearby');
  const [selectedCategory, setSelectedCategory] = useState<CategoriaAlerta | 'all'>('all');

  // Ordenar siempre las alertas por NIVEL DE IMPORTANCIA primero (4 > 3 > 2 > 1)
  const activeAlertsAll = allAlerts
    .filter((a) => a.status !== 'resuelta' && a.status !== 'descartada' && a.status !== 'expirada')
    .sort((a, b) => {
      if (b.level !== a.level) {
        return b.level - a.level;
      }
      return a.distanceKm - b.distanceKm;
    });

  const resolvedAlerts = nearbyResolvedAlerts.length > 0 ? nearbyResolvedAlerts : allAlerts.filter((a) => a.status === 'resuelta');

  // Determinar lista base según pestaña
  const baseList =
    activeTab === 'nearby'
      ? nearbyActiveAlerts
      : activeTab === 'all'
      ? activeAlertsAll
      : resolvedAlerts;

  // Filtrado opcional por categoría
  const displayedAlerts = selectedCategory === 'all'
    ? baseList
    : baseList.filter((a) => a.category === selectedCategory);

  return (
    <div className="w-full space-y-4">
      {/* Selector de Pestañas de Filtrado */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-xl border transition-colors ${
        isAdminTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-100 border-slate-200'
      }`}>
        <div className={`inline-flex rounded-lg p-1 border shadow-2xs ${
          isAdminTheme ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('nearby')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
              activeTab === 'nearby'
                ? 'bg-red-600 text-white shadow-xs'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
            <span>En mi cercanía</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[11px] tabular-nums font-bold">
              {nearbyActiveAlerts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
              activeTab === 'all'
                ? isAdminTheme ? 'bg-amber-500 text-zinc-950 font-bold shadow-xs' : 'bg-slate-800 text-white shadow-xs'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Todas en Lázaro Cárdenas</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[11px] tabular-nums font-bold ${
              isAdminTheme ? 'bg-zinc-800 text-zinc-200' : 'bg-slate-200 text-slate-800'
            }`}>
              {activeAlertsAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
              activeTab === 'resolved'
                ? 'bg-emerald-700 text-white shadow-xs font-bold'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
            <span>Resueltas</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[11px] tabular-nums font-bold ${
              isAdminTheme ? 'bg-zinc-800 text-zinc-200' : 'bg-slate-200 text-slate-800'
            }`}>
              {resolvedAlerts.length}
            </span>
          </button>
        </div>

        {/* Filtro por Categoría Oficial */}
        <div className="flex items-center gap-2 px-2">
          <Filter className={`w-3.5 h-3.5 ${isAdminTheme ? 'text-zinc-400' : 'text-slate-500'}`} />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as CategoriaAlerta | 'all')}
            className={`text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs font-medium border ${
              isAdminTheme
                ? 'bg-zinc-950 border-zinc-700 text-zinc-100'
                : 'bg-white border-slate-300 text-slate-800'
            }`}
          >
            <option value="all">Todas las 12 categorías</option>
            {Object.values(CATEGORIAS_OFICIALES).map((cat) => (
              <option key={cat.clave} value={cat.clave}>
                {cat.icono} {cat.nombre_corto} (Nivel {cat.nivel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Alertas */}
      <AnimatePresence mode="popLayout">
        {displayedAlerts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`p-8 text-center rounded-xl border shadow-xs ${
              isAdminTheme ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
              isAdminTheme ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400' : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold mb-1">
              {activeTab === 'nearby'
                ? 'Zona Segura: No hay emergencias activas en tu radio de proximidad'
                : 'No se encontraron alertas registradas en esta vista'}
            </h4>
            <p className={`text-xs max-w-md mx-auto ${isAdminTheme ? 'text-zinc-400' : 'text-slate-600'}`}>
              {activeTab === 'nearby'
                ? 'Las alertas emitidas por la comunidad o validadas por el CCE dentro de tu perímetro aparecerán de forma inmediata en tiempo real.'
                : 'Puedes cambiar de pestaña a "Todas en Lázaro Cárdenas" o restablecer el filtro de categorías.'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {displayedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onOpenSightingModal={onOpenSightingModal}
                onSelectOnMap={onSelectOnMap}
                isAdminTheme={isAdminTheme}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
