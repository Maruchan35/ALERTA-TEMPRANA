import { AlertUI } from '../types/alert';

export interface CarpetaInvestigacion {
  idCarpeta: string; // ej. CI-2026-AC-F829A0B1
  alertaId: string;
  folioAlerta: string;
  folio911?: string;
  titulo: string;
  categoria: string;
  categoriaClave: string;
  nivelPeligro: number;
  estadoFinal: 'resuelta' | 'descartada';
  motivoCierre: string;
  fechaCreacion: string;
  fechaCierre: string;
  coordenadas: {
    lat: number;
    lng: number;
    direccion: string;
    referencia?: string;
  };
  radioFinalMetros: number;
  radioFinalKm: number;
  fotoUrl?: string;
  descripcionOriginal: string;
  validadorResponsable: string;
  confirmacionesCiudadanas: {
    votosAfirmativos: number;
    votosObjecion: number;
  };
  hashIntegridad: string;
  archivadoEn: string;
}

const STORAGE_ARCHIVE_KEY = 'alerta_cerca_carpetas_investigacion';

// Genera un código hash simple de integridad forense
function generarHashIntegridad(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

const DEFAULT_SEED_CARPETAS: CarpetaInvestigacion[] = [
  {
    idCarpeta: 'CI-2026-AC-78A190B2',
    alertaId: 'seed-alerta-menor-01',
    folioAlerta: 'AC-78A190B2',
    folio911: '911-2026-04192',
    titulo: 'Menor de 7 años localizado con bien tras reporte comunitario',
    categoria: 'Menor Extraviado',
    categoriaClave: 'menor_desaparecido',
    nivelPeligro: 4,
    estadoFinal: 'resuelta',
    motivoCierre: 'Menor resguardado por comerciantes locales y entregado a sus padres y DIF municipal en óptimas condiciones.',
    fechaCreacion: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    fechaCierre: new Date(Date.now() - 34 * 3600 * 1000).toISOString(),
    coordenadas: {
      lat: 17.9621,
      lng: -102.1985,
      direccion: 'Av. Melchor Ocampo esq. Av. Lázaro Cárdenas, Centro',
      referencia: 'Frente a Farmacia Guadalajara / Plaza Tabachines',
    },
    radioFinalMetros: 3000,
    radioFinalKm: 3.0,
    fotoUrl: 'https://images.unsplash.com/photo-1543332164-6e82f355badc?auto=format&fit=crop&w=600&q=80',
    descripcionOriginal: 'Menor de 7 años extraviado, vestía playera azul con dibujo de dinosaurio y tenis blancos. Visto por última vez saliendo de la tienda.',
    validadorResponsable: 'Lic. Julio César Cortés (CCE Lázaro Cárdenas)',
    confirmacionesCiudadanas: {
      votosAfirmativos: 42,
      votosObjecion: 0,
    },
    hashIntegridad: 'F829A0B1',
    archivadoEn: new Date(Date.now() - 34 * 3600 * 1000).toISOString(),
  },
  {
    idCarpeta: 'CI-2026-AC-31D94C88',
    alertaId: 'seed-alerta-vehiculo-02',
    folioAlerta: 'AC-31D94C88',
    folio911: '911-2026-08311',
    titulo: 'Vehículo Nissan Versa gris asegurado en punto de control',
    categoria: 'Robo de Vehículo',
    categoriaClave: 'robo_vehiculo',
    nivelPeligro: 3,
    estadoFinal: 'resuelta',
    motivoCierre: 'Vehículo detectado en punto de inspección carretero sobre Libramiento hacia La Orilla y puesto a disposición de la Fiscalía Regional.',
    fechaCreacion: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    fechaCierre: new Date(Date.now() - 69 * 3600 * 1000).toISOString(),
    coordenadas: {
      lat: 17.9754,
      lng: -102.2152,
      direccion: 'Carretera Libramiento La Orilla, Tramo km 4',
      referencia: 'Cerca del entronque al acceso portuario',
    },
    radioFinalMetros: 5000,
    radioFinalKm: 5.0,
    fotoUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80',
    descripcionOriginal: 'Nissan Versa modelo 2021 color gris grafito, placas PJR-42-19 de Michoacán, con calcomanía de águila en vidrio trasero.',
    validadorResponsable: 'Operaciones CCE / Mando Coordinado',
    confirmacionesCiudadanas: {
      votosAfirmativos: 18,
      votosObjecion: 1,
    },
    hashIntegridad: 'C74E219A',
    archivadoEn: new Date(Date.now() - 69 * 3600 * 1000).toISOString(),
  },
];

let listeners: Array<(carpetas: CarpetaInvestigacion[]) => void> = [];

function notifyListeners() {
  const carpetas = archiveService.listarCarpetas();
  listeners.forEach((l) => l(carpetas));
}

export const archiveService = {
  // Suscribirse a cambios en los expedientes
  subscribe(listener: (carpetas: CarpetaInvestigacion[]) => void): () => void {
    listeners.push(listener);
    listener(this.listarCarpetas());
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  // Obtiene todas las carpetas archivadas
  listarCarpetas(): CarpetaInvestigacion[] {
    try {
      const raw = localStorage.getItem(STORAGE_ARCHIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    // Si no hay o está vacío, poblar con las carpetas semilla oficiales
    try {
      localStorage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(DEFAULT_SEED_CARPETAS));
    } catch {
      // ignore
    }
    return DEFAULT_SEED_CARPETAS;
  },

  // Archiva o actualiza una alerta resuelta o descartada como carpeta de investigación
  archivarAlerta(alert: AlertUI, motivoCierre: string, estadoFinal: 'resuelta' | 'descartada' = 'resuelta'): CarpetaInvestigacion {
    const carpetas = this.listarCarpetas();
    const idCarpeta = `CI-2026-${alert.folio || alert.id.substring(0, 8).toUpperCase()}`;

    const rawDataToHash = `${alert.id}|${alert.title}|${alert.coordinates.lat}|${alert.coordinates.lng}|${alert.createdAt}|${motivoCierre}`;
    const hashIntegridad = generarHashIntegridad(rawDataToHash);

    const nuevaCarpeta: CarpetaInvestigacion = {
      idCarpeta,
      alertaId: alert.id,
      folioAlerta: alert.folio,
      folio911: alert.folio911,
      titulo: alert.title,
      categoria: alert.categoryName,
      categoriaClave: alert.category,
      nivelPeligro: alert.level,
      estadoFinal,
      motivoCierre: motivoCierre.trim() || 'Incidente resuelto y archivado en sistema',
      fechaCreacion: alert.createdAt,
      fechaCierre: new Date().toISOString(),
      coordenadas: {
        lat: alert.coordinates.lat,
        lng: alert.coordinates.lng,
        direccion: alert.coordinates.address || 'Lázaro Cárdenas, Michoacán',
        referencia: alert.reference || alert.coordinates.referencePoint,
      },
      radioFinalMetros: alert.currentRadiusMeters,
      radioFinalKm: alert.currentRadiusKm,
      fotoUrl: alert.photoUrl,
      descripcionOriginal: alert.description,
      validadorResponsable: alert.verifiedBy || 'Consejo Coordinador Empresarial (CCE)',
      confirmacionesCiudadanas: {
        votosAfirmativos: alert.confirmedCount,
        votosObjecion: alert.disputeCount,
      },
      hashIntegridad,
      archivadoEn: new Date().toISOString(),
    };

    // Evitar duplicados (actualizar si ya existe)
    const index = carpetas.findIndex((c) => c.alertaId === alert.id);
    if (index >= 0) {
      carpetas[index] = nuevaCarpeta;
    } else {
      carpetas.unshift(nuevaCarpeta);
    }

    try {
      localStorage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(carpetas));
    } catch (e) {
      console.warn('Error guardando carpeta en localStorage:', e);
    }

    notifyListeners();
    return nuevaCarpeta;
  },

  // Genera el informe textual oficial listo para copiar para MP / 911 / Policía
  formatearParaOficio(c: CarpetaInvestigacion): string {
    return [
      `=============================================================`,
      `EXPEDIENTE FORENSE / CARPETA DE INVESTIGACIÓN: ${c.idCarpeta}`,
      `CONSEJO COORDINADOR EMPRESARIAL DE LÁZARO CÁRDENAS, MICHOACÁN`,
      `PLATAFORMA CIUDADANA Y TERRITORIAL: ALERTA CERCA`,
      `=============================================================`,
      ``,
      `DATOS GENERALES DEL INCIDENTE:`,
      `• Folio Plataforma: ${c.folioAlerta}`,
      `• Folio 911 Relacionado: ${c.folio911 || 'NO PROPORCIONADO / REPORTE DIRECTO'}`,
      `• Título del Suceso: ${c.titulo}`,
      `• Categoría: ${c.categoria} (Clave: ${c.categoriaClave})`,
      `• Nivel de Peligrosidad: Nivel ${c.nivelPeligro}`,
      `• Estado Final: ${c.estadoFinal.toUpperCase()}`,
      `• Motivo / Conclusión de Cierre: ${c.motivoCierre}`,
      ``,
      `LÍNEA DE TIEMPO:`,
      `• Fecha/Hora de Emisión: ${new Date(c.fechaCreacion).toLocaleString('es-MX')}`,
      `• Fecha/Hora de Cierre: ${new Date(c.fechaCierre).toLocaleString('es-MX')}`,
      `• Fecha de Archivo Forense: ${new Date(c.archivadoEn).toLocaleString('es-MX')}`,
      ``,
      `UBICACIÓN Y COORDENADAS GEOGRÁFICAS (WGS84):`,
      `• Latitud: ${c.coordenadas.lat}`,
      `• Longitud: ${c.coordenadas.lng}`,
      `• Dirección / Sector: ${c.coordenadas.direccion}`,
      `• Referencia Física: ${c.coordenadas.referencia || 'N/A'}`,
      `• Radio de Geocerca Emitido: ${c.radioFinalKm} km (${c.radioFinalMetros} m)`,
      `• Enlace Cartográfico: https://www.google.com/maps/search/?api=1&query=${c.coordenadas.lat},${c.coordenadas.lng}`,
      ``,
      `DESCRIPCIÓN DE LOS HECHOS:`,
      `"${c.descripcionOriginal}"`,
      ``,
      `METADATA Y CADENA DE CUSTODIA DIGITAL:`,
      `• Validador Responsable: ${c.validadorResponsable}`,
      `• Confirmaciones Comunitarias: ${c.confirmacionesCiudadanas.votosAfirmativos} a favor | ${c.confirmacionesCiudadanas.votosObjecion} objeciones`,
      `• Evidencia Fotográfica Registrada: ${c.fotoUrl ? c.fotoUrl : 'Sin foto adjunta'}`,
      `• Hash de Integridad Forense: ${c.hashIntegridad}`,
      `=============================================================`,
    ].join('\n');
  },

  // Exportar todas las carpetas a un archivo JSON descargable
  descargarTodasJSON() {
    const carpetas = this.listarCarpetas();
    const blob = new Blob([JSON.stringify(carpetas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Expedientes_Investigacion_CCE_LazaroCardenas_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
