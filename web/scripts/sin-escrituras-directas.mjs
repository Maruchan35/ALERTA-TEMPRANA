// Falla si el código del portal escribe DIRECTO en una tabla de Supabase.
//
// En ALERTA CERCA todo cambio pasa por funciones del servidor (validar_alerta, crear_reporte,
// confirmar_alerta): revisan el rol, dejan registro en la bitácora y avisan a los teléfonos.
// Una escritura directa el servidor la rechaza (RLS) y la página mostraría algo que no pasó.
// Se ejecuta antes de cada `npm run build` (y en GitHub Actions).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tablas que el diseño SÍ deja escribir directo (con RLS "solo lo mío")
const PERMITIDAS = new Set(['zonas_usuario']);

const raiz = fileURLToPath(new URL('../src', import.meta.url));
const archivos = (dir) =>
  readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx|js|jsx)$/.test(nombre) ? [ruta] : [];
  });

const patron = /\.from\(\s*['"`](\w+)['"`]\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/g;
const hallazgos = [];
for (const archivo of archivos(raiz)) {
  const texto = readFileSync(archivo, 'utf8');
  for (const m of texto.matchAll(patron)) {
    if (PERMITIDAS.has(m[1])) continue;
    const linea = texto.slice(0, m.index).split('\n').length;
    hallazgos.push(`${relative(process.cwd(), archivo)}:${linea}  .from('${m[1]}').${m[2]}(...)`);
  }
}

if (hallazgos.length) {
  console.error('✖ Escritura directa en tablas de Supabase. Usa las funciones del servidor (README → Reglas):');
  for (const h of hallazgos) console.error(`  ${h}`);
  process.exit(1);
}
console.log('✓ Sin escrituras directas: todo pasa por las funciones del servidor.');
