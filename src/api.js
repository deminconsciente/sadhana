// API de reservas y panel /admin de Sadhana.
//
// Público:
//   POST /api/reservas          guarda un ticket recién emitido por la landing.
//   GET  /api/reservas/estado   ?folios=A,B → {A:"pendiente",B:"confirmado"} (sin datos personales).
//   GET  /api/catalogo          directorio de clases editable desde /equipo → {clases:[...], fundadores}.
//                               Vacío = la landing usa el directorio que trae escrito.
//                               Trae también `paquetes` (máx. 4) si el equipo los activó y `promo`
//                               (precio de apertura de la clase individual y primera clase gratis).
//   POST /api/votos             voto por días y horas de una clase {clase, titulo, dias, horas, modalidad, nombre, tel}.
//   GET  /api/votos/conteo      {claseId: personas} (sin datos personales) para la barra «interesados».
// Privado (contraseña en el secreto ADMIN_CLAVE):
//   GET  /admin                 panel para Isa y Diego.
//   GET  /admin/api/reservas    lista (JSON) o ?formato=csv.
//   POST /admin/api/reservas/:folio  {estado?, nota?}
import panelHTML from './admin.html';

const ESTADOS = ['pendiente', 'confirmado', 'cancelado', 'asistio'];
const FOLIO = /^SAD-[A-Z0-9]{2,8}-\d{4}$/;
const MAX_BODY = 8 * 1024;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const txt = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);

export function esApi(pathname) {
  return pathname.startsWith('/api/') || pathname === '/admin' || pathname.startsWith('/admin/');
}

export async function api(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (!env.DB) return json({ ok: false, error: 'Base de datos no configurada' }, 503);

  try {
    if (p === '/api/reservas' && request.method === 'POST') return await crear(request, env);
    if (p === '/api/reservas/estado' && request.method === 'GET') return await estados(url, env);
    if (p === '/api/catalogo' && request.method === 'GET') return await catalogo(env);
    if (p === '/api/votos' && request.method === 'POST') return await votar(request, env);
    if (p === '/api/votos/conteo' && request.method === 'GET') return await conteoVotos(env);

    if (p === '/admin' || p.startsWith('/admin/')) {
      const auth = autorizado(request, env);
      if (auth) return auth;
      if (p === '/admin' && request.method === 'GET')
        return new Response(panelHTML, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-robots-tag': 'noindex',
            'x-frame-options': 'DENY',
          },
        });
      if (p === '/admin/api/reservas' && request.method === 'GET') return await listar(url, env);
      const m = p.match(/^\/admin\/api\/reservas\/([^/]+)$/);
      if (m && request.method === 'POST') return await actualizar(decodeURIComponent(m[1]), request, env);
    }
    return json({ ok: false, error: 'No encontrado' }, 404);
  } catch (e) {
    console.error('api', p, e && e.stack ? e.stack : e);
    return json({ ok: false, error: 'Error interno' }, 500);
  }
}

async function leerJSON(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error('demasiado grande'), { status: 413 });
  return JSON.parse(raw || '{}');
}

async function crear(request, env) {
  // Solo desde el propio sitio (mismo host) o desde sadhanaholistics.com.
  const origen = request.headers.get('origin');
  if (origen) {
    let host = '';
    try { host = new URL(origen).host; } catch (e) {}
    if (host !== new URL(request.url).host && !/(^|\.)sadhanaholistics\.com$/.test(host))
      return json({ ok: false, error: 'Origen no permitido' }, 403);
  }

  let b;
  try { b = await leerJSON(request); } catch (e) { return json({ ok: false, error: 'JSON inválido' }, e.status || 400); }

  const folio = txt(b.folio, 20);
  const nombre = txt(b.nombre, 120);
  const tel = String(b.tel || '').replace(/\D/g, '').slice(-13);
  const titulo = txt(b.titulo, 160);
  if (!folio || !FOLIO.test(folio)) return json({ ok: false, error: 'Folio inválido' }, 400);
  if (!nombre || tel.length < 10 || !titulo) return json({ ok: false, error: 'Faltan datos' }, 400);

  // Límite suave contra spam: 15 reservas por teléfono en 24 h.
  const desde = new Date(Date.now() - 864e5).toISOString();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM reservas WHERE tel = ? AND creado > ?').bind(tel, desde).first();
  if (n >= 15) return json({ ok: false, error: 'Demasiadas reservas' }, 429);

  // Primera clase gratis: una por WhatsApp. Se niega si ese número ya tiene una clase o paquete
  // (no cancelados) o una membresía, o si el equipo apagó la promo en /equipo.
  const gratis = b.metodo === 'primera-gratis';
  if (gratis) {
    if (Number(b.monto)) return json({ ok: false, error: 'La clase gratis no lleva cobro' }, 400);
    const promo = await leerPromo(env);
    if (promo && promo.gratis === false) return json({ ok: false, error: 'promo_cerrada' }, 409);
    if (await yaTomoClase(env, tel)) return json({ ok: false, error: 'ya_usada' }, 409);
  }

  const detalle = Array.isArray(b.detalle) ? JSON.stringify(b.detalle.slice(0, 12).map(([k, v]) => [txt(k, 40), txt(v, 160)])) : null;
  const estado = b.estado === 'confirmado' && (b.metodo === 'credito' || !Number(b.monto)) ? 'confirmado' : 'pendiente';
  const ahora = new Date().toISOString();

  const utm = limpiarUtm(b.utm);

  // INSERT OR IGNORE: si la landing reintenta el mismo folio, no se duplica ni se pisa.
  const valores = [
    folio, ahora, txt(b.tipo, 40), titulo, txt(b.ini, 40), detalle, nombre, tel, txt(b.email, 160),
    Math.max(0, Math.round(Number(b.monto) || 0)), txt(b.metodo, 30), estado, ahora,
    b.aceptaPrivacidad ? 1 : 0, b.aceptaComunidad ? 1 : 0
  ];
  const SQL = `INSERT OR IGNORE INTO reservas
     (folio, creado, tipo, titulo, ini, detalle, nombre, tel, email, monto, metodo, estado, actualizado, acepta_privacidad, acepta_comunidad`;
  try {
    await env.DB.prepare(SQL + `, utm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...valores, utm).run();
  } catch (e) {
    // Base sin la migración 0004 todavía: guarda la reserva sin el origen en vez de perderla.
    if (!/utm/i.test(String(e && e.message))) throw e;
    await env.DB.prepare(SQL + `) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...valores).run();
  }

  return json({ ok: true, folio, estado }, 201);
}

// Origen del contacto: solo las llaves conocidas, texto corto, guardado como JSON (o null).
function limpiarUtm(u) {
  if (!u || typeof u !== 'object') return null;
  const o = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ref']) {
    const v = txt(u[k], 100);
    if (v) o[k] = v;
  }
  return Object.keys(o).length ? JSON.stringify(o) : null;
}

async function leerPromo(env) {
  try {
    const r = await env.DB.prepare("SELECT data FROM proyeccion_docs WHERE col = 'catalogo' AND id = '_paquetes'").first();
    const d = r ? JSON.parse(r.data) : null;
    return d && d.promo ? d.promo : null;
  } catch (e) { return null; }
}
async function yaTomoClase(env, tel) {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM reservas WHERE substr(tel, -10) = ? AND estado != 'cancelado' AND (tipo IN ('Clase', 'Paquete') OR metodo = 'primera-gratis')"
  ).bind(tel.slice(-10)).first();
  if (r && r.n > 0) return true;
  try { // membresías del CRM (la tabla puede no existir en una base nueva)
    const m = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM membresias m JOIN alumnos a ON a.id = m.alumno_id WHERE substr(a.tel, -10) = ?"
    ).bind(tel.slice(-10)).first();
    if (m && m.n > 0) return true;
  } catch (e) {}
  return false;
}

async function estados(url, env) {
  const folios = (url.searchParams.get('folios') || '').split(',').map(s => s.trim()).filter(f => FOLIO.test(f)).slice(0, 30);
  if (!folios.length) return json({});
  const { results } = await env.DB.prepare(
    `SELECT folio, estado FROM reservas WHERE folio IN (${folios.map(() => '?').join(',')})`
  ).bind(...folios).all();
  return json(Object.fromEntries(results.map(r => [r.folio, r.estado])));
}

function autorizado(request, env) {
  const clave = env.ADMIN_CLAVE;
  if (!clave) return new Response('Falta configurar ADMIN_CLAVE', { status: 503 });
  const h = request.headers.get('authorization') || '';
  let pass = '';
  if (h.startsWith('Basic ')) {
    try { pass = atob(h.slice(6)).split(':').slice(1).join(':'); } catch (e) {}
  }
  if (pass && iguales(pass, clave)) return null;
  return new Response('Acceso solo para el equipo de Sadhana', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Sadhana admin", charset="UTF-8"', 'cache-control': 'no-store' },
  });
}

function iguales(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

async function listar(url, env) {
  const filtro = url.searchParams.get('filtro') || 'todas';
  const where = {
    pendientes: "WHERE estado = 'pendiente'",
    proximas: "WHERE ini >= ? AND estado != 'cancelado'",
    todas: '',
  }[filtro] ?? '';
  const orden = filtro === 'proximas' ? 'ORDER BY ini ASC' : 'ORDER BY creado DESC';
  const stmt = env.DB.prepare(`SELECT * FROM reservas ${where} ${orden} LIMIT 500`);
  const { results } = await (filtro === 'proximas' ? stmt.bind(new Date(Date.now() - 3 * 3600e3).toISOString()) : stmt).all();

  if (url.searchParams.get('formato') === 'csv') {
    const cols = ['folio', 'creado', 'tipo', 'titulo', 'ini', 'nombre', 'tel', 'email', 'monto', 'metodo', 'estado', 'nota', 'acepta_comunidad'];
    const esc = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = '﻿' + [cols.join(','), ...results.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sadhana-reservas-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }
  return json(results);
}

async function actualizar(folio, request, env) {
  let b;
  try { b = await leerJSON(request); } catch (e) { return json({ ok: false, error: 'JSON inválido' }, 400); }
  const sets = [], vals = [];
  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) return json({ ok: false, error: 'Estado inválido' }, 400);
    sets.push('estado = ?'); vals.push(b.estado);
  }
  if (b.nota !== undefined) { sets.push('nota = ?'); vals.push(txt(b.nota, 500)); }
  if (!sets.length) return json({ ok: false, error: 'Nada que cambiar' }, 400);
  sets.push('actualizado = ?'); vals.push(new Date().toISOString());
  const r = await env.DB.prepare(`UPDATE reservas SET ${sets.join(', ')} WHERE folio = ?`).bind(...vals, folio).run();
  if (!r.meta.changes) return json({ ok: false, error: 'No existe ese folio' }, 404);
  return json({ ok: true });
}

// Directorio de clases (lo edita administración en /equipo → Directorio; vive en proyeccion_docs, col 'catalogo').
// Solo sale lo público: las clases ocultas no se mandan.
async function catalogo(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare("SELECT id, data FROM proyeccion_docs WHERE col = 'catalogo'").all());
  } catch (e) {
    rows = []; // la tabla aún no existe: la landing usa su directorio escrito
  }
  let fundadores = null, paquetes = null, promo = null, terapias = null;
  const clases = [];
  for (const r of rows) {
    let d;
    try { d = JSON.parse(r.data); } catch (e) { continue; }
    if (r.id === '_fundadores') { fundadores = { cupo: d.cupo, tomados: d.tomados ?? null, descuento: d.descuento }; continue; }
    // Paquetes de alumno: solo salen si el equipo activó «Mostrar en la página».
    // La promo de apertura (precio de la clase individual y primera clase gratis) sale siempre que exista.
    if (r.id === '_paquetes') { if (d.publicar && Array.isArray(d.items)) paquetes = d.items.slice(0, 4); if (d.promo) promo = d.promo; continue; }
    // Terapias 1:1: solo salen las activas.
    if (r.id === '_terapias') { if (Array.isArray(d.items)) terapias = d.items.filter(x => x && x.estado !== 'oculta'); continue; }
    if (r.id.startsWith('_') || d.estado === 'oculta') continue;
    clases.push({ ...d, id: r.id });
  }
  clases.sort((a, b) => (Number(a.orden) || 99) - (Number(b.orden) || 99));
  return json({ clases, fundadores, paquetes, promo, terapias }, 200, { 'cache-control': 'public, max-age=20' });
}

// ---------- Votos por horario (clases nuevas u otro horario) ----------
let votosLista = false;
export async function tablaVotos(env) {
  if (votosLista) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS votos (clase TEXT NOT NULL, tel TEXT NOT NULL, titulo TEXT, nombre TEXT NOT NULL, dias TEXT NOT NULL, horas TEXT NOT NULL,
     modalidad TEXT, acepta_comunidad INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL, actualizado TEXT NOT NULL, PRIMARY KEY (clase, tel))`
  ).run();
  try { await env.DB.prepare('ALTER TABLE votos ADD COLUMN slots TEXT').run(); } catch (e) {} // «día-hora» exactos; ya existe en bases nuevas
  votosLista = true;
}

async function votar(request, env) {
  const origen = request.headers.get('origin');
  if (origen) {
    let host = '';
    try { host = new URL(origen).host; } catch (e) {}
    if (host !== new URL(request.url).host && !/(^|\.)sadhanaholistics\.com$/.test(host))
      return json({ ok: false, error: 'Origen no permitido' }, 403);
  }
  let b;
  try { b = await leerJSON(request); } catch (e) { return json({ ok: false, error: 'JSON inválido' }, e.status || 400); }
  const clase = String(b.clase || '').trim().slice(0, 60);
  const nombre = txt(b.nombre, 120);
  const tel = String(b.tel || '').replace(/\D/g, '').slice(-13);
  const enteros = (v, min, max) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= min && n <= max))].sort((x, y) => x - y);
  // slots: ["1-19","6-9"] = día-hora exactos que la persona pulsó. Si vienen, de ahí salen dias y horas.
  const slots = [...new Set((Array.isArray(b.slots) ? b.slots : []).map(String).filter(k => /^[0-6]-([5-9]|1\d|2[0-3])$/.test(k)))].slice(0, 40);
  const dias = slots.length ? enteros(slots.map(k => k.split('-')[0]), 0, 6) : enteros(b.dias, 0, 6);
  const horas = slots.length ? enteros(slots.map(k => k.split('-')[1]), 5, 23) : enteros(b.horas, 5, 23);
  const modalidad = ['Presencial', 'En línea', 'Cualquiera'].includes(b.modalidad) ? b.modalidad : 'Presencial';
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(clase)) return json({ ok: false, error: 'Clase inválida' }, 400);
  if (!nombre || tel.length < 10 || !dias.length || !horas.length) return json({ ok: false, error: 'Faltan datos' }, 400);

  await tablaVotos(env);
  // Límite suave contra spam: un mismo WhatsApp vota hasta 12 clases.
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM votos WHERE tel = ? AND clase <> ?').bind(tel, clase).first();
  if (n >= 12) return json({ ok: false, error: 'Demasiados votos' }, 429);
  const ahora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO votos (clase, tel, titulo, nombre, dias, horas, slots, modalidad, acepta_comunidad, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(clase, tel) DO UPDATE SET titulo = excluded.titulo, nombre = excluded.nombre, dias = excluded.dias, horas = excluded.horas, slots = excluded.slots,
       modalidad = excluded.modalidad, acepta_comunidad = excluded.acepta_comunidad, actualizado = excluded.actualizado`
  ).bind(clase, tel, txt(b.titulo, 120), nombre, JSON.stringify(dias), JSON.stringify(horas), slots.length ? JSON.stringify(slots) : null, modalidad, b.comunidad ? 1 : 0, ahora, ahora).run();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM votos WHERE clase = ?').bind(clase).first();
  return json({ ok: true, interesados: r.n }, 201);
}

async function conteoVotos(env) {
  let rows = [];
  try { ({ results: rows } = await env.DB.prepare('SELECT clase, COUNT(*) AS n FROM votos GROUP BY clase').all()); } catch (e) { rows = []; }
  return json(Object.fromEntries(rows.map(r => [r.clase, r.n])), 200, { 'cache-control': 'public, max-age=30' });
}
