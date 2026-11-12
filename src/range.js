// Range (206) para audio y video.
//
// Los assets estáticos de Cloudflare devuelven el archivo COMPLETO aunque el
// navegador pida un rango (medido el 2026-10-03: `Range: bytes=0-99` → 200 con
// 20 MB). Safari no reproduce <audio>/<video> de un servidor así, y ningún
// navegador puede saltar a otra posición del archivo. Vercel sí respondía 206;
// esto se perdió con el corte a Cloudflare del 2026-09-26.
//
// Aquí el Worker pide el asset completo y devuelve solo el tramo pedido, en
// streaming. Los assets tampoco traen Content-Length, así que el total sale de
// media-sizes.generated.js (lo escribe el build); si un archivo no está ahí, se
// mide leyéndolo en memoria, más lento pero correcto.

import TAMANOS from './media-sizes.generated.js';

const MEDIA = /\.(mp3|m4a|aac|ogg|oga|opus|wav|mp4|m4v|webm|mov)$/i;

export function esMedia(pathname) {
  return MEDIA.test(pathname);
}

export async function servirConRango(request, env, ctx) {
  const rango = request.headers.get('Range');
  const pide = new Headers(request.headers);
  pide.delete('Range');
  pide.delete('If-Range');
  // Sin query: la firma (?exp&f) es para el Worker, no para el asset.
  const sinQuery = new URL(request.url);
  sinQuery.search = '';
  const res = await env.ASSETS.fetch(new Request(sinQuery, { method: request.method, headers: pide }));

  // 304, 404, redirecciones…: tal cual.
  if (res.status !== 200) return res;

  const cabeceras = new Headers(res.headers);
  cabeceras.set('Accept-Ranges', 'bytes');
  if (!rango) return new Response(res.body, { status: 200, headers: cabeceras });

  let ruta;
  try { ruta = decodeURIComponent(new URL(request.url).pathname); } catch { ruta = ''; }
  let total = TAMANOS[ruta] ?? Number(res.headers.get('Content-Length'));
  let cuerpo = res.body;
  if (!Number.isFinite(total) || total <= 0) {
    const buffer = await res.arrayBuffer();
    total = buffer.byteLength;
    cuerpo = new Blob([buffer]).stream();
  }
  const completo = () => {
    cabeceras.set('Content-Length', String(total));
    return new Response(cuerpo, { status: 200, headers: cabeceras });
  };

  // If-Range con otra versión del archivo: se responde completo (RFC 9110 §13.1.5).
  const siRango = request.headers.get('If-Range');
  if (siRango && siRango !== res.headers.get('ETag') && siRango !== res.headers.get('Last-Modified')) {
    return completo();
  }

  // Solo un rango; varios rangos o un formato raro → archivo completo, que es válido.
  const m = /^bytes=(\d*)-(\d*)$/.exec(rango.trim());
  if (!m || (m[1] === '' && m[2] === '')) return completo();

  let inicio;
  let fin;
  if (m[1] === '') {
    const sufijo = Number(m[2]);
    inicio = Math.max(0, total - sufijo);
    fin = total - 1;
    if (sufijo === 0) inicio = total; // bytes=-0 no se puede satisfacer
  } else {
    inicio = Number(m[1]);
    fin = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  }

  if (inicio >= total || inicio > fin) {
    if (cuerpo) await cuerpo.cancel();
    cabeceras.set('Content-Range', `bytes */${total}`);
    cabeceras.delete('Content-Length');
    return new Response(null, { status: 416, headers: cabeceras });
  }

  const largo = fin - inicio + 1;
  cabeceras.set('Content-Range', `bytes ${inicio}-${fin}/${total}`);
  cabeceras.set('Content-Length', String(largo));

  if (request.method === 'HEAD' || !cuerpo) {
    return new Response(null, { status: 206, headers: cabeceras });
  }

  // FixedLengthStream hace que Cloudflare mande Content-Length en vez de chunked.
  const { readable, writable } = new FixedLengthStream(largo);
  ctx.waitUntil(recortar(cuerpo, inicio, largo).pipeTo(writable).catch(() => {}));
  return new Response(readable, { status: 206, headers: cabeceras });
}

// Deja pasar solo los bytes [inicio, inicio + largo) del stream.
function recortar(stream, inicio, largo) {
  const lector = stream.getReader();
  let posicion = 0;
  let restante = largo;
  return new ReadableStream({
    async pull(control) {
      for (;;) {
        if (restante <= 0) {
          control.close();
          lector.cancel().catch(() => {});
          return;
        }
        const { done, value } = await lector.read();
        if (done) {
          control.close();
          return;
        }
        const finTrozo = posicion + value.byteLength;
        if (finTrozo <= inicio) {
          posicion = finTrozo;
          continue;
        }
        const desde = Math.max(0, inicio - posicion);
        const trozo = value.subarray(desde, Math.min(value.byteLength, desde + restante));
        posicion = finTrozo;
        restante -= trozo.byteLength;
        control.enqueue(trozo);
        return;
      }
    },
    cancel(motivo) {
      return lector.cancel(motivo);
    },
  });
}
