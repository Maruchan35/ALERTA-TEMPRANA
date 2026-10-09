// Captura una página con Edge (ya abierto con --remote-debugging-port=9333) y guarda un PNG.
// Uso: node captura.mjs <url> <salida.png> <ancho> <alto> <escala> <movil 0|1> <espera_ms> [clic_texto] [js_previo]
// - clic_texto: clic en el primer botón cuyo texto contenga ese valor (p. ej. "Mapa Radar").
// - js_previo: script que corre ANTES de que cargue la página (p. ej. preferencias de la app).
import { writeFileSync } from 'node:fs';

const [url, salida, ancho, alto, escala, movil, espera, clic = '', previo = ''] = process.argv.slice(2);
const puerto = 9333;

const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/new?about:blank`, { method: 'PUT' });
const objetivo = await respuesta.json();
const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });

let id = 0;
const pendientes = new Map();
const eventos = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pendientes.has(msg.id)) {
    const { ok, mal } = pendientes.get(msg.id);
    pendientes.delete(msg.id);
    msg.error ? mal(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method && eventos.has(msg.method)) {
    eventos.get(msg.method)(msg.params);
  }
};
const enviar = (method, params = {}) =>
  new Promise((ok, mal) => {
    const n = ++id;
    pendientes.set(n, { ok, mal });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cargado = () => new Promise((r) => eventos.set('Page.loadEventFired', () => r()));

await enviar('Page.enable');
await enviar('Runtime.enable');
await enviar('Emulation.setDeviceMetricsOverride', {
  width: Number(ancho),
  height: Number(alto),
  deviceScaleFactor: Number(escala),
  mobile: movil === '1',
});
if (previo) await enviar('Page.addScriptToEvaluateOnNewDocument', { source: previo });

const carga = cargado();
await enviar('Page.navigate', { url });
await carga;
await esperar(Number(espera));

if (clic) {
  const resultado = await enviar('Runtime.evaluate', {
    expression: `(() => { const b = [...document.querySelectorAll('button, [role=tab]')].find(e => e.textContent.includes(${JSON.stringify(clic)})); if (b) { b.click(); return true; } return false; })()`,
    returnByValue: true,
  });
  if (!resultado.result.value) throw new Error(`No encontré el control "${clic}"`);
  await esperar(Number(espera));
}

const { data } = await enviar('Page.captureScreenshot', { format: 'png' });
writeFileSync(salida, Buffer.from(data, 'base64'));
ws.close();
await fetch(`http://127.0.0.1:${puerto}/json/close/${objetivo.id}`).catch(() => {});
console.log(`OK ${salida}`);
