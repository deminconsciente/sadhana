// CRM ligero y panel del equipo de Sadhana (sobre la base D1 de src/api.js).
//
// Público:
//   GET  /api/confirmar?f=FOLIO&t=TOKEN     datos mínimos de la reserva para la página /confirmar/
//   POST /api/confirmar {f, t, r:"si"|"no"}  el cliente confirma o avisa que no podrá ir
// Equipo (usuario y clave propios de la tabla `equipo`, o la clave maestra ADMIN_CLAVE; se entra en /entrar
// y queda una cookie de 90 días, ver src/sesion.js; Basic Auth sigue valiendo):
//   GET  /equipo                          panel (src/equipo.html)
//   GET  /api/crm/yo                      quién entró y con qué rol
//   GET  /api/crm/reservas?filtro=hoy|proximas|pendientes|todas
//   POST /api/crm/reservas                alta manual (clase, terapia, evento, membresía…)
//   POST /api/crm/reservas/:folio         {estado?, nota?, maestro?}
//   POST /api/crm/reservas/:folio/recordatorio  → enlace de confirmación + texto para WhatsApp
//   GET  /api/crm/alumnos?q=&segmento=todos|nuevos|vencen|inactivos|membresia
//   GET  /api/crm/alumnos/:id             ficha con historial y membresías
//   POST /api/crm/alumnos                 {id?, nombre, tel, email, origen, etiquetas, nota}
//   POST /api/crm/membresias              {alumno_id, plan, inicio, meses|fin, clases, monto, metodo}
//   POST /api/crm/membresias/:id          {estado?, nota?}
//   GET  /api/crm/votos                   votos por horario: por clase, personas, conteo por día, hora y día+hora
// Solo administradores:
//   GET  /api/crm/equipo · POST /api/crm/equipo · POST /api/crm/equipo/:id
//   GET  /api/crm/resumen?mes=YYYY-MM     números del mes para Proyección Sadhana (presupuesto vs real)
//   GET  /api/crm/kpis?semana=YYYY-MM-DD  tablero de KPIs (Proyección → Tablero): 16 indicadores, semáforos, publicidad y equilibrio
//   GET  /proyeccion                      → /equipo#proyeccion (la calculadora va embebida con ?embed=1)
//   GET  /api/crm/docs/:col · POST/DELETE /api/crm/docs/:col/:id   sus datos (escenarios, pendientes, presupuesto)
// Importación única (encabezado x-import-token = secreto IMPORT_TOKEN): POST /api/crm/docs-import
import equipoHTML from './equipo.html';
import proyeccionHTML from './proyeccion.html';
import { tablaVotos } from './api.js';
import { calcular as calcularKpis, guardarResumenSemanal } from './kpis.js';
import { deSesion, validar, sinSesion, renovar } from './sesion.js';

const ESTADOS = ['pendiente', 'confirmado', 'cancelado', 'asistio'];
const FOLIO = /^SAD-[A-Z0-9]{2,8}-\d{4}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,40}$/;
const MAX_BODY = 8 * 1024;
const MTY = -6 * 3600e3; // Monterrey, UTC-6 todo el año

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const txt = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const soloTel = v => String(v || '').replace(/\D/g, '').slice(-13);
const ahora = () => new Date().toISOString();
const hoyMTY = () => new Date(Date.now() + MTY).toISOString().slice(0, 10);
const diaISO = /^\d{4}-\d{2}-\d{2}$/;
const sumaDias = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function sumaMeses(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return sumaDias(d.toISOString().slice(0, 10), -1);
}

export function esCRM(pathname) {
  return pathname === '/equipo' || pathname === '/equipo/' || pathname === '/proyeccion' || pathname === '/proyeccion/' ||
    pathname.startsWith('/api/crm/') || pathname === '/api/confirmar';
}

export async function crm(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const M = request.method;
  if (!env.DB) return json({ ok: false, error: 'Base de datos no configurada' }, 503);

  try {
    if (p === '/api/confirmar') return M === 'POST' ? await confirmar(request, env) : await verConfirmacion(url, env);

    if (p === '/api/crm/docs-import' && M === 'POST') return await importarDocs(request, env);

    const yo = await quien(request, env);
    if (yo instanceof Response) return yo;

    if (p === '/proyeccion') {
      if (yo.rol !== 'admin') return new Response('Solo administración', { status: 403 });
      // Proyección vive como pestaña de /equipo; la ruta directa lleva ahí. /equipo la carga con ?embed=1.
      if (!url.searchParams.has('embed')) return Response.redirect(url.origin + '/equipo#proyeccion', 302);
      return new Response(proyeccionHTML, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" },
      });
    }

    if (p === '/equipo' && M === 'GET')
      return await renovar(new Response(equipoHTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex',
          'x-frame-options': 'DENY',
        },
      }), env, yo);
    if (M === 'POST' && !mismoOrigen(request)) return json({ ok: false, error: 'Origen no permitido' }, 403);

    const r = p.slice('/api/crm/'.length).split('/').map(decodeURIComponent);
    const [a, b, c] = r;
    if (a === 'yo') return json({ usuario: yo.usuario, nombre: yo.nombre, rol: yo.rol });
    if (a === 'reservas') {
      if (!b && M === 'GET') return await listarReservas(url, env);
      if (!b && M === 'POST') return await altaManual(request, env, yo);
      if (b && !c && M === 'POST') return await cambiarReserva(b, request, env);
      if (b && c === 'recordatorio' && M === 'POST') return await recordatorio(b, url, env);
    }
    if (a === 'alumnos') {
      if (!b && M === 'GET') return await listarAlumnos(url, env);
      if (!b && M === 'POST') return await guardarAlumno(request, env);
      if (b && M === 'GET') return await fichaAlumno(b, env);
    }
    if (a === 'votos' && !b && M === 'GET') return await listarVotos(env);
    if (a === 'membresias') {
      if (!b && M === 'POST') return await nuevaMembresia(request, env, yo);
      if (b && M === 'POST') return await cambiarMembresia(b, request, env);
    }
    if (a === 'docs') {
      if (yo.rol !== 'admin') return json({ ok: false, error: 'Solo administración' }, 403);
      if (!COLS.includes(b)) return json({ ok: false, error: 'Colección inválida' }, 400);
      await tablaDocs(env);
      if (!c && M === 'GET') return await listarDocs(b, env);
      if (c && M === 'POST') return await guardarDoc(b, c, request, env, yo);
      if (c && M === 'DELETE') return await borrarDoc(b, c, env);
    }
    if (a === 'kpis' && M === 'GET') {
      if (yo.rol !== 'admin') return json({ ok: false, error: 'Solo administradores' }, 403);
      return json(await calcularKpis(env, { semana: url.searchParams.get('semana') }, sincronizarAlumnos));
    }
    if (a === 'equipo' || a === 'resumen') {
      if (yo.rol !== 'admin') return json({ ok: false, error: 'Solo administradores' }, 403);
      if (a === 'resumen' && M === 'GET') return await resumen(url, env);
      if (a === 'equipo' && !b && M === 'GET') return await listarEquipo(env);
      if (a === 'equipo' && !b && M === 'POST') return await nuevoMiembro(request, env);
      if (a === 'equipo' && b && M === 'POST') return await cambiarMiembro(b, request, env);
    }
    return json({ ok: false, error: 'No encontrado' }, 404);
  } catch (e) {
    if (e.status) return json({ ok: false, error: e.message }, e.status);
    console.error('crm', p, e && e.stack ? e.stack : e);
    return json({ ok: false, error: 'Error interno' }, 500);
  }
}

const falla = (status, message) => Object.assign(new Error(message), { status });

async function leerJSON(request, max = MAX_BODY) {
  const raw = await request.text();
  if (raw.length > max) throw falla(413, 'Demasiado grande');
  try { return JSON.parse(raw || '{}'); } catch (e) { throw falla(400, 'JSON inválido'); }
}

function mismoOrigen(request) {
  const o = request.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; }
}

// ---------- Acceso ----------

async function quien(request, env) {
  // 1) Cookie de sesión (formulario /entrar, se guarda 90 días).
  const ses = await deSesion(request, env);
  if (ses) return ses;
  // 2) Acceso anterior por Basic Auth (sigue funcionando para no romper nada).
  const h = request.headers.get('authorization') || '';
  if (h.startsWith('Basic ')) {
    let usuario = '', pass = '';
    try {
      const raw = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), ch => ch.charCodeAt(0)));
      const i = raw.indexOf(':');
      usuario = raw.slice(0, i).trim().toLowerCase();
      pass = raw.slice(i + 1);
    } catch (e) {}
    const yo = await validar(env, usuario, pass);
    if (yo) return { usuario: yo.usuario, nombre: yo.nombre, rol: yo.rol };
  }
  return sinSesion(request);
}

function iguales(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

const b64 = u8 => btoa(String.fromCharCode(...u8));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(clave, sal, vueltas) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, k, 256));
}
async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const v = 100000;
  return `pbkdf2$${v}$${b64(sal)}$${b64(await pbkdf2(clave, sal, v))}`;
}
async function verificaClave(clave, guardado) {
  const [tipo, v, sal, h] = String(guardado || '').split('$');
  if (tipo !== 'pbkdf2') return false;
  return iguales(b64(await pbkdf2(clave, deB64(sal), Number(v))), h);
}
function nuevoToken() {
  return b64(crypto.getRandomValues(new Uint8Array(18))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- Alumnos: cada teléfono que reservó tiene su ficha ----------

async function sincronizarAlumnos(env) {
  try {
    // Origen = fuente[:campaña] de su primera reserva con UTM (p. ej. meta:enero); si no hay, 'web'.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO alumnos (tel, nombre, email, origen, acepta_comunidad, creado)
       SELECT tel, nombre, email,
              COALESCE((SELECT json_extract(r2.utm, '$.utm_source') ||
                               COALESCE(':' || json_extract(r2.utm, '$.utm_campaign'), '') FROM reservas r2
                        WHERE r2.tel = reservas.tel AND r2.utm IS NOT NULL ORDER BY r2.creado LIMIT 1), 'web'),
              MAX(acepta_comunidad), MIN(creado) FROM reservas GROUP BY tel`
    ).run();
    return;
  } catch (e) { /* sin la columna utm (migración 0004 pendiente): sigue con el origen 'web' */ }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO alumnos (tel, nombre, email, origen, acepta_comunidad, creado)
     SELECT tel, nombre, email, 'web', MAX(acepta_comunidad), MIN(creado) FROM reservas GROUP BY tel`
  ).run();
}

async function upsertAlumno(env, { nombre, tel, email, origen }) {
  const t = ahora();
  await env.DB.prepare(
    `INSERT INTO alumnos (tel, nombre, email, origen, creado) VALUES (?,?,?,?,?)
     ON CONFLICT(tel) DO UPDATE SET email = COALESCE(alumnos.email, excluded.email), actualizado = ?`
  ).bind(tel, nombre, email, origen, t, t).run();
  return env.DB.prepare('SELECT * FROM alumnos WHERE tel = ?').bind(tel).first();
}

const STATS = `
  COUNT(r.folio) AS reservas,
  COALESCE(SUM(r.estado = 'asistio'), 0) AS asistencias,
  MAX(CASE WHEN r.estado != 'cancelado' THEN COALESCE(r.ini, r.creado) END) AS ultima,
  COALESCE(SUM(CASE WHEN r.estado IN ('confirmado','asistio') AND r.metodo != 'membresia' THEN r.monto ELSE 0 END), 0) AS reservas_pagadas,
  (SELECT COALESCE(SUM(monto),0) FROM membresias m WHERE m.alumno_id = a.id AND m.estado != 'cancelada') AS membresias_pagadas,
  (SELECT plan || '|' || fin || '|' || COALESCE(clases,'') || '|' || id FROM membresias m
     WHERE m.alumno_id = a.id AND m.estado = 'activa' AND m.fin >= ?1 ORDER BY m.fin DESC LIMIT 1) AS membresia`;

async function listarAlumnos(url, env) {
  await sincronizarAlumnos(env);
  const hoy = hoyMTY();
  const seg = url.searchParams.get('segmento') || 'todos';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const { results } = await env.DB.prepare(
    `SELECT a.*, ${STATS} FROM alumnos a LEFT JOIN reservas r ON r.tel = a.tel GROUP BY a.id ORDER BY a.nombre COLLATE NOCASE LIMIT 2000`
  ).bind(hoy).all();
  const en7 = sumaDias(hoy, 7);
  const hace14 = new Date(Date.parse(hoy + 'T06:00:00Z') - 14 * 864e5).toISOString();
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const lista = results
    .map(conMembresia)
    .filter(x => !q || [x.nombre, x.tel, x.email, x.etiquetas].join(' ').toLowerCase().includes(q))
    .filter(x => {
      if (seg === 'nuevos') return x.creado >= hace30;
      if (seg === 'membresia') return !!x.membresia;
      if (seg === 'vencen') return x.membresia && x.membresia.fin <= en7;
      if (seg === 'inactivos') return x.ultima && x.ultima < hace14 && x.ultima < ahora();
      return true;
    });
  return json(lista);
}

function conMembresia(x) {
  if (x.membresia) {
    const [plan, fin, clases, id] = x.membresia.split('|');
    x.membresia = { id: Number(id), plan, fin, clases: clases ? Number(clases) : null };
  }
  x.gastado = (x.reservas_pagadas || 0) + (x.membresias_pagadas || 0);
  return x;
}

async function fichaAlumno(id, env) {
  const a = await env.DB.prepare(`SELECT a.*, ${STATS} FROM alumnos a LEFT JOIN reservas r ON r.tel = a.tel WHERE a.id = ?2 GROUP BY a.id`)
    .bind(hoyMTY(), Number(id)).first();
  if (!a) return json({ ok: false, error: 'No existe' }, 404);
  const { results: reservas } = await env.DB.prepare(
    `SELECT r.folio, r.titulo, r.tipo, r.ini, r.creado, r.monto, r.metodo, r.estado, r.nota, c.origen, c.registrado_por, c.maestro, c.asistencia
     FROM reservas r LEFT JOIN reserva_crm c ON c.folio = r.folio WHERE r.tel = ? ORDER BY COALESCE(r.ini, r.creado) DESC LIMIT 200`
  ).bind(a.tel).all();
  const { results: membresias } = await env.DB.prepare(
    `SELECT m.*, (SELECT COUNT(*) FROM reservas r WHERE r.tel = ? AND r.metodo = 'membresia' AND r.estado != 'cancelado'
       AND substr(COALESCE(r.ini, r.creado),1,10) BETWEEN m.inicio AND m.fin) AS usadas
     FROM membresias m WHERE m.alumno_id = ? ORDER BY m.fin DESC`
  ).bind(a.tel, a.id).all();
  return json({ ...conMembresia(a), historial: reservas, membresias });
}

async function guardarAlumno(request, env) {
  const b = await leerJSON(request);
  const nombre = txt(b.nombre, 120), tel = soloTel(b.tel);
  if (!nombre || tel.length < 10) return json({ ok: false, error: 'Nombre y WhatsApp de 10 dígitos' }, 400);
  const campos = [nombre, txt(b.email, 160), txt(b.origen, 40), txt(b.etiquetas, 200), txt(b.nota, 1000), ahora()];
  if (b.id) {
    const viejo = await env.DB.prepare('SELECT tel FROM alumnos WHERE id = ?').bind(Number(b.id)).first();
    if (!viejo) return json({ ok: false, error: 'No existe' }, 404);
    if (viejo.tel !== tel) return json({ ok: false, error: 'El teléfono liga sus reservas; para cambiarlo da de alta una ficha nueva' }, 400);
    await env.DB.prepare('UPDATE alumnos SET nombre=?, email=?, origen=?, etiquetas=?, nota=?, actualizado=? WHERE id=?')
      .bind(...campos, Number(b.id)).run();
    return json({ ok: true, id: Number(b.id) });
  }
  const r = await env.DB.prepare('INSERT OR IGNORE INTO alumnos (nombre, email, origen, etiquetas, nota, creado, tel) VALUES (?,?,?,?,?,?,?)')
    .bind(...campos, tel).run();
  if (!r.meta.changes) return json({ ok: false, error: 'Ese WhatsApp ya tiene ficha' }, 409);
  const { id } = await env.DB.prepare('SELECT id FROM alumnos WHERE tel = ?').bind(tel).first();
  return json({ ok: true, id }, 201);
}

// ---------- Reservas: la lista del día y el alta manual ----------

async function listarReservas(url, env) {
  const filtro = url.searchParams.get('filtro') || 'hoy';
  const hoy = hoyMTY();
  const ini0 = new Date(Date.parse(hoy + 'T00:00:00Z') - MTY).toISOString();
  const ini1 = new Date(Date.parse(ini0) + 864e5).toISOString();
  const W = {
    hoy: ['WHERE r.ini >= ? AND r.ini < ?', 'ORDER BY r.ini ASC', [ini0, ini1]],
    proximas: ["WHERE r.ini >= ? AND r.estado != 'cancelado'", 'ORDER BY r.ini ASC', [new Date(Date.now() - 3 * 3600e3).toISOString()]],
    pendientes: ["WHERE r.estado = 'pendiente'", 'ORDER BY r.creado DESC', []],
  }[filtro] || ['', 'ORDER BY r.creado DESC', []];
  const { results } = await env.DB.prepare(
    `SELECT r.*, c.origen, c.registrado_por, c.maestro, c.asistencia, c.recordado, c.respondido, a.id AS alumno_id
     FROM reservas r LEFT JOIN reserva_crm c ON c.folio = r.folio LEFT JOIN alumnos a ON a.tel = r.tel
     ${W[0]} ${W[1]} LIMIT 500`
  ).bind(...W[2]).all();
  return json(results);
}

function folioManual() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `SAD-EQ${L[r[0] % L.length]}${L[r[1] % L.length]}-${String(((r[2] << 8) | r[3]) % 10000).padStart(4, '0')}`;
}

async function altaManual(request, env, yo) {
  const b = await leerJSON(request);
  const nombre = txt(b.nombre, 120), tel = soloTel(b.tel), titulo = txt(b.titulo, 160);
  if (!nombre || tel.length < 10 || !titulo) return json({ ok: false, error: 'Faltan nombre, WhatsApp o qué reservó' }, 400);
  const estado = ESTADOS.includes(b.estado) ? b.estado : 'confirmado';
  const metodo = txt(b.metodo, 30) || 'efectivo';
  let ini = null;
  if (b.ini) {
    const d = new Date(b.ini);
    if (isNaN(d)) return json({ ok: false, error: 'Fecha inválida' }, 400);
    ini = d.toISOString();
  }
  const alumno = await upsertAlumno(env, { nombre, tel, email: txt(b.email, 160), origen: 'manual' });

  let aviso = null;
  if (metodo === 'membresia') {
    const dia = (ini ? new Date(Date.parse(ini) + MTY).toISOString() : new Date(Date.now() + MTY).toISOString()).slice(0, 10);
    const m = await env.DB.prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM reservas r WHERE r.tel = ? AND r.metodo = 'membresia' AND r.estado != 'cancelado'
         AND substr(COALESCE(r.ini, r.creado),1,10) BETWEEN m.inicio AND m.fin) AS usadas
       FROM membresias m WHERE m.alumno_id = ? AND m.estado = 'activa' AND ? BETWEEN m.inicio AND m.fin ORDER BY m.fin DESC LIMIT 1`
    ).bind(tel, alumno.id, dia).first();
    if (!m) aviso = 'No tiene membresía activa para esa fecha. Revisa su ficha.';
    else if (m.clases && m.usadas >= m.clases) aviso = `Ya usó sus ${m.clases} clases de "${m.plan}".`;
  }

  const t = ahora();
  let folio;
  for (let i = 0; i < 5 && !folio; i++) {
    const f = folioManual();
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO reservas (folio, creado, tipo, titulo, ini, nombre, tel, email, monto, metodo, estado, nota, actualizado, acepta_privacidad, acepta_comunidad)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`
    ).bind(f, t, txt(b.tipo, 40), titulo, ini, nombre, tel, alumno.email, Math.max(0, Math.round(Number(b.monto) || 0)), metodo, estado, txt(b.nota, 500), t).run();
    if (r.meta.changes) folio = f;
  }
  if (!folio) return json({ ok: false, error: 'No se pudo generar folio, intenta de nuevo' }, 500);
  await env.DB.prepare('INSERT INTO reserva_crm (folio, origen, registrado_por, maestro) VALUES (?,?,?,?)')
    .bind(folio, 'manual', yo.usuario, txt(b.maestro, 60)).run();
  return json({ ok: true, folio, alumno_id: alumno.id, aviso }, 201);
}

async function cambiarReserva(folio, request, env) {
  const b = await leerJSON(request);
  const sets = [], vals = [];
  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) return json({ ok: false, error: 'Estado inválido' }, 400);
    sets.push('estado = ?'); vals.push(b.estado);
  }
  if (b.nota !== undefined) { sets.push('nota = ?'); vals.push(txt(b.nota, 500)); }
  if (sets.length) {
    sets.push('actualizado = ?'); vals.push(ahora());
    const r = await env.DB.prepare(`UPDATE reservas SET ${sets.join(', ')} WHERE folio = ?`).bind(...vals, folio).run();
    if (!r.meta.changes) return json({ ok: false, error: 'No existe ese folio' }, 404);
    if (b.estado === 'confirmado') await activarPaqueteHoras(env, folio);
  }
  if (b.maestro !== undefined) {
    const existe = await env.DB.prepare('SELECT 1 FROM reservas WHERE folio = ?').bind(folio).first();
    if (!existe) return json({ ok: false, error: 'No existe ese folio' }, 404);
    await env.DB.prepare('INSERT INTO reserva_crm (folio, maestro) VALUES (?,?) ON CONFLICT(folio) DO UPDATE SET maestro = excluded.maestro')
      .bind(folio, txt(b.maestro, 60)).run();
  }
  if (!sets.length && b.maestro === undefined) return json({ ok: false, error: 'Nada que cambiar' }, 400);
  return json({ ok: true });
}

// Al confirmar el pago de un «Paquete de horas» (sala) se abre su membresía: clases = horas, con su vigencia.
// Las rentas pagadas con el paquete restan de ahí (ver horasDisponibles en src/sala.js).
async function activarPaqueteHoras(env, folio) {
  const r = await env.DB.prepare("SELECT * FROM reservas WHERE folio = ? AND tipo = 'Paquete de horas'").bind(folio).first();
  if (!r) return;
  const nota = 'Folio ' + folio;
  if (await env.DB.prepare('SELECT 1 FROM membresias WHERE nota = ?').bind(nota).first()) return;
  let det = [];
  try { det = JSON.parse(r.detalle || '[]'); } catch (e) {}
  const val = k => (det.find(x => new RegExp(k, 'i').test(x[0])) || [])[1] || '';
  const horas = parseInt(val('horas'), 10) || 0, dias = parseInt(val('vigencia'), 10) || 90;
  if (!horas) return;
  await sincronizarAlumnos(env);
  const al = await env.DB.prepare('SELECT id FROM alumnos WHERE tel = ?').bind(r.tel).first();
  if (!al) return;
  const inicio = hoyMTY();
  await env.DB.prepare(
    'INSERT INTO membresias (alumno_id, plan, inicio, fin, clases, monto, metodo, nota, registrado_por, creado) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(al.id, `Paquete ${horas} h de sala`, inicio, sumaDias(inicio, dias), horas, r.monto || 0, r.metodo, nota, 'automático', ahora()).run();
}

// ---------- Confirmación de asistencia en línea ----------

async function recordatorio(folio, url, env) {
  const r = await env.DB.prepare('SELECT r.*, c.token FROM reservas r LEFT JOIN reserva_crm c ON c.folio = r.folio WHERE r.folio = ?').bind(folio).first();
  if (!r) return json({ ok: false, error: 'No existe ese folio' }, 404);
  const token = r.token || nuevoToken();
  await env.DB.prepare(
    `INSERT INTO reserva_crm (folio, token, recordado) VALUES (?,?,?)
     ON CONFLICT(folio) DO UPDATE SET token = COALESCE(reserva_crm.token, excluded.token), recordado = excluded.recordado`
  ).bind(folio, token, ahora()).run();
  const base = /^(localhost|127\.)/.test(url.hostname) ? url.origin : `https://${url.host}`;
  const enlace = `${base}/confirmar/?f=${encodeURIComponent(folio)}&t=${token}`;
  const cuando = r.ini
    ? new Date(r.ini).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Monterrey' })
    : '';
  const texto = `Hola ${r.nombre.split(' ')[0]}, te esperamos${cuando ? ` el ${cuando}` : ''} en Sadhana para ${r.titulo}. ` +
    `¿Nos confirmas tu asistencia con un toque? ${enlace}`;
  const tel = r.tel.length === 10 ? '52' + r.tel : r.tel;
  return json({ ok: true, enlace, texto, whatsapp: `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` });
}

async function reservaPorToken(f, t, env) {
  if (!FOLIO.test(f || '') || !TOKEN.test(t || '')) return null;
  const r = await env.DB.prepare(
    'SELECT r.folio, r.titulo, r.tipo, r.ini, r.nombre, r.estado, c.asistencia, c.token FROM reservas r JOIN reserva_crm c ON c.folio = r.folio WHERE r.folio = ?'
  ).bind(f).first();
  return r && r.token && iguales(r.token, t) ? r : null;
}

async function verConfirmacion(url, env) {
  const r = await reservaPorToken(url.searchParams.get('f'), url.searchParams.get('t'), env);
  if (!r) return json({ ok: false, error: 'Enlace no válido' }, 404);
  return json({ ok: true, folio: r.folio, titulo: r.titulo, tipo: r.tipo, ini: r.ini, nombre: r.nombre.split(' ')[0], estado: r.estado, asistencia: r.asistencia });
}

async function confirmar(request, env) {
  const b = await leerJSON(request);
  const r = await reservaPorToken(b.f, b.t, env);
  if (!r) return json({ ok: false, error: 'Enlace no válido' }, 404);
  if (r.estado === 'cancelado') return json({ ok: false, error: 'Esta reserva está cancelada' }, 409);
  if (!['si', 'no'].includes(b.r)) return json({ ok: false, error: 'Respuesta inválida' }, 400);
  const asistencia = b.r === 'si' ? 'confirmada' : 'no_ira';
  await env.DB.prepare('UPDATE reserva_crm SET asistencia = ?, respondido = ? WHERE folio = ?').bind(asistencia, ahora(), r.folio).run();
  return json({ ok: true, asistencia });
}

// ---------- Membresías ----------

async function nuevaMembresia(request, env, yo) {
  const b = await leerJSON(request);
  const alumno = await env.DB.prepare('SELECT id FROM alumnos WHERE id = ?').bind(Number(b.alumno_id)).first();
  if (!alumno) return json({ ok: false, error: 'Alumno no existe' }, 404);
  const plan = txt(b.plan, 80);
  const inicio = diaISO.test(b.inicio || '') ? b.inicio : hoyMTY();
  const fin = diaISO.test(b.fin || '') ? b.fin : sumaMeses(inicio, Math.max(1, Math.min(24, Number(b.meses) || 1)));
  if (!plan || fin < inicio) return json({ ok: false, error: 'Faltan plan o fechas' }, 400);
  const clases = Number(b.clases) > 0 ? Math.round(Number(b.clases)) : null;
  const r = await env.DB.prepare(
    'INSERT INTO membresias (alumno_id, plan, inicio, fin, clases, monto, metodo, nota, registrado_por, creado) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(alumno.id, plan, inicio, fin, clases, Math.max(0, Math.round(Number(b.monto) || 0)), txt(b.metodo, 30), txt(b.nota, 500), yo.usuario, ahora()).run();
  return json({ ok: true, id: r.meta.last_row_id, inicio, fin }, 201);
}

async function cambiarMembresia(id, request, env) {
  const b = await leerJSON(request);
  const sets = [], vals = [];
  if (b.estado !== undefined) {
    if (!['activa', 'pausada', 'cancelada'].includes(b.estado)) return json({ ok: false, error: 'Estado inválido' }, 400);
    sets.push('estado = ?'); vals.push(b.estado);
  }
  if (b.nota !== undefined) { sets.push('nota = ?'); vals.push(txt(b.nota, 500)); }
  if (b.fin !== undefined) {
    if (!diaISO.test(b.fin)) return json({ ok: false, error: 'Fecha inválida' }, 400);
    sets.push('fin = ?'); vals.push(b.fin);
  }
  if (!sets.length) return json({ ok: false, error: 'Nada que cambiar' }, 400);
  const r = await env.DB.prepare(`UPDATE membresias SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, Number(id)).run();
  if (!r.meta.changes) return json({ ok: false, error: 'No existe' }, 404);
  return json({ ok: true });
}

// ---------- Equipo ----------

async function listarEquipo(env) {
  const { results } = await env.DB.prepare('SELECT id, usuario, nombre, rol, activo, creado FROM equipo ORDER BY nombre').all();
  return json(results);
}

async function nuevoMiembro(request, env) {
  const b = await leerJSON(request);
  const usuario = String(b.usuario || '').trim().toLowerCase();
  const nombre = txt(b.nombre, 80);
  if (!/^[a-z0-9._-]{2,30}$/.test(usuario) || !nombre) return json({ ok: false, error: 'Usuario (sin espacios) y nombre' }, 400);
  if (String(b.clave || '').length < 8) return json({ ok: false, error: 'La clave necesita al menos 8 caracteres' }, 400);
  const rol = b.rol === 'admin' ? 'admin' : 'maestro';
  const r = await env.DB.prepare('INSERT OR IGNORE INTO equipo (usuario, nombre, rol, clave_hash, creado) VALUES (?,?,?,?,?)')
    .bind(usuario, nombre, rol, await hashClave(String(b.clave)), ahora()).run();
  if (!r.meta.changes) return json({ ok: false, error: 'Ese usuario ya existe' }, 409);
  return json({ ok: true }, 201);
}

async function cambiarMiembro(id, request, env) {
  const b = await leerJSON(request);
  const sets = [], vals = [];
  if (b.activo !== undefined) { sets.push('activo = ?'); vals.push(b.activo ? 1 : 0); }
  if (b.rol !== undefined) { sets.push('rol = ?'); vals.push(b.rol === 'admin' ? 'admin' : 'maestro'); }
  if (b.clave !== undefined) {
    if (String(b.clave).length < 8) return json({ ok: false, error: 'La clave necesita al menos 8 caracteres' }, 400);
    sets.push('clave_hash = ?'); vals.push(await hashClave(String(b.clave)));
  }
  if (!sets.length) return json({ ok: false, error: 'Nada que cambiar' }, 400);
  const r = await env.DB.prepare(`UPDATE equipo SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, Number(id)).run();
  if (!r.meta.changes) return json({ ok: false, error: 'No existe' }, 404);
  return json({ ok: true });
}

// ---------- Resumen del mes para Proyección Sadhana ----------

async function resumen(url, env) {
  await sincronizarAlumnos(env);
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : hoyMTY().slice(0, 7);
  const d0 = mes + '-01';
  const d1 = sumaMeses(d0, 1);
  const a0 = new Date(Date.parse(d0 + 'T00:00:00Z') - MTY).toISOString();
  const a1 = new Date(Date.parse(d1 + 'T00:00:00Z') - MTY + 864e5).toISOString();
  const cuando = 'COALESCE(ini, creado)';
  const DB = env.DB;
  const [porEstado, porMetodo, porHorario, nuevos, membresias, porMaestro] = await Promise.all([
    DB.prepare(`SELECT estado, COUNT(*) AS n, SUM(monto) AS monto FROM reservas WHERE ${cuando} >= ? AND ${cuando} < ? GROUP BY estado`).bind(a0, a1).all(),
    DB.prepare(`SELECT COALESCE(metodo,'') AS metodo, COUNT(*) AS n, SUM(monto) AS monto FROM reservas
                WHERE ${cuando} >= ? AND ${cuando} < ? AND estado IN ('confirmado','asistio') GROUP BY metodo`).bind(a0, a1).all(),
    DB.prepare(`SELECT titulo, ini, estado FROM reservas WHERE ini >= ? AND ini < ? AND estado != 'cancelado'`).bind(a0, a1).all(),
    DB.prepare(`SELECT COUNT(*) AS n FROM alumnos WHERE creado >= ? AND creado < ?`).bind(a0, a1).first(),
    DB.prepare(`SELECT plan, monto, inicio, fin, clases FROM membresias WHERE estado != 'cancelada' AND inicio <= ? AND fin >= ?`).bind(sumaDias(d1, -0), d0).all(),
    DB.prepare(`SELECT TRIM(c.maestro) AS maestro, r.ini, r.estado FROM reservas r JOIN reserva_crm c ON c.folio = r.folio
                WHERE r.ini >= ? AND r.ini < ? AND r.estado != 'cancelado' AND c.maestro IS NOT NULL AND TRIM(c.maestro) != ''`).bind(a0, a1).all(),
  ]);

  // Clases reales de cada maestro en el mes: sesiones distintas, reservas y asistencias (para "Real" en Proyección).
  const mae = {};
  for (const r of porMaestro.results) {
    const k = r.maestro.toLowerCase();
    const m = (mae[k] ||= { maestro: r.maestro, sesiones: new Set(), reservas: 0, asistencias: 0 });
    m.sesiones.add(r.ini);
    m.reservas++;
    if (r.estado === 'asistio') m.asistencias++;
  }
  const maestros = Object.values(mae).map(m => ({ maestro: m.maestro, sesiones: m.sesiones.size, reservas: m.reservas, asistencias: m.asistencias }));

  // Ocupación por día de la semana y hora (hora de Monterrey) para el mapa de calor "Hoy".
  const horarios = {};
  for (const r of porHorario.results) {
    const l = new Date(Date.parse(r.ini) + MTY);
    const k = `${l.getUTCDay()}|${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}|${r.titulo}`;
    const h = (horarios[k] ||= { dia: l.getUTCDay(), hora: k.split('|')[1], titulo: r.titulo, sesiones: new Set(), reservas: 0, asistencias: 0 });
    h.sesiones.add(l.toISOString().slice(0, 10));
    h.reservas++;
    if (r.estado === 'asistio') h.asistencias++;
  }
  const ocupacion = Object.values(horarios).map(h => ({
    dia: h.dia, hora: h.hora, titulo: h.titulo, sesiones: h.sesiones.size, reservas: h.reservas, asistencias: h.asistencias,
    promedio: Math.round((h.reservas / h.sesiones.size) * 10) / 10,
  }));

  const vendidasMes = membresias.results.filter(m => m.inicio >= d0 && m.inicio < d1);
  return json({
    mes,
    reservas: Object.fromEntries(porEstado.results.map(r => [r.estado, { n: r.n, monto: r.monto || 0 }])),
    ingresos: {
      total: porMetodo.results.reduce((s, r) => s + (r.metodo === 'membresia' ? 0 : r.monto || 0), 0) + vendidasMes.reduce((s, m) => s + m.monto, 0),
      reservas: Object.fromEntries(porMetodo.results.map(r => [r.metodo, { n: r.n, monto: r.monto || 0 }])),
      membresias_vendidas: { n: vendidasMes.length, monto: vendidasMes.reduce((s, m) => s + m.monto, 0) },
    },
    alumnos_nuevos: nuevos.n,
    membresias_activas: membresias.results.length,
    ocupacion,
    maestros,
  });
}

// ---------- Datos de Proyección Sadhana (la calculadora) ----------
// Cada documento es el mismo objeto que guardaba el artefacto, como JSON.
const COLS = ['escenarios', 'meta', 'actuals', 'invest', 'tasks', 'catalogo', 'kpis'];
const DOC_ID = /^[A-Za-z0-9_.-]{1,60}$/;
let tablaLista = false;
async function tablaDocs(env) {
  if (tablaLista) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS proyeccion_docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, actualizado TEXT NOT NULL, por TEXT, PRIMARY KEY (col, id))`
  ).run();
  tablaLista = true;
}

async function listarDocs(col, env) {
  const { results } = await env.DB.prepare('SELECT id, data, actualizado FROM proyeccion_docs WHERE col = ?').bind(col).all();
  return json(results.map(r => ({ id: r.id, data: JSON.parse(r.data), actualizado: r.actualizado })));
}

async function guardarDoc(col, id, request, env, yo) {
  if (!DOC_ID.test(id)) return json({ ok: false, error: 'Id inválido' }, 400);
  const b = await leerJSON(request, 200 * 1024);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ ok: false, error: 'Documento inválido' }, 400);
  delete b.id;
  await env.DB.prepare(
    `INSERT INTO proyeccion_docs (col, id, data, actualizado, por) VALUES (?,?,?,?,?)
     ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado, por = excluded.por`
  ).bind(col, id, JSON.stringify(b), ahora(), yo.usuario).run();
  return json({ ok: true });
}

async function borrarDoc(col, id, env) {
  await env.DB.prepare('DELETE FROM proyeccion_docs WHERE col = ? AND id = ?').bind(col, id).run();
  return json({ ok: true });
}

// Carga inicial desde el artefacto. Solo con el secreto IMPORT_TOKEN (se borra al terminar)
// y solo llena documentos que no existan, para no pisar cambios hechos en el sitio.
async function importarDocs(request, env) {
  const t = request.headers.get('x-import-token') || '';
  if (!env.IMPORT_TOKEN || !t || !iguales(t, env.IMPORT_TOKEN)) return json({ ok: false, error: 'No autorizado' }, 401);
  const b = await leerJSON(request, 1024 * 1024);
  await tablaDocs(env);
  const ahoraISO = ahora();
  const stmts = [];
  for (const col of COLS)
    for (const d of Array.isArray(b[col]) ? b[col] : []) {
      if (!d || !DOC_ID.test(String(d.id || ''))) continue;
      const { id, ...data } = d;
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO proyeccion_docs (col, id, data, actualizado, por) VALUES (?,?,?,?,?)')
        .bind(col, String(id), JSON.stringify(data), ahoraISO, 'importación'));
    }
  const r = stmts.length ? await env.DB.batch(stmts) : [];
  return json({ ok: true, recibidos: stmts.length, nuevos: r.reduce((s, x) => s + (x.meta.changes || 0), 0) });
}

// ---------- Votos por horario ----------
// Agrupa por clase: cuántas personas, cuántas marcaron cada día, cada hora y cada combinación día+hora.
async function listarVotos(env) {
  await tablaVotos(env);
  const { results } = await env.DB.prepare('SELECT * FROM votos ORDER BY actualizado DESC').all();
  const porClase = new Map();
  for (const v of results) {
    let dias = [], horas = [], slots = null;
    try { dias = JSON.parse(v.dias); horas = JSON.parse(v.horas); if (v.slots) slots = JSON.parse(v.slots); } catch (e) {}
    if (!porClase.has(v.clase)) porClase.set(v.clase, { clase: v.clase, titulo: v.titulo || v.clase, personas: [], dias: {}, horas: {}, combos: {}, modalidad: {} });
    const c = porClase.get(v.clase);
    c.personas.push({ nombre: v.nombre, tel: v.tel, dias, horas, modalidad: v.modalidad, comunidad: !!v.acepta_comunidad, actualizado: v.actualizado });
    for (const d of dias) c.dias[d] = (c.dias[d] || 0) + 1;
    for (const h of horas) c.horas[h] = (c.horas[h] || 0) + 1;
    if (slots) for (const k of slots) c.combos[k] = (c.combos[k] || 0) + 1; // día-hora exactos (voto de un toque)
    else for (const d of dias) for (const h of horas) c.combos[d + '-' + h] = (c.combos[d + '-' + h] || 0) + 1;
    c.modalidad[v.modalidad || 'Presencial'] = (c.modalidad[v.modalidad || 'Presencial'] || 0) + 1;
  }
  const out = [...porClase.values()].map(c => ({
    ...c,
    top: Object.entries(c.combos).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, n]) => { const [d, h] = k.split('-').map(Number); return { dia: d, h, n }; }),
  }));
  out.sort((x, y) => y.personas.length - x.personas.length);
  return json(out);
}

// Resumen de los lunes (lo llama el cron de src/index.js).
export const resumenKpisDeLosLunes = env => guardarResumenSemanal(env, sincronizarAlumnos);
