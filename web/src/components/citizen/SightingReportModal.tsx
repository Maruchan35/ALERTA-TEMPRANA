import React, { useState } from 'react';
import { AlertWithDistance } from '../../hooks/useNearbyAlerts';
import { Button } from '../ui/Button';
import { alertService } from '../../services/alertService';
import { X, Eye, MapPin, CheckCircle, Send } from 'lucide-react';

interface SightingReportModalProps {
  alert: AlertWithDistance | null;
  onClose: () => void;
}

export const SightingReportModal: React.FC<SightingReportModalProps> = ({
  alert,
  onClose,
}) => {
  const [locationDescription, setLocationDescription] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationDescription.trim()) {
      setError('Por favor indica en qué lugar o intersección observaste los hechos.');
      return;
    }
    if (!note.trim()) {
      setError('Por favor describe brevemente qué observaste o hacia dónde se desplazaba.');
      return;
    }

    try {
      await alertService.voteConfirmation(alert.id, 'confirmo');
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1800);
    } catch {
      setError('No se pudo enviar la confirmación. Intenta de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sighting-dialog-title"
      >
        {/* Cabecera */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 id="sighting-dialog-title" className="text-sm font-bold text-slate-900">
                Aportar Pista o Confirmación Comunitaria
              </h3>
              <p className="text-[11px] text-slate-500">
                Folio: <span className="font-mono text-slate-700 font-semibold">{alert.folio}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumen de la alerta a colaborar */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center gap-3">
          {alert.photoUrl && (
            <img
              src={alert.photoUrl}
              alt={alert.title}
              className="w-10 h-10 rounded object-cover border border-slate-200 shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{alert.title}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {alert.reference ? `Ref: ${alert.reference} · ` : ''}{alert.description}
            </p>
          </div>
        </div>

        {isSubmitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">¡Gracias por tu colaboración responsable!</h4>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              Tu aporte ha sido registrado en la red comunitaria y puesto a disposición de la mesa de coordinación del CCE.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ¿Dónde lo viste? (Calle, colonia o punto de referencia en Lázaro Cárdenas)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={locationDescription}
                  onChange={(e) => {
                    setLocationDescription(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ej. Frente a Oxxo de Av. Tulipanes hacia el malecón..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Detalles del avistamiento y dirección observada
              </label>
              <textarea
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (error) setError(null);
                }}
                rows={3}
                placeholder="Describe qué viste (ropa, dirección hacia la que se desplazaba, características relevantes)..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                required
              />
            </div>

            <p className="text-[11px] text-slate-500">
              * La información se consolida en tiempo real con las instituciones de apoyo perimetral.
            </p>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                icon={<Send className="w-3.5 h-3.5" />}
              >
                Registrar Aporte
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
