import { supabase, isSupabaseConfigured, SUPABASE_URL } from './supabase';
import { 
  AlertUI, 
  SupabaseAlertaRow, 
  CategoriaAlerta, 
  CATEGORIAS_OFICIALES,
  TipoConfirmacion,
} from '../types/alert';


const LOCAL_STORAGE_KEY = 'alerta_cerca_real_alerts';

// Resuelve URLs públicas de Supabase Storage para fotos y evidencias
export function resolvePhotoUrl(path?: string | null): string | undefined {
  if (!path || typeof path !== 'string' || path.trim() === '') return undefined;
  const clean = path.trim();

  // 1. Descartar rutas de almacenamiento local del dispositivo móvil (Android/iOS)
  if (
    clean.startsWith('file://') ||
    clean.startsWith('/data/user/') ||
    clean.startsWith('/data/data/') ||
    clean.startsWith('/storage/emulated/') ||
    clean.startsWith('content://')
  ) {
    // Si la app móvil envió una ruta interna del teléfono en vez de subir al bucket de Supabase
    return undefined;
  }

  // 2. Si ya es una URL web completa (http, https, blob o base64 data URI)
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('blob:')
  ) {
    return clean;
  }

  // 3. Limpiar barras iniciales
  const stripped = clean.replace(/^\/+/, '');

  // 4. Si la ruta ya incluye el path de la API de Supabase Storage
  if (stripped.startsWith('storage/v1/object/public/') || stripped.startsWith('storage/v1/object/sign/')) {
    return `${SUPABASE_URL}/${stripped}`;
  }

  const baseUrl = `${SUPABASE_URL}/storage/v1/object/public`;

  // 5. Si la ruta ya especifica el bucket (ej. "alertas/...", "fotos/...", "evidencias/...")
  const knownBuckets = [
    'alertas',
    'fotos',
    'evidencias',
    'imagenes',
    'reportes',
    'public',
    'uploads',
    'images',
    'photos',
    'multimedia'
  ];
  const firstSlashIndex = stripped.indexOf('/');

  if (firstSlashIndex !== -1) {
    const bucket = stripped.substring(0, firstSlashIndex).toLowerCase();
    if (knownBuckets.includes(bucket)) {
      const rest = stripped.substring(firstSlashIndex + 1);
      return `${baseUrl}/${bucket}/${rest}`;
    }
  }

  // 6. Por defecto, buscar en el bucket oficial 'alertas'
  return `${baseUrl}/alertas/${stripped}`;
}

// Función para transformar una fila de Supabase en un modelo AlertUI enriquecido
export function mapSupabaseRowToUI(row: SupabaseAlertaRow): AlertUI {
  const catConfig = CATEGORIAS_OFICIALES[row.categoria] || CATEGORIAS_OFICIALES['otro'];
  const radiusMeters = row.radio_manual_m || row.radio_actual_m || 1000;

  return {
    id: row.id,
    folio: `AC-${row.id.substring(0, 8).toUpperCase()}`,
    title: row.titulo,
    category: row.categoria,
    categoryName: catConfig.nombre_corto,
    level: catConfig.nivel,
    status: row.estado,
    description: row.descripcion || '',
    reference: row.referencia || undefined,
    photoUrl: resolvePhotoUrl(row.foto_path),
    folio911: row.folio_911 || undefined,
    coordinates: {
      lat: Number(row.lat) || 17.9581,
      lng: Number(row.lon) || -102.1942,
      address: row.referencia || 'Lázaro Cárdenas, Michoacán',
    },
    currentRadiusMeters: radiusMeters,
    currentRadiusKm: Number((radiusMeters / 1000).toFixed(1)),
    manualRadiusMeters: row.radio_manual_m || undefined,
    createdAt: row.creada_en,
    verifiedAt: row.verificada_en || undefined,
    closedAt: row.cerrada_en || undefined,
    expiresAt: row.expira_en,
    verifiedBy: row.validada_por || (row.verificada_por ? 'Consejo Coordinador Empresarial' : undefined),
    confirmedCount: row.n_confirmo || 0,
    disputeCount: row.n_parece_falsa || 0,
    instructions: catConfig.instrucciones,
    requiresValidation: catConfig.requiere_validacion,
    isInstitutionOnly: catConfig.solo_institucion,
  };
}

class AlertService {
  private alertsCache: AlertUI[] = [];
  private listeners: Array<(alerts: AlertUI[]) => void> = [];
  private channel: any = null;

  constructor() {
    this.loadFromLocalStorage();
    this.initRealtime();
  }

  // Carga inicial de alertas en caché local
  private loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) {
        this.alertsCache = JSON.parse(data);
      }
    } catch {
      // ignore
    }
  }

  // Guardar en caché local
  private saveToLocalStorage() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.alertsCache));
    } catch {
      // ignore
    }
  }

  // Suscribirse a cambios en tiempo real vía Supabase Realtime
  private initRealtime() {
    if (!supabase || !isSupabaseConfigured) return;

    try {
      this.channel = supabase
        .channel('alertas-publicas-en-vivo')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'alertas' },
          (payload) => {
            console.log('📡 Cambio en tiempo real recibido desde Supabase:', payload);
            this.fetchAll();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('No se pudo inicializar Supabase Realtime channel:', e);
    }
  }

  public isRealtimeActive(): boolean {
    return Boolean(this.channel);
  }

  public cleanup() {
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // Suscribir callback de componentes React
  public subscribe(listener: (alerts: AlertUI[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.alertsCache);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.saveToLocalStorage();
    this.listeners.forEach((listener) => listener([...this.alertsCache]));
  }

  // Obtener todas las alertas reales desde Supabase
  public async fetchAll(): Promise<AlertUI[]> {
    if (supabase && isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('alertas')
          .select('*')
          .order('creada_en', { ascending: false });

        if (!error && Array.isArray(data)) {
          this.alertsCache = data.map((row) => mapSupabaseRowToUI(row as SupabaseAlertaRow));
          this.notify();
          return this.alertsCache;
        } else if (error) {
          console.warn('Error al consultar alertas en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('Excepción de red con Supabase:', err);
      }
    }

    return this.alertsCache;
  }

  // Emitir un nuevo reporte ciudadano o institucional
  public async createReport(payload: {
    category: CategoriaAlerta;
    title: string;
    description: string;
    reference?: string;
    lat: number;
    lng: number;
    photoPath?: string;
    folio911?: string;
    consent?: boolean;
    isOfficial?: boolean;
    officialVerifierName?: string;
  }): Promise<{ success: boolean; alert?: AlertUI; error?: string }> {
    const expiresHours = 24;
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
    const isOfficial = Boolean(payload.isOfficial);

    const newRecord: Partial<SupabaseAlertaRow> = {
      categoria: payload.category,
      titulo: payload.title.trim(),
      descripcion: payload.description.trim() || null,
      referencia: payload.reference?.trim() || null,
      foto_path: payload.photoPath || null,
      folio_911: payload.folio911?.trim() || null,
      consentimiento: Boolean(payload.consent),
      lat: payload.lat,
      lon: payload.lng,
      estado: isOfficial ? 'verificada' : 'no_confirmada',
      radio_actual_m: 1000,
      expira_en: expiresAt,
      publicada_en: new Date().toISOString(),
      verificada_en: isOfficial ? new Date().toISOString() : null,
    };

    if (supabase && isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('alertas')
          .insert(newRecord)
          .select()
          .single();

        if (!error && data) {
          const alertUI = mapSupabaseRowToUI(data as SupabaseAlertaRow);
          this.alertsCache = [alertUI, ...this.alertsCache.filter((a) => a.id !== alertUI.id)];
          this.notify();
          return { success: true, alert: alertUI };
        } else if (error) {
          console.warn('RLS impidió inserción directa en Supabase, registrando en caché local:', error.message);
        }
      } catch (err) {
        console.warn('Error al comunicarse con Supabase:', err);
      }
    }

    // Registro local garantizado (siempre funcional y persistente)
    const localId = `loc-${Date.now()}`;
    const localRow: SupabaseAlertaRow = {
      id: localId,
      categoria: payload.category,
      titulo: payload.title.trim(),
      descripcion: payload.description.trim() || null,
      referencia: payload.reference?.trim() || null,
      foto_path: payload.photoPath || null,
      folio_911: payload.folio911?.trim() || null,
      consentimiento: Boolean(payload.consent),
      lat: payload.lat,
      lon: payload.lng,
      estado: isOfficial ? 'verificada' : 'no_confirmada',
      radio_actual_m: 1000,
      radio_manual_m: null,
      creada_por: null,
      verificada_por: isOfficial ? payload.officialVerifierName || 'CCE Lázaro Cárdenas' : null,
      creada_en: new Date().toISOString(),
      publicada_en: new Date().toISOString(),
      verificada_en: isOfficial ? new Date().toISOString() : null,
      cerrada_en: null,
      expira_en: expiresAt,
      motivo_cierre: null,
    };

    const alertUI = mapSupabaseRowToUI(localRow);
    this.alertsCache = [alertUI, ...this.alertsCache];
    this.notify();
    return { success: true, alert: alertUI };
  }

  // Verificar una alerta pendiente o no confirmada (Rol Validador / CCE)
  public async verifyAlert(id: string, verifierName: string = 'Consejo Coordinador Empresarial'): Promise<boolean> {
    if (supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from('alertas')
          .update({
            estado: 'verificada',
            verificada_en: new Date().toISOString(),
          })
          .eq('id', id);
      } catch (e) {
        console.warn('Error al actualizar en Supabase:', e);
      }
    }

    this.alertsCache = this.alertsCache.map((a) =>
      a.id === id
        ? {
            ...a,
            status: 'verificada',
            verifiedAt: new Date().toISOString(),
            verifiedBy: verifierName,
          }
        : a
    );
    this.notify();
    return true;
  }

  // Ajustar radio manual en metros (1000m, 3000m, 5000m, 10000m, 25000m)
  public async adjustRadius(id: string, radiusMeters: number): Promise<boolean> {
    if (supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from('alertas')
          .update({
            radio_manual_m: radiusMeters,
            radio_actual_m: radiusMeters,
          })
          .eq('id', id);
      } catch (e) {
        console.warn('Error al ajustar radio en Supabase:', e);
      }
    }

    this.alertsCache = this.alertsCache.map((a) =>
      a.id === id
        ? {
            ...a,
            currentRadiusMeters: radiusMeters,
            currentRadiusKm: Number((radiusMeters / 1000).toFixed(1)),
            manualRadiusMeters: radiusMeters,
          }
        : a
    );
    this.notify();
    return true;
  }

  // Resolver una alerta (Caso atendido con éxito)
  public async resolveAlert(id: string, reason: string = 'Situación resuelta y atendida'): Promise<boolean> {
    if (supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from('alertas')
          .update({
            estado: 'resuelta',
            cerrada_en: new Date().toISOString(),
            motivo_cierre: reason,
          })
          .eq('id', id);
      } catch (e) {
        console.warn('Error al resolver en Supabase:', e);
      }
    }

    this.alertsCache = this.alertsCache.map((a) =>
      a.id === id
        ? {
            ...a,
            status: 'resuelta',
            closedAt: new Date().toISOString(),
          }
        : a
    );
    this.notify();
    return true;
  }

  // Descartar una alerta falsa o inválida
  public async discardAlert(id: string, reason: string = 'Descartada por reporte falso o duplicado'): Promise<boolean> {
    if (supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from('alertas')
          .update({
            estado: 'descartada',
            cerrada_en: new Date().toISOString(),
            motivo_cierre: reason,
          })
          .eq('id', id);
      } catch (e) {
        console.warn('Error al descartar en Supabase:', e);
      }
    }

    this.alertsCache = this.alertsCache.map((a) =>
      a.id === id
        ? {
            ...a,
            status: 'descartada',
            closedAt: new Date().toISOString(),
          }
        : a
    );
    this.notify();
    return true;
  }

  // Votar confirmación ciudadana ('confirmo', 'ya_no_esta', 'parece_falsa')
  public async voteConfirmation(alertaId: string, tipo: TipoConfirmacion): Promise<boolean> {
    const target = this.alertsCache.find((a) => a.id === alertaId);
    const nextConfirmCount = (target?.confirmedCount || 0) + (tipo === 'confirmo' ? 1 : 0);
    const nextDisputeCount = (target?.disputeCount || 0) + (tipo === 'parece_falsa' ? 1 : 0);

    // 1. Actualizar caché local y notificar reactivamente a los componentes
    this.alertsCache = this.alertsCache.map((a) => {
      if (a.id === alertaId) {
        if (tipo === 'confirmo') {
          return { ...a, confirmedCount: nextConfirmCount };
        } else if (tipo === 'parece_falsa') {
          return { ...a, disputeCount: nextDisputeCount };
        }
      }
      return a;
    });
    this.notify();

    // 2. Persistir en la base de datos de Supabase
    if (supabase && isSupabaseConfigured) {
      try {
        if (tipo === 'confirmo') {
          await supabase.from('alertas').update({ n_confirmo: nextConfirmCount }).eq('id', alertaId);
        } else if (tipo === 'parece_falsa') {
          await supabase.from('alertas').update({ n_parece_falsa: nextDisputeCount }).eq('id', alertaId);
        }
      } catch (err) {
        console.warn('Error persistiendo voto en Supabase:', err);
      }
    }

    return true;
  }
}

export const alertService = new AlertService();
