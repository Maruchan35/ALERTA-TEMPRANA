import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { AlertCard } from './AlertCard';
import { 
  ShieldCheck, 
  Filter, 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  Flame, 
  ShieldAlert, 
  LayoutGrid
} from 'lucide-react';
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

  // Ordenar siempre las alertas por nivel de importancia y proximidad
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

  // Clasificación en 4 Columnas de más peligroso a menos peligroso:
  // Columna 1: Nivel 4 (Extremo / Crítico)
  const col1Level4 = displayedAlerts.filter((a) => a.level === 4 && a.status !== 'resuelta' && a.status !== 'descartada');
  
  // Columna 2: Nivel 3 (Alto)
  const col2Level3 = displayedAlerts.filter((a) => a.level === 3 && a.status !== 'resuelta' && a.status !== 'descartada');
  
  // Columna 3: Nivel 2 (Medio / Preventivo)
  const col3Level2 = displayedAlerts.filter((a) => a.level === 2 && a.status !== 'resuelta' && a.status !== 'descartada');
  
  // Columna 4: Nivel 1 & Resueltas (Bajo / Resueltas)
  const col4Level1AndResolved = displayedAlerts.filter(
    (a) => (a.level === 1 || a.level === undefined || a.status === 'resuelta' || a.status === 'descartada')
  );

  return (
    <div className="w-full space-y-5">
      {/* Barra Superior: Filtros y Selector de Pestañas */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-2xl border transition-colors shadow-2xs ${
        isAdminTheme ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
      }`}>
        <div className={`inline-flex rounded-xl p-1 border shadow-2xs ${
          isAdminTheme ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('nearby')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
              activeTab === 'nearby'
                ? 'bg-red-600 text-white shadow-xs'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
            <span>En mi cercanía</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] tabular-nums font-bold">
              {nearbyActiveAlerts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
              activeTab === 'all'
                ? isAdminTheme ? 'bg-amber-500 text-zinc-950 shadow-xs' : 'bg-slate-900 text-white shadow-xs'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Todo el Municipio</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums font-bold ${
              isAdminTheme ? 'bg-zinc-800 text-zinc-200' : 'bg-slate-200 text-slate-800'
            }`}>
              {activeAlertsAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
              activeTab === 'resolved'
                ? 'bg-emerald-700 text-white shadow-xs'
                : isAdminTheme
                ? 'text-zinc-400 hover:text-zinc-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
            <span>Resueltas</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums font-bold ${
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
            className={`text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer font-medium border transition-colors ${
              isAdminTheme
                ? 'bg-zinc-950 border-zinc-700 text-zinc-100'
                : 'bg-white border-slate-300 text-slate-800'
            }`}
          >
            <option value="all">Todas las categorías ({displayedAlerts.length})</option>
            {Object.values(CATEGORIAS_OFICIALES).map((cat) => (
              <option key={cat.clave} value={cat.clave}>
                {cat.icono} {cat.nombre_corto} (Nivel {cat.nivel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================
          MATRIZ DE 4 COLUMNAS SOBRIAS (MÁS PELIGROSO A MENOS PELIGROSO)
      ======================================================== */}
      <AnimatePresence mode="popLayout">
        {displayedAlerts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`p-10 text-center rounded-3xl border shadow-xs ${
              isAdminTheme ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3.5 ${
              isAdminTheme ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400' : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            }`}>
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold mb-1">
              {activeTab === 'nearby'
                ? 'Zona Segura: Sin emergencias activas en tu perímetro'
                : 'No se encontraron alertas en este criterio'}
            </h4>
            <p className={`text-xs max-w-md mx-auto ${isAdminTheme ? 'text-zinc-400' : 'text-slate-600'}`}>
              {activeTab === 'nearby'
                ? 'Las alertas comunitarias o validadas por el CCE dentro de tu radio aparecerán aquí en tiempo real.'
                : 'Puedes cambiar de pestaña o restablecer el filtro de categorías.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8 items-start animate-fade-in">
            {/* ========================================================
                COLUMNA 1: PELIGRO EXTREMO (NIVEL 4)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs ${
                isAdminTheme
                  ? 'bg-red-950/40 border-red-900/60'
                  : 'bg-red-50/90 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-red-600 text-white animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black text-red-900 uppercase tracking-tight">
                      1. Peligro Extremo
                    </h5>
                    <span className="text-[10px] text-red-700 font-semibold">Nivel 4</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                  {col1Level4.length}
                </span>
              </div>

              {col1Level4.length > 0 ? (
                <div className="space-y-4 sm:space-y-5">
                  {col1Level4.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onOpenSightingModal={onOpenSightingModal}
                      onSelectOnMap={onSelectOnMap}
                      isAdminTheme={isAdminTheme}
                    />
                  ))}
                </div>
              ) : (
                <div className={`p-4 rounded-xl border border-dashed text-center text-xs py-8 ${
                  isAdminTheme ? 'border-zinc-800 bg-zinc-950/40 text-zinc-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  Sin incidentes Nivel 4
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 2: PELIGRO ALTO (NIVEL 3)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs ${
                isAdminTheme
                  ? 'bg-orange-950/40 border-orange-900/60'
                  : 'bg-orange-50/90 border-orange-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-orange-500 text-white">
                    <Flame className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black text-orange-950 uppercase tracking-tight">
                      2. Peligro Alto
                    </h5>
                    <span className="text-[10px] text-orange-800 font-semibold">Nivel 3</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                  {col2Level3.length}
                </span>
              </div>

              {col2Level3.length > 0 ? (
                <div className="space-y-4 sm:space-y-5">
                  {col2Level3.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onOpenSightingModal={onOpenSightingModal}
                      onSelectOnMap={onSelectOnMap}
                      isAdminTheme={isAdminTheme}
                    />
                  ))}
                </div>
              ) : (
                <div className={`p-4 rounded-xl border border-dashed text-center text-xs py-8 ${
                  isAdminTheme ? 'border-zinc-800 bg-zinc-950/40 text-zinc-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  Sin incidentes Nivel 3
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 3: PELIGRO MEDIO (NIVEL 2)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs ${
                isAdminTheme
                  ? 'bg-yellow-950/40 border-yellow-900/60'
                  : 'bg-yellow-50/90 border-yellow-300'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-yellow-500 text-zinc-950 font-bold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black text-yellow-950 uppercase tracking-tight">
                      3. Peligro Medio
                    </h5>
                    <span className="text-[10px] text-yellow-800 font-semibold">Nivel 2</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-yellow-500 text-zinc-950 text-[10px] font-bold">
                  {col3Level2.length}
                </span>
              </div>

              {col3Level2.length > 0 ? (
                <div className="space-y-4 sm:space-y-5">
                  {col3Level2.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onOpenSightingModal={onOpenSightingModal}
                      onSelectOnMap={onSelectOnMap}
                      isAdminTheme={isAdminTheme}
                    />
                  ))}
                </div>
              ) : (
                <div className={`p-4 rounded-xl border border-dashed text-center text-xs py-8 ${
                  isAdminTheme ? 'border-zinc-800 bg-zinc-950/40 text-zinc-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  Sin incidentes Nivel 2
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 4: BAJO PELIGRO / RESUELTAS (NIVEL 1)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs ${
                isAdminTheme
                  ? 'bg-emerald-950/40 border-emerald-900/60'
                  : 'bg-emerald-50/90 border-emerald-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-emerald-600 text-white">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black text-emerald-950 uppercase tracking-tight">
                      4. Avisos / Resueltas
                    </h5>
                    <span className="text-[10px] text-emerald-800 font-semibold">Nivel 1</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  {col4Level1AndResolved.length}
                </span>
              </div>

              {col4Level1AndResolved.length > 0 ? (
                <div className="space-y-4 sm:space-y-5">
                  {col4Level1AndResolved.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onOpenSightingModal={onOpenSightingModal}
                      onSelectOnMap={onSelectOnMap}
                      isAdminTheme={isAdminTheme}
                    />
                  ))}
                </div>
              ) : (
                <div className={`p-4 rounded-xl border border-dashed text-center text-xs py-8 ${
                  isAdminTheme ? 'border-zinc-800 bg-zinc-950/40 text-zinc-500' : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  Sin avisos o resueltas
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
