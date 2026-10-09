// Genera, con el MISMO código del servidor, el texto de una notificación y un XML CAP 1.2 de ejemplo.
// Los datos son ficticios (demostración): nadie real.
import { datosPush, textoVisible } from '../../../supabase/functions/_compartido/mensajes.ts';
import { alertaCap } from '../../../supabase/functions/_compartido/cap.ts';

const ejemplo = {
  id: '6f1c2b7e-3a9d-4e51-9b0a-2d8e7f4c1a55',
  categoria: 'robo_vehiculo',
  estado: 'verificada',
  titulo: 'Robo de vehículo: Nissan Versa gris',
  descripcion: 'Nissan Versa gris, placas DEMO-123, visto por última vez sobre Av. Lázaro Cárdenas.',
  referencia: 'Av. Lázaro Cárdenas, Centro',
  lat: 17.9581,
  lon: -102.1942,
  foto_path: null,
  motivo_cierre: null,
  radio_actual_m: 3000,
  radio_manual_m: null,
  verificada_en: '2026-10-08T21:40:00Z',
  cerrada_en: null,
  expira_en: '2026-10-09T03:40:00Z',
  categorias: {
    nombre: 'Robo de vehículo',
    nombre_corto: 'Robo de vehículo',
    nivel: 3,
    categoria_cap: 'Security',
    instrucciones: 'No te acerques. Llama al 911 y anota placas y dirección.',
  },
  validador: { institucion: 'CCE Lázaro Cárdenas', nombre: null },
};

const aviso = textoVisible(datosPush(ejemplo as never, 'nueva', { radio_m: 3000 }) as never);
const cap = alertaCap(ejemplo as never, 'alertacerca');

const salida = { notificacion: aviso, cap };
await Deno.writeTextFile(new URL('./fig6-datos.json', import.meta.url), JSON.stringify(salida, null, 2));
console.log(JSON.stringify(aviso, null, 2));
console.log(cap.split('\n').slice(0, 30).join('\n'));
