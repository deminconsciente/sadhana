// Revisión rápida de src/proyeccion.html: falla si dos funciones tienen el mismo nombre
// dentro del mismo script (la segunda pisa a la primera y rompe la herramienta sin avisar).
// Uso: node scripts/check-proyeccion.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../src/proyeccion.html', import.meta.url), 'utf8');
const seen = new Map(), dup = [];
html.split('\n').forEach((line, i) => {
  const m = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (!m) return;
  if (seen.has(m[1])) dup.push(`${m[1]} (líneas ${seen.get(m[1])} y ${i + 1})`);
  else seen.set(m[1], i + 1);
});
if (dup.length) { console.error('Funciones repetidas en proyeccion.html:\n- ' + dup.join('\n- ')); process.exit(1); }
console.log(`OK: ${seen.size} funciones, ninguna repetida.`);
