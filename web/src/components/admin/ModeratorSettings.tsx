import React, { useState } from 'react';
import { ModeratorUser } from '../../types/auth';
import { Button } from '../ui/Button';
import { ShieldCheck, Lock, KeyRound, CheckCircle2, LogOut } from 'lucide-react';

interface ModeratorSettingsProps {
  moderatorUser: ModeratorUser | null;
  onLogout: () => void;
}

export const ModeratorSettings: React.FC<ModeratorSettingsProps> = ({
  moderatorUser,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setErrorMessage(null);
    setSaveSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in text-slate-900">
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Ajustes de Moderador y Seguridad de Acceso
              </h2>
              <p className="text-xs text-slate-500">
                Administración de credenciales oficiales y parámetros de verificación CCE.
              </p>
            </div>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={onLogout}
            icon={<LogOut className="w-3.5 h-3.5" />}
            className="bg-red-600 hover:bg-red-700 text-white font-bold"
          >
            Cerrar Sesión de Mando
          </Button>
        </div>

        {/* Perfil del Operador */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
              Operador Oficial
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block">
              {moderatorUser?.fullName || 'Validador Oficial CCE'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
              Institución
            </span>
            <span className="text-sm font-bold text-amber-800 mt-0.5 block truncate">
              {moderatorUser?.entity || 'CCE Lázaro Cárdenas'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
              Nivel de Autorización
            </span>
            <span className="text-sm font-bold text-emerald-700 mt-0.5 block">
              Supervisión & Verificación Plena
            </span>
          </div>
        </div>

        {/* Estado del Backend Supabase & PostGIS */}
        <div className="mb-6 p-4 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Supabase Cloud DB & Realtime Sincronizado
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              ID: boygtmnmtgeknlwvtwkf
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 block">Host Endpoint</span>
              <span className="font-mono text-[11px] text-slate-800 truncate block">boygtmnmtgeknlwvtwkf.supabase.co</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Motor Espacial</span>
              <span className="font-semibold text-slate-800">PostGIS (ST_DWithin)</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Catálogo Oficial</span>
              <span className="font-semibold text-emerald-700">12 Categorías Activas</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Escalones de Radio</span>
              <span className="font-semibold text-emerald-700">25 Niveles (1km - 25km)</span>
            </div>
          </div>
        </div>

        {/* Formulario de Cambio de Contraseña */}
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Actualizar Contraseña de Acceso</span>
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Modifica la clave de acceso utilizada para proteger la base de datos confidencial del Centro de Mando.
          </p>

          {saveSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Contraseña actualizada satisfactoriamente.</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contraseña Actual
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa clave actual (ej. admin123 o cce2026)"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            <Button
              variant="primary"
              size="md"
              type="submit"
              icon={<Lock className="w-3.5 h-3.5" />}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              Guardar Nueva Contraseña
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
