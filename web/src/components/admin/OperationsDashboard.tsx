import React, { useState } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { CategoryBadge, StatusBadge, LevelBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { 
  ShieldCheck, 
  CheckCircle, 
  XCircle, 
  Maximize2, 
  Clock, 
  MapPin, 
  Search,
  Radio
} from 'lucide-react';

interface OperationsDashboardProps {
  alerts: AlertWithDistance[];
  onSelectOnMap?: (alertId: string) => void;
}

export const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  alerts,
  onSelectOnMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pendientes' | 'verificadas' | 'resueltas'>('all');
  const [selectedAlertToResolve, setSelectedAlertToResolve] = useState<AlertWithDistance | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Filtrado de alertas
  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const handleVerify = async (alertId: string) => {
    setIsProcessing(alertId);
    try {
      await alertService.verifyAlert(alertId, 'Consejo Coordinador Empresarial (CCE)');
      audioAlert.playInfoAlert();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleExpandRadius = async (alertId: string, currentMeters: number) => {
    setIsProcessing(alertId);
    try {
      // Escalones estándar de radio: 1km -> 3km -> 5km -> 10km -> 25km
      const nextMeters = currentMeters <= 1000 ? 3000 : currentMeters <= 3000 ? 5000 : currentMeters <= 5000 ? 10000 : 25000;
      await alertService.adjustRadius(alertId, nextMeters);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setIsProcessing(null);
    }
  };

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

  const handleConfirmResolve = async () => {
    if (!selectedAlertToResolve) return;
    setIsProcessing(selectedAlertToResolve.id);
    try {
      await alertService.resolveAlert(selectedAlertToResolve.id, resolutionNote.trim());
      audioAlert.playResolvedChime();
      setSelectedAlertToResolve(null);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCancelAlert = async (alertId: string) => {
    if (window.confirm('¿Desestimar reporte como falsa alarma o reporte duplicado?')) {
      setIsProcessing(alertId);
      try {
        await alertService.discardAlert(alertId, 'Reporte desestimado tras verificación operativa en campo.');
      } catch (e) {
        window.alert((e as Error).message);
      } finally {
        setIsProcessing(null);
      }
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Encabezado del Centro de Mando */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm text-zinc-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Centro de Operaciones y Monitoreo Territorial CCE
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Consola de supervisión de geocercas, verificación oficial de reportes y control de radio para Lázaro Cárdenas. Sincronizado en tiempo real con Supabase.
            </p>
          </div>

          {/* Estadísticas rápidas */}
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-xl bg-zinc-800/80 border border-zinc-700 text-right">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">Total</span>
              <span className="text-base font-bold text-white tabular-nums">
                {alerts.length}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-800/60 text-right">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-semibold">Por Validar</span>
              <span className="text-base font-bold text-amber-300 tabular-nums">
                {alerts.filter((a) => a.status === 'pendiente' || a.status === 'no_confirmada').length}
              </span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-right">
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-semibold">Verificadas</span>
              <span className="text-base font-bold text-emerald-300 tabular-nums">
                {alerts.filter((a) => a.status === 'verificada').length}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por folio, título, colonia, descripción..."
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'pendientes', label: 'Pendientes / Sin Confirmar' },
              { id: 'verificadas', label: 'Oficialmente Verificadas' },
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
      </div>

      {/* Tabla de Alta Densidad */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-800/80 text-zinc-300 border-b border-zinc-700 sticky top-0 z-10 select-none">
              <tr>
                <th className="py-3 px-4 font-semibold">Folio / Incidente</th>
                <th className="py-3 px-3 font-semibold">Categoría & Nivel</th>
                <th className="py-3 px-3 font-semibold">Ubicación (Lázaro Cárdenas)</th>
                <th className="py-3 px-3 font-semibold text-right tabular-nums">Radio de Geocerca</th>
                <th className="py-3 px-3 font-semibold text-right tabular-nums">Confirmaciones</th>
                <th className="py-3 px-4 font-semibold text-right">Acciones Operativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500">
                    No hay incidentes que coincidan con los criterios seleccionados.
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
                      className={`hover:bg-zinc-800/60 transition-colors ${
                        isPending ? 'bg-amber-950/20' : ''
                      }`}
                    >
                      {/* Folio y Título */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-semibold text-zinc-400">{alert.folio}</span>
                          {alert.folio911 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800 font-mono font-bold">
                              911: {alert.folio911}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-white mt-0.5 max-w-xs truncate" title={alert.title}>
                          {alert.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>

                      {/* Categoría y Nivel de Verificación */}
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

                      {/* Radio de Cobertura */}
                      <td className="py-3 px-3 text-right tabular-nums">
                        <div className="font-bold text-zinc-100 flex items-center justify-end gap-1">
                          <Radio className="w-3 h-3 text-blue-400" />
                          <span>{alert.currentRadiusKm.toFixed(1)} km</span>
                        </div>
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
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Botón Ver en Mapa */}
                          {onSelectOnMap && (
                            <button
                              type="button"
                              onClick={() => onSelectOnMap(alert.id)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                              title="Centrar en el mapa"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                          )}

                          {/* Botón Aprobar Verificación Oficial (CCE) */}
                          {isPending && !isResolved && !isDiscarded && (
                            <button
                              type="button"
                              disabled={isProcessing === alert.id}
                              onClick={() => handleVerify(alert.id)}
                              className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                              title="Validar oficialmente como CCE / Protección Civil"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Validar CCE</span>
                            </button>
                          )}

                          {/* Botón Ampliar Radio */}
                          {!isResolved && !isDiscarded && (
                            <button
                              type="button"
                              disabled={isProcessing === alert.id}
                              onClick={() => handleExpandRadius(alert.id, alert.currentRadiusMeters)}
                              className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                              title="Ampliar radio geográfico de cobertura"
                            >
                              <Maximize2 className="w-3 h-3 text-blue-600" />
                              <span>+Radio</span>
                            </button>
                          )}

                          {/* Botón Resolver Incidente */}
                          {!isResolved && !isDiscarded ? (
                            <button
                              type="button"
                              disabled={isProcessing === alert.id}
                              onClick={() => handleOpenResolve(alert)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                            >
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Resolver</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded border border-emerald-200">
                              {isResolved ? 'Resuelta' : 'Descartada'}
                            </span>
                          )}

                          {/* Botón Cancelar / Desestimar */}
                          {isPending && !isResolved && !isDiscarded && (
                            <button
                              type="button"
                              disabled={isProcessing === alert.id}
                              onClick={() => handleCancelAlert(alert.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer disabled:opacity-50"
                              title="Desestimar alerta"
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

      {/* Modal para Cerrar / Resolver la Alerta */}
      {selectedAlertToResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Cerrar y Marcar Incidente como Resuelto
              </h3>
            </div>

            <p className="text-xs text-slate-600">
              Al cerrar este incidente ({selectedAlertToResolve.folio}), se actualizará su estado en la base de datos de Supabase y cesará la alarma acústica en el perímetro territorial.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nota oficial de resolución:
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlertToResolve(null)}>
                Volver
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmResolve}>
                Confirmar Resolución Oficial
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
