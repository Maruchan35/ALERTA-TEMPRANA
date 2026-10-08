// =============================================================================
// ALERTA CERCA · Tipos de datos sincronizados con Supabase (HackaITLAC 2026)
// Basado en el esquema PostgreSQL / PostGIS oficial de Maruchan35
// =============================================================================

export type CategoriaAlerta =
  | 'menor_desaparecido'
  | 'persona_desaparecida'
  | 'persona_vulnerable'
  | 'robo_vehiculo'
  | 'asalto'
  | 'incendio'
  | 'inundacion'
  | 'accidente'
  | 'riesgo_ambiental'
  | 'evacuacion'
  | 'fenomeno_natural'
  | 'otro';

export type EstadoAlerta =
  | 'pendiente'
  | 'no_confirmada'
  | 'corroborada'
  | 'verificada'
  | 'resuelta'
  | 'descartada'
  | 'expirada';

export type RolUsuario = 'ciudadano' | 'validador' | 'institucion' | 'admin';

export type TipoConfirmacion = 'confirmo' | 'ya_no_esta' | 'parece_falsa';

// Estructura oficial de la tabla `categorias` en Supabase
export interface CategoriaConfig {
  clave: CategoriaAlerta;
  nombre: string;
  nombre_corto: string;
  nivel: 1 | 2 | 3 | 4;
  requiere_validacion: boolean;
  solo_institucion: boolean;
  radio_max_no_conf_m: number;
  vigencia?: string;
  categoria_cap: string;
  instrucciones: string;
  icono?: string;
  color?: string;
}

// Estructura oficial de la tabla `alertas` en Supabase
export interface SupabaseAlertaRow {
  id: string;
  categoria: CategoriaAlerta;
  titulo: string;
  descripcion: string | null;
  referencia: string | null;
  foto_path: string | null;
  folio_911: string | null;
  consentimiento: boolean;
  lat: number;
  lon: number;
  ubicacion?: any;
  estado: EstadoAlerta;
  radio_actual_m: number;
  radio_manual_m: number | null;
  creada_por: string | null;
  verificada_por: string | null;
  creada_en: string;
  publicada_en: string | null;
  verificada_en: string | null;
  cerrada_en: string | null;
  expira_en: string;
  motivo_cierre: string | null;
  // Campos agregados por joins o vistas
  validada_por?: string | null;
  n_confirmo?: number;
  n_ya_no_esta?: number;
  n_parece_falsa?: number;
  mi_confirmacion?: TipoConfirmacion | null;
}

// Coordenadas geográficas
export interface Coordinates {
  lat: number;
  lng: number;
  address?: string;
  referencePoint?: string;
  accuracyMeters?: number;
}

// Modelo de alerta enriquecido para la UI (compatible y reactivo)
export interface AlertUI {
  id: string;
  folio: string;
  title: string;
  category: CategoriaAlerta;
  categoryName: string;
  level: 1 | 2 | 3 | 4;
  status: EstadoAlerta;
  description: string;
  reference?: string;
  photoUrl?: string;
  folio911?: string;
  coordinates: Coordinates;
  currentRadiusMeters: number;
  currentRadiusKm: number;
  manualRadiusMeters?: number;
  createdAt: string;
  verifiedAt?: string;
  closedAt?: string;
  expiresAt: string;
  verifiedBy?: string;
  confirmedCount: number;
  disputeCount: number;
  instructions?: string;
  requiresValidation: boolean;
  isInstitutionOnly: boolean;
}

// Catálogo enriquecido de las 12 categorías oficiales
export const CATEGORIAS_OFICIALES: Record<CategoriaAlerta, CategoriaConfig> = {
  menor_desaparecido: {
    clave: 'menor_desaparecido',
    nombre: 'Menor desaparecido o posible sustracción',
    nombre_corto: 'Menor desaparecido',
    nivel: 4,
    requiere_validacion: true,
    solo_institucion: false,
    radio_max_no_conf_m: 0,
    categoria_cap: 'Rescue',
    instrucciones: 'Si lo ves, no lo pierdas de vista y llama al 911 de inmediato. No intervengas por tu cuenta.',
    icono: '🧒',
    color: '#dc2626',
  },
  persona_desaparecida: {
    clave: 'persona_desaparecida',
    nombre: 'Persona desaparecida',
    nombre_corto: 'Persona desaparecida',
    nivel: 3,
    requiere_validacion: true,
    solo_institucion: false,
    radio_max_no_conf_m: 0,
    categoria_cap: 'Rescue',
    instrucciones: 'Si la ves, llama al 911 e indica dónde y a qué hora. No difundas datos personales adicionales.',
    icono: '👤',
    color: '#ea580c',
  },
  persona_vulnerable: {
    clave: 'persona_vulnerable',
    nombre: 'Adulto mayor o persona vulnerable extraviada',
    nombre_corto: 'Persona vulnerable extraviada',
    nivel: 3,
    requiere_validacion: true,
    solo_institucion: false,
    radio_max_no_conf_m: 0,
    categoria_cap: 'Rescue',
    instrucciones: 'Si la ves, acércate con calma, procura que esté segura y llama al 911.',
    icono: '🧓',
    color: '#d97706',
  },
  robo_vehiculo: {
    clave: 'robo_vehiculo',
    nombre: 'Robo de vehículo',
    nombre_corto: 'Robo de vehículo',
    nivel: 3,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Security',
    instrucciones: 'Si ves el vehículo, no lo sigas ni intervengas. Anota lugar, hora y dirección, y llama al 911.',
    icono: '🚗',
    color: '#b45309',
  },
  asalto: {
    clave: 'asalto',
    nombre: 'Asalto o situación de riesgo',
    nombre_corto: 'Asalto o riesgo',
    nivel: 3,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Security',
    instrucciones: 'Evita la zona. Si estás en peligro, ponte a salvo y llama al 911.',
    icono: '⚠️',
    color: '#dc2626',
  },
  incendio: {
    clave: 'incendio',
    nombre: 'Incendio',
    nombre_corto: 'Incendio',
    nivel: 3,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Fire',
    instrucciones: 'Aléjate del humo y no bloquees el paso a los bomberos. Si hay personas en riesgo, llama al 911.',
    icono: '🔥',
    color: '#ef4444',
  },
  inundacion: {
    clave: 'inundacion',
    nombre: 'Inundación',
    nombre_corto: 'Inundación',
    nivel: 3,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Met',
    instrucciones: 'No cruces calles inundadas a pie ni en vehículo. Busca zonas altas y sigue a Protección Civil.',
    icono: '🌊',
    color: '#0284c7',
  },
  accidente: {
    clave: 'accidente',
    nombre: 'Accidente o emergencia',
    nombre_corto: 'Accidente',
    nivel: 2,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Transport',
    instrucciones: 'Evita la zona para no estorbar a los servicios de emergencia. Si hay heridos, llama al 911.',
    icono: '🚑',
    color: '#eab308',
  },
  riesgo_ambiental: {
    clave: 'riesgo_ambiental',
    nombre: 'Riesgo ambiental',
    nombre_corto: 'Riesgo ambiental',
    nivel: 2,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Env',
    instrucciones: 'Si hay humo o gases, cierra puertas y ventanas y sigue las indicaciones de Protección Civil.',
    icono: '☣️',
    color: '#16a34a',
  },
  evacuacion: {
    clave: 'evacuacion',
    nombre: 'Evacuación',
    nombre_corto: 'Evacuación',
    nivel: 4,
    requiere_validacion: false,
    solo_institucion: true,
    radio_max_no_conf_m: 0,
    categoria_cap: 'Safety',
    instrucciones: 'Sigue las rutas de evacuación y las indicaciones de las autoridades. No regreses hasta que lo indiquen.',
    icono: '🚨',
    color: '#991b1b',
  },
  fenomeno_natural: {
    clave: 'fenomeno_natural',
    nombre: 'Fenómeno natural',
    nombre_corto: 'Fenómeno natural',
    nivel: 4,
    requiere_validacion: false,
    solo_institucion: true,
    radio_max_no_conf_m: 0,
    categoria_cap: 'Geo',
    instrucciones: 'Mantén la calma, sigue a Protección Civil y ten a la mano tu mochila de emergencia.',
    icono: '🌪️',
    color: '#7c3aed',
  },
  otro: {
    clave: 'otro',
    nombre: 'Otra situación de riesgo',
    nombre_corto: 'Situación de riesgo',
    nivel: 1,
    requiere_validacion: false,
    solo_institucion: false,
    radio_max_no_conf_m: 1000,
    categoria_cap: 'Other',
    instrucciones: 'Mantente atento y evita riesgos innecesarios. En una emergencia, llama al 911.',
    icono: '📢',
    color: '#64748b',
  },
};

// Ubicación predeterminada para pruebas o puntos de referencia
export interface PresetLocation {
  id: string;
  name: string;
  zone?: string;
  coords: Coordinates;
}

// Estructura de reporte de avistamiento o pista ciudadana
export interface SightingReport {
  id?: string;
  alertId?: string;
  locationDescription: string;
  note: string;
  timestamp?: string;
}

// Alias de retrocompatibilidad
export type Alert = AlertUI;

