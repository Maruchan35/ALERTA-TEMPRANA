import React, { useState } from 'react';
import { ModeratorUser } from '../../types/auth';
import { Button } from '../ui/Button';
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
  AlertTriangle,
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

          <Button
            variant="danger"
            size="sm"
            onClick={onLogout}
            icon={<LogOut className="w-3.5 h-3.5" />}
            className="bg-red-600 hover:bg-red-700 text-white font-bold self-start sm:self-auto cursor-pointer"
          >
            Cerrar Sesión de Mando
          </Button>
        </div>

        {/* Resumen del Operador Conectado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
              Sesión Activa
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate">
              {moderatorUser?.fullName || 'Director General CCE'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
              Entidad Asignada
            </span>
            <span className="text-sm font-bold text-slate-800 mt-0.5 block truncate">
              {moderatorUser?.entity || 'Consejo Coordinador Empresarial'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Operadores Habilitados
              </span>
              <span className="text-sm font-black text-emerald-700 mt-0.5 block">
                {accounts.filter((a) => a.active).length} de {accounts.length} Activos
              </span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Pestañas de Navegación de Ajustes */}
        <div className="flex flex-wrap items-center gap-1.5 pt-5 border-t border-slate-200 mt-5">
          <button
            type="button"
            onClick={() => setActiveTab('operators')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'operators'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Operadores & Super Admin</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {accounts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('protocols')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'protocols'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Radio Adaptativo & Tiempos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'contacts'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
            <span>Enlaces 911 & Directorio</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {contacts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cabin')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'cabin'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Sonidos & Pantalla de Cabina</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Auditoría Forense</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
              {auditLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Seguridad & Clave</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          PESTAÑA 1: GESTIÓN DE OPERADORES Y SUPER ADMIN
      ======================================================== */}
      {activeTab === 'operators' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
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

              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNewUserModal(true)}
                icon={<UserPlus className="w-3.5 h-3.5" />}
                className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Dar de Alta Operador
              </Button>
            </div>

            {/* Tabla de Operadores */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-black text-[10px]">
                            <Sparkles className="w-3 h-3 text-red-600" />
                            Super Admin
                          </span>
                        ) : acc.role === 'operador' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px]">
                            Validador CCE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">
                            Suspendido
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(acc.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                            acc.active
                              ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
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
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
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
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
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
                    className="flex-1 accent-red-600 cursor-pointer"
                  />
                  <span className="font-mono font-black text-sm text-red-600 bg-white px-3 py-1 rounded-lg border border-slate-200">
                    {prefs.autoExpandRadioMinutes} min
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
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
                    className="flex-1 accent-red-600 cursor-pointer"
                  />
                  <span className="font-mono font-black text-sm text-red-600 bg-white px-3 py-1 rounded-lg border border-slate-200">
                    {prefs.maxAdaptiveRadiusKm} km
                  </span>
                </div>
              </div>
            </div>

            {/* Explicación de Fases Oficiales */}
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Protocolo Oficial CCE de Expansión Geodésica:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
                <li><strong>Fase 1 (0-{prefs.autoExpandRadioMinutes}m):</strong> Radio inicial barrial inmediato (1.0 km a 3.0 km).</li>
                <li><strong>Fase 2 ({prefs.autoExpandRadioMinutes}-{prefs.autoExpandRadioMinutes * 2}m):</strong> Sector urbano ampliado y avenidas principales (5.0 km).</li>
                <li><strong>Fase 3 ({prefs.autoExpandRadioMinutes * 2}-{prefs.autoExpandRadioMinutes * 3}m):</strong> Zona conurbada, accesos portuarios y periferia (10.0 km).</li>
                <li><strong>Fase 4 (+{prefs.autoExpandRadioMinutes * 3}m):</strong> Cobertura municipal total, filtros carreteros y salidas ({prefs.maxAdaptiveRadiusKm}.0 km).</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={<Check className="w-4 h-4" />}
                className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Guardar Parámetros de Protocolo
              </Button>

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
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
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

              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNewContactModal(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Agregar Número Oficial
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition-colors relative flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {c.department}
                      </span>
                      {c.isPrimary && (
                        <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-800 font-bold text-[9px]">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900">{c.name}</div>
                    <div className="text-base font-mono font-black text-red-600 mt-2 flex items-center gap-1.5">
                      <PhoneCall className="w-4 h-4 text-red-600" />
                      <span>{c.phone}</span>
                    </div>
                  </div>

                  {!c.isPrimary && (
                    <div className="pt-3 border-t border-slate-200 mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(c.id)}
                        className="text-[11px] text-red-600 hover:text-red-800 font-bold flex items-center gap-1 cursor-pointer"
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
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6">
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
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
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
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
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
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Selector de Volumen de Sirena SOS */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Nivel de Volumen Sirena SOS ({prefs.sosSirenVolume}%)</span>
                <span className="text-[11px] text-slate-500">Alerta de pánico ciudadana</span>
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
                className="w-full accent-red-600 cursor-pointer"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={<Check className="w-4 h-4" />}
              className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
            >
              Guardar Preferencias de Cabina
            </Button>
          </div>
        </form>
      )}

      {/* ========================================================
          PESTAÑA 5: AUDITORÍA FORENSE INMUTABLE (AUDIT LOG)
      ======================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportAudit}
                  icon={<Download className="w-3.5 h-3.5" />}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300 cursor-pointer"
                >
                  Exportar Auditoría (.JSON)
                </Button>
              </div>
            </div>

            {/* Buscador de Logs */}
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filtrar por operador, acción o palabra clave..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
            />

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-200 text-slate-800">
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-900">{log.operatorName}</span>
                        <span className="text-[10px] text-slate-400">({log.operatorRole})</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">{log.details}</p>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 sm:text-right shrink-0">
                      <div>{new Date(log.timestamp).toLocaleString('es-MX')}</div>
                      <div>{log.ipOrDevice}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
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
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
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
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Contraseña actualizada satisfactoriamente.</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span>{passwordError}</span>
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
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                required
              />
            </div>

            <Button
              variant="primary"
              size="md"
              type="submit"
              icon={<Lock className="w-3.5 h-3.5" />}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
            >
              Guardar Nueva Contraseña
            </Button>
          </form>
        </div>
      )}

      {/* ========================================================
          MODAL: DAR DE ALTA NUEVO OPERADOR (SUPER ADMIN)
      ======================================================== */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Alta de Operador / Administrador CCE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewUserModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-3.5 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={<UserPlus className="w-3.5 h-3.5" />}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                >
                  Crear y Habilitar Acceso
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: AGREGAR CONTACTO DE EMERGENCIA
      ======================================================== */}
      {showNewContactModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Agregar Contacto de Emergencia Oficial
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewContactModal(false)}
                  className="px-3.5 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                >
                  Guardar en Directorio
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
