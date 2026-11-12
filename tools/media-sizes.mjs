// Escribe src/media-sizes.generated.js con el tamaño de cada audio/video de public/.
// range.js lo usa para responder 206 (Safari no reproduce audio sin Range).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const raiz = new URL('../public/', import.meta.url).pathname;
const MEDIA = /\.(mp3|m4a|aac|ogg|oga|opus|wav|mp4|m4v|webm|mov)$/i;
const tam = {};
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (MEDIA.test(n)) tam['/' + relative(raiz, p)] = statSync(p).size;
  }
})(raiz);
writeFileSync(new URL('../src/media-sizes.generated.js', import.meta.url),
  '// Generado por tools/media-sizes.mjs. No editar.\nexport default ' + JSON.stringify(tam, null, 2) + ';\n');
console.log('media-sizes:', Object.keys(tam).length, 'archivos');
