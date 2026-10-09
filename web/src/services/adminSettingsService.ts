import { supabase } from './supabase';

export type AdminRole = 'superadmin' | 'operador' | 'observador';

export interface AdminAccount {
  id: string;
  username: string;
  fullName: string;
  role: AdminRole;
  roleTitle: string;
  entity: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  phone?: string;
  source?: 'supabase' | 'local';
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  department: string;
  isPrimary?: boolean;
}

export interface CabinPreferences {
  soundCodeRedContinuous: boolean;
  sosSirenVolume: number; // 0 a 100
  kioskKeepScreenAlive: boolean;
  autoExpandRadioMinutes: number; // Minutos entre fases de expansión
  maxAdaptiveRadiusKm: number; // Radio límite (ej. 25km)
  autoRefreshIntervalSeconds: number; // Intervalo de refresco en vivo
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  operatorName: string;
  operatorRole: string;
  action: string;
  details: string;
  ipOrDevice?: string;
  alertaId?: string;
  source?: 'supabase' | 'local';
}

const STORAGE_ACCOUNTS_KEY = 'alerta_cerca_admin_accounts';
const STORAGE_PREFS_KEY = 'alerta_cerca_cabin_prefs';
const STORAGE_CONTACTS_KEY = 'alerta_cerca_emergency_contacts';
const STORAGE_AUDIT_KEY = 'alerta_cerca_audit_log';

// Cuentas predeterminadas iniciales
const INITIAL_ACCOUNTS: AdminAccount[] = [
  {
    id: 'usr-superadmin-01',
    username: 'admin123@gmail.com',
    fullName: 'Director General CCE (Super Admin)',
    role: 'superadmin',
    roleTitle: 'Coordinador General & Super Administrador',
    entity: 'Consejo Coordinador Empresarial (CCE)',
    active: true,
    createdAt: '2026-01-15T08:00:00Z',
    lastLogin: new Date().toISOString(),
    phone: '753-532-1200',
  },
  {
    id: 'usr-operador-02',
    username: 'cce.lazarocardenas@gmail.com',
    fullName: 'Lic. Julio César Cortés',
    role: 'operador',
    roleTitle: 'Operador de Enlace & Validador CCE',
    entity: 'CCE Lázaro Cárdenas',
    active: true,
    createdAt: '2026-02-01T10:30:00Z',
    lastLogin: '2026-10-08T18:30:00Z',
    phone: '753-102-4589',
  },
  {
    id: 'usr-observador-03',
    username: 'c5i.enlace@michoacan.gob.mx',
    fullName: 'Comandancia C5i Costa Michoacán',
    role: 'observador',
    roleTitle: 'Enlace de Seguridad Pública',
    entity: 'Secretaría de Seguridad Pública / C5i',
    active: true,
    createdAt: '2026-02-10T12:00:00Z',
    lastLogin: '2026-10-08T14:15:00Z',
    phone: '911',
  },
];

const INITIAL_CONTACTS: EmergencyContact[] = [
  { id: 'cnt-1', name: 'Centro de Atención de Llamadas de Emergencia', phone: '911', department: 'C5i Michoacán', isPrimary: true },
  { id: 'cnt-2', name: 'Denuncia Anónima Inmediata', phone: '089', department: 'Fiscalía General del Estado', isPrimary: true },
  { id: 'cnt-3', name: 'Cruz Roja Mexicana Delegación Lázaro Cárdenas', phone: '753-537-2244', department: 'Cuerpo de Paramédicos' },
  { id: 'cnt-4', name: 'Protección Civil & Bomberos Municipales', phone: '753-532-1925', department: 'Gobierno Municipal' },
  { id: 'cnt-5', name: 'Comandancia de Seguridad Pública Municipal', phone: '753-537-4004', department: 'Policía Municipal' },
  { id: 'cnt-6', name: 'Capitanía de Puerto / Décima Cuarta Zona Naval', phone: '753-532-0158', department: 'SEMAR / Rescate Marítimo' },
];

const INITIAL_PREFS: CabinPreferences = {
  soundCodeRedContinuous: true,
  sosSirenVolume: 90,
  kioskKeepScreenAlive: true,
  autoExpandRadioMinutes: 30,
  maxAdaptiveRadiusKm: 25,
  autoRefreshIntervalSeconds: 10,
};

class AdminSettingsService {
  private accounts: AdminAccount[];
  private prefs: CabinPreferences;
  private contacts: EmergencyContact[];
  private auditLogs: AuditLogEntry[];

  constructor() {
    this.accounts = this.loadFromStorage(STORAGE_ACCOUNTS_KEY, INITIAL_ACCOUNTS);
    this.prefs = this.loadFromStorage(STORAGE_PREFS_KEY, INITIAL_PREFS);
    this.contacts = this.loadFromStorage(STORAGE_CONTACTS_KEY, INITIAL_CONTACTS);
    this.auditLogs = this.loadFromStorage(STORAGE_AUDIT_KEY, [
      {
        id: 'aud-001',
        timestamp: new Date().toISOString(),
        operatorName: 'Super Admin CCE',
        operatorRole: 'superadmin',
        action: 'INICIO_SISTEMA',
        details: 'Inicio del Centro de Operaciones CCE Lázaro Cárdenas v1.2.0',
        ipOrDevice: 'Consola Central',
      },
    ]);
  }

  private loadFromStorage<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    return fallback;
  }

  private saveToStorage<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('Error al persistir adminSettings:', err);
    }
  }

  // --- 1. GESTIÓN DE OPERADORES Y CUENTAS CON VALIDACIÓN RLS EN SUPABASE ---
  public async verifyUserRole(userId: string): Promise<{
    valid: boolean;
    role: AdminRole;
    rawRole: string;
    nombre: string;
    institucion: string;
  } | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre, rol, institucion')
        .eq('id', userId)
        .single();

      if (error || !data) return null;

      // Solo roles con privilegios bajo RLS es_validador()
      if (!['admin', 'validador', 'institucion'].includes(data.rol)) {
        return null;
      }

      let role: AdminRole = 'operador';
      if (data.rol === 'admin') role = 'superadmin';
      else if (data.rol === 'institucion') role = 'observador';

      return {
        valid: true,
        role,
        rawRole: data.rol,
        nombre: data.nombre || 'Validador Oficial CCE',
        institucion: data.institucion || 'Consejo Coordinador Empresarial',
      };
    } catch (err) {
      console.warn('Error verificando rol en perfiles:', err);
      return null;
    }
  }

  public getAccounts(): AdminAccount[] {
    return [...this.accounts];
  }

  public async fetchServerAccounts(): Promise<AdminAccount[]> {
    if (!supabase) return this.getAccounts();
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre, rol, institucion, creado_en')
        .in('rol', ['admin', 'validador', 'institucion'])
        .order('creado_en', { ascending: false });

      if (error || !data || data.length === 0) {
        return this.getAccounts();
      }

      const roleTitles: Record<string, string> = {
        admin: 'Coordinador General & Super Administrador RLS',
        validador: 'Operador de Mando & Validador CCE',
        institucion: 'Enlace de Seguridad / Protección Civil',
      };

      const serverAccounts: AdminAccount[] = data.map((p) => {
        let mappedRole: AdminRole = 'operador';
        if (p.rol === 'admin') mappedRole = 'superadmin';
        else if (p.rol === 'institucion') mappedRole = 'observador';

        const local = this.accounts.find((a) => a.id === p.id || a.fullName === p.nombre);

        return {
          id: p.id,
          username: local?.username || `${p.nombre?.toLowerCase().replace(/\s+/g, '.') || 'operador'}@cce.gob.mx`,
          fullName: p.nombre || 'Operador Oficial CCE',
          role: mappedRole,
          roleTitle: roleTitles[p.rol] || 'Validador Oficial CCE',
          entity: p.institucion || 'Consejo Coordinador Empresarial',
          active: true,
          createdAt: p.creado_en || new Date().toISOString(),
          lastLogin: local?.lastLogin,
          phone: local?.phone,
          source: 'supabase',
        };
      });

      // Asegurar que las cuentas locales preconfiguradas también estén visibles si no chocan
      const merged = [...serverAccounts];
      for (const loc of this.accounts) {
        if (!merged.some((m) => m.id === loc.id || m.username === loc.username)) {
          merged.push({ ...loc, source: 'local' });
        }
      }

      return merged;
    } catch (err) {
      console.warn('Error obteniendo cuentas de Supabase:', err);
      return this.getAccounts();
    }
  }

  public createAccount(newAccount: Omit<AdminAccount, 'id' | 'createdAt'>): AdminAccount {
    const account: AdminAccount = {
      ...newAccount,
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
      active: true,
    };
    this.accounts.push(account);
    this.saveToStorage(STORAGE_ACCOUNTS_KEY, this.accounts);

    this.logAction(
      newAccount.fullName,
      'CREACION_USUARIO',
      `Creado nuevo operador ${account.username} con rol ${account.role}`
    );

    return account;
  }

  public toggleAccountStatus(id: string): boolean {
    const index = this.accounts.findIndex((a) => a.id === id);
    if (index === -1) return false;
    
    // Proteger el superadmin inicial
    if (this.accounts[index].role === 'superadmin' && this.accounts.filter(a => a.role === 'superadmin' && a.active).length <= 1) {
      if (this.accounts[index].active) return false;
    }

    this.accounts[index].active = !this.accounts[index].active;
    this.saveToStorage(STORAGE_ACCOUNTS_KEY, this.accounts);

    this.logAction(
      'Super Admin',
      'CAMBIO_ESTADO_USUARIO',
      `Operador ${this.accounts[index].fullName} marcado como ${this.accounts[index].active ? 'ACTIVO' : 'SUSPENDIDO'}`
    );

    return true;
  }

  public deleteAccount(id: string): boolean {
    const acc = this.accounts.find((a) => a.id === id);
    if (!acc || acc.role === 'superadmin') return false;

    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.saveToStorage(STORAGE_ACCOUNTS_KEY, this.accounts);

    this.logAction('Super Admin', 'ELIMINACION_USUARIO', `Operador ${acc.fullName} (${acc.username}) eliminado`);
    return true;
  }

  // --- 2. PREFERENCIAS DE CABINA ---
  public getPreferences(): CabinPreferences {
    return { ...this.prefs };
  }

  public updatePreferences(newPrefs: Partial<CabinPreferences>): CabinPreferences {
    this.prefs = { ...this.prefs, ...newPrefs };
    this.saveToStorage(STORAGE_PREFS_KEY, this.prefs);

    this.logAction(
      'Operador en Turno',
      'CONFIGURACION_CABINA',
      'Parámetros tácticos y alertas sonoras actualizados'
    );

    return { ...this.prefs };
  }

  // --- 3. DIRECTORIO DE CONTACTOS DE EMERGENCIA ---
  public getEmergencyContacts(): EmergencyContact[] {
    return [...this.contacts];
  }

  public addEmergencyContact(contact: Omit<EmergencyContact, 'id'>): EmergencyContact {
    const newContact: EmergencyContact = {
      ...contact,
      id: `cnt-${Date.now()}`,
    };
    this.contacts.push(newContact);
    this.saveToStorage(STORAGE_CONTACTS_KEY, this.contacts);
    return newContact;
  }

  public deleteEmergencyContact(id: string): void {
    this.contacts = this.contacts.filter((c) => c.id !== id);
    this.saveToStorage(STORAGE_CONTACTS_KEY, this.contacts);
  }

  // --- 4. AUDITORÍA FORENSE INMUTABLE CON SINCRONIZACIÓN SUPABASE (bitacora) ---
  public getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public async fetchServerAuditLogs(): Promise<AuditLogEntry[]> {
    if (!supabase) return this.getAuditLogs();
    try {
      // 1. Consultar eventos forenses registrados en la tabla 'bitacora' de PostgreSQL
      const { data: bitacoraRows, error: bitErr } = await supabase
        .from('bitacora')
        .select('id, alerta_id, usuario_id, accion, detalle, creada_en')
        .order('creada_en', { ascending: false })
        .limit(150);

      if (bitErr || !bitacoraRows || bitacoraRows.length === 0) {
        return this.getAuditLogs();
      }

      // 2. Extraer IDs de usuarios para resolver sus nombres de validadores
      const userIds = Array.from(
        new Set(bitacoraRows.map((b) => b.usuario_id).filter((id): id is string => Boolean(id)))
      );

      const perfilMap = new Map<string, { nombre: string; rol: string; institucion: string }>();
      if (userIds.length > 0) {
        const { data: perfiles } = await supabase
          .from('perfiles')
          .select('id, nombre, rol, institucion')
          .in('id', userIds);

        if (perfiles) {
          perfiles.forEach((p) => {
            perfilMap.set(p.id, {
              nombre: p.nombre || 'Validador Oficial',
              rol: p.rol,
              institucion: p.institucion || 'CCE',
            });
          });
        }
      }

      // 3. Mapear cada registro de bitácora
      const serverEntries: AuditLogEntry[] = bitacoraRows.map((b) => {
        const perfil = b.usuario_id ? perfilMap.get(b.usuario_id) : null;
        let detalleStr = '';
        if (b.detalle && typeof b.detalle === 'object') {
          detalleStr = Object.entries(b.detalle)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' | ');
        } else {
          detalleStr = String(b.detalle || 'Acción de protocolo ejecutada');
        }

        const roleDisplay = perfil?.rol === 'admin'
          ? 'Super Administrador'
          : perfil?.rol === 'institucion'
          ? 'Enlace Institucional'
          : b.usuario_id
          ? 'Validador CCE'
          : 'Sistema Automático';

        return {
          id: `srv-bit-${b.id}`,
          timestamp: b.creada_en,
          operatorName: perfil?.nombre || (b.usuario_id ? 'Operador Validador' : 'Motor Central CCE'),
          operatorRole: roleDisplay,
          action: String(b.accion || 'ACCION').toUpperCase(),
          details: b.alerta_id ? `[Alerta ${b.alerta_id.slice(0, 8)}] ${detalleStr}` : detalleStr,
          ipOrDevice: 'Servidor PostgreSQL (RLS)',
          alertaId: b.alerta_id,
          source: 'supabase',
        };
      });

      // 4. Combinar con acciones locales de cabina si no coinciden
      const localLogs = this.auditLogs.map((l) => ({
        ...l,
        source: (l.source || 'local') as 'supabase' | 'local',
      }));

      const merged = [...serverEntries];
      for (const loc of localLogs) {
        if (!merged.some((m) => m.id === loc.id || (m.timestamp === loc.timestamp && m.action === loc.action))) {
          merged.push(loc);
        }
      }

      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return merged;
    } catch (err) {
      console.warn('Error sincronizando bitácora con Supabase:', err);
      return this.getAuditLogs();
    }
  }

  public logAction(
    operatorName: string,
    action: string,
    details: string,
    alertaId?: string
  ): void {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      operatorName,
      operatorRole: 'Operador CCE',
      action,
      details,
      ipOrDevice: navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Estación Fija',
      alertaId,
      source: 'local',
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 300) this.auditLogs.pop(); // Mantener últimas 300 acciones
    this.saveToStorage(STORAGE_AUDIT_KEY, this.auditLogs);
  }

  public clearAuditLogs(): void {
    this.auditLogs = [];
    this.saveToStorage(STORAGE_AUDIT_KEY, this.auditLogs);
    this.logAction('Super Admin', 'PURGA_AUDITORIA', 'Registro de auditoría reiniciado');
  }
}

export const adminSettingsService = new AdminSettingsService();
