// API de reservas y panel /admin de Sadhana.
//
// Público:
//   POST /api/reservas          guarda un ticket recién emitido por la landing.
//   GET  /api/reservas/estado   ?folios=A,B → {A:"pendiente",B:"confirmado"} (sin datos personales).
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

  const detalle = Array.isArray(b.detalle) ? JSON.stringify(b.detalle.slice(0, 12).map(([k, v]) => [txt(k, 40), txt(v, 160)])) : null;
  const estado = b.estado === 'confirmado' && (b.metodo === 'credito' || !Number(b.monto)) ? 'confirmado' : 'pendiente';
  const ahora = new Date().toISOString();

  // INSERT OR IGNORE: si la landing reintenta el mismo folio, no se duplica ni se pisa.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO reservas
     (folio, creado, tipo, titulo, ini, detalle, nombre, tel, email, monto, metodo, estado, actualizado, acepta_privacidad, acepta_comunidad)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    folio, ahora, txt(b.tipo, 40), titulo, txt(b.ini, 40), detalle, nombre, tel, txt(b.email, 160),
    Math.max(0, Math.round(Number(b.monto) || 0)), txt(b.metodo, 30), estado, ahora,
    b.aceptaPrivacidad ? 1 : 0, b.aceptaComunidad ? 1 : 0
  ).run();

  return json({ ok: true, folio, estado }, 201);
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
