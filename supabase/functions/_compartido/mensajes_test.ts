import { assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  type AlertaAviso,
  datosEmergencia,
  datosPush,
  type EmergenciaAviso,
  textoTelegramCierre,
  textoTelegramNueva,
  textoVisible,
} from './mensajes.ts';

const menor: AlertaAviso = {
  id: '6f1c2a9e-0b7d-4a51-9a43-2c8e7f1d5b10',
  categoria: 'menor_desaparecido',
  estado: 'verificada',
  titulo: 'Niño de 8 años, playera roja',
  descripcion: '1.20 m, short azul.',
  referencia: 'Frente al mercado municipal',
  lat: 17.9581,
  lon: -102.1942,
  foto_path: 'u/1.jpg',
  motivo_cierre: null,
  radio_actual_m: 1000,
  categorias: {
    nombre: 'Menor desaparecido o posible sustracción',
    nombre_corto: 'Menor desaparecido',
    nivel: 4,
    instrucciones: 'Si lo ves, llama al 911.',
  },
};

Deno.test('datosPush: todos los valores son texto (requisito de FCM) y siguen el contrato 7.2', () => {
  const d = datosPush(menor, 'nueva', { radio_m: 3000 });
  for (const v of Object.values(d)) assertEquals(typeof v, 'string');
  assertEquals(d, {
    tipo: 'nueva',
    alerta_id: menor.id,
    categoria: 'menor_desaparecido',
    nivel: '4',
    estado: 'verificada',
    titulo: 'MENOR DESAPARECIDO',
    cuerpo: 'Niño de 8 años, playera roja',
    lat: '17.9581',
    lon: '-102.1942',
    radio_m: '3000',
    foto: '1',
  });
});

Deno.test('datosPush: actualización, cierre, descarte y validación', () => {
  assertEquals(datosPush(menor, 'actualizacion', { institucion: 'Protección Civil' }).titulo, 'AHORA VERIFICADA');
  assertEquals(
    datosPush(menor, 'actualizacion', { institucion: 'Protección Civil' }).cuerpo,
    'Menor desaparecido: Protección Civil confirmó el reporte.',
  );
  assertEquals(datosPush({ ...menor, estado: 'corroborada' }, 'actualizacion').titulo, 'AHORA CORROBORADA');

  const resuelta = datosPush({ ...menor, estado: 'resuelta', motivo_cierre: 'El menor fue localizado' }, 'cierre');
  assertEquals([resuelta.titulo, resuelta.cuerpo], ['RESUELTA', 'El menor fue localizado. Gracias por tu ayuda.']);
  const conPunto = datosPush({ ...menor, estado: 'resuelta', motivo_cierre: '¡Localizado sano y salvo!' }, 'cierre');
  assertEquals(conPunto.cuerpo, '¡Localizado sano y salvo! Gracias por tu ayuda.');
  const descartada = datosPush({ ...menor, estado: 'descartada' }, 'cierre');
  assertEquals([descartada.titulo, descartada.cuerpo], ['DESCARTADA', 'La información no pudo confirmarse.']);

  assertEquals(datosPush({ ...menor, estado: 'pendiente' }, 'validacion').titulo, 'POR VALIDAR · MENOR DESAPARECIDO');
});

Deno.test('textoVisible (iOS/web) incluye el estado de confianza', () => {
  assertEquals(textoVisible(datosPush({ ...menor, estado: 'no_confirmada' }, 'nueva')), {
    title: 'MENOR DESAPARECIDO',
    body: 'No confirmada · Niño de 8 años, playera roja',
  });
});

Deno.test('Telegram: mapa, instrucciones y aviso del 911', () => {
  const t = textoTelegramNueva({ ...menor, estado: 'no_confirmada' });
  assertMatch(t, /^🔴 MENOR DESAPARECIDO · NO CONFIRMADA \(reporte ciudadano\)/);
  assertStringIncludes(t, 'https://www.openstreetmap.org/?mlat=17.9581&mlon=-102.1942');
  assertStringIncludes(t, 'Qué hacer: Si lo ves, llama al 911.');
  assertStringIncludes(t, 'no sustituye al 911');
  assertStringIncludes(textoTelegramCierre({ ...menor, estado: 'resuelta', motivo_cierre: 'Localizado' }), 'RESUELTA');
  assertStringIncludes(textoTelegramCierre({ ...menor, estado: 'descartada' }), 'no la sigas compartiendo');
});

// ─── Modo emergencia (SOS) ──────────────────────────────────────────────────

const sos: EmergenciaAviso = {
  id: '0b6f8a52-7a8e-4f0b-9c55-1f7d2a3e4b60',
  estado: 'activa',
  tipo: 'sos',
  origen: 'movimiento',
  lat: 17.9581,
  lon: -102.1942,
  velocidad_ms: 12.5,
  bateria: 18,
  cierre: null,
};

Deno.test('datosEmergencia: aviso de prioridad máxima solo con texto, con cómo pidió ayuda y su velocidad', () => {
  const d = datosEmergencia(sos, 'nueva');
  for (const v of Object.values(d)) assertEquals(typeof v, 'string');
  assertEquals(d, {
    tipo: 'emergencia',
    evento: 'nueva',
    emergencia_id: sos.id,
    nivel: '4',
    titulo: 'EMERGENCIA SOS',
    cuerpo: 'Una persona pidió ayuda con una sacudida fuerte del teléfono. Se mueve a 45 km/h. ' +
      'Toca para ver su ubicación en vivo.',
    lat: '17.9581',
    lon: '-102.1942',
  });
  // A pie no se menciona la velocidad
  assertEquals(
    datosEmergencia({ ...sos, origen: 'boton', velocidad_ms: 1.2 }, 'nueva').cuerpo,
    'Una persona pidió ayuda con el botón de pánico. Toca para ver su ubicación en vivo.',
  );
});

Deno.test('datosEmergencia: lo que indica la persona, sin señal y cierre por la persona', () => {
  const secuestro = datosEmergencia({ ...sos, tipo: 'secuestro' }, 'tipo');
  assertEquals(secuestro.titulo, 'SOS · POSIBLE SECUESTRO');
  assertStringIncludes(secuestro.cuerpo, '«Me llevan»');

  const sinSenal = datosEmergencia(sos, 'sin_senal');
  assertEquals([sinSenal.titulo, sinSenal.nivel], ['SOS · SIN SEÑAL', '4']);
  assertStringIncludes(sinSenal.cuerpo, 'Batería: 18 %');

  const cerrada = datosEmergencia({ ...sos, estado: 'cerrada', cierre: 'a_salvo' }, 'cerrada');
  assertEquals(cerrada.nivel, '2', 'el cierre informa, no alarma');
  assertStringIncludes(cerrada.cuerpo, '«Estoy a salvo»');
  assertStringIncludes(datosEmergencia({ ...sos, cierre: 'falsa_alarma' }, 'cerrada').cuerpo, 'falsa alarma');
  assertEquals(textoVisible(cerrada), { title: cerrada.titulo, body: cerrada.cuerpo });
});
