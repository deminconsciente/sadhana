// Inicio de sesión del equipo (para /equipo, /proyeccion y /admin).
//
//   GET  /entrar?v=/equipo   formulario normal (el gestor de contraseñas del navegador lo guarda)
//   POST /entrar             valida y deja una cookie firmada que dura 90 días
//   GET  /salir              borra la cookie
//
// Quién puede entrar: la clave maestra ADMIN_CLAVE con cualquier nombre o correo (entra como
// administración), o un usuario de la tabla `equipo` con su clave propia.
// La cookie va firmada con HMAC (llave derivada de ADMIN_CLAVE, o SESION_CLAVE si existe):
// cambiar ADMIN_CLAVE cierra todas las sesiones de clave maestra; cambiar la clave de un usuario
// o desactivarlo cierra la suya. El acceso anterior por Basic Auth sigue funcionando.

const COOKIE = '__Host-sadhana';
const DIAS = 90;
const RENUEVA_DIAS = 60; // si quedan menos de 60 días, se renueva sola al abrir el panel
const DESTINOS = ['/equipo', '/proyeccion', '/admin'];

const enc = new TextEncoder();
const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function iguales(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

const b64 = u8 => btoa(String.fromCharCode(...u8));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdf2(clave, sal, vueltas) {
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, k, 256));
}
export async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const v = 100000;
  return `pbkdf2$${v}$${b64(sal)}$${b64(await pbkdf2(clave, sal, v))}`;
}
export async function verificaClave(clave, guardado) {
  const [tipo, v, sal, h] = String(guardado || '').split('$');
  if (tipo !== 'pbkdf2') return false;
  return iguales(b64(await pbkdf2(clave, deB64(sal), Number(v))), h);
}

// Huella corta de la clave guardada: si la clave cambia, la sesión deja de valer.
const huella = clave_hash => String(clave_hash || '').slice(-12);

const nombreDe = ident => {
  const base = String(ident || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base ? base.replace(/\b\p{L}/gu, c => c.toUpperCase()) : 'Administración';
};

// Valida nombre/correo + clave. Devuelve {usuario, nombre, rol, v} o null.
export async function validar(env, ident, pass) {
  ident = String(ident || '').trim().toLowerCase().slice(0, 80);
  if (!pass) return null;
  if (env.ADMIN_CLAVE && iguales(pass, env.ADMIN_CLAVE))
    return { usuario: ident || 'admin', nombre: nombreDe(ident), rol: 'admin', v: 'm' };
  if (ident && env.DB) {
    try {
      const m = await env.DB.prepare('SELECT * FROM equipo WHERE usuario = ? AND activo = 1').bind(ident).first();
      if (m && (await verificaClave(pass, m.clave_hash)))
        return { usuario: m.usuario, nombre: m.nombre, rol: m.rol, v: huella(m.clave_hash) };
    } catch (e) {}
  }
  return null;
}

async function llave(env) {
  const s = env.SESION_CLAVE || (env.ADMIN_CLAVE ? 'sesion·' + env.ADMIN_CLAVE : '');
  if (!s) return null;
  return crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function firmar(env, yo) {
  const k = await llave(env);
  const datos = b64u(enc.encode(JSON.stringify({ u: yo.usuario, n: yo.nombre, r: yo.rol, v: yo.v, e: Date.now() + DIAS * 864e5 })));
  return datos + '.' + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(datos))));
}

function leerCookie(request) {
  const c = request.headers.get('cookie') || '';
  for (const parte of c.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === COOKIE) return parte.slice(i + 1).trim();
  }
  return '';
}

// Lee la cookie de sesión. Devuelve {usuario, nombre, rol, renovar} o null.
export async function deSesion(request, env) {
  const t = leerCookie(request);
  const [datos, firma] = t.split('.');
  if (!datos || !firma) return null;
  try {
    const k = await llave(env);
    if (!k || !(await crypto.subtle.verify('HMAC', k, deB64u(firma), enc.encode(datos)))) return null;
    const s = JSON.parse(new TextDecoder().decode(deB64u(datos)));
    if (!s.e || s.e < Date.now()) return null;
    let yo = { usuario: s.u, nombre: s.n, rol: s.r, v: s.v };
    if (s.v !== 'm') {
      // Usuario del equipo: sigue activo y con la misma clave (y su rol actual).
      const m = await env.DB.prepare('SELECT usuario, nombre, rol, clave_hash FROM equipo WHERE usuario = ? AND activo = 1').bind(s.u).first();
      if (!m || huella(m.clave_hash) !== s.v) return null;
      yo = { usuario: m.usuario, nombre: m.nombre, rol: m.rol, v: s.v };
    }
    yo.renovar = s.e - Date.now() < RENUEVA_DIAS * 864e5;
    return yo;
  } catch (e) {
    return null;
  }
}

const cookieCon = (valor, segundos) =>
  `${COOKIE}=${valor}; Path=/; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Lax`;

export async function cookieDe(env, yo) {
  return cookieCon(await firmar(env, yo), DIAS * 86400);
}

// Agrega la cookie renovada a una respuesta (para que la sesión no caduque mientras se use).
export async function renovar(res, env, yo) {
  if (!yo || !yo.renovar || !yo.v) return res;
  const r = new Response(res.body, res);
  r.headers.append('set-cookie', await cookieDe(env, yo));
  return r;
}

const destino = v => {
  const p = String(v || '').split(/[?#]/)[0].replace(/\/+$/, '');
  return DESTINOS.includes(p) ? String(v) : '/equipo';
};

// Respuesta para quien no ha entrado: las páginas van al formulario, la API responde 401 (sin
// el cuadro de Basic Auth del navegador, que no se deja guardar bien en celular).
export function sinSesion(request) {
  const url = new URL(request.url);
  const esPagina = request.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/admin/api/');
  if (esPagina) {
    const v = url.pathname.replace(/\/+$/, '') + url.search;
    return new Response(null, { status: 303, headers: { location: '/entrar?v=' + encodeURIComponent(v), 'cache-control': 'no-store' } });
  }
  return new Response(JSON.stringify({ ok: false, error: 'Tu sesión terminó. Vuelve a entrar.', entrar: true }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function esSesion(pathname) {
  return pathname === '/entrar' || pathname === '/entrar/' || pathname === '/salir' || pathname === '/salir/';
}

export async function sesion(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/salir')
    return new Response(null, { status: 303, headers: { location: '/entrar', 'set-cookie': cookieCon('', 0), 'cache-control': 'no-store' } });

  if (request.method === 'POST') {
    const o = request.headers.get('origin');
    if (o && o !== url.origin) return new Response('Origen no permitido', { status: 403 });
    if (!env.ADMIN_CLAVE && !env.SESION_CLAVE) return new Response('Falta configurar ADMIN_CLAVE', { status: 503 });
    let f;
    try { f = await request.formData(); } catch (e) { f = new FormData(); }
    const ident = String(f.get('usuario') || '');
    const yo = await validar(env, ident, String(f.get('clave') || ''));
    const v = destino(f.get('v'));
    if (!yo) return pagina({ v, ident, error: 'Ese nombre o esa clave no coinciden.' }, 401);
    return new Response(null, { status: 303, headers: { location: v, 'set-cookie': await cookieDe(env, yo), 'cache-control': 'no-store' } });
  }

  const v = destino(url.searchParams.get('v'));
  if (await deSesion(request, env)) return Response.redirect(url.origin + v, 303);
  return pagina({ v });
}

const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina({ v, ident = '', error = '' }, status = 200) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Entrar · Sadhana</title>
<link rel="icon" href="/assets/img/sello.png">
<style>
@font-face{font-family:"Glacial Indifference";src:url(/assets/fonts/glacial-indifference-400.woff2) format("woff2");font-weight:400}
@font-face{font-family:"Glacial Indifference";src:url(/assets/fonts/glacial-indifference-700.woff2) format("woff2");font-weight:700}
:root{--bg:#f7f1ea;--card:#fffdf9;--ink:#2a1424;--ink-2:#6b5560;--line:#e6d9cc;--acc:#a45a2a;--vino:#8a3a55;--bad:#a33b3b;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1b1418;--card:#261c22;--ink:#f5ece6;--ink-2:#c9b7ad;--line:#3d2f36;--acc:#d08c5c;--vino:#d98aa6;--bad:#e48b8b;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--acc) 16%,var(--bg)),var(--bg) 60%);color:var(--ink);font:16px/1.45 "Glacial Indifference",system-ui,sans-serif}
form{width:min(380px,100%);display:grid;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:0 10px 34px rgba(42,20,36,.10)}
img{width:64px;height:64px;margin:0 auto 2px;display:block;padding:8px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--vino))}
h1{margin:0;text-align:center;font-size:1.35rem}
p{margin:0;color:var(--ink-2);text-align:center;font-size:.95rem}
label{display:grid;gap:5px;font-size:.92rem;color:var(--ink-2)}
input{font:inherit;font-size:16px;width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
input:focus{outline:2px solid var(--acc);outline-offset:1px}
.pw{position:relative}.pw input{padding-right:84px}
.ver{position:absolute;right:6px;top:50%;transform:translateY(-50%);font:inherit;font-size:.85rem;border:0;background:transparent;color:var(--acc);padding:8px 10px;cursor:pointer}
button[type=submit]{font:inherit;font-weight:700;border:0;border-radius:999px;padding:13px;background:linear-gradient(90deg,var(--acc),var(--vino));color:#fff;cursor:pointer;min-height:48px}
.err{color:var(--bad);font-weight:700}
small{color:var(--ink-2);text-align:center;font-size:.82rem}
</style>
</head>
<body>
<form method="post" action="/entrar" autocomplete="on">
  <img src="/assets/img/sello.png" alt="">
  <h1>Equipo Sadhana</h1>
  <p>Entra una vez y tu navegador te recuerda por 90 días.</p>
  ${error ? `<p class="err" role="alert">${escH(error)}</p>` : ''}
  <input type="hidden" name="v" value="${escH(v)}">
  <label>Tu nombre, usuario o correo
    <input name="usuario" id="usuario" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${escH(ident)}" placeholder="diego o tu@correo.com">
  </label>
  <label>Clave
    <span class="pw"><input name="clave" id="clave" type="password" autocomplete="current-password" required ${ident ? 'autofocus' : ''}><button type="button" class="ver" aria-controls="clave">Mostrar</button></span>
  </label>
  <button type="submit">Entrar</button>
  <small>Guarda la clave cuando tu navegador lo ofrezca y la próxima vez se llena sola.</small>
</form>
<script>
document.querySelector(".ver").onclick=function(){var c=document.getElementById("clave"),m=c.type==="password";c.type=m?"text":"password";this.textContent=m?"Ocultar":"Mostrar";};
if(!document.getElementById("usuario").value)document.getElementById("usuario").focus();
</script>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-frame-options': 'DENY' },
  });
}
