// Textos de las notificaciones (push y Telegram). Funciones puras: se prueban sin red.

export interface CategoriaAviso {
  nombre: string;
  nombre_corto: string;
  nivel: number;
  instrucciones: string | null;
}

export interface AlertaAviso {
  id: string;
  categoria: string;
  estado: string;
  titulo: string;
  descripcion: string | null;
  referencia: string | null;
  lat: number;
  lon: number;
  foto_path: string | null;
  motivo_cierre: string | null;
  radio_actual_m: number;
  categorias: CategoriaAviso;
}

export type TipoAviso = 'nueva' | 'actualizacion' | 'cierre' | 'validacion';

export const ESTADO_LEGIBLE: Record<string, string> = {
  pendiente: 'En revisión',
  no_confirmada: 'No confirmada',
  corroborada: 'Corroborada',
  verificada: 'Verificada',
  resuelta: 'Resuelta',
  descartada: 'Descartada',
  expirada: 'Expirada',
};

const EMOJI_NIVEL: Record<number, string> = { 4: '🔴', 3: '🟠', 2: '🟡', 1: '🔵' };

export const AVISO_911 = 'ALERTA CERCA no sustituye al 911. En una emergencia, llama al 911.';

export const mapaUrl = (lat: number, lon: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

/** Agrega un punto final solo si hace falta ("Localizado" → "Localizado."). */
const conPunto = (s: string) => (/[.!?¡¿…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * Campo `data` del mensaje push (contrato de la sección 7.2). FCM exige que TODOS los
 * valores sean texto: los números viajan como cadenas y la app los convierte.
 */
export function datosPush(
  a: AlertaAviso,
  tipo: TipoAviso,
  opciones: { radio_m?: number; institucion?: string | null } = {},
): Record<string, string> {
  const corto = a.categorias.nombre_corto;
  const datos: Record<string, string> = {
    tipo,
    alerta_id: a.id,
    categoria: a.categoria,
    nivel: String(a.categorias.nivel),
    estado: a.estado,
    titulo: corto.toUpperCase(),
    cuerpo: a.titulo,
    lat: String(a.lat),
    lon: String(a.lon),
    radio_m: String(opciones.radio_m ?? a.radio_actual_m ?? 0),
    foto: a.foto_path ? '1' : '0',
  };
  switch (tipo) {
    case 'actualizacion':
      datos.titulo = `AHORA ${(ESTADO_LEGIBLE[a.estado] ?? a.estado).toUpperCase()}`;
      datos.cuerpo = a.estado === 'verificada'
        ? `${corto}: ${opciones.institucion ?? 'una institución'} confirmó el reporte.`
        : `${corto}: 3 o más vecinos confirmaron el reporte.`;
      break;
    case 'cierre':
      if (a.estado === 'resuelta') {
        datos.titulo = 'RESUELTA';
        datos.cuerpo = `${conPunto(a.motivo_cierre || 'El caso fue resuelto')} Gracias por tu ayuda.`;
      } else {
        datos.titulo = 'DESCARTADA';
        datos.cuerpo = 'La información no pudo confirmarse.';
      }
      break;
    case 'validacion':
      datos.titulo = `POR VALIDAR · ${corto.toUpperCase()}`;
      datos.cuerpo = a.titulo;
      break;
  }
  return datos;
}

/**
 * Texto visible cuando el sistema operativo muestra la notificación por su cuenta
 * (iOS y web). En Android la arma la app, que además calcula la distancia exacta.
 */
export function textoVisible(datos: Record<string, string>): { title: string; body: string } {
  if (datos.tipo === 'nueva') {
    return { title: datos.titulo, body: `${ESTADO_LEGIBLE[datos.estado] ?? datos.estado} · ${datos.cuerpo}` };
  }
  return { title: datos.titulo, body: datos.cuerpo };
}

/** Mensaje de Telegram para una alerta nueva (texto plano: el contenido del usuario no rompe el formato). */
export function textoTelegramNueva(a: AlertaAviso): string {
  const c = a.categorias;
  const estado = a.estado === 'no_confirmada'
    ? 'NO CONFIRMADA (reporte ciudadano)'
    : (ESTADO_LEGIBLE[a.estado] ?? a.estado).toUpperCase();
  const lineas = [
    `${EMOJI_NIVEL[c.nivel] ?? '⚠️'} ${c.nombre_corto.toUpperCase()} · ${estado}`,
    a.titulo,
  ];
  if (a.descripcion) lineas.push(a.descripcion);
  if (a.referencia) lineas.push(`📍 ${a.referencia}`);
  lineas.push(`🗺 Mapa: ${mapaUrl(a.lat, a.lon)}`);
  if (c.instrucciones) lineas.push(`ℹ️ Qué hacer: ${c.instrucciones}`);
  lineas.push('', AVISO_911);
  return lineas.join('\n');
}

export function textoTelegramCierre(a: AlertaAviso): string {
  const corto = a.categorias.nombre_corto;
  if (a.estado === 'resuelta') {
    return `✅ RESUELTA · ${corto}\n${a.titulo}\n${
      conPunto(a.motivo_cierre || 'El caso fue resuelto')
    } Gracias por tu ayuda.`;
  }
  return `⚪ DESCARTADA · ${corto}\n${a.titulo}\nLa información no pudo confirmarse. Por favor no la sigas compartiendo.`;
}
