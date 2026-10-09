import React, { useState, useEffect } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { CategoryBadge, StatusBadge, LevelBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { archiveService, CarpetaInvestigacion } from '../../services/archiveService';
import { 
  ShieldCheck, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  Search,
  Radio,
  Sliders,
  Eye,
  FolderArchive,
  Copy,
  Download,
  ExternalLink,
  X,
  AlertTriangle,
  Check,
  Image as ImageIcon
} from 'lucide-react';

interface OperationsDashboardProps {
  alerts: AlertWithDistance[];
  onSelectOnMap?: (alertId: string) => void;
}

// Presets tácticos de radio con justificación operativa para Lázaro Cárdenas
const TACTICAL_RADIUS_PRESETS = [
  { meters: 1000, km: '1.0 km', label: 'Micro-cuadrante Barrial', desc: 'Disturbio menor, calle cerrada, riña o auxilio vecinal' },
  { meters: 2500, km: '2.5 km', label: 'Sector Urbano Inmediato', desc: 'Robo a comercio, fuga de gas o siniestro en colonia' },
  { meters: 5000, km: '5.0 km', label: 'Distrito / Media Ciudad', desc: 'Robo vehicular reciente o persona vulnerable desorientada' },
  { meters: 10000, km: '10.0 km', label: 'Zona Conurbada / Periférico', desc: 'Búsqueda activa, persecución y vías de escape de Lázaro Cárdenas' },
  { meters: 25000, km: '25.0 km', label: 'Municipio Completo y Salidas', desc: 'Código Rojo, Alerta AMBER / menor desaparecido y filtros carreteros' },
];

export const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  alerts,
  onSelectOnMap,
}) => {
  // Pestaña principal: Alertas Activas en Vivo vs. Carpetas de Investigación (Expedientes Forenses)
  const [activeTab, setActiveTab] = useState<'live' | 'archive'>('live');

  // Filtros y Búsqueda en vivo
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pendientes' | 'verificadas' | 'resueltas'>('all');

  // Estados de Modales y Selección Interactiva
  const [selectedAlertForDetail, setSelectedAlertForDetail] = useState<AlertWithDistance | null>(null);
  const [selectedAlertForRadius, setSelectedAlertForRadius] = useState<AlertWithDistance | null>(null);
  const [targetRadiusMeters, setTargetRadiusMeters] = useState<number>(1000);
  const [selectedAlertToResolve, setSelectedAlertToResolve] = useState<AlertWithDistance | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Carpetas de Investigación Archivadas
  const [carpetas, setCarpetas] = useState<CarpetaInvestigacion[]>(() => archiveService.listarCarpetas());
  const [archiveSearchTerm, setArchiveSearchTerm] = useState('');
  const [selectedCarpetaForDetail, setSelectedCarpetaForDetail] = useState<CarpetaInvestigacion | null>(null);

  // Mensaje flotante de notificación (Toast)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Suscripción en vivo al servicio de archivo forense
  useEffect(() => {
    const unsubscribe = archiveService.subscribe((updatedCarpetas) => {
      setCarpetas(updatedCarpetas);
    });
    return () => unsubscribe();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Filtrado de alertas activas
  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (alert.folio911 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (alert.coordinates.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'pendientes') {
      return alert.status === 'pendiente' || alert.status === 'no_confirmada';
    }
    if (filterStatus === 'verificadas') {
      return alert.status === 'verificada' || alert.status === 'corroborada';
    }
    if (filterStatus === 'resueltas') {
      return alert.status === 'resuelta';
    }
    return true;
  });

  // Filtrado de carpetas archivadas
  const filteredCarpetas = carpetas.filter((c) => {
    const term = archiveSearchTerm.toLowerCase();
    return (
      c.idCarpeta.toLowerCase().includes(term) ||
      c.folioAlerta.toLowerCase().includes(term) ||
      (c.folio911 || '').toLowerCase().includes(term) ||
      c.titulo.toLowerCase().includes(term) ||
      c.categoria.toLowerCase().includes(term) ||
      c.coordenadas.direccion.toLowerCase().includes(term) ||
      c.motivoCierre.toLowerCase().includes(term) ||
      c.hashIntegridad.toLowerCase().includes(term)
    );
  });

  // Validar Alerta oficialmente como CCE
  const handleVerify = async (alertId: string) => {
    setIsProcessing(alertId);
    try {
      await alertService.verifyAlert(alertId, 'Consejo Coordinador Empresarial (CCE)');
      audioAlert.playInfoAlert();
      showToast('✅ Alerta verificada oficialmente como CCE / Protección Civil');
      if (selectedAlertForDetail && selectedAlertForDetail.id === alertId) {
        setSelectedAlertForDetail({ ...selectedAlertForDetail, status: 'verificada', verifiedBy: 'Consejo Coordinador Empresarial (CCE)' });
      }
    } finally {
      setIsProcessing(null);
    }
  };

  // Abrir Modal de Configuración de Radio
  const handleOpenRadiusModal = (alert: AlertWithDistance) => {
    setSelectedAlertForRadius(alert);
    setTargetRadiusMeters(alert.currentRadiusMeters || 1000);
  };

  // Confirmar y aplicar nuevo radio territorial
  const handleSaveRadius = async () => {
    if (!selectedAlertForRadius) return;
    setIsProcessing(selectedAlertForRadius.id);
    try {
      await alertService.adjustRadius(selectedAlertForRadius.id, targetRadiusMeters);
      audioAlert.playInfoAlert();
      showToast(`🎯 Radio geográfico actualizado a ${(targetRadiusMeters / 1000).toFixed(1)} km`);
      if (selectedAlertForDetail && selectedAlertForDetail.id === selectedAlertForRadius.id) {
        setSelectedAlertForDetail({
          ...selectedAlertForDetail,
          currentRadiusMeters: targetRadiusMeters,
          currentRadiusKm: Number((targetRadiusMeters / 1000).toFixed(1)),
          manualRadiusMeters: targetRadiusMeters,
        });
      }
      setSelectedAlertForRadius(null);
    } finally {
      setIsProcessing(null);
    }
  };

  // Restablecer radio al Protocolo Adaptativo Automático (ej. 1000m iniciales y expansión dinámica)
  const handleResetToAdaptive = async () => {
    if (!selectedAlertForRadius) return;
    setIsProcessing(selectedAlertForRadius.id);
    try {
      // Reajustar a 1000m base
      await alertService.adjustRadius(selectedAlertForRadius.id, 1000);
      showToast('🔄 Protocolo Adaptativo reactivado para la alerta.');
      setSelectedAlertForRadius(null);
    } finally {
      setIsProcessing(null);
    }
  };

  // Abrir Modal de Cierre / Resolución
  const handleOpenResolve = (alert: AlertWithDistance) => {
    setSelectedAlertToResolve(alert);
    setResolutionNote(
      alert.category === 'menor_desaparecido'
        ? 'Menor localizado con bien gracias a la colaboración comunitaria y autoridades.'
        : alert.category === 'robo_vehiculo'
        ? 'Vehículo asegurado por autoridades en punto de control carretero.'
        : 'Situación atendida y controlada en su totalidad por personal operativo del CCE.'
    );
  };

  // Confirmar resolución y archivado forense
  const handleConfirmResolve = async () => {
    if (!selectedAlertToResolve) return;
    setIsProcessing(selectedAlertToResolve.id);
    try {
      await alertService.resolveAlert(selectedAlertToResolve.id, resolutionNote.trim());
      audioAlert.playResolvedChime();
      showToast('📁 Incidente resuelto y archivado en Carpeta de Investigación');
      if (selectedAlertForDetail && selectedAlertForDetail.id === selectedAlertToResolve.id) {
        setSelectedAlertForDetail({
          ...selectedAlertForDetail,
          status: 'resuelta',
          closedAt: new Date().toISOString(),
        });
      }
      setSelectedAlertToResolve(null);
    } finally {
      setIsProcessing(null);
    }
  };

  // Descartar reporte falso o duplicado
  const handleCancelAlert = async (alertId: string) => {
    if (window.confirm('¿Desestimar reporte como falsa alarma o reporte duplicado? Se archivará con fines de registro forense.')) {
      setIsProcessing(alertId);
      try {
        await alertService.discardAlert(alertId, 'Reporte desestimado tras verificación operativa en campo.');
        showToast('📁 Alerta descartada y resguardada en Carpeta de Investigación');
        if (selectedAlertForDetail && selectedAlertForDetail.id === alertId) {
          setSelectedAlertForDetail(null);
        }
      } finally {
        setIsProcessing(null);
      }
    }
  };

  // Copiar Ficha Oficial para Ministerio Público / 911 al portapapeles
  const handleCopyForOficio = (c: CarpetaInvestigacion) => {
    const texto = archiveService.formatearParaOficio(c);
    navigator.clipboard.writeText(texto);
    showToast(`📋 Ficha oficial para MP / 911 copiada (Expediente: ${c.idCarpeta})`);
  };

  // Descargar todas las carpetas a JSON
  const handleDownloadArchiveJSON = () => {
    archiveService.descargarTodasJSON();
    showToast('💾 Descarga iniciada: Base de datos forense completa en formato JSON');
  };

  return (
    <div className="w-full space-y-4">
      {/* Toast Flotante de Notificación */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 text-white border border-amber-500/70 shadow-2xl animate-fade-in text-xs font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-zinc-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Encabezado del Centro de Mando */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm text-zinc-100">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Centro de Operaciones y Base de Datos CCE
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Supervisión de incidentes territoriales, control operativo de radio geográfico y resguardo de Carpetas de Investigación forenses para Lázaro Cárdenas, Michoacán.
            </p>
          </div>

          {/* Estadísticas rápidas */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3 py-2 rounded-xl bg-zinc-800/80 border border-zinc-700 text-right">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">Activas</span>
              <span className="text-base font-bold text-white tabular-nums">
                {alerts.filter((a) => a.status !== 'resuelta' && a.status !== 'descartada').length}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-800/60 text-right">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-semibold">Por Validar</span>
              <span className="text-base font-bold text-amber-300 tabular-nums">
                {alerts.filter((a) => a.status === 'pendiente' || a.status === 'no_confirmada').length}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-purple-950/40 border border-purple-800/60 text-right">
              <span className="text-[10px] text-purple-400 uppercase tracking-wider block font-semibold">Expedientes MP</span>
              <span className="text-base font-bold text-purple-300 tabular-nums">
                {carpetas.length}
              </span>
            </div>
          </div>
        </div>

        {/* Selector de Pestañas: Operaciones en Vivo vs. Carpetas de Investigación */}
        <div className="mt-5 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'live'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Incidentes Operativos Activos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-900/40 font-mono">
                {alerts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('archive')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'archive'
                  ? 'bg-purple-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>📁 Carpetas de Investigación (Expedientes)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950/80 text-purple-200 border border-purple-700/50 font-mono font-bold">
                {carpetas.length}
              </span>
            </button>
          </div>

          {activeTab === 'archive' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadArchiveJSON}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Descargar base de datos forense completa en formato JSON"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Exportar JSON Forense</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          VISTA 1: INCIDENTES OPERATIVOS ACTIVOS (TABLA DE ALTA DENSIDAD)
      ======================================================== */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          {/* Filtros de la tabla en vivo */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por folio, 911, delito, calle, descripción..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'pendientes', label: 'Por Validar' },
                { id: 'verificadas', label: 'Verificadas CCE' },
                { id: 'resueltas', label: 'Resueltas' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterStatus(f.id as typeof filterStatus)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all select-none cursor-pointer ${
                    filterStatus === f.id
                      ? 'bg-amber-500 text-zinc-950 font-bold shadow-xs'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de Incidentes */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-800/90 text-zinc-300 border-b border-zinc-700 sticky top-0 z-10 select-none">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Folio / Incidente</th>
                    <th className="py-3 px-3 font-semibold">Categoría & Nivel</th>
                    <th className="py-3 px-3 font-semibold">Ubicación (Lázaro Cárdenas)</th>
                    <th className="py-3 px-3 font-semibold text-right tabular-nums">Radio de Geocerca</th>
                    <th className="py-3 px-3 font-semibold text-right tabular-nums">Comunidad</th>
                    <th className="py-3 px-4 font-semibold text-right">Acciones Operativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-200">
                  {filteredAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">
                        No hay incidentes que coincidan con los criterios de búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.map((alert) => {
                      const isResolved = alert.status === 'resuelta';
                      const isDiscarded = alert.status === 'descartada';
                      const isPending = alert.status === 'pendiente' || alert.status === 'no_confirmada';

                      return (
                        <tr
                          key={alert.id}
                          onClick={() => setSelectedAlertForDetail(alert)}
                          className={`hover:bg-zinc-800/70 transition-colors cursor-pointer group ${
                            isPending ? 'bg-amber-950/15' : ''
                          }`}
                        >
                          {/* Folio y Título */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] font-semibold text-zinc-400 group-hover:text-amber-400 transition-colors">
                                {alert.folio}
                              </span>
                              {alert.folio911 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800 font-mono font-bold">
                                  911: {alert.folio911}
                                </span>
                              )}
                              {alert.photoUrl && (
                                <span className="px-1 py-0.5 rounded text-[9px] bg-blue-950/80 text-blue-300 border border-blue-800/60 font-semibold flex items-center gap-0.5" title="Foto adjunta disponible">
                                  <ImageIcon className="w-2.5 h-2.5" />
                                  <span>Foto</span>
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-white mt-0.5 max-w-xs truncate group-hover:underline" title={alert.title}>
                              {alert.title}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              <span>{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-amber-400/90 text-[10px] font-semibold flex items-center gap-0.5">
                                <Eye className="w-2.5 h-2.5" /> Clic para ficha emergente
                              </span>
                            </div>
                          </td>

                          {/* Categoría y Nivel */}
                          <td className="py-3 px-3 space-y-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <CategoryBadge category={alert.category} />
                              <LevelBadge level={alert.level} />
                            </div>
                            <div>
                              <StatusBadge status={alert.status} verifiedBy={alert.verifiedBy} />
                            </div>
                          </td>

                          {/* Ubicación */}
                          <td className="py-3 px-3 max-w-xs">
                            <div className="flex items-start gap-1 text-zinc-200">
                              <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <span className="truncate" title={alert.coordinates.address}>
                                {alert.coordinates.address || `${alert.coordinates.lat.toFixed(4)}, ${alert.coordinates.lng.toFixed(4)}`}
                              </span>
                            </div>
                            {alert.coordinates.referencePoint && (
                              <div className="text-[11px] text-zinc-400 truncate pl-4.5">
                                {alert.coordinates.referencePoint}
                              </div>
                            )}
                          </td>

                          {/* Radio de Cobertura con acceso directo al configurador */}
                          <td className="py-3 px-3 text-right tabular-nums">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenRadiusModal(alert);
                              }}
                              className="font-bold text-zinc-100 hover:text-amber-400 flex items-center justify-end gap-1 ml-auto group/radio cursor-pointer"
                              title="Clic para configurar radio territorial"
                            >
                              <Radio className="w-3 h-3 text-blue-400 group-hover/radio:animate-pulse" />
                              <span>{alert.currentRadiusKm.toFixed(1)} km</span>
                              <Sliders className="w-3 h-3 text-zinc-500 opacity-0 group-hover/radio:opacity-100 transition-opacity" />
                            </button>
                            <div className="text-[10px] text-zinc-400">
                              ({alert.currentRadiusMeters.toLocaleString()} m)
                            </div>
                          </td>

                          {/* Confirmaciones y Apoyos */}
                          <td className="py-3 px-3 text-right tabular-nums">
                            <div className="font-semibold text-emerald-400">
                              {alert.confirmedCount} confirmaciones
                            </div>
                            {alert.disputeCount > 0 && (
                              <div className="text-[10px] text-amber-400 font-semibold">
                                {alert.disputeCount} objeciones
                              </div>
                            )}
                          </td>

                          {/* Acciones de Operación */}
                          <td className="py-3 px-4 text-right">
                            <div
                              className="flex items-center justify-end gap-1.5 flex-wrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Botón Ver Ficha Emergente */}
                              <button
                                type="button"
                                onClick={() => setSelectedAlertForDetail(alert)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                                title="Ver ficha técnica completa y fotografía"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                              </button>

                              {/* Botón Ver en Mapa */}
                              {onSelectOnMap && (
                                <button
                                  type="button"
                                  onClick={() => onSelectOnMap(alert.id)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                                  title="Centrar en el mapa radar"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                </button>
                              )}

                              {/* Botón Aprobar Verificación Oficial (CCE) */}
                              {isPending && !isResolved && !isDiscarded && (
                                <button
                                  type="button"
                                  disabled={isProcessing === alert.id}
                                  onClick={() => handleVerify(alert.id)}
                                  className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 text-emerald-200 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                  title="Validar oficialmente como CCE / Protección Civil"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Validar</span>
                                </button>
                              )}

                              {/* Botón Configurar Radio */}
                              {!isResolved && !isDiscarded && (
                                <button
                                  type="button"
                                  disabled={isProcessing === alert.id}
                                  onClick={() => handleOpenRadiusModal(alert)}
                                  className="px-2 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-700 text-blue-200 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                  title="Configurar radio geográfico de cobertura"
                                >
                                  <Sliders className="w-3 h-3 text-blue-400" />
                                  <span>Radio</span>
                                </button>
                              )}

                              {/* Botón Resolver Incidente */}
                              {!isResolved && !isDiscarded ? (
                                <button
                                  type="button"
                                  disabled={isProcessing === alert.id}
                                  onClick={() => handleOpenResolve(alert)}
                                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                  title="Resolver y archivar en carpeta de investigación"
                                >
                                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                                  <span>Resolver</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-semibold px-2 py-1 bg-zinc-800 rounded border border-zinc-700">
                                  {isResolved ? 'Resuelta' : 'Descartada'}
                                </span>
                              )}

                              {/* Botón Cancelar / Desestimar */}
                              {isPending && !isResolved && !isDiscarded && (
                                <button
                                  type="button"
                                  disabled={isProcessing === alert.id}
                                  onClick={() => handleCancelAlert(alert.id)}
                                  className="p-1 rounded text-zinc-500 hover:text-red-400 cursor-pointer disabled:opacity-50"
                                  title="Desestimar alerta como reporte falso"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          VISTA 2: CARPETAS DE INVESTIGACIÓN (EXPEDIENTES FORENSES ARCHIVADOS)
      ======================================================== */}
      {activeTab === 'archive' && (
        <div className="space-y-4">
          {/* Banner explicativo para colaboración con Fiscalía / Policía */}
          <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/70 text-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-purple-900/60 border border-purple-700 text-purple-300 shrink-0">
                <FolderArchive className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-purple-100">
                  Archivo Forense y Cadena de Custodia Digital
                </h3>
                <p className="text-xs text-purple-300 mt-0.5">
                  Las alertas resueltas o descartadas no se borran; quedan comprimidas con coordenadas WGS84, fotografías y Hash de integridad para dar respuesta expedita ante requerimientos del Ministerio Público, Fiscalía o 911.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-lg bg-purple-900/80 border border-purple-700 text-xs font-mono font-bold text-purple-200">
                {carpetas.length} Expedientes en Custodia
              </span>
            </div>
          </div>

          {/* Buscador de expedientes */}
          <div className="flex items-center justify-between gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={archiveSearchTerm}
                onChange={(e) => setArchiveSearchTerm(e.target.value)}
                placeholder="Buscar por Carpeta (CI-2026-...), 911, delito, calle, resolución..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Tabla de Carpetas Forenses */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-800/90 text-zinc-300 border-b border-zinc-700 sticky top-0 z-10 select-none">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Carpeta de Investigación / 911</th>
                    <th className="py-3 px-3 font-semibold">Incidente & Categoría</th>
                    <th className="py-3 px-3 font-semibold">Ubicación y Sector</th>
                    <th className="py-3 px-3 font-semibold">Resolución Oficial</th>
                    <th className="py-3 px-3 font-semibold text-center">Integridad Forense</th>
                    <th className="py-3 px-4 font-semibold text-right">Colaboración Oficial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-200">
                  {filteredCarpetas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">
                        No hay expedientes archivados que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredCarpetas.map((c) => (
                      <tr
                        key={c.idCarpeta}
                        className="hover:bg-zinc-800/60 transition-colors"
                      >
                        {/* ID Carpeta y Folio 911 */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-purple-400">
                              {c.idCarpeta}
                            </span>
                            {c.folio911 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800 font-mono font-bold">
                                911: {c.folio911}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-mono">
                            <span>Plataforma: {c.folioAlerta}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            Cerrada: {new Date(c.fechaCierre).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </td>

                        {/* Suceso y Categoría */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white max-w-xs truncate" title={c.titulo}>
                            {c.titulo}
                          </div>
                          <div className="text-[11px] text-purple-300 font-medium mt-0.5">
                            {c.categoria} (Nivel {c.nivelPeligro})
                          </div>
                        </td>

                        {/* Coordenadas y Dirección */}
                        <td className="py-3 px-3 max-w-xs">
                          <div className="flex items-start gap-1 text-zinc-200">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                            <span className="truncate" title={c.coordenadas.direccion}>
                              {c.coordenadas.direccion}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono pl-4.5 mt-0.5">
                            {c.coordenadas.lat.toFixed(4)}, {c.coordenadas.lng.toFixed(4)} · Radio {c.radioFinalKm} km
                          </div>
                        </td>

                        {/* Resolución */}
                        <td className="py-3 px-3 max-w-sm">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.estadoFinal === 'resuelta'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}>
                              {c.estadoFinal}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-300 mt-1 line-clamp-2" title={c.motivoCierre}>
                            {c.motivoCierre}
                          </p>
                        </td>

                        {/* Hash de Integridad Forense */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-block px-2 py-1 rounded bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-emerald-400 font-bold" title="Hash criptográfico que certifica que los datos no han sido alterados">
                            #{c.hashIntegridad}
                          </div>
                          <span className="text-[9px] text-zinc-500 block mt-0.5">SHA Custodia</span>
                        </td>

                        {/* Acciones para Ministerio Público / 911 */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Copiar Formato de Oficio */}
                            <button
                              type="button"
                              onClick={() => handleCopyForOficio(c)}
                              className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-700 text-purple-200 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                              title="Copiar informe formal para oficio de Ministerio Público, Fiscalía o 911"
                            >
                              <Copy className="w-3 h-3 text-purple-300" />
                              <span>Copiar Oficio MP</span>
                            </button>

                            {/* Ver Expediente Completo */}
                            <button
                              type="button"
                              onClick={() => setSelectedCarpetaForDetail(c)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                              title="Ver ficha técnica completa del expediente"
                            >
                              <Eye className="w-3.5 h-3.5 text-zinc-300" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 1: FICHA TÉCNICA Y FOTOGRAFÍA EMERGENTE (ALERTA ACTIVA)
      ======================================================== */}
      {selectedAlertForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header del Modal */}
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-900/90">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                  {selectedAlertForDetail.folio}
                </span>
                {selectedAlertForDetail.folio911 && (
                  <span className="font-mono text-xs font-bold text-red-300 bg-red-950 px-2 py-0.5 rounded border border-red-800">
                    911: {selectedAlertForDetail.folio911}
                  </span>
                )}
                <CategoryBadge category={selectedAlertForDetail.category} />
                <LevelBadge level={selectedAlertForDetail.level} />
                <StatusBadge status={selectedAlertForDetail.status} verifiedBy={selectedAlertForDetail.verifiedBy} />
              </div>

              <button
                type="button"
                onClick={() => setSelectedAlertForDetail(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Cerrar ficha emergente"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido con scroll */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-zinc-200">
              {/* Fotografía del Suceso / Evidencia */}
              {selectedAlertForDetail.photoUrl ? (
                <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 relative group">
                  <img
                    src={selectedAlertForDetail.photoUrl}
                    alt={selectedAlertForDetail.title}
                    className="w-full max-h-72 object-contain bg-black/60 mx-auto"
                    onError={(e) => {
                      // Fallback visual si la imagen falla
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="p-2.5 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between text-xs">
                    <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                      Fotografía de evidencia registrada en la plataforma
                    </span>
                    <a
                      href={selectedAlertForDetail.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver en alta resolución
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 flex items-center justify-center gap-2 text-zinc-500 text-xs">
                  <ImageIcon className="w-4 h-4 text-zinc-600" />
                  <span>Sin evidencia fotográfica adjunta en el reporte original</span>
                </div>
              )}

              {/* Título y Descripción */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {selectedAlertForDetail.title}
                </h3>
                <p className="text-xs text-zinc-300 mt-2 leading-relaxed bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
                  {selectedAlertForDetail.description}
                </p>
              </div>

              {/* Ubicación y Radio de Cobertura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cuadro de Ubicación */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    <span>Ubicación Territorial</span>
                  </div>
                  <p className="text-xs font-semibold text-white">
                    {selectedAlertForDetail.coordinates.address || 'Lázaro Cárdenas, Michoacán'}
                  </p>
                  {selectedAlertForDetail.coordinates.referencePoint && (
                    <p className="text-[11px] text-zinc-400">
                      Ref: {selectedAlertForDetail.coordinates.referencePoint}
                    </p>
                  )}
                  <div className="text-[10px] font-mono text-zinc-500">
                    GPS: {selectedAlertForDetail.coordinates.lat.toFixed(5)}, {selectedAlertForDetail.coordinates.lng.toFixed(5)}
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    {onSelectOnMap && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOnMap(selectedAlertForDetail.id);
                          setSelectedAlertForDetail(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-blue-400 text-[11px] font-semibold border border-zinc-700 flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin className="w-3 h-3" />
                        Centrar en Radar
                      </button>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedAlertForDetail.coordinates.lat},${selectedAlertForDetail.coordinates.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold border border-zinc-700 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Google Maps
                    </a>
                  </div>
                </div>

                {/* Cuadro de Radio */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-400" />
                    <span>Radio Geográfico Actual</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-white tabular-nums">
                      {selectedAlertForDetail.currentRadiusKm.toFixed(1)} km
                    </span>
                    <span className="text-xs text-zinc-400">
                      ({selectedAlertForDetail.currentRadiusMeters.toLocaleString()} metros)
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    {selectedAlertForDetail.manualRadiusMeters ? 'Perímetro táctico manual establecido' : 'Protocolo adaptativo activo'}
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenRadiusModal(selectedAlertForDetail);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-950 hover:bg-blue-900 text-blue-300 text-[11px] font-semibold border border-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      Reconfigurar Radio
                    </button>
                  </div>
                </div>
              </div>

              {/* Instrucciones Ciudadanas */}
              {selectedAlertForDetail.instructions && (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Protocolo y Medidas Preventivas</span>
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    {selectedAlertForDetail.instructions}
                  </p>
                </div>
              )}

              {/* Métricas Comunitarias y Cadena de Tiempo */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Reportado</span>
                  <span className="text-xs font-semibold text-zinc-200 mt-0.5 block">
                    {new Date(selectedAlertForDetail.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Confirmaciones</span>
                  <span className="text-xs font-semibold text-emerald-400 mt-0.5 block">
                    {selectedAlertForDetail.confirmedCount} a favor · {selectedAlertForDetail.disputeCount} dudas
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Validador Oficial</span>
                  <span className="text-xs font-semibold text-zinc-200 mt-0.5 block truncate">
                    {selectedAlertForDetail.verifiedBy || 'Sin validar oficial'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer con Acciones */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/95 flex items-center justify-between gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAlertForDetail(null)}
              >
                Cerrar Ficha
              </Button>

              <div className="flex items-center gap-2">
                {selectedAlertForDetail.status === 'pendiente' && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                    disabled={isProcessing === selectedAlertForDetail.id}
                    onClick={() => handleVerify(selectedAlertForDetail.id)}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    Validar CCE
                  </Button>
                )}

                {selectedAlertForDetail.status !== 'resuelta' && selectedAlertForDetail.status !== 'descartada' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      handleOpenResolve(selectedAlertForDetail);
                    }}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    Resolver y Archivar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: CONFIGURACIÓN Y CONTROL DE RADIO GEOGRÁFICO
      ======================================================== */}
      {selectedAlertForRadius && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-5">
            {/* Cabecera */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-950 border border-blue-800 text-blue-400">
                  <Sliders className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Configuración de Radio Territorial
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Folio: <strong className="text-zinc-200">{selectedAlertForRadius.folio}</strong> · {selectedAlertForRadius.title}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAlertForRadius(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Radio Seleccionado en Grande */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center space-y-1">
              <span className="text-[11px] text-zinc-400 uppercase font-semibold tracking-wider">
                Perímetro de Cobertura Seleccionado
              </span>
              <div className="text-3xl font-extrabold text-blue-400 font-mono tracking-tight">
                {(targetRadiusMeters / 1000).toFixed(1)} km
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {targetRadiusMeters.toLocaleString()} metros a la redonda
              </span>
            </div>

            {/* Presets Tácticos con 1 Clic */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 block">
                Presets Tácticos para Lázaro Cárdenas:
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {TACTICAL_RADIUS_PRESETS.map((preset) => {
                  const isSelected = targetRadiusMeters === preset.meters;
                  return (
                    <button
                      key={preset.meters}
                      type="button"
                      onClick={() => setTargetRadiusMeters(preset.meters)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-blue-950/80 border-blue-500 text-white shadow-xs'
                          : 'bg-zinc-950 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{preset.label}</span>
                          <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded ${
                            isSelected ? 'bg-blue-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {preset.km}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400">{preset.desc}</p>
                      </div>

                      {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slider de Ajuste Fino */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300">Ajuste Milimétrico Libre:</span>
                <span className="font-mono text-zinc-400 text-[11px]">500 m - 30,000 m</span>
              </div>
              <input
                type="range"
                min={500}
                max={30000}
                step={250}
                value={targetRadiusMeters}
                onChange={(e) => setTargetRadiusMeters(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleResetToAdaptive}
                className="text-xs text-zinc-400 hover:text-amber-400 underline cursor-pointer"
                title="Volver al algoritmo que expande el radio según el tiempo"
              >
                Restablecer a Protocolo Adaptativo
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAlertForRadius(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isProcessing === selectedAlertForRadius.id}
                  onClick={handleSaveRadius}
                >
                  Aplicar Radio
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: EXPEDIENTE FORENSE COMPLETO (CARPETA DE INVESTIGACIÓN)
      ======================================================== */}
      {selectedCarpetaForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-zinc-900 border border-purple-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-900/90">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                  {selectedCarpetaForDetail.idCarpeta}
                </span>
                {selectedCarpetaForDetail.folio911 && (
                  <span className="font-mono text-xs font-bold text-red-300 bg-red-950 px-2 py-0.5 rounded border border-red-800">
                    911: {selectedCarpetaForDetail.folio911}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {selectedCarpetaForDetail.estadoFinal}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCarpetaForDetail(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-zinc-200">
              {/* Foto si existe */}
              {selectedCarpetaForDetail.fotoUrl && (
                <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                  <img
                    src={selectedCarpetaForDetail.fotoUrl}
                    alt={selectedCarpetaForDetail.titulo}
                    className="w-full max-h-60 object-contain bg-black/60 mx-auto"
                  />
                  <div className="p-2 bg-zinc-950 text-[11px] text-zinc-400 border-t border-zinc-800">
                    Evidencia fotográfica archivada en cadena de custodia
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedCarpetaForDetail.titulo}
                </h3>
                <p className="text-xs text-purple-300 mt-0.5 font-semibold">
                  Categoría: {selectedCarpetaForDetail.categoria} · Nivel de Peligro {selectedCarpetaForDetail.nivelPeligro}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] font-bold text-zinc-400 uppercase">
                  Motivo y Conclusión Oficial de Cierre:
                </span>
                <p className="text-xs text-zinc-200 leading-relaxed font-semibold">
                  "{selectedCarpetaForDetail.motivoCierre}"
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] font-bold text-zinc-400 uppercase">
                  Descripción Original de los Hechos:
                </span>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {selectedCarpetaForDetail.descripcionOriginal}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Ubicación Registrada</span>
                  <p className="font-semibold text-white">{selectedCarpetaForDetail.coordenadas.direccion}</p>
                  <p className="font-mono text-[10px] text-zinc-400">
                    GPS: {selectedCarpetaForDetail.coordenadas.lat}, {selectedCarpetaForDetail.coordenadas.lng}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Radio Final: {selectedCarpetaForDetail.radioFinalKm} km ({selectedCarpetaForDetail.radioFinalMetros} m)
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Cadena de Custodia</span>
                  <p className="text-zinc-200">Validador: {selectedCarpetaForDetail.validadorResponsable}</p>
                  <p className="font-mono text-emerald-400 text-[11px] font-bold">
                    Hash Forense: #{selectedCarpetaForDetail.hashIntegridad}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Archivado: {new Date(selectedCarpetaForDetail.archivadoEn).toLocaleString('es-MX')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/95 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCarpetaForDetail(null)}
              >
                Cerrar
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleCopyForOficio(selectedCarpetaForDetail)}
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copiar Ficha Formal para MP / 911
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: CONFIRMACIÓN DE RESOLUCIÓN Y ARCHIVO FORENSE
      ======================================================== */}
      {selectedAlertToResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-4 text-zinc-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-white">
                Cerrar Incidente y Archivar en Carpeta de Investigación
              </h3>
            </div>

            <p className="text-xs text-zinc-400">
              Al resolver este incidente ({selectedAlertToResolve.folio}), los datos <strong className="text-white">no serán borrados</strong>. Se comprimirán y se creará una <strong className="text-purple-300">Carpeta de Investigación Forense</strong> con hash de custodia para colaborar ante el Ministerio Público o 911.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Motivo / Conclusión oficial de cierre:
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlertToResolve(null)}>
                Volver
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                onClick={handleConfirmResolve}
              >
                Confirmar y Archivar Expediente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
