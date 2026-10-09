import { supabase, isSupabaseConfigured, ensureAuthSession } from './supabase';
import {
  AlertUI,
  SupabaseAlertaRow,
  CategoriaAlerta,
  CATEGORIAS_OFICIALES,
  TipoConfirmacion,
} from '../types/alert';
import { archiveService } from './archiveService';

const LOCAL_STORAGE_KEY = 'alerta_cerca_real_alerts';
const DELETED_ALERTS_KEY = 'alerta_cerca_deleted_alert_ids';

// Lista de incidentes purgados/eliminados (incluyendo reporte de prueba Lluvia Tecnm AC-952657DB)
const PURGED_ALERT_IDS = [
  '952657db-7e0f-4bf3-8cc0-53a414e72afa', // AC-952657DB
];

/**
 * Ruta de una foto dentro del bucket PRIVADO `fotos` de Supabase Storage. La app móvil sube cada
 * foto ahí y guarda en `foto_path` "<id de usuario>/<milisegundos>.jpg". null si no es de Storage.
 */
export function rutaEnBucket(path?: string | null): string | null {
  if (!path || typeof path !== 'string') return null;
  const limpio = path.trim();
  if (!limpio) return null;
  // Una URL de nuestro Storage (pública o firmada vieja): se recupera la ruta y se vuelve a firmar
  const enUrl = limpio.match(/storage\/v1\/object\/(?:public|sign|authenticated)\/fotos\/([^?#]+)/);
  if (enUrl) return decodeURIComponent(enUrl[1]);
  if (/^(https?:|data:|blob:|file:|content:)/i.test(limpio)) return null;
  if (limpio.startsWith('/data/') || limpio.startsWith('/storage/emulated/')) return null; // ruta local del celular
  return limpio.replace(/^\/+/, '').replace(/^fotos\//, '');
}

/**
 * URL que se puede mostrar sin firmar: solo las externas (http, data, blob). Las de Storage NO:
 * el bucket `fotos` es privado a propósito (fotos de menores y personas) y se firman en
 * `AlertService.firmarFotos` con la sesión de quien mira.
 */
export function resolvePhotoUrl(path?: string | null): string | undefined {
  if (!path || typeof path !== 'string' || rutaEnBucket(path)) return undefined;
  const limpio = path.trim();
  return /^(https?:|data:|blob:)/i.test(limpio) ? limpio : undefined;
}

/** URL firmada de una sola foto (1 h). Para listas, el servicio las firma en lote en fetchAll. */
export async function resolveSignedPhotoUrl(path?: string | null): Promise<string | undefined> {
  const ruta = rutaEnBucket(path);
  if (!ruta) return resolvePhotoUrl(path);
  if (!supabase || !isSupabaseConfigured) return undefined;
  await ensureAuthSession();
  const { data, error } = await supabase.storage.from('fotos').createSignedUrl(ruta, 3600);
  if (error) console.warn('Foto', ruta, error.message);
  return data?.signedUrl;
}

/** Mensajes del servidor en palabras de la persona que usa el portal. */
function mensajeServidor(mensaje: string): string {
  if (/No autorizado|row-level security/i.test(mensaje)) {
    return 'Tu sesión no tiene permisos de validador. Vuelve a entrar con una cuenta de validador, institución o administrador.';
  }
  if (/Verifica tu número|permission denied/i.test(mensaje)) {
    return 'Para eso hay que verificar el número de teléfono en la app ALERTA CERCA (por WhatsApp).';
  }
  if (/JWT expired|invalid JWT/i.test(mensaje)) return 'Tu sesión venció: vuelve a entrar.';
  return mensaje;
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
    verifiedBy:
      row.validada_por ||
      row.validador_institucion ||
      row.validador_nombre ||
      (row.verificada_por ? 'Consejo Coordinador Empresarial' : undefined),
    confirmedCount: row.n_confirmo || 0,
    disputeCount: row.n_parece_falsa || 0,
    instructions: catConfig.instrucciones,
    requiresValidation: catConfig.requiere_validacion,
    isInstitutionOnly: catConfig.solo_institucion,
  };
}

type AccionValidador = 'verificar' | 'ajustar_radio' | 'resolver' | 'descartar';

class AlertService {
  private alertsCache: AlertUI[] = [];
  private listeners: Array<(alerts: AlertUI[]) => void> = [];
  private channel: any = null;
  private deletedIds = new Set<string>(PURGED_ALERT_IDS);
  /** Fotos ya firmadas: ruta → URL (dura 1 h; se renueva un poco antes). */
  private fotosFirmadas = new Map<string, { url: string; vence: number }>();

  constructor() {
    this.loadDeletedIds();
    this.loadFromLocalStorage();
    this.initRealtime();
  }

  private loadDeletedIds() {
    try {
      const data = localStorage.getItem(DELETED_ALERTS_KEY);
      if (data) {
        const arr = JSON.parse(data);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => this.deletedIds.add(id));
        }
      }
    } catch {
      // ignore
    }
  }

  private saveDeletedIds() {
    try {
      localStorage.setItem(DELETED_ALERTS_KEY, JSON.stringify(Array.from(this.deletedIds)));
    } catch {
      // ignore
    }
  }

  // Carga inicial de alertas en caché local
  private loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.alertsCache = parsed.filter((a: AlertUI) => !this.deletedIds.has(a.id));
        }
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
          () => {
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

  /** Las fotos del bucket privado `fotos` se firman en lote con la sesión de quien mira. */
  private async firmarFotos(alertas: AlertUI[], filas: SupabaseAlertaRow[]) {
    if (!supabase) return;
    const ahora = Date.now();
    const rutas = [...new Set(filas.map((f) => rutaEnBucket(f.foto_path)).filter((r): r is string => Boolean(r)))];
    const faltan = rutas.filter((r) => (this.fotosFirmadas.get(r)?.vence ?? 0) <= ahora);
    if (faltan.length) {
      const { data, error } = await supabase.storage.from('fotos').createSignedUrls(faltan, 3600);
      if (error) console.warn('No se pudieron firmar las fotos:', error.message);
      for (const f of data ?? []) {
        if (f.path && f.signedUrl) {
          this.fotosFirmadas.set(f.path, { url: f.signedUrl, vence: ahora + 3500 * 1000 });
        } else if (f.error) {
          // "Object not found": la cuenta no tiene permiso para esa foto o la ruta no existe
          console.warn('Foto', f.path, f.error);
        }
      }
    }
    filas.forEach((fila, i) => {
      const ruta = rutaEnBucket(fila.foto_path);
      if (ruta) alertas[i].photoUrl = this.fotosFirmadas.get(ruta)?.url;
    });
  }

  // Obtener todas las alertas reales desde Supabase
  public async fetchAll(): Promise<AlertUI[]> {
    if (!supabase || !isSupabaseConfigured) return this.alertsCache;
    try {
      // Como la app: sin sesión el servidor no firma ninguna foto; con una anónima, solo las de
      // alertas confirmadas (las cuentas de validador ven todas)
      const sesion = await ensureAuthSession();
      const conCuenta = Boolean(sesion && !sesion.user.is_anonymous);
      // Con cuenta de validador: la vista del panel (todas, con conteos y folio). Sin cuenta: lo que RLS deja ver.
      const consultar = (fuente: string) =>
        supabase!.from(fuente).select('*').order('creada_en', { ascending: false }).limit(300);
      let resultado = await consultar(conCuenta ? 'alertas_panel' : 'alertas');
      if (resultado.error && conCuenta) resultado = await consultar('alertas');
      if (resultado.error || !Array.isArray(resultado.data)) {
        console.warn('Error al consultar alertas en Supabase:', resultado.error?.message);
        return this.alertsCache;
      }
      const filas = (resultado.data as SupabaseAlertaRow[]).filter((f) => !this.deletedIds.has(f.id));
      const alertas = filas.map(mapSupabaseRowToUI).filter((a) => !this.deletedIds.has(a.id));
      await this.firmarFotos(alertas, filas);
      this.alertsCache = alertas;
      this.notify();
    } catch (err) {
      console.warn('Excepción de red con Supabase:', err);
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
    if (!supabase || !isSupabaseConfigured) return this.crearReporteLocal(payload);

    // El servidor decide el estado: con cuenta de validador/institución sale VERIFICADA; los
    // ciudadanos necesitan su número verificado (en la app). Una foto por URL externa no se
    // puede adjuntar (solo fotos del bucket propio): se deja en la descripción.
    const foto = rutaEnBucket(payload.photoPath);
    const urlExterna = payload.photoPath && !foto ? payload.photoPath.trim() : '';
    const descripcion = [payload.description.trim(), urlExterna && `Foto: ${urlExterna}`].filter(Boolean).join('\n');
    const { data, error } = await supabase.rpc('crear_reporte', {
      p_categoria: payload.category,
      p_titulo: payload.title.trim(),
      p_descripcion: descripcion || null,
      p_referencia: payload.reference?.trim() || null,
      p_lat: payload.lat,
      p_lon: payload.lng,
      p_foto_path: foto,
      p_folio_911: payload.folio911?.trim() || null,
      p_consentimiento: Boolean(payload.consent),
    });
    if (error) return { success: false, error: mensajeServidor(error.message) };
    await this.fetchAll();
    const id = (data as { alerta_id?: string; duplicada_de?: string } | null)?.alerta_id ?? data?.duplicada_de;
    return { success: true, alert: this.alertsCache.find((a) => a.id === id) };
  }

  /** Sin Supabase configurado (demostración sin internet): el reporte vive solo en este navegador. */
  private crearReporteLocal(payload: Parameters<AlertService['createReport']>[0]) {
    const isOfficial = Boolean(payload.isOfficial);
    const ahora = new Date().toISOString();
    const localRow: SupabaseAlertaRow = {
      id: `loc-${Date.now()}`,
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
      creada_en: ahora,
      publicada_en: ahora,
      verificada_en: isOfficial ? ahora : null,
      cerrada_en: null,
      expira_en: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      motivo_cierre: null,
    };
    const alertUI = mapSupabaseRowToUI(localRow);
    this.alertsCache = [alertUI, ...this.alertsCache];
    this.notify();
    return { success: true, alert: alertUI };
  }

  /**
   * Acciones de validador: SIEMPRE con la función del servidor `validar_alerta`, que revisa el rol,
   * deja registro en la bitácora y avisa a los teléfonos. Si falla, lanza un Error con el motivo.
   */
  private async validar(id: string, accion: AccionValidador, extra: { motivo?: string; radio?: number } = {}) {
    if (!supabase || !isSupabaseConfigured) throw new Error('El portal no está conectado a Supabase.');
    if (id.startsWith('loc-')) throw new Error('Esa alerta solo existe en este navegador: nunca llegó al servidor.');
    const { error } = await supabase.rpc('validar_alerta', {
      p_alerta: id,
      p_accion: accion,
      p_motivo: extra.motivo ?? null,
      p_radio_m: extra.radio ?? null,
    });
    if (error) throw new Error(mensajeServidor(error.message));
    await this.fetchAll();
  }

  // Verificar una alerta pendiente o no confirmada (Rol Validador / CCE)
  public async verifyAlert(id: string, _verifierName?: string): Promise<boolean> {
    await this.validar(id, 'verificar');
    return true;
  }

  // Ajustar radio manual en metros (1000m, 3000m, 5000m, 10000m, 25000m)
  public async adjustRadius(id: string, radiusMeters: number): Promise<boolean> {
    await this.validar(id, 'ajustar_radio', { radio: radiusMeters });
    return true;
  }

  // Resolver una alerta (Caso atendido con éxito)
  public async resolveAlert(id: string, reason: string = 'Situación resuelta y atendida'): Promise<boolean> {
    const targetAlert = this.alertsCache.find((a) => a.id === id);
    if (targetAlert) {
      archiveService.archivarAlerta(targetAlert, reason, 'resuelta');
    }
    await this.validar(id, 'resolver', { motivo: reason });
    return true;
  }

  // Descartar una alerta falsa o inválida
  public async discardAlert(id: string, reason: string = 'Descartada por reporte falso o duplicado'): Promise<boolean> {
    const targetAlert = this.alertsCache.find((a) => a.id === id);
    if (targetAlert) {
      archiveService.archivarAlerta(targetAlert, reason, 'descartada');
    }
    await this.validar(id, 'descartar', { motivo: reason });
    return true;
  }

  // Elimina / purga permanentemente un incidente de las vistas de consola y de la caché
  public async deleteAlert(id: string): Promise<boolean> {
    this.deletedIds.add(id);
    this.saveDeletedIds();
    this.alertsCache = this.alertsCache.filter((a) => a.id !== id);
    this.notify();
    archiveService.eliminarCarpetaPorAlertaId(id);
    return true;
  }

  // Votar confirmación ciudadana ('confirmo', 'ya_no_esta', 'parece_falsa'). Requiere el número
  // verificado (en la app): el servidor cuenta un voto por persona y por alerta.
  public async voteConfirmation(alertaId: string, tipo: TipoConfirmacion): Promise<boolean> {
    if (!supabase || !isSupabaseConfigured) throw new Error('El portal no está conectado a Supabase.');
    const { error } = await supabase.rpc('confirmar_alerta', { p_alerta: alertaId, p_tipo: tipo });
    if (error) throw new Error(mensajeServidor(error.message));
    await this.fetchAll();
    return true;
  }

  // Subir foto a Supabase Storage o generar base64 local
  public async uploadPhoto(file: File): Promise<{ success: boolean; path?: string; previewUrl?: string; error?: string }> {
    if (!file) return { success: false, error: 'Archivo no válido' };

    if (supabase && isSupabaseConfigured) {
      try {
        await ensureAuthSession();
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `reportes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('fotos')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (!uploadError) {
          const previewUrl = URL.createObjectURL(file);
          return { success: true, path: filePath, previewUrl };
        }
      } catch (e: any) {
        console.warn('Error subiendo foto a Supabase Storage:', e);
      }
    }

    // Fallback: Si no hay Supabase o falla el storage, usar Base64 local
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve({
          success: true,
          path: base64String,
          previewUrl: base64String,
        });
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Error leyendo la imagen seleccionada' });
      };
      reader.readAsDataURL(file);
    });
  }
}

export const alertService = new AlertService();
