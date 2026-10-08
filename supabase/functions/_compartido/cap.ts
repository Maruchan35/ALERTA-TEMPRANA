// CAP 1.2 (Common Alerting Protocol, OASIS): el formato XML estándar con el que los
// sistemas oficiales intercambian alertas públicas. Funciones puras para el feed `cap`.

export interface AlertaCap {
  id: string;
  estado: string;
  titulo: string;
  descripcion: string | null;
  referencia: string | null;
  lat: number;
  lon: number;
  radio_actual_m: number;
  radio_manual_m: number | null;
  verificada_en: string;
  cerrada_en: string | null;
  expira_en: string;
  motivo_cierre: string | null;
  categoria: string;
  categorias: { nombre: string; nivel: number; categoria_cap: string; instrucciones: string | null };
  validador?: { institucion: string | null; nombre: string | null } | null;
}

export const CAP_NS = 'urn:oasis:names:tc:emergency:cap:1.2';
export const SEVERIDAD: Record<number, string> = { 4: 'Extreme', 3: 'Severe', 2: 'Moderate', 1: 'Minor' };

const RESPUESTA: Record<string, string> = {
  evacuacion: 'Evacuate',
  incendio: 'Avoid',
  inundacion: 'Avoid',
  asalto: 'Avoid',
  accidente: 'Avoid',
  riesgo_ambiental: 'Shelter',
  fenomeno_natural: 'Prepare',
};

/** Escapa texto para XML. */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** CAP exige fecha con desfase explícito: 2026-11-14T23:42:00+00:00 (sin milisegundos). */
export const fechaCap = (iso: string | Date) => new Date(iso).toISOString().replace(/\.\d+Z$/, '+00:00');

/** Radio en km para <circle> (CAP: "latitud,longitud radio_en_km"). */
export function radioKm(a: Pick<AlertaCap, 'radio_actual_m' | 'radio_manual_m'>): string {
  const metros = Math.max(a.radio_actual_m || 0, a.radio_manual_m || 0, 1000);
  return (metros / 1000).toFixed(1);
}

export const identificador = (a: { id: string }) => `alertacerca-${a.id}`;

/**
 * Documento CAP de una alerta. Si estaba verificada y ya se resolvió o descartó, se emite
 * como `Cancel` que referencia a la alerta original, para que los sistemas oficiales la retiren.
 */
export function alertaCap(a: AlertaCap, emisor = 'alertacerca', url?: string): string {
  const cancelada = a.estado === 'resuelta' || a.estado === 'descartada';
  const c = a.categorias;
  const km = radioKm(a);
  const institucion = a.validador?.institucion ?? a.validador?.nombre ?? null;
  const id = cancelada ? `${identificador(a)}-cierre` : identificador(a);
  const enviada = fechaCap(cancelada && a.cerrada_en ? a.cerrada_en : a.verificada_en);
  const partes = [
    `<alert xmlns="${CAP_NS}">`,
    `<identifier>${esc(id)}</identifier>`,
    `<sender>${esc(emisor)}</sender>`,
    `<sent>${enviada}</sent>`,
    `<status>Actual</status>`,
    `<msgType>${cancelada ? 'Cancel' : 'Alert'}</msgType>`,
    `<scope>Public</scope>`,
  ];
  if (cancelada) {
    partes.push(
      `<note>${
        esc(a.estado === 'resuelta' ? (a.motivo_cierre ?? 'Caso resuelto') : 'Información no confirmada')
      }</note>`,
    );
    partes.push(`<references>${esc(emisor)},${esc(identificador(a))},${fechaCap(a.verificada_en)}</references>`);
  }
  partes.push(
    `<info>`,
    `<language>es-MX</language>`,
    `<category>${esc(c.categoria_cap)}</category>`,
    `<event>${esc(c.nombre)}</event>`,
    `<responseType>${cancelada ? 'AllClear' : (RESPUESTA[a.categoria] ?? 'Monitor')}</responseType>`,
    `<urgency>${cancelada ? 'Past' : 'Immediate'}</urgency>`,
    `<severity>${cancelada ? 'Minor' : (SEVERIDAD[c.nivel] ?? 'Unknown')}</severity>`,
    `<certainty>Observed</certainty>`,
    `<expires>${fechaCap(a.expira_en)}</expires>`,
    `<senderName>${esc(institucion ? `ALERTA CERCA · ${institucion}` : 'ALERTA CERCA')}</senderName>`,
    `<headline>${esc(a.titulo)}</headline>`,
  );
  const descripcion = [a.descripcion, a.referencia ? `Referencia: ${a.referencia}` : null]
    .filter(Boolean).join(' ');
  if (descripcion) partes.push(`<description>${esc(descripcion)}</description>`);
  if (c.instrucciones && !cancelada) partes.push(`<instruction>${esc(c.instrucciones)}</instruction>`);
  if (url) partes.push(`<web>${esc(url)}</web>`);
  partes.push(
    `<area>`,
    `<areaDesc>${esc(`Radio de ${km} km alrededor del suceso`)}</areaDesc>`,
    `<circle>${a.lat},${a.lon} ${km}</circle>`,
    `</area>`,
    `</info>`,
    `</alert>`,
  );
  return partes.join('');
}

export const documentoCap = (a: AlertaCap, emisor?: string, url?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${alertaCap(a, emisor, url)}\n`;

/** Feed Atom con un documento CAP por alerta: como lo consumen los agregadores oficiales. */
export function feedAtom(alertas: AlertaCap[], base: string, emisor?: string, ahora = new Date()): string {
  const entradas = alertas.map((a) => {
    const url = `${base}?id=${a.id}`;
    const actualizada = fechaCap(a.cerrada_en ?? a.verificada_en);
    return [
      '<entry>',
      `<id>urn:alertacerca:${a.id}${a.cerrada_en ? ':cierre' : ''}</id>`,
      `<title>${esc(`${a.categorias.nombre}: ${a.titulo}`)}</title>`,
      `<updated>${actualizada}</updated>`,
      `<link rel="alternate" type="application/cap+xml" href="${esc(url)}"/>`,
      `<summary>${esc(a.descripcion ?? a.titulo)}</summary>`,
      `<content type="application/cap+xml">${alertaCap(a, emisor, url)}</content>`,
      '</entry>',
    ].join('');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '<id>urn:alertacerca:feed</id>',
    '<title>ALERTA CERCA · Alertas verificadas (CAP 1.2)</title>',
    '<subtitle>Mecanismo complementario de información comunitaria. No sustituye al 911 ni a los sistemas oficiales.</subtitle>',
    `<updated>${fechaCap(ahora)}</updated>`,
    '<author><name>ALERTA CERCA</name></author>',
    `<link rel="self" href="${esc(base)}"/>`,
    ...entradas,
    '</feed>',
    '',
  ].join('\n');
}
