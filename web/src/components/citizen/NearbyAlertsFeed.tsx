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
  const [activeTab, setActiveTab] = useState<TabType>('nearby');
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

  // Si está en 'nearby' pero no hay alertas dentro del radio y sí hay alertas en el municipio, mostrar todas
  const isAutoShowingAll = activeTab === 'nearby' && nearbyActiveAlerts.length === 0 && activeAlertsAll.length > 0;

  // Determinar lista base según pestaña
  const baseList =
    activeTab === 'nearby'
      ? (isAutoShowingAll ? activeAlertsAll : nearbyActiveAlerts)
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
  const col1Level4 = displayedAlerts.filter((a) => a.level === 4 && a.status !== 'resuelta' && a.status !== 'descartada');
  const col2Level3 = displayedAlerts.filter((a) => a.level === 3 && a.status !== 'resuelta' && a.status !== 'descartada');
  const col3Level2 = displayedAlerts.filter((a) => a.level === 2 && a.status !== 'resuelta' && a.status !== 'descartada');
  const col4Level1AndResolved = displayedAlerts.filter(
    (a) => (a.level === 1 || a.level === undefined || a.status === 'resuelta' || a.status === 'descartada')
  );

  return (
    <div className="w-full space-y-5">
      {/* Aviso contextual si se muestran todas las alertas del municipio */}
      {isAutoShowingAll && (
        <div className="px-4 py-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 text-xs">
            <span className="p-1 rounded-md bg-blue-100 text-blue-700 font-semibold shrink-0">
              📍 Municipio Completo
            </span>
            <span className="text-blue-800">
              Tu ubicación actual está fuera del radio inmediato de los incidentes. Mostrando <strong>todas las {activeAlertsAll.length} alertas ciudadanas e institucionales</strong> activas en Lázaro Cárdenas.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline shrink-0 cursor-pointer text-left"
          >
            Ver vista municipal
          </button>
        </div>
      )}

      {/* Barra Superior: Filtros y Selector de Pestañas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="inline-flex rounded-xl p-1 bg-slate-100/90 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveTab('nearby')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer active:scale-[0.98] ${
              activeTab === 'nearby'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-red-600 animate-pulse" />
            <span>En mi cercanía</span>
            <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
              {nearbyActiveAlerts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer active:scale-[0.98] ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
            <span>Todo el Municipio</span>
            <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
              {activeAlertsAll.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer active:scale-[0.98] ${
              activeTab === 'resolved'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Resueltas</span>
            <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-[0.98] border ${
              onlyCritical
                ? 'bg-red-50 text-red-700 border-red-300 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Mostrar únicamente incidentes Nivel 3 y 4 de alta prioridad"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${onlyCritical ? 'text-red-600' : 'text-slate-400'}`} />
            <span>Código Rojo</span>
          </button>

          {/* Botón Guía Preventiva */}
          <button
            type="button"
            onClick={() => setShowGuiaModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer select-none border bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-[0.98]"
            title="Consultar protocolos y recomendaciones de autoprotección ciudadana"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Guía Preventiva</span>
          </button>

          {/* Filtro por Categoría Oficial */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CategoriaAlerta | 'all')}
              className="text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer font-medium border border-slate-200 bg-white text-slate-800 transition-colors"
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
          MATRIZ DE 4 COLUMNAS EDITORIAL (MÁS PELIGROSO A MENOS PELIGROSO)
      ======================================================== */}
      <AnimatePresence mode="popLayout">
        {displayedAlerts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={`p-12 text-center rounded-2xl border shadow-xs ${
              isAdminTheme ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200/80 text-slate-900'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
              isAdminTheme ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400' : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold mb-1 tracking-tight">
              {activeTab === 'nearby'
                ? 'Perímetro Seguro: Sin incidentes activos en tu radio'
                : 'No se encontraron alertas para este criterio'}
            </h4>
            <p className={`text-xs max-w-md mx-auto ${isAdminTheme ? 'text-zinc-400' : 'text-slate-500'}`}>
              {activeTab === 'nearby'
                ? 'Las alertas comunitarias o validadas por el CCE dentro de tu radio aparecerán aquí en tiempo real.'
                : 'Puedes cambiar de pestaña o restablecer el filtro de categorías.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 xl:gap-6 items-start">
            {/* ========================================================
                COLUMNA 1: PELIGRO EXTREMO (NIVEL 4)
            ======================================================== */}
            <div className="flex flex-col space-y-3.5 min-w-0">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-white border-t-2 border-t-red-600 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200/60">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-semibold tracking-tight text-slate-900">
                      Peligro Extremo
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono">Nivel 4 · Crítica</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[11px] font-mono font-bold">
                  {col1Level4.length}
                </span>
              </div>

              {col1Level4.length > 0 ? (
                <div className="space-y-3.5">
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
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs py-7 text-slate-400">
                  Sin incidentes Nivel 4
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 2: PELIGRO ALTO (NIVEL 3)
            ======================================================== */}
            <div className="flex flex-col space-y-3.5 min-w-0">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-white border-t-2 border-t-amber-500 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/60">
                    <Flame className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-semibold tracking-tight text-slate-900">
                      Prioridad Alta
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono">Nivel 3</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-mono font-bold">
                  {col2Level3.length}
                </span>
              </div>

              {col2Level3.length > 0 ? (
                <div className="space-y-3.5">
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
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs py-7 text-slate-400">
                  Sin incidentes Nivel 3
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 3: PELIGRO MEDIO (NIVEL 2)
            ======================================================== */}
            <div className="flex flex-col space-y-3.5 min-w-0">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-white border-t-2 border-t-sky-500 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/60">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-semibold tracking-tight text-slate-900">
                      Preventiva
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono">Nivel 2</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-mono font-bold">
                  {col3Level2.length}
                </span>
              </div>

              {col3Level2.length > 0 ? (
                <div className="space-y-3.5">
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
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs py-7 text-slate-400">
                  Sin incidentes Nivel 2
                </div>
              )}
            </div>

            {/* ========================================================
                COLUMNA 4: BAJO PELIGRO / RESUELTAS (NIVEL 1)
            ======================================================== */}
            <div className="flex flex-col space-y-3.5 min-w-0">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-white border-t-2 border-t-slate-400 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-semibold tracking-tight text-slate-900">
                      Avisos y Resueltas
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono">Nivel 1 / Concluidas</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-mono font-bold">
                  {col4Level1AndResolved.length}
                </span>
              </div>

              {col4Level1AndResolved.length > 0 ? (
                <div className="space-y-3.5">
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
                <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs py-7 text-slate-400">
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
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden text-slate-900">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                    Guía de Autoprotección Comunitaria
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Protocolos del CCE y corporaciones de auxilio de Lázaro Cárdenas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuiaModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  <span>1. Menor o Persona Extraviada (Alerta AMBER / Código Rojo)</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  <strong>NO esperes 24 ni 72 horas</strong>: Las primeras 3 horas son fundamentales. Llama al 911 de inmediato, solicita la ficha de búsqueda y comparte en Alerta Cerca una fotografía clara y vestimenta reciente. Si ves a la persona, presiona "Lo he visto" y aporta señas en el sistema.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  <span>2. Fugas de Gas o Riesgos Químicos / Industriales</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Evacúa en sentido contrario al viento. <strong>No enciendas luces, interruptores ni cerillos</strong>. Cierra la llave de paso si es seguro hacerlo. Llama a Bomberos Municipales (753-532-1925) y advierte a vecinos contiguos.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                  <span>3. Asalto o Hecho Violento en Vía Pública</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Prioriza tu vida sobre cualquier bien material. No confrontes a personas armadas. Tras ponerte a salvo, memoriza la ruta de escape, tipo de vehículo o señas físicas y activa la alerta ciudadana para advertir a los comercios y transeúntes del cuadrante.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                  <span>4. Robo Vehicular y Salidas de la Ciudad</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Reporta placas, color y modelo de inmediato. El Centro de Mando activará la geocerca de 10 a 25 km que abarca los filtros carreteros de salida a la autopista Siglo XXI, acceso a La Mira y puentes limítrofes con Guerrero.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>5. Urgencias Médicas y Primeros Auxilios</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  No muevas a personas lesionadas de la columna o cuello a menos que haya riesgo inminente de explosión o atropellamiento. Despeja el área y solicita ambulancia de Cruz Roja (753-537-2244) o CRUM.
                </p>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 font-medium">Consejo Coordinador Empresarial (CCE)</span>
              <button
                type="button"
                onClick={() => setShowGuiaModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer transition-all active:scale-[0.98]"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
