import React, { useState } from 'react';
import { Coordinates } from '../../types/alert';
import { PUNTOS_REFERENCIA_LC } from '../../hooks/useGeolocation';
import { 
  MapPin, 
  Navigation, 
  Search, 
  RotateCcw, 
  Check, 
  Smartphone, 
  Laptop, 
  Info,
  Loader2,
  X
} from 'lucide-react';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCoords: Coordinates;
  isUsingRealGPS: boolean;
  isLocating: boolean;
  onSelectCoords: (lat: number, lng: number, address?: string) => void;
  onRetryGPS: () => void;
  onGoToMap: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentCoords,
  isUsingRealGPS,
  isLocating,
  onSelectCoords,
  onRetryGPS,
  onGoToMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<Array<{ lat: number; lng: number; display: string }>>([]);

  if (!isOpen) return null;

  // Búsqueda en vivo usando Nominatim acotado a Lázaro Cárdenas
  const handleOnlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearchingOnline(true);
    setOnlineResults([]);

    try {
      const q = encodeURIComponent(`${searchTerm.trim()}, Lázaro Cárdenas, Michoacán`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${q}&bounded=1&viewbox=-102.85,18.15,-102.10,17.90&limit=5`,
        { headers: { 'User-Agent': 'AlertaCerca-Web/1.0 (HackaITLAC)' } }
      );
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map((item: any) => ({
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          display: item.display_name.split(',').slice(0, 3).join(','),
        }));
        setOnlineResults(formatted);
      }
    } catch {
      // ignore
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const filteredPuntos = PUNTOS_REFERENCIA_LC.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.desc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Calibración de Ubicación GPS
              </h3>
              <p className="text-xs text-slate-500">
                Lázaro Cárdenas, Michoacán
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado del Dispositivo (Explicación didáctica Laptop vs Móvil) */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              {isUsingRealGPS ? (
                <>
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  GPS Satelital Activo (Móvil)
                </>
              ) : (
                <>
                  <Laptop className="w-4 h-4 text-blue-600" />
                  Modo Laptop / PC (Calibrado)
                </>
              )}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
              isUsingRealGPS ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {isUsingRealGPS ? 'Alta Precisión' : 'Precisión Local'}
            </span>
          </div>

          <p className="text-slate-600 text-[11px] leading-relaxed">
            {isUsingRealGPS
              ? `Tu dispositivo móvil está sincronizado con satélites GPS en tiempo real (±${currentCoords.accuracyMeters || 10}m).`
              : 'Las laptops no tienen chip GPS satelital físico; por ello, Alerta Cerca mantiene tu punto exacto dentro de Lázaro Cárdenas sin saltos de red a Morelia.'}
          </p>

          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onRetryGPS();
              }}
              disabled={isLocating}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              {isLocating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>{isLocating ? 'Detectando...' : 'Reintentar GPS Satelital'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToMap();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Arrastrar en Mapa</span>
            </button>
          </div>
        </div>

        {/* Buscador de Calles / Colonias */}
        <form onSubmit={handleOnlineSearch} className="relative shrink-0">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Escribe tu calle o colonia (ej: Melchor Ocampo, Las Guacamayas)..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-20 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <button
            type="submit"
            disabled={isSearchingOnline || !searchTerm.trim()}
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1"
          >
            {isSearchingOnline ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Buscar'}
          </button>
        </form>

        {/* Lista de Resultados / Puntos Rápidos */}
        <div className="overflow-y-auto flex-1 space-y-2 pr-1 min-h-[160px]">
          {/* Resultados de búsqueda en línea si existen */}
          {onlineResults.length > 0 && (
            <div className="space-y-1.5 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 px-1">
                Resultados en OpenStreetMap:
              </span>
              {onlineResults.map((res, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onSelectCoords(res.lat, res.lng, res.display);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-slate-800 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="pr-2">
                    <p className="text-xs font-bold text-slate-900">{res.display}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {res.lat.toFixed(4)}, {res.lng.toFixed(4)}
                    </p>
                  </div>
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                </button>
              ))}
            </div>
          )}

          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            Sectores y Colonias Principales:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredPuntos.map((punto) => {
              const isCurrent =
                Math.abs(currentCoords.lat - punto.lat) < 0.005 &&
                Math.abs(currentCoords.lng - punto.lng) < 0.005;

              return (
                <button
                  key={punto.name}
                  type="button"
                  onClick={() => {
                    onSelectCoords(punto.lat, punto.lng, `${punto.name}, Lázaro Cárdenas`);
                    onClose();
                  }}
                  className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isCurrent
                      ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-400'
                      : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <p className="font-bold text-slate-900">{punto.name}</p>
                    <p className="text-[10px] text-slate-500 line-clamp-1">{punto.desc}</p>
                  </div>
                  {isCurrent ? (
                    <span className="p-0.5 rounded-full bg-blue-600 text-white shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer del Modal */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            Tu ubicación se guarda en tu navegador.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
