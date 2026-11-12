// Worker de sadhanaholistics.com.
// Casi todo lo sirve Cloudflare directo desde public/ (sin invocar el Worker).
// Solo pasan por aquí las rutas de run_worker_first (wrangler.jsonc):
//  - www.sadhanaholistics.com → 301 al dominio sin www.
//  - /audios/* → respuesta 206 con Range (Safari lo necesita para reproducir).
import { esMedia, servirConRango } from './range.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === 'www.sadhanaholistics.com') {
      url.hostname = 'sadhanaholistics.com';
      return Response.redirect(url.toString(), 301);
    }
    if (esMedia(url.pathname)) return servirConRango(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
