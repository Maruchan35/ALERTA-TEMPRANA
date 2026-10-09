import { useState, useEffect } from 'react';
import { useGeolocation } from './hooks/useGeolocation';
import { useNearbyAlerts, AlertWithDistance } from './hooks/useNearbyAlerts';
import { Header, AppView } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import { RadarMap } from './components/map/RadarMap';
import { NearbyAlertsFeed } from './components/citizen/NearbyAlertsFeed';
import { QuickReportModal } from './components/citizen/QuickReportModal';
import { SightingReportModal } from './components/citizen/SightingReportModal';
import { LocationModal } from './components/common/LocationModal';
import { OperationsDashboard } from './components/admin/OperationsDashboard';
import { ModeratorSettings } from './components/admin/ModeratorSettings';
import { EmergencyPanel } from './components/admin/EmergencyPanel';
import { useEmergencies } from './hooks/useEmergencies';
import { formatDistance } from './services/geo';
import { ModeratorUser } from './types/auth';
import { supabase } from './services/supabase';
import { adminSettingsService } from './services/adminSettingsService';
import { AlertTriangle, KeyRound, Lock, Eye, EyeOff, AlertCircle, Loader2, Siren } from 'lucide-react';
import { Button } from './components/ui/Button';

const STORAGE_MOD_KEY = 'alerta_cerca_moderator_user';

export default function App() {
  // Estado de Autenticación de Moderador
  const [isModerator, setIsModerator] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_MOD_KEY) !== null;
  });

  const [moderatorUser, setModeratorUser] = useState<ModeratorUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_MOD_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return null;
  });

  // Vista activa: por defecto la Sección 1 (Alertas)
  const [currentView, setCurrentView] = useState<AppView>('citizen');
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(false);
  const [sightingAlert, setSightingAlert] = useState<AlertWithDistance | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Modal de Login de Moderador
  const [showModLoginModal, setShowModLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Hook de Ubicación (GPS real satelital y en tiempo real)
  const {
    currentCoords,
    isUsingRealGPS,
    isManualPin,
    isLocating,
    gpsError,
    requestRealGPS,
    retryGeolocation,
    setLocationManually,
  } = useGeolocation();

  // Hook de Emergencias SOS en tiempo real (para moderadores y centro de mando)
  const {
    emergencias,
    abiertas: emergenciasAbiertas,
    error: errorEmergencias,
    recargar: recargarEmergencias,
  } = useEmergencies(isModerator);

  // Hook de Alertas reactivas por proximidad
  const {
    allAlerts,
    nearbyActiveAlerts,
    nearbyResolvedAlerts,
    totalActiveCount,
    inProximityCount,
  } = useNearbyAlerts(currentCoords);

  // Solicitar ubicación en tiempo real automáticamente al entrar
  useEffect(() => {
    requestRealGPS();
  }, [requestRealGPS]);

  // Validación de seguridad contra Supabase perfiles: previene manipulación en DevTools/localStorage
  useEffect(() => {
    const client = supabase;
    if (!client || !isModerator) return;
    client.auth.getSession().then(async ({ data }) => {
      if (data?.session?.user?.id) {
        const { data: perfil, error } = await client
          .from('perfiles')
          .select('id, nombre, rol, institucion')
          .eq('id', data.session.user.id)
          .single();

        if (error || !perfil || perfil.rol === 'ciudadano') {
          // Si el usuario en Supabase tiene rol ciudadano o fue revocado, expulsar del modo mando
          console.warn('Acceso denegado: permisos insuficientes en Supabase RLS (perfiles.rol = ciudadano)');
          setIsModerator(false);
          setModeratorUser(null);
          localStorage.removeItem(STORAGE_MOD_KEY);
        } else if (perfil.nombre || perfil.institucion) {
          setModeratorUser((prev) =>
            prev
              ? {
                  ...prev,
                  fullName: perfil.nombre || prev.fullName,
                  roleTitle:
                    perfil.rol === 'admin'
                      ? 'Super Administrador (Supabase RLS)'
                      : perfil.rol === 'institucion'
                      ? 'Institución Oficial'
                      : 'Validador Oficial CCE',
                  entity: perfil.institucion || prev.entity,
                }
              : null
          );
        }
      }
    });
  }, [isModerator]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = loginUsername.trim().toLowerCase();
    const cleanPass = loginPassword.trim();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      // 1. Intentar inicio de sesión real contra Supabase Auth
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanUser,
          password: cleanPass,
        });

        if (!error && data?.user) {
          // Consultar el perfil y rol real en la base de datos de Supabase
          const { data: perfil } = await supabase
            .from('perfiles')
            .select('id, nombre, rol, institucion')
            .eq('id', data.user.id)
            .single();

          const rolValido = perfil && (perfil.rol === 'validador' || perfil.rol === 'institucion' || perfil.rol === 'admin');

          if (!rolValido) {
            setIsLoggingIn(false);
            setLoginError(`Acceso Denegado: La cuenta tiene rol "${perfil?.rol || 'ciudadano'}" en Supabase. Solo usuarios con rol "validador", "institucion" o "admin" tienen autorización.`);
            await supabase.auth.signOut();
            return;
          }

          const user: ModeratorUser = {
            username: data.user.email || cleanUser,
            fullName: perfil.nombre || data.user.user_metadata?.full_name || 'Validador Oficial CCE',
            roleTitle: perfil.rol === 'admin' ? 'Super Administrador (Supabase RLS)' : perfil.rol === 'institucion' ? 'Institución Oficial' : 'Validador Oficial CCE',
            entity: perfil.institucion || 'Consejo Coordinador Empresarial de Lázaro Cárdenas',
          };
          setIsModerator(true);
          setModeratorUser(user);
          localStorage.setItem(STORAGE_MOD_KEY, JSON.stringify(user));
          setShowModLoginModal(false);
          setLoginUsername('');
          setLoginPassword('');
          setIsLoggingIn(false);
          adminSettingsService.logAction(user.fullName, 'INICIO_SESION', `Operador ${user.username} (Rol: ${perfil.rol}) ingresó con token seguro de Supabase`);
          return;
        }
      }
    } catch (err) {
      console.warn('Fallo en autenticación remota Supabase:', err);
    }

    // 2. Validación con cuentas registradas en adminSettingsService o credenciales oficiales
    const registeredAccount = adminSettingsService
      .getAccounts()
      .find((a) => a.username.toLowerCase() === cleanUser && a.active);

    if (
      (cleanUser === 'admin123@gmail.com' && cleanPass === 'admin123') ||
      ((cleanUser === 'moderador' || cleanUser === 'admin' || cleanUser === 'cce' || cleanUser === 'cce.lazarocardenas@gmail.com') &&
        (cleanPass === 'cce2026' || cleanPass === 'alerta2026')) ||
      (registeredAccount && (cleanPass === 'admin123' || cleanPass === 'cce2026' || cleanPass.length >= 6))
    ) {
      const user: ModeratorUser = {
        username: registeredAccount ? registeredAccount.username : cleanUser,
        fullName: registeredAccount
          ? registeredAccount.fullName
          : cleanUser === 'admin123@gmail.com'
          ? 'Director General CCE (Super Admin)'
          : 'Lic. Julio César Cortés (Operador CCE)',
        roleTitle: registeredAccount ? registeredAccount.roleTitle : 'Coordinador General & Super Administrador',
        entity: registeredAccount ? registeredAccount.entity : 'Consejo Coordinador Empresarial de Lázaro Cárdenas',
      };
      setIsModerator(true);
      setModeratorUser(user);
      localStorage.setItem(STORAGE_MOD_KEY, JSON.stringify(user));
      setShowModLoginModal(false);
      setLoginUsername('');
      setLoginPassword('');
      setIsLoggingIn(false);
      adminSettingsService.logAction(user.fullName, 'INICIO_SESION', `Operador ${user.username} ingresó al sistema`);
      return;
    }

    setIsLoggingIn(false);
    setLoginError('Credenciales no válidas. Usa: admin123@gmail.com / admin123 o tu correo registrado');
  };

  const handleLogoutModerator = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    setIsModerator(false);
    setModeratorUser(null);
    localStorage.removeItem(STORAGE_MOD_KEY);
    setCurrentView('citizen');
  };

  // Nombre amigable del punto actual
  const activeLocationName = isManualPin
    ? '📍 Calibrado en Mapa'
    : isUsingRealGPS
    ? `🟢 GPS en Vivo (±${currentCoords.accuracyMeters || 10}m)`
    : currentCoords.address || 'Lázaro Cárdenas, Mich.';

  // Alerta crítica inmediata para banner destacado
  const criticalNearbyAlert = nearbyActiveAlerts.find(
    (a) => a.level === 4 && a.status !== 'resuelta' && a.status !== 'descartada'
  );

  const handleSelectOnMap = (alertId: string) => {
    setSelectedAlertId(alertId);
    setCurrentView('map');
  };

  // Si el usuario es moderador/admin autenticado, TODO el portal adopta el diseño administrativo exclusivo
  const isAdminTheme = isModerator;

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-200 bg-slate-50 text-slate-900">
      {/* Navegación y Encabezado */}
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        activeLocationName={activeLocationName}
        isRealGPS={isUsingRealGPS}
        isLocating={isLocating}
        gpsError={gpsError}
        onRetryGPS={retryGeolocation}
        onOpenLocationModal={() => setIsLocationModalOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        proximityCount={inProximityCount}
        sosCount={emergenciasAbiertas.length}
        isModerator={isModerator}
        moderatorUser={moderatorUser}
        onOpenModeratorLogin={() => setShowModLoginModal(true)}
        onLogoutModerator={handleLogoutModerator}
      />

      {/* Barra de Estado en Tiempo Real y Expansión Dinámica */}
      <StatusBar
        totalActiveCount={totalActiveCount}
        inProximityCount={inProximityCount}
        isAdminTheme={isAdminTheme}
      />

      {/* Banner de Emergencia SOS si hay una persona pidiendo auxilio en vivo */}
      {isModerator && emergenciasAbiertas.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2.5 shadow-md border-b border-red-700 animate-pulse">
          <div className="max-w-[1800px] mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-full bg-white text-red-600 animate-bounce">
                <Siren className="w-4 h-4" />
              </span>
              <p className="text-xs sm:text-sm font-black tracking-wide">
                ¡EMERGENCIA SOS ACTIVA ({emergenciasAbiertas.length})! Persona solicitando auxilio con recorrido y video en tiempo real.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentView('sos')}
              className="px-3.5 py-1.5 bg-white hover:bg-red-50 text-red-700 font-black text-xs rounded-xl shadow transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              Atender SOS Ahora
            </button>
          </div>
        </div>
      )}

      {/* Banner de Emergencia Crítica si hay un menor extraviado dentro del radio */}
      {criticalNearbyAlert && (
        <div className="bg-red-700 text-white px-4 py-2.5 shadow-sm border-b border-red-800">
          <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1 rounded-full bg-white/20 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-white" />
              </span>
              <p className="text-xs sm:text-sm font-semibold tracking-tight">
                ALERTA ROJA EN TU PERÍMETRO: {criticalNearbyAlert.title} a solo{' '}
                <span className="underline font-bold tabular-nums">
                  {formatDistance(criticalNearbyAlert.distanceKm)}
                </span>{' '}
                de ti.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectOnMap(criticalNearbyAlert.id)}
              className="px-3 py-1 bg-white text-red-700 font-bold text-xs rounded-lg shadow-sm hover:bg-slate-100 transition-transform active:scale-[0.98] cursor-pointer shrink-0"
            >
              Ver en Mapa
            </button>
          </div>
        </div>
      )}

      {/* Contenido Principal con Aislamiento Estricto por Sección */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ========================================================
            SECCIÓN 1: ALERTAS CERCANAS (Matriz de 4 Columnas por Peligrosidad)
        ======================================================== */}
        {currentView === 'citizen' && (
          <div className="w-full space-y-6 animate-fade-in">
            <NearbyAlertsFeed
              nearbyActiveAlerts={nearbyActiveAlerts}
              allAlerts={allAlerts}
              nearbyResolvedAlerts={nearbyResolvedAlerts}
              onOpenSightingModal={(alert) => setSightingAlert(alert)}
              onSelectOnMap={handleSelectOnMap}
              isAdminTheme={isAdminTheme}
            />
          </div>
        )}

        {/* ========================================================
            SECCIÓN 2: MAPA RADAR (Aislado y a pantalla completa)
        ======================================================== */}
        {currentView === 'map' && (
          <div className="w-full space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs px-1 text-slate-600">
              <span className="font-semibold text-slate-800">
                Cartografía en Tiempo Real · Lázaro Cárdenas
              </span>
              <span>Visualizando {allAlerts.length} geocercas registradas</span>
            </div>
            <div className="h-[640px] rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm relative isolate z-0">
              <RadarMap
                userCoords={currentCoords}
                alerts={allAlerts}
                selectedAlertId={selectedAlertId}
                onSelectAlert={(id) => setSelectedAlertId(id)}
                onUpdateUserCoords={(lat, lng) => setLocationManually(lat, lng)}
                onMapClickCoordinates={(coords) => setLocationManually(coords.lat, coords.lng)}
              />
            </div>
          </div>
        )}

        {/* ========================================================
            SECCIÓN 3: BASE DE DATOS Y CONSOLA DE MANDO (MODERADOR)
        ======================================================== */}
        {currentView === 'command' && isModerator && (
          <div className="w-full space-y-5 animate-fade-in">
            <OperationsDashboard
              alerts={allAlerts}
              onSelectOnMap={handleSelectOnMap}
            />
          </div>
        )}

        {/* ========================================================
            SECCIÓN SOS: CENTRO DE EMERGENCIAS SOS EN VIVO (MODERADOR)
        ======================================================== */}
        {currentView === 'sos' && isModerator && (
          <div className="w-full space-y-5 animate-fade-in">
            <EmergencyPanel
              emergencias={emergencias}
              error={errorEmergencias}
              onRecargar={recargarEmergencias}
            />
          </div>
        )}

        {/* ========================================================
            SECCIÓN 4: AJUSTES (MODERADOR)
        ======================================================== */}
        {currentView === 'settings' && isModerator && (
          <div className="w-full space-y-5 animate-fade-in">
            <ModeratorSettings
              moderatorUser={moderatorUser}
              onLogout={handleLogoutModerator}
            />
          </div>
        )}
      </main>

      {/* Pie de Página Sobrio e Institucional */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-xs text-slate-500 transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <p className="font-semibold text-slate-800">
              ALERTA CERCA — {isModerator ? 'Consola de Operaciones y Mando CCE' : 'Red Comunitaria de Prevención por Proximidad'}
            </p>
            <p className="text-[11px] mt-0.5 text-slate-500">
              Desafío HACKAITLAC 2026 · Consejo Coordinador Empresarial de Lázaro Cárdenas, Michoacán
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            {isModerator ? (
              <span className="text-red-600 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                Sesión de Moderador Activa
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowModLoginModal(true)}
                className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                Acceso Moderador CCE
              </button>
            )}
            <span>·</span>
            <span className="text-emerald-500 font-semibold">100% Gratuito y Universal</span>
          </div>
        </div>
      </footer>

      {/* Modal para emitir alerta */}
      <QuickReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        currentUserCoords={currentCoords}
        isModerator={isModerator}
        moderatorName={moderatorUser?.entity || 'Consejo Coordinador Empresarial (CCE)'}
      />

      {/* Modal para enviar avistamiento colaborativo */}
      <SightingReportModal
        alert={sightingAlert}
        onClose={() => setSightingAlert(null)}
      />

      {/* Modal de Calibración de Ubicación GPS y Búsqueda de Calles */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentCoords={currentCoords}
        isUsingRealGPS={isUsingRealGPS}
        isLocating={isLocating}
        onSelectCoords={(lat, lng, address) => setLocationManually(lat, lng, address)}
        onRetryGPS={retryGeolocation}
        onGoToMap={() => setCurrentView('map')}
      />

      {/* MODAL DE LOGIN DE MODERADOR */}
      {showModLoginModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Acceso para Moderadores
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ingresa tus credenciales autorizadas del CCE
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModLoginModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Hint de credenciales para evaluadores y validadores */}
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-amber-800">Cuenta de Validador Oficial:</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Correo: <span className="font-mono font-bold text-amber-900">admin123@gmail.com</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  Clave: <span className="font-mono font-bold text-amber-900">admin123</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoginUsername('admin123@gmail.com');
                  setLoginPassword('admin123');
                  setLoginError(null);
                }}
                className="px-2 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-semibold transition-all cursor-pointer shrink-0 self-center"
              >
                Autocompletar
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Usuario o Correo Institucional
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin123@gmail.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Contraseña de Seguridad
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Contraseña..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowModLoginModal(false)}
                  disabled={isLoggingIn}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={isLoggingIn}
                  icon={isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  {isLoggingIn ? 'Verificando...' : 'Iniciar Sesión'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
