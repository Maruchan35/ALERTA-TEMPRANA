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
  LayoutGrid,
  LifeBuoy,
  X,
  BookOpen
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
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoriaAlerta | 'all'>('all');
  const [onlyCritical, setOnlyCritical] = useState<boolean>(false);
  const [showGuiaModal, setShowGuiaModal] = useState<boolean>(false);

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

  // Filtrado opcional por categoría y nivel crítico
  let displayedAlerts = selectedCategory === 'all'
    ? baseList
    : baseList.filter((a) => a.category === selectedCategory);

  if (onlyCritical) {
    displayedAlerts = displayedAlerts.filter((a) => a.level >= 3);
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-2xl border border-slate-200 bg-white transition-colors shadow-2xs">
        <div className="inline-flex rounded-xl p-1 border border-slate-200 bg-slate-50 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('nearby')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
              activeTab === 'nearby'
                ? 'bg-red-600 text-white shadow-xs'
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
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Todo el Municipio</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums font-bold bg-slate-200 text-slate-800">
              {activeAlertsAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all select-none cursor-pointer ${
              activeTab === 'resolved'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
            <span>Resueltas</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums font-bold bg-slate-200 text-slate-800">
              {resolvedAlerts.length}
            </span>
          </button>
        </div>

        {/* Controles de Filtro Rápido */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Solo Código Rojo */}
          <button
            type="button"
            onClick={() => setOnlyCritical(!onlyCritical)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none border ${
              onlyCritical
                ? 'bg-red-600 text-white border-red-600 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Mostrar únicamente incidentes Nivel 3 y 4 de alta prioridad"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${onlyCritical ? 'text-white' : 'text-red-600'}`} />
            <span>Código Rojo</span>
          </button>

          {/* Botón Guía Preventiva */}
          <button
            type="button"
            onClick={() => setShowGuiaModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
            title="Consultar protocolos y recomendaciones de autoprotección ciudadana"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Guía Preventiva</span>
          </button>

          {/* Filtro por Categoría Oficial */}
          <div className="flex items-center gap-1.5 px-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CategoriaAlerta | 'all')}
              className="text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer font-medium border border-slate-300 bg-white text-slate-800 transition-colors"
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
              <div className="p-3 rounded-xl border border-red-700 bg-red-600 text-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-black/20 text-white animate-pulse">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide text-white">
                      1. Peligro Extremo
                    </h5>
                    <span className="text-[10px] text-red-100 font-bold">Nivel 4</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white text-red-700 text-[11px] font-black shadow-xs">
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
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs py-8 text-slate-400 font-medium">
                  Sin incidentes Nivel 4
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 2: PELIGRO ALTO (NIVEL 3)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className="p-3 rounded-xl border border-orange-600 bg-orange-500 text-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-black/20 text-white">
                    <Flame className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide text-white">
                      2. Peligro Alto
                    </h5>
                    <span className="text-[10px] text-orange-100 font-bold">Nivel 3</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white text-orange-600 text-[11px] font-black shadow-xs">
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
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs py-8 text-slate-400 font-medium">
                  Sin incidentes Nivel 3
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 3: PELIGRO MEDIO (NIVEL 2)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className="p-3 rounded-xl border border-amber-600 bg-amber-500 text-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-black/20 text-white">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide text-white">
                      3. Peligro Medio
                    </h5>
                    <span className="text-[10px] text-amber-100 font-bold">Nivel 2</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white text-amber-800 text-[11px] font-black shadow-xs">
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
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs py-8 text-slate-400 font-medium">
                  Sin incidentes Nivel 2
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 4: BAJO PELIGRO / RESUELTAS (NIVEL 1)
            ======================================================== */}
            <div className="flex flex-col space-y-4 min-w-0">
              <div className="p-3 rounded-xl border border-emerald-700 bg-emerald-600 text-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-black/20 text-white">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide text-white">
                      4. Avisos / Resueltas
                    </h5>
                    <span className="text-[10px] text-emerald-100 font-bold">Nivel 1</span>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white text-emerald-700 text-[11px] font-black shadow-xs">
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
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs py-8 text-slate-400 font-medium">
                  Sin avisos o resueltas
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL: GUÍA DE AUTOPROTECCIÓN VECINAL & PROTOCOLOS CCE
      ======================================================== */}
      {showGuiaModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Guía de Autoprotección Comunitaria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Protocolos recomendados por el CCE y corporaciones de auxilio de Lázaro Cárdenas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuiaModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/60 space-y-1">
                <div className="font-bold text-red-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  <span>1. Menor o Persona Extraviada (Alerta AMBER / Código Rojo)</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  <strong>NO esperes 24 ni 72 horas</strong>: Las primeras 3 horas son fundamentales. Llama al 911 de inmediato, solicita la ficha de búsqueda y comparte en Alerta Cerca una fotografía clara y vestimenta reciente. Si ves a la persona, presiona "Lo he visto" y aporta señas en el sistema.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1">
                <div className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  <span>2. Fugas de Gas o Riesgos Químicos / Industriales</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  Evacúa en sentido contrario al viento. <strong>No enciendas luces, interruptores ni cerillos</strong>. Cierra la llave de paso si es seguro hacerlo. Llama a Bomberos Municipales (753-532-1925) y advierte a vecinos contiguos.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/60 space-y-1">
                <div className="font-bold text-orange-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-600" />
                  <span>3. Asalto o Hecho Violento en Vía Pública</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  Prioriza tu vida sobre cualquier bien material. No confrontes a personas armadas. Tras ponerte a salvo, memoriza la ruta de escape, tipo de vehículo o señas físicas y activa la alerta ciudadana para advertir a los comercios y transeúntes del cuadrante.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 space-y-1">
                <div className="font-bold text-blue-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>4. Robo Vehicular y Salidas de la Ciudad</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  Reporta placas, color y modelo de inmediato. El Centro de Mando activará la geocerca de 10 a 25 km que abarca los filtros carreteros de salida a la autopista Siglo XXI, acceso a La Mira y puentes limítrofes con Guerrero.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-1">
                <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>5. Urgencias Médicas y Primeros Auxilios</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  No muevas a personas lesionadas de la columna o cuello a menos que haya riesgo inminente de explosión o atropellamiento. Despeja el área y solicita ambulancia de Cruz Roja (753-537-2244) o CRUM.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 font-semibold">Consejo Coordinador Empresarial (CCE)</span>
              <button
                type="button"
                onClick={() => setShowGuiaModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
