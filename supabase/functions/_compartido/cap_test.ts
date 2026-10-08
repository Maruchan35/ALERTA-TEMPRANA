import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { XMLParser, XMLValidator } from 'npm:fast-xml-parser@4';
import { type AlertaCap, documentoCap, esc, fechaCap, feedAtom, radioKm } from './cap.ts';

const alerta: AlertaCap = {
  id: '6f1c2a9e-0b7d-4a51-9a43-2c8e7f1d5b10',
  estado: 'verificada',
  titulo: 'Niño de 8 años visto por última vez frente al mercado',
  descripcion: 'Playera roja & short azul, 1.20 m <alto>.',
  referencia: 'Mercado municipal',
  lat: 17.9581,
  lon: -102.1942,
  radio_actual_m: 3000,
  radio_manual_m: null,
  verificada_en: '2026-11-14T23:42:00.123Z',
  cerrada_en: null,
  expira_en: '2026-11-17T23:42:00Z',
  motivo_cierre: null,
  categoria: 'menor_desaparecido',
  categorias: {
    nombre: 'Menor desaparecido o posible sustracción',
    nivel: 4,
    categoria_cap: 'Rescue',
    instrucciones: 'Llama al 911.',
  },
  validador: { institucion: 'Protección Civil (demo)', nombre: 'Validador 1' },
};

const parser = new XMLParser({ ignoreAttributes: false });

Deno.test('fechaCap y radioKm siguen el formato CAP', () => {
  assertEquals(fechaCap('2026-11-14T23:42:00.123Z'), '2026-11-14T23:42:00+00:00');
  assertEquals(radioKm({ radio_actual_m: 3000, radio_manual_m: null }), '3.0');
  assertEquals(radioKm({ radio_actual_m: 0, radio_manual_m: null }), '1.0');
  assertEquals(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
});

Deno.test('documentoCap: XML válido con los elementos obligatorios de CAP 1.2', () => {
  const doc = documentoCap(alerta, 'alertacerca', 'https://x.supabase.co/functions/v1/cap?id=1');
  assertEquals(XMLValidator.validate(doc), true);
  const { alert } = parser.parse(doc);
  assertEquals(alert['@_xmlns'], 'urn:oasis:names:tc:emergency:cap:1.2');
  assertEquals(alert.identifier, `alertacerca-${alerta.id}`);
  assertEquals(alert.sent, '2026-11-14T23:42:00+00:00');
  assertEquals([alert.status, alert.msgType, alert.scope], ['Actual', 'Alert', 'Public']);
  assertEquals(alert.info.category, 'Rescue');
  assertEquals(alert.info.severity, 'Extreme');
  assertEquals(alert.info.urgency, 'Immediate');
  assertEquals(alert.info.certainty, 'Observed');
  assertEquals(alert.info.area.circle, '17.9581,-102.1942 3.0');
  assertStringIncludes(alert.info.senderName, 'Protección Civil (demo)');
  assertStringIncludes(alert.info.description, 'Playera roja & short azul, 1.20 m <alto>.');
});

Deno.test('documentoCap: una alerta resuelta se publica como Cancel que referencia a la original', () => {
  const doc = documentoCap({
    ...alerta,
    estado: 'resuelta',
    cerrada_en: '2026-11-15T00:20:00Z',
    motivo_cierre: 'Localizado',
  });
  assertEquals(XMLValidator.validate(doc), true);
  const { alert } = parser.parse(doc);
  assertEquals(alert.msgType, 'Cancel');
  assertEquals(alert.references, `alertacerca,alertacerca-${alerta.id},2026-11-14T23:42:00+00:00`);
  assertEquals(alert.info.responseType, 'AllClear');
});

Deno.test('feedAtom: feed válido con un documento CAP por alerta', () => {
  const feed = feedAtom(
    [alerta, { ...alerta, id: 'b'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12) }],
    'https://x/cap',
  );
  assertEquals(XMLValidator.validate(feed), true);
  const { feed: f } = parser.parse(feed);
  assertEquals(f.entry.length, 2);
  assert(f.entry[0].content.alert, 'cada entrada lleva el documento CAP completo');
  assertEquals(f.entry[0].link['@_href'], `https://x/cap?id=${alerta.id}`);
});
