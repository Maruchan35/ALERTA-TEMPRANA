import React, { useState } from 'react';
import { ModeratorUser } from '../../types/auth';
import { Button } from '../ui/Button';
import { 
  Radio, 
  ShieldCheck, 
  User, 
  Lock, 
  KeyRound, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface RoleGatewayProps {
  onSelectCitizen: () => void;
  onLoginModerator: (user: ModeratorUser) => void;
}

export const RoleGateway: React.FC<RoleGatewayProps> = ({
  onSelectCitizen,
  onLoginModerator,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);

    setTimeout(() => {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      // Validación de credenciales de demostración
      if (
        (cleanUser === 'moderador' || cleanUser === 'admin' || cleanUser === 'cce' || cleanUser === 'cce.lazarocardenas@gmail.com') &&
        (cleanPass === 'cce2026' || cleanPass === 'alerta2026')
      ) {
        onLoginModerator({
          username: cleanUser,
          fullName: 'Lic. Julio César Cortés (Operador CCE)',
          roleTitle: 'Coordinador de Alertas y Verificación',
          entity: 'Consejo Coordinador Empresarial de Lázaro Cárdenas',
        });
        setIsLoading(false);
      } else {
        setLoginError('Credenciales incorrectas. Usa el usuario "moderador" y contraseña "cce2026".');
        setIsLoading(false);
      }
    }, 400);
  };

  const handleFillDemoCredentials = () => {
    setUsername('moderador');
    setPassword('cce2026');
    setLoginError(null);
  };

  return (
    <div className="min-h-screen bg-background text-zinc-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Barra superior de bienvenida */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-red-950/40 border border-red-500/40 text-red-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white">ALERTA CERCA</span>
            <span className="block text-[11px] text-zinc-400">Lázaro Cárdenas, Michoacán · Hackaitlac 2026</span>
          </div>
        </div>

        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-full">
          ● Red Activa
        </span>
      </header>

      {/* Contenido Central: Selector de Rol */}
      <main className="max-w-2xl w-full mx-auto my-auto py-8">
        <div className="text-center mb-8 space-y-2">
          <span className="text-xs uppercase font-semibold tracking-wider text-brand-400 bg-brand-950/60 border border-brand-800/60 px-3 py-1 rounded-full inline-block">
            Acceso al Sistema
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            ¿Cómo deseas ingresar hoy?
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            Selecciona tu perfil para acceder a la experiencia correspondiente de alertamiento por proximidad.
          </p>
        </div>

        {/* Las 2 Tarjetas de Opción */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Opción 1: CIUDADANO (Foco Móvil / Inmediato) */}
          <div
            onClick={onSelectCitizen}
            className="group relative p-6 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 hover:border-brand-500/60 transition-all duration-200 card-highlight cursor-pointer flex flex-col justify-between shadow-lg"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-brand-950/60 border border-brand-700/60 text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                <User className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    1. Modo Ciudadano
                  </h3>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.2 rounded font-medium">
                    Gratuito
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Diseñado para móviles. Recibe alertas activas en tu perímetro, consulta el mapa radar y reporta incidentes o avistamientos de emergencia.
                </p>
              </div>

              <ul className="text-[11px] text-zinc-400 space-y-1.5 pt-2 border-t border-zinc-800/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Sin registro ni contraseñas</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Privacidad garantizada (cálculo en dispositivo)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Alertas acústicas inmediatas</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <Button
                variant="primary"
                size="md"
                onClick={onSelectCitizen}
                icon={<ArrowRight className="w-4 h-4" />}
                className="w-full font-semibold justify-center"
              >
                Ingresar como Ciudadano
              </Button>
            </div>
          </div>

          {/* Opción 2: MODERADOR / AUTORIDADES (Protegido por Login) */}
          <div
            onClick={() => setShowLoginModal(true)}
            className="group relative p-6 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-500/60 transition-all duration-200 card-highlight cursor-pointer flex flex-col justify-between shadow-lg"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    2. Moderador / CCE
                  </h3>
                  <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.2 rounded font-medium flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Protegido
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Consola oficial para el Consejo Coordinador Empresarial y Protección Civil. Supervisión de base de datos, validación y control de radio dinámico.
                </p>
              </div>

              <ul className="text-[11px] text-zinc-400 space-y-1.5 pt-2 border-t border-zinc-800/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Validación oficial de reportes ciudadanos</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Control de expansión de radio dinámico</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Base de datos sensible y resolución</span>
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowLoginModal(true)}
                icon={<Lock className="w-4 h-4 text-amber-400" />}
                className="w-full font-semibold justify-center border-zinc-700"
              >
                Acceso de Moderador
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Pie institucional */}
      <footer className="max-w-4xl w-full mx-auto text-center py-4 text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-zinc-900">
        <p>Iniciativa del Consejo Coordinador Empresarial de Lázaro Cárdenas</p>
        <p className="font-mono text-[11px]">HACKAITLAC 2026 · Versión 1.0</p>
      </footer>

      {/* MODAL DE INICIO DE SESIÓN PARA MODERADORES */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl card-highlight space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-700/80 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Acceso para Moderadores
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Ingresa tus credenciales autorizadas del CCE
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Hint de credenciales para evaluadores del Hackathon */}
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-amber-300">Credenciales de Demostración:</p>
                <p className="text-[11px] text-zinc-300 mt-0.5">
                  Usuario: <span className="font-mono font-bold text-amber-200">moderador</span> | Contraseña:{' '}
                  <span className="font-mono font-bold text-amber-200">cce2026</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleFillDemoCredentials}
                className="px-2 py-1 rounded bg-amber-900/60 hover:bg-amber-800/80 text-amber-100 text-[10px] font-semibold transition-all cursor-pointer shrink-0"
              >
                Autocompletar
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Usuario o Correo Institucional
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. moderador o cce.lazarocardenas@gmail.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Contraseña de Seguridad
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 pr-9 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLoginModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  isLoading={isLoading}
                  icon={<Lock className="w-3.5 h-3.5" />}
                  className="bg-amber-600 hover:bg-amber-500 border-amber-500/40 text-black font-bold"
                >
                  Ingresar a Consola de Mando
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
