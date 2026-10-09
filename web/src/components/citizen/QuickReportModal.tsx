import React, { useState, useEffect, useRef } from 'react';
import { CategoriaAlerta, Coordinates, CATEGORIAS_OFICIALES } from '../../types/alert';
import { Button } from '../ui/Button';
import { alertService } from '../../services/alertService';
import { audioAlert } from '../../services/audioAlert';
import { 
  X, 
  MapPin, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle, 
  AlertTriangle,
  ShieldCheck,
  FileText,
  Upload,
  Trash2,
  Loader2
} from 'lucide-react';

interface QuickReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserCoords: Coordinates;
  isModerator?: boolean;
  moderatorName?: string;
}

export const QuickReportModal: React.FC<QuickReportModalProps> = ({
  isOpen,
  onClose,
  currentUserCoords,
  isModerator = false,
  moderatorName = 'Consejo Coordinador Empresarial',
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [category, setCategory] = useState<CategoriaAlerta>('menor_desaparecido');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [folio911, setFolio911] = useState('');
  const [consent, setConsent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoInputMode, setPhotoInputMode] = useState<'file' | 'url'>('file');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Location
  const [lat, setLat] = useState<number>(currentUserCoords.lat);
  const [lng, setLng] = useState<number>(currentUserCoords.lng);
  const [locationLabel, setLocationLabel] = useState(currentUserCoords.address || 'Lázaro Cárdenas, Michoacán');

  useEffect(() => {
    setLat(currentUserCoords.lat);
    setLng(currentUserCoords.lng);
    setLocationLabel(currentUserCoords.address || 'Lázaro Cárdenas, Michoacán');
  }, [currentUserCoords]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError('La imagen supera el límite de 5 MB.');
      return;
    }

    setIsUploadingPhoto(true);
    setFormError(null);

    try {
      const res = await alertService.uploadPhoto(file);
      if (res.success && res.path) {
        setPhotoUrl(res.path);
        setPhotoPreview(res.previewUrl || URL.createObjectURL(file));
      } else {
        setFormError(res.error || 'No se pudo procesar la imagen.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error al procesar la imagen del equipo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl('');
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const catConfig = CATEGORIAS_OFICIALES[category] || CATEGORIAS_OFICIALES['otro'];

  const handleNextStep = () => {
    setFormError(null);
    if (step === 1) {
      if (!title.trim() || title.trim().length < 5) {
        setFormError('Ingresa un título descriptivo de al menos 5 caracteres.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!description.trim() || description.trim().length < 10) {
        setFormError('Ingresa una descripción clara de lo sucedido (mínimo 10 caracteres).');
        return;
      }
      if (catConfig.requiere_validacion && photoUrl && !consent) {
        setFormError('Para publicar la foto de una persona debes confirmar el consentimiento del familiar o tutor legal.');
        return;
      }
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    setFormError(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await alertService.createReport({
        category,
        title,
        description,
        reference: reference.trim() || locationLabel,
        lat,
        lng,
        photoPath: photoUrl.trim() || undefined,
        folio911: folio911.trim() || undefined,
        consent,
        isOfficial: isModerator,
        officialVerifierName: isModerator ? moderatorName : undefined,
      });

      if (res.success) {
        setIsSuccess(true);
        audioAlert.playInfoAlert();
      } else {
        setFormError(res.error || 'No se pudo emitir el reporte. Intenta de nuevo.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error al enviar reporte a Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setStep(1);
    setTitle('');
    setDescription('');
    setReference('');
    setFolio911('');
    setConsent(false);
    setPhotoUrl('');
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsSuccess(false);
    setFormError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl text-white ${isModerator ? 'bg-amber-600' : 'bg-red-600'}`}>
              {isModerator ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                {isModerator ? 'Emitir Alerta Oficial Verificada' : 'Reportar Incidente Comunitario'}
              </h3>
              <p className="text-xs text-slate-500">
                {isModerator
                  ? 'Publicación con respaldo del Consejo Coordinador Empresarial'
                  : 'Transmitir acontecimiento urgente a los ciudadanos cercanos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pantalla de Éxito */}
        {isSuccess ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">
              {isModerator ? 'Alerta Oficial Verificada Emitida' : 'Reporte Ciudadano Recibido'}
            </h4>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              {isModerator
                ? 'La alerta ha sido registrada con validación institucional y se ha activado la geocerca de notificación territorial en Lázaro Cárdenas.'
                : 'Tu reporte se ha registrado y georreferenciado con tu posición actual. Los ciudadanos dentro del radio serán informados.'}
            </p>
            <Button variant="primary" onClick={handleResetAndClose} className="mt-4 px-6 font-bold">
              Aceptar y Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {formError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 font-medium">
                {formError}
              </div>
            )}

            {/* PASO 1: Categoría y Título */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    1. Selecciona la Categoría Oficial del Acontecimiento:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.values(CATEGORIAS_OFICIALES)
                      .filter((c) => isModerator || !c.solo_institucion)
                      .map((cat) => (
                        <button
                          key={cat.clave}
                          type="button"
                          onClick={() => setCategory(cat.clave)}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between select-none cursor-pointer ${
                            category === cat.clave
                              ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-bold ring-2 ring-blue-500/20'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">{cat.icono}</span>
                            <span className="truncate">{cat.nombre_corto}</span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold self-start ${
                            cat.nivel === 4 ? 'bg-red-100 text-red-800' : cat.nivel === 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            Nivel {cat.nivel}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Título breve y claro:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="ej. Menor extraviado en Parque Romero o Robo de camioneta blanca..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-400 block text-right mt-0.5">{title.length}/80</span>
                </div>
              </div>
            )}

            {/* PASO 2: Descripción y Evidencia */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descripción detallada del suceso:
                  </label>
                  <textarea
                    rows={3}
                    required
                    maxLength={1000}
                    placeholder="Qué ocurrió, características visibles, ropa, dirección de huida, placas o señas..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Sección de Fotografía o Ficha */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Fotografía, Ficha o Evidencia (opcional):
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPhotoInputMode('file')}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          photoInputMode === 'file' ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        📁 Mis Archivos
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setPhotoInputMode('url')}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          photoInputMode === 'url' ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🔗 URL Web
                      </button>
                    </div>
                  </div>

                  {photoInputMode === 'file' ? (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      {!photoPreview ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingPhoto}
                          className="w-full py-4 px-3 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl flex flex-col items-center justify-center gap-1.5 text-xs text-slate-600 transition-all cursor-pointer"
                        >
                          {isUploadingPhoto ? (
                            <div className="flex items-center gap-2 text-blue-600">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Subiendo archivo al servidor...</span>
                            </div>
                          ) : (
                            <>
                              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                                <Upload className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-slate-800">
                                Haz clic para abrir tu Galería o Documentos
                              </span>
                              <span className="text-[10px] text-slate-400">
                                JPG, PNG o WebP (Máx. 5 MB)
                              </span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <img
                              src={photoPreview}
                              alt="Vista previa"
                              className="w-12 h-12 object-cover rounded-lg border border-slate-300 shrink-0"
                            />
                            <div className="truncate">
                              <span className="text-xs font-bold text-slate-800 block truncate">
                                Foto lista para adjuntar
                              </span>
                              <span className="text-[10px] text-emerald-700 font-medium">
                                ✓ Cargada con éxito
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                            title="Quitar foto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="url"
                        placeholder="https://ejemplo.com/foto-alerta.jpg"
                        value={photoUrl}
                        onChange={(e) => {
                          setPhotoUrl(e.target.value);
                          setPhotoPreview(e.target.value);
                        }}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Consentimiento legal si es menor o persona */}
                {catConfig.requiere_validacion && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-1.5">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-amber-950">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-amber-400"
                      />
                      <span>
                        <strong>Consentimiento Legal:</strong> Cuento con autorización del familiar o tutor legal para difundir la imagen y señas particulares con fines exclusivos de búsqueda humanitaria.
                      </span>
                    </label>
                  </div>
                )}

                {/* Folio oficial 911 (opcional o para CCE) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Folio de Denuncia / 911 / C5i (opcional):
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="ej. 911-2026-LC-449"
                    value={folio911}
                    onChange={(e) => setFolio911(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* PASO 3: Ubicación Georreferenciada */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <MapPin className="w-4 h-4 text-red-600" />
                    <span>Ubicación del Suceso en Lázaro Cárdenas:</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Calle, Colonia o Punto de Referencia:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. Av. Melchor Ocampo esq. Tulipanes o Frente al Puerto..."
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="text-[11px] text-slate-500 truncate">
                    Zona detectada: <span className="font-medium text-slate-700">{locationLabel}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Latitud:</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={lat}
                        onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Longitud:</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={lng}
                        onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-slate-300 rounded font-mono text-xs text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Resumen de la Alerta:</span>
                  </div>
                  <div><strong>{title}</strong></div>
                  <div>Categoría: {catConfig.nombre_corto} (Nivel {catConfig.nivel})</div>
                  <div>Radio inicial de geocerca: <strong>1.0 km</strong> (crece dinámicamente)</div>
                </div>
              </div>
            )}

            {/* Botonera de Navegación del Modal */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
              {step > 1 ? (
                <Button type="button" variant="outline" size="sm" onClick={handlePrevStep} className="flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Atrás</span>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={handleResetAndClose}>
                  Cancelar
                </Button>
              )}

              {step < 3 ? (
                <Button type="button" variant="primary" size="sm" onClick={handleNextStep} className="flex items-center gap-1.5 font-bold">
                  <span>Siguiente</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant={isModerator ? 'danger' : 'primary'}
                  size="sm"
                  disabled={isSubmitting}
                  className="font-bold px-5"
                >
                  {isSubmitting ? 'Transmitiendo...' : isModerator ? 'Emitir Alerta Oficial' : 'Enviar Reporte'}
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
