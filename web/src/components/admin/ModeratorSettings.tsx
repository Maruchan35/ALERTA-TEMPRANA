import React, { useState } from 'react';
import { ModeratorUser } from '../../types/auth';
import {
  adminSettingsService,
  AdminAccount,
  AdminRole,
  EmergencyContact,
  CabinPreferences,
  AuditLogEntry,
} from '../../services/adminSettingsService';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  CheckCircle2,
  LogOut,
  Users,
  Sliders,
  PhoneCall,
  Volume2,
  FileText,
  UserPlus,
  Trash2,
  Check,
  X,
  Download,
  Plus,
  Sparkles,
} from 'lucide-react';

interface ModeratorSettingsProps {
  moderatorUser: ModeratorUser | null;
  onLogout: () => void;
}

type SettingsTab = 'operators' | 'protocols' | 'contacts' | 'cabin' | 'audit' | 'security';

export const ModeratorSettings: React.FC<ModeratorSettingsProps> = ({
  moderatorUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('operators');

  // Estados de Operadores
  const [accounts, setAccounts] = useState<AdminAccount[]>(() => adminSettingsService.getAccounts());
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AdminRole>('operador');
  const [newUserEntity, setNewUserEntity] = useState('Consejo Coordinador Empresarial (CCE)');
  const [newUserPhone, setNewUserPhone] = useState('');

  // Estados de Preferencias y Protocolo
  const [prefs, setPrefs] = useState<CabinPreferences>(() => adminSettingsService.getPreferences());
  const [savePrefsSuccess, setSavePrefsSuccess] = useState(false);

  // Estados de Contactos de Emergencia
  const [contacts, setContacts] = useState<EmergencyContact[]>(() =>
    adminSettingsService.getEmergencyContacts()
  );
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactDept, setNewContactDept] = useState('');

  // Estados de Auditoría
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    adminSettingsService.getAuditLogs()
  );
  const [auditSearch, setAuditSearch] = useState('');

  // Estados de Cambio de Contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notificación Toast
  const [toast, setToast] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // --- ACCIONES DE OPERADORES ---
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserName.trim()) return;

    const roleTitles: Record<AdminRole, string> = {
      superadmin: 'Super Administrador / Director',
      operador: 'Operador de Mando & Validador CCE',
      observador: 'Enlace de Seguridad (Solo Consulta)',
    };

    const created = adminSettingsService.createAccount({
      username: newUserEmail.trim().toLowerCase(),
      fullName: newUserName.trim(),
      role: newUserRole,
      roleTitle: roleTitles[newUserRole],
      entity: newUserEntity.trim(),
      active: true,
      phone: newUserPhone.trim() || undefined,
    });

    setAccounts(adminSettingsService.getAccounts());
    setAuditLogs(adminSettingsService.getAuditLogs());
    setShowNewUserModal(false);
    setNewUserEmail('');
    setNewUserName('');
    setNewUserPhone('');
    showNotification(`Operador "${created.fullName}" dado de alta satisfactoriamente.`);
  };

  const handleToggleStatus = (id: string) => {
    const ok = adminSettingsService.toggleAccountStatus(id);
    if (!ok) {
      showNotification('No se puede desactivar al único Super Administrador activo.');
      return;
    }
    setAccounts(adminSettingsService.getAccounts());
    setAuditLogs(adminSettingsService.getAuditLogs());
    showNotification('Estado del operador actualizado.');
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (confirm(`¿Estás seguro de revocar y eliminar el acceso de "${name}"?`)) {
      const ok = adminSettingsService.deleteAccount(id);
      if (!ok) {
        showNotification('No es posible eliminar una cuenta con rango Super Administrador.');
        return;
      }
      setAccounts(adminSettingsService.getAccounts());
      setAuditLogs(adminSettingsService.getAuditLogs());
      showNotification(`Cuenta de ${name} eliminada.`);
    }
  };

  // --- ACCIONES DE PREFERENCIAS DE PROTOCOLO ---
  const handleSavePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = adminSettingsService.updatePreferences(prefs);
    setPrefs(updated);
    setAuditLogs(adminSettingsService.getAuditLogs());
    setSavePrefsSuccess(true);
    setTimeout(() => setSavePrefsSuccess(false), 3000);
    showNotification('Parámetros de cabina y radio adaptativo guardados.');
  };

  // --- ACCIONES DE CONTACTOS ---
  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;

    adminSettingsService.addEmergencyContact({
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      department: newContactDept.trim() || 'Servicio de Emergencia',
    });

    setContacts(adminSettingsService.getEmergencyContacts());
    setShowNewContactModal(false);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactDept('');
    showNotification('Contacto de emergencia agregado al directorio.');
  };

  const handleDeleteContact = (id: string) => {
    adminSettingsService.deleteEmergencyContact(id);
    setContacts(adminSettingsService.getEmergencyContacts());
    showNotification('Contacto eliminado del directorio.');
  };

  // --- ACCIONES DE CONTRASEÑA ---
  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
    showNotification('Contraseña principal de acceso actualizada.');
  };

  // Exportar Auditoría a JSON
  const handleExportAudit = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `auditoria_cce_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification('Registro de auditoría exportado correctamente.');
  };

  const filteredLogs = auditLogs.filter(
    (l) =>
      l.operatorName.toLowerCase().includes(auditSearch.toLowerCase()) ||
      l.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
      l.details.toLowerCase().includes(auditSearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fade-in text-slate-900">
      {/* Toast Flotante */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[999999] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Cabecera Principal */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shadow-2xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  Centro de Mando & Ajustes de Cabina
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-black uppercase tracking-wider">
                  Super Admin CCE
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Gestión de operadores oficiales, protocolos de radio adaptativo, auditoría y seguridad.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-red-200/90 text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión de Mando</span>
          </button>
        </div>

        {/* Resumen del Operador Conectado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold font-mono">
              Sesión Activa
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate">
              {moderatorUser?.fullName || 'Director General CCE'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold font-mono">
              Entidad Asignada
            </span>
            <span className="text-sm font-bold text-slate-800 mt-0.5 block truncate">
              {moderatorUser?.entity || 'Consejo Coordinador Empresarial'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold font-mono">
                Operadores Habilitados
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block font-mono tabular-nums">
                {accounts.filter((a) => a.active).length} <span className="text-xs font-sans text-slate-500 font-normal">de</span> {accounts.length} Activos
              </span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Pestañas de Navegación de Ajustes */}
        <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-slate-100 mt-4">
          {[
            { id: 'operators', label: 'Operadores & Roles', icon: Users, count: accounts.length },
            { id: 'protocols', label: 'Radio Adaptativo', icon: Sliders },
            { id: 'contacts', label: 'Directorio 911', icon: PhoneCall, count: contacts.length },
            { id: 'cabin', label: 'Sonidos & Pantalla', icon: Volume2 },
            { id: 'audit', label: 'Auditoría Forense', icon: FileText, count: auditLogs.length },
            { id: 'security', label: 'Seguridad & Clave', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all select-none cursor-pointer active:scale-[0.98] ${
                  isActive
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================
          PESTAÑA 1: GESTIÓN DE OPERADORES Y SUPER ADMIN
      ======================================================== */}
      {activeTab === 'operators' && (
        <div className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-red-600" />
                  <span>Cuentas de Operadores y Administradores Autorizados</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Como Super Administrador puedes dar de alta nuevos operadores, definir sus facultades o suspender su acceso.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewUserModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Dar de Alta Operador</span>
              </button>
            </div>

            {/* Tabla de Operadores */}
            <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] font-semibold font-mono tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Operador / Correo</th>
                    <th className="px-4 py-3">Rol & Autorización</th>
                    <th className="px-4 py-3">Entidad / Enlace</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{acc.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{acc.username}</div>
                        {acc.phone && <div className="text-[10px] text-slate-400">Tel: {acc.phone}</div>}
                      </td>

                      <td className="px-4 py-3">
                        {acc.role === 'superadmin' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                            <Sparkles className="w-3 h-3 text-red-600" />
                            Super Admin
                          </span>
                        ) : acc.role === 'operador' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                            Validador CCE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[10px]">
                            Observador 911
                          </span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">{acc.roleTitle}</div>
                      </td>

                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {acc.entity}
                      </td>

                      <td className="px-4 py-3">
                        {acc.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[10px]">
                            Suspendido
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(acc.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-[0.98] cursor-pointer ${
                            acc.active
                              ? 'border-slate-200/80 text-slate-700 hover:bg-slate-100'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          {acc.active ? 'Suspender' : 'Habilitar'}
                        </button>

                        {acc.role !== 'superadmin' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(acc.id, acc.fullName)}
                            className="p-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Eliminar operador"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PESTAÑA 2: PROTOCOLOS & RADIO ADAPTATIVO
      ======================================================== */}
      {activeTab === 'protocols' && (
        <form onSubmit={handleSavePrefs} className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-red-600" />
                <span>Protocolos de Búsqueda y Expansión Adaptativa</span>
              </h3>
              <p className="text-xs text-slate-500">
                Ajusta las reglas matemáticas de dispersión de radio en Lázaro Cárdenas para menores desaparecidos y alertas Código Rojo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Tiempo entre Fases de Expansión (Minutos)
                </label>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Tiempo que debe transcurrir para que una alerta crítica pase automáticamente a la siguiente fase de cobertura territorial (1km → 3km → 5km → 10km → 25km).
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={prefs.autoExpandRadioMinutes}
                    onChange={(e) =>
                      setPrefs({ ...prefs, autoExpandRadioMinutes: parseInt(e.target.value) })
                    }
                    className="flex-1 accent-slate-900 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs tabular-nums">
                    {prefs.autoExpandRadioMinutes} min
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Radio Límite Máximo Permitido (Kilómetros)
                </label>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Alcance geodésico máximo para todo el municipio de Lázaro Cárdenas incluyendo carreteras, salidas y accesos portuarios.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="15"
                    max="50"
                    step="5"
                    value={prefs.maxAdaptiveRadiusKm}
                    onChange={(e) =>
                      setPrefs({ ...prefs, maxAdaptiveRadiusKm: parseInt(e.target.value) })
                    }
                    className="flex-1 accent-slate-900 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-xs text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs tabular-nums">
                    {prefs.maxAdaptiveRadiusKm} km
                  </span>
                </div>
              </div>
            </div>

            {/* Explicación de Fases Oficiales */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-3">
              <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-700" />
                <span>Protocolo Oficial CCE de Expansión Geodésica:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70">
                  <div className="font-mono text-[10px] font-bold uppercase text-slate-500">Fase 1 · Barrial</div>
                  <div className="font-bold text-slate-900 mt-0.5">1.0 km a 3.0 km</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">0 a {prefs.autoExpandRadioMinutes} min</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70">
                  <div className="font-mono text-[10px] font-bold uppercase text-slate-500">Fase 2 · Sector</div>
                  <div className="font-bold text-slate-900 mt-0.5">5.0 km</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">{prefs.autoExpandRadioMinutes} a {prefs.autoExpandRadioMinutes * 2} min</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70">
                  <div className="font-mono text-[10px] font-bold uppercase text-slate-500">Fase 3 · Periferia</div>
                  <div className="font-bold text-slate-900 mt-0.5">10.0 km</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">{prefs.autoExpandRadioMinutes * 2} a {prefs.autoExpandRadioMinutes * 3} min</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70">
                  <div className="font-mono text-[10px] font-bold uppercase text-slate-500">Fase 4 · Filtros</div>
                  <div className="font-bold text-slate-900 mt-0.5">{prefs.maxAdaptiveRadiusKm}.0 km</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">+{prefs.autoExpandRadioMinutes * 3} min</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Guardar Parámetros de Protocolo</span>
              </button>

              {savePrefsSuccess && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Cambios aplicados en tiempo real
                </span>
              )}
            </div>
          </div>
        </form>
      )}

      {/* ========================================================
          PESTAÑA 3: DIRECTORIO DE ENLACES DE EMERGENCIA 911
      ======================================================== */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-red-600" />
                  <span>Directorio Oficial de Despacho & Corporaciones</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Números de enlace directo desplegados en fichas forenses, avisos de cabina y enlace SOS.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewContactModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Número Oficial</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 shadow-2xs transition-all relative flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                        {c.department}
                      </span>
                      {c.isPrimary && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[9px] font-semibold">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-slate-900">{c.name}</div>
                    <div className="text-base font-mono font-bold text-slate-900 mt-2 flex items-center gap-1.5 tabular-nums">
                      <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
                      <span>{c.phone}</span>
                    </div>
                  </div>

                  {!c.isPrimary && (
                    <div className="pt-3 border-t border-slate-100 mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(c.id)}
                        className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PESTAÑA 4: SONIDOS & CABINA DE MANDO
      ======================================================== */}
      {activeTab === 'cabin' && (
        <form onSubmit={handleSavePrefs} className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-red-600" />
                <span>Preferencias de Alertas Sonoras y Pantalla de Cabina</span>
              </h3>
              <p className="text-xs text-slate-500">
                Configuración ergonómica para guardias operativas y monitores centrales del CCE.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Alerta Sonora Continua en Código Rojo
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Repite la alarma auditiva de forma periódica hasta que el operador presione "Verificar" o "Descartar".
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.soundCodeRedContinuous}
                  onChange={(e) =>
                    setPrefs({ ...prefs, soundCodeRedContinuous: e.target.checked })
                  }
                  className="w-4 h-4 accent-slate-900 rounded cursor-pointer mt-0.5"
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Modo Pantalla Activa (Anti-Suspensión)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Mantiene la pantalla de cabina encendida sin apagarse durante guardias y monitoreo de emergencias.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.kioskKeepScreenAlive}
                  onChange={(e) =>
                    setPrefs({ ...prefs, kioskKeepScreenAlive: e.target.checked })
                  }
                  className="w-4 h-4 accent-slate-900 rounded cursor-pointer mt-0.5"
                />
              </div>
            </div>

            {/* Selector de Volumen de Sirena SOS */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Nivel de Volumen Sirena SOS ({prefs.sosSirenVolume}%)</span>
                <span className="text-[11px] text-slate-500 font-normal">Alerta de pánico ciudadana</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={prefs.sosSirenVolume}
                onChange={(e) =>
                  setPrefs({ ...prefs, sosSirenVolume: parseInt(e.target.value) })
                }
                className="w-full accent-slate-900 cursor-pointer"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Preferencias de Cabina</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================
          PESTAÑA 5: AUDITORÍA FORENSE INMUTABLE (AUDIT LOG)
      ======================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>Bitácora de Auditoría Forense Inmutable</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Registro cronológico de todas las intervenciones realizadas por operadores para soporte judicial.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAudit}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 font-medium text-xs transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Auditoría (.JSON)</span>
                </button>
              </div>
            </div>

            {/* Buscador de Logs */}
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filtrar por operador, acción o palabra clave..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
            />

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50/50 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-900">{log.operatorName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({log.operatorRole})</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{log.details}</p>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 sm:text-right shrink-0 tabular-nums">
                      <div>{new Date(log.timestamp).toLocaleString('es-MX')}</div>
                      <div>{log.ipOrDevice}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200/80 rounded-xl">
                  No se encontraron registros que coincidan con la búsqueda.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PESTAÑA 6: SEGURIDAD & CONTRASEÑA
      ======================================================== */}
      {activeTab === 'security' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <span>Actualizar Contraseña de Acceso</span>
            </h3>
            <p className="text-xs text-slate-500">
              Modifica la clave de acceso utilizada para proteger la consola confidencial del Centro de Mando.
            </p>
          </div>

          {passwordSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Contraseña actualizada satisfactoriamente.</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contraseña Actual
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa clave actual (ej. admin123 o cce2026)"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Guardar Nueva Contraseña</span>
            </button>
          </form>
        </div>
      )}

      {/* ========================================================
          MODAL: DAR DE ALTA NUEVO OPERADOR (SUPER ADMIN)
      ======================================================== */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Alta de Operador / Administrador CCE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewUserModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre Completo del Operador *
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej. Ing. Martín Valenzuela (CCE)"
                  required
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Correo Electrónico Oficial (Login) *
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="ej. operador1@cce.org.mx"
                  required
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 font-mono transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rol en la Plataforma *
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as AdminRole)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 cursor-pointer transition-colors"
                  >
                    <option value="operador">Validador CCE (Operativo)</option>
                    <option value="superadmin">Super Administrador</option>
                    <option value="observador">Observador 911 (Solo Consulta)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Teléfono Celular / Radio
                  </label>
                  <input
                    type="text"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    placeholder="Ej. 753-123-4567"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Entidad o Dependencia Oficial
                </label>
                <input
                  type="text"
                  value={newUserEntity}
                  onChange={(e) => setNewUserEntity(e.target.value)}
                  placeholder="Ej. CCE Lázaro Cárdenas / Protección Civil"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                />
              </div>

              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-600 font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Crear y Habilitar Acceso</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: AGREGAR CONTACTO DE EMERGENCIA
      ======================================================== */}
      {showNewContactModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Agregar Contacto de Emergencia Oficial
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre de la Corporación o Enlace *
                </label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Ej. Centro Regulador de Urgencias Médicas (CRUM)"
                  required
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Teléfono / Línea Directa *
                </label>
                <input
                  type="text"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="Ej. 753-532-0000 o 911"
                  required
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Área o Departamento
                </label>
                <input
                  type="text"
                  value={newContactDept}
                  onChange={(e) => setNewContactDept(e.target.value)}
                  placeholder="Ej. Paramédicos / Policía / Tránsito"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                />
              </div>

              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewContactModal(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-600 font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-all shadow-2xs active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Guardar en Directorio</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
