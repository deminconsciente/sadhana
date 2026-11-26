// Sala única de Sadhana: disponibilidad real y renta por hora sin traslapes.
//
// Hay UNA sola sala. Lo que la ocupa, en este orden:
//   1. Clases fijas: las activas del directorio (/equipo → Directorio) más los bloques base de abajo
//      (el escenario de enero 2027 que define Diego en Proyección).
//   2. Eventos de fin de semana (lista `eventos` del documento `_sala`).
//   3. Rentas por hora (tabla sala_ocupacion, ligada a `reservas` para saber si ya se canceló o venció).
// Entre un bloque y otro queda un margen para entrar y salir (BASE.margen).
//
// Público:
//   GET  /api/sala/disponibilidad?desde=YYYY-MM-DD&dias=21   días con bloques y ventanas libres
//   POST /api/sala/reservar   {folio, fecha, a, horas, uso, nombre, tel, email?, aceptaPrivacidad, utm?}
// Equipo (src/crm.js):
//   salaKpis(env, desde, hasta) (exportada para el tablero de KPIs): horas, ocupación e ingreso de la sala
//
// Todo lo editable vive en proyeccion_docs (col 'catalogo', id '_sala'): precios, horario, bloques extra,
// eventos, días cerrados y si se rentan fines de semana. Lo que no esté ahí usa BASE.

const MTY = -6 * 3600e3; // Monterrey, UTC-6 todo el año
const FOLIO = /^SAD-[A-Z0-9]{2,8}-\d{4}$/;
const ESPACIOS = { consultorio: 'Sesión 1:1', salon: 'Taller o clase' }; // los dos usan la misma y única sala

export const BASE = {
  // Precios por hora en MXN (se editan en /equipo → Directorio → Sala y rentas).
  // SUPUESTO por validar con Diego: la competencia cobra $380 a $420 por hora.
  precios: { consultorio: 400, salon: 500 },
  kit: ['Camilla y cojines', 'Tapetes y mantas', 'Cuencos y gong', 'Bocina y música'],
  paquetes: [],         // paquetes de horas: [{id, t, horas, precio, dias, estado}]
  bloqueMensual: { activo: true, t: 'Bloque mensual fijo', precio: 3200, horasSemana: 4, d: '4 horas por semana, el mismo día y hora, durante un mes.' },
  calToken: '',         // clave del calendario .ics (se genera en /equipo)
  talleresActivos: ['reiki1'], // certificaciones visibles en «Soy terapeuta» (se edita en /equipo)
  horario: { abre: 7 * 60, cierra: 21 * 60 + 30 }, // lunes a viernes
  rentaFinSemana: false, // sábado y domingo son de eventos fijos y variables
  margen: 15,            // minutos antes y después de cada bloque
  minHoras: 1,
  maxHoras: 4,
  anticipacion: 120,     // minutos mínimos de aviso
  cerrados: ['2026-12-25', '2027-01-01'],
  eventos: [],           // [{fecha:'2027-01-23', h:10, m:0, dur:120, n:'El Poder del OM'}]
  // Escenario de arranque (4 de enero de 2027). Días: 0 = domingo … 6 = sábado.
  bloques: [
    { dias: [2, 3, 4, 5], h: 7, m: 0, dur: 60, n: 'Rocket yoga · Luigi', desde: '2027-01-04' },
    { dias: [2, 3, 4, 5], h: 8, m: 30, dur: 60, n: 'Chi kung y consciencia corporal', desde: '2027-01-04' },
    { dias: [1, 2, 3, 4], h: 18, m: 30, dur: 60, n: 'Hatha y vinyasa · Miranda', desde: '2027-01-04' },
    { dias: [1, 2, 3, 4], h: 19, m: 45, dur: 60, n: 'Vinyasa, consciencia corporal y meditación', desde: '2027-01-04' },
  ],
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const txt = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const diaISO = /^\d{4}-\d{2}-\d{2}$/;
const ahoraMTY = () => new Date(Date.now() + MTY);
const hoyMTY = () => ahoraMTY().toISOString().slice(0, 10);
const sumaDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dowDe = f => new Date(f + 'T12:00:00Z').getUTCDay();
const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

export function esSala(pathname) {
  return pathname.startsWith('/api/sala/');
}

let tablasListas = false;
export async function tablasSala(env) {
  if (tablasListas) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sala_ocupacion (folio TEXT PRIMARY KEY, fecha TEXT NOT NULL, a INTEGER NOT NULL, b INTEGER NOT NULL, uso TEXT, creado TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS sala_ocupacion_fecha ON sala_ocupacion(fecha)`),
  ]);
  tablasListas = true;
}

// ---------- Configuración y bloques ----------
// Mezcla lo que el equipo guardó (`_sala`) con los valores base y con las clases activas del directorio.
function fusionar(doc, clases) {
  doc = doc || {};
  const cfg = {
    ...BASE, ...doc,
    precios: { ...BASE.precios, ...(doc.precios || {}) },
    horario: { ...BASE.horario, ...(doc.horario || {}) },
    cerrados: Array.isArray(doc.cerrados) ? doc.cerrados : BASE.cerrados,
    eventos: Array.isArray(doc.eventos) ? doc.eventos : BASE.eventos,
    kit: Array.isArray(doc.kit) && doc.kit.length ? doc.kit : BASE.kit,
    paquetes: Array.isArray(doc.paquetes) ? doc.paquetes : BASE.paquetes,
    bloqueMensual: doc.bloqueMensual === null ? null : { ...BASE.bloqueMensual, ...(doc.bloqueMensual || {}) },
  };
  cfg.bloques = [...BASE.bloques, ...(Array.isArray(doc.bloques) ? doc.bloques : []), ...(clases || [])];
  return cfg;
}

// Lo público de la configuración (sale en /api/catalogo para la sección «Soy terapeuta»).
export function configPublica(doc) {
  const c = fusionar(doc, []);
  return {
    precios: c.precios, minHoras: c.minHoras, maxHoras: c.maxHoras, kit: c.kit,
    paquetes: c.paquetes.filter(p => p && p.estado !== 'oculta' && Number(p.horas) > 0),
    bloqueMensual: c.bloqueMensual && c.bloqueMensual.activo !== false ? c.bloqueMensual : null,
    talleresActivos: Array.isArray(c.talleresActivos) ? c.talleresActivos.filter(x => typeof x === 'string').slice(0, 50) : BASE.talleresActivos,
  };
}

async function leerConfig(env) {
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare("SELECT id, data FROM proyeccion_docs WHERE col = 'catalogo'").all());
  } catch (e) { rows = []; }
  let doc = {};
  const clases = [];
  for (const r of rows) {
    let d;
    try { d = JSON.parse(r.data); } catch (e) { continue; }
    if (r.id === '_sala') { doc = d || {}; continue; }
    if (r.id.startsWith('_') || d.estado !== 'activa') continue;
    for (const h of Array.isArray(d.horarios) ? d.horarios : []) {
      if (Number.isInteger(h.dia) && Number.isFinite(+h.h))
        clases.push({ dias: [h.dia], h: +h.h, m: +h.m || 0, dur: +h.dur || 60, n: [d.titulo, d.guia].filter(Boolean).join(' · ') });
    }
  }
  return fusionar(doc, clases);
}

const precioDe = (cfg, espacio) => Number(espacio === 'salon' ? cfg.precios.salon : cfg.precios.consultorio) || 0;

// Rentas apartadas (con nombre, para el calendario del equipo) y terapias 1:1 reservadas desde el sitio:
// las terapias de Isa y Diego también se dan en la sala, así que la ocupan.
async function leerRentas(env, desde, hasta) {
  await tablasSala(env);
  const corte = new Date(Date.now() - 24 * 3600e3).toISOString(); // un lugar pendiente se aparta 24 h
  const { results } = await env.DB.prepare(
    `SELECT o.folio, o.fecha, o.a, o.b, o.uso, r.estado, r.monto, r.nombre
       FROM sala_ocupacion o JOIN reservas r ON r.folio = o.folio
      WHERE o.fecha >= ? AND o.fecha <= ?
        AND (r.estado IN ('confirmado', 'asistio') OR (r.estado = 'pendiente' AND r.creado > ?))`
  ).bind(desde, hasta, corte).all();
  const rows = results.map(r => ({ ...r, t: 'renta', n: `Renta · ${r.nombre} (${r.estado})` }));
  try {
    const i0 = new Date(`${desde}T00:00:00-06:00`).toISOString(), i1 = new Date(`${sumaDias(hasta, 1)}T00:00:00-06:00`).toISOString();
    const { results: ter } = await env.DB.prepare(
      `SELECT folio, titulo, ini, detalle, estado, nombre FROM reservas
        WHERE tipo = 'Terapia 1:1' AND ini >= ? AND ini < ? AND (estado IN ('confirmado', 'asistio') OR (estado = 'pendiente' AND creado > ?))`
    ).bind(i0, i1, corte).all();
    for (const r of ter) {
      const loc = new Date(Date.parse(r.ini) + MTY), fecha = loc.toISOString().slice(0, 10), a = loc.getUTCHours() * 60 + loc.getUTCMinutes();
      let dur = 90; // si el ticket no trae la duración, se asume 1 h 30
      try {
        const txt = (JSON.parse(r.detalle || '[]').find(x => /duraci/i.test(x[0])) || [])[1] || '';
        const h = /(\d+)\s*h/.exec(txt), m = /(\d+)\s*min/.exec(txt);
        if (h || m) dur = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
      } catch (e) {}
      rows.push({ folio: r.folio, fecha, a, b: a + dur, t: 'terapia', n: `${r.titulo} · ${r.nombre} (${r.estado})`, estado: r.estado });
    }
  } catch (e) { /* sin tabla de reservas todavía */ }
  return rows;
}

// Información de un día: bloques ocupados y ventanas libres (ya con el margen y el aviso mínimo).
function infoDia(f, cfg, rentas) {
  const dow = dowDe(f);
  const bloques = [];
  for (const b of cfg.bloques) {
    if (!b.dias.includes(dow) || (b.desde && f < b.desde)) continue;
    const a = b.h * 60 + (b.m || 0);
    bloques.push({ a, b: a + (b.dur || 60), t: 'clase', n: b.n });
  }
  for (const e of cfg.eventos) {
    if (e.fecha !== f) continue;
    const a = (+e.h || 0) * 60 + (+e.m || 0);
    bloques.push({ a, b: a + (+e.dur || 120), t: 'evento', n: e.n || 'Evento' });
  }
  for (const r of rentas) if (r.fecha === f) bloques.push({ a: r.a, b: r.b, t: r.t || 'renta', n: r.n || 'Reservado', folio: r.folio });
  bloques.sort((x, y) => x.a - y.a);

  const cerrado = cfg.cerrados.includes(f);
  const abierto = !cerrado && ((dow >= 1 && dow <= 5) || cfg.rentaFinSemana);
  const motivo = cerrado ? 'Cerrado' : !abierto ? 'Fines de semana: eventos' : '';
  let libres = [];
  if (abierto) {
    let ini = cfg.horario.abre;
    const fin = cfg.horario.cierra;
    const hoy = hoyMTY();
    if (f < hoy) ini = fin;
    else if (f === hoy) {
      const n = ahoraMTY();
      const mins = n.getUTCHours() * 60 + n.getUTCMinutes() + cfg.anticipacion;
      ini = Math.max(ini, Math.ceil(mins / 30) * 30);
    }
    let cursor = ini;
    for (const b of bloques) {
      const a = b.a - cfg.margen, z = b.b + cfg.margen;
      if (a > cursor) libres.push([cursor, Math.min(a, fin)]);
      cursor = Math.max(cursor, z);
    }
    if (cursor < fin) libres.push([cursor, fin]);
    // Las horas arrancan en :00 o :30. Se recorta el inicio al siguiente y se descartan ventanas cortas.
    libres = libres
      .map(([a, z]) => [Math.ceil(a / 30) * 30, z])
      .filter(([a, z]) => z - a >= cfg.minHoras * 60);
  }
  return { f, dow, abierto, motivo, abre: cfg.horario.abre, cierra: cfg.horario.cierra, bloques, libres };
}

function publico(d) {
  return { f: d.f, dow: d.dow, abierto: d.abierto, motivo: d.motivo, abre: d.abre, cierra: d.cierra,
    // Rentas y terapias no muestran quién es: solo que la sala está ocupada.
    bloques: d.bloques.map(({ a, b, t, n }) => ({ a, b, t: t === 'terapia' ? 'renta' : t, n: t === 'renta' || t === 'terapia' ? 'Reservado' : n })), libres: d.libres };
}

async function disponibilidad(url, env) {
  const hoy = hoyMTY();
  let desde = url.searchParams.get('desde') || hoy;
  if (!diaISO.test(desde) || desde < hoy) desde = hoy;
  const n = Math.min(45, Math.max(1, parseInt(url.searchParams.get('dias'), 10) || 21));
  const hasta = sumaDias(desde, n - 1);
  const cfg = await leerConfig(env);
  const rentas = await leerRentas(env, desde, hasta);
  const dias = [];
  for (let i = 0; i < n; i++) dias.push(publico(infoDia(sumaDias(desde, i), cfg, rentas)));
  return json({ hoy, precios: cfg.precios, minHoras: cfg.minHoras, maxHoras: cfg.maxHoras, margen: cfg.margen, dias },
    200, { 'cache-control': 'public, max-age=15' });
}

// Origen del contacto (mismo formato que /api/reservas): solo llaves conocidas, texto corto, JSON o null.
function limpiarUtm(u) {
  if (!u || typeof u !== 'object') return null;
  const o = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ref']) {
    const v = txt(u[k], 100);
    if (v) o[k] = v;
  }
  return Object.keys(o).length ? JSON.stringify(o) : null;
}

// Horas de sala que le quedan a un WhatsApp: paquetes activos y vigentes («… de sala», clases = horas)
// menos las horas ya apartadas con ese paquete.
async function horasDisponibles(env, tel, fecha) {
  try {
    const t10 = tel.slice(-10);
    const { results } = await env.DB.prepare(
      `SELECT m.clases FROM membresias m JOIN alumnos a ON a.id = m.alumno_id
        WHERE substr(a.tel, -10) = ? AND m.estado = 'activa' AND m.plan LIKE '%de sala%' AND m.clases IS NOT NULL AND m.inicio <= ? AND m.fin >= ?`
    ).bind(t10, fecha, fecha).all();
    const total = results.reduce((x, r) => x + (r.clases || 0), 0);
    if (!total) return 0;
    const u = await env.DB.prepare(
      `SELECT COALESCE(SUM(o.b - o.a), 0) AS min FROM sala_ocupacion o JOIN reservas r ON r.folio = o.folio
        WHERE substr(r.tel, -10) = ? AND r.metodo = 'paquete-horas' AND r.estado <> 'cancelado'`
    ).bind(t10).first();
    return total - (u ? u.min : 0) / 60;
  } catch (e) { return 0; }
}

// ---------- Calendario .ics para Google Calendar ----------
// Se suscribe una sola vez («Otros calendarios → Desde URL»). Trae rentas, terapias 1:1, clases y eventos de la sala,
// así el equipo los ve junto a su agenda. Google lo refresca solo, cada varias horas. Pide la clave `t` (calToken en /equipo).
async function calendario(url, env) {
  const cfg = await leerConfig(env);
  const tk = cfg.calToken || env.CAL_TOKEN;
  if (!tk || url.searchParams.get('t') !== tk) return new Response('No encontrado', { status: 404 });
  const hoy = hoyMTY(), d0 = sumaDias(hoy, -7), d1 = sumaDias(hoy, 120);
  const rentas = await leerRentas(env, d0, d1);
  const esc = v => String(v).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sadhana//Sala//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Sadhana · Sala',
    'X-WR-TIMEZONE:America/Monterrey', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const sello = z(Date.now());
  for (let f = d0; f <= d1; f = sumaDias(f, 1)) {
    const dia = infoDia(f, { ...cfg, cerrados: [] }, rentas), base = Date.parse(`${f}T00:00:00-06:00`);
    for (const b of dia.bloques) {
      const nombre = { clase: 'Clase', evento: 'Evento', renta: 'Renta', terapia: 'Terapia' }[b.t] || 'Sala';
      L.push('BEGIN:VEVENT', `UID:${f}-${b.a}-${b.t}-${esc(b.folio || b.n).replace(/\W+/g, '')}@sadhanaholistics.com`, `DTSTAMP:${sello}`,
        `DTSTART:${z(base + b.a * 60000)}`, `DTEND:${z(base + b.b * 60000)}`,
        `SUMMARY:${esc(b.t === 'clase' || b.t === 'evento' ? b.n : b.n)}`, `CATEGORIES:${nombre}`,
        `DESCRIPTION:${esc(b.folio ? 'Folio ' + b.folio : 'Bloque fijo de la sala')}`, 'LOCATION:Sadhana · P.º del Acueducto 430 Local 18', 'END:VEVENT');
    }
  }
  L.push('END:VCALENDAR');
  return new Response(L.join('\r\n'), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

// ---------- Reservar ----------
async function reservar(request, env) {
  const origen = request.headers.get('origin');
  if (origen) {
    let host = '';
    try { host = new URL(origen).host; } catch (e) {}
    if (host !== new URL(request.url).host && !/(^|\.)sadhanaholistics\.com$/.test(host))
      return json({ ok: false, error: 'Origen no permitido' }, 403);
  }
  const raw = await request.text();
  if (raw.length > 8 * 1024) return json({ ok: false, error: 'Demasiado grande' }, 413);
  let b;
  try { b = JSON.parse(raw || '{}'); } catch (e) { return json({ ok: false, error: 'JSON inválido' }, 400); }

  const cfg = await leerConfig(env);
  const folio = txt(b.folio, 20), nombre = txt(b.nombre, 120);
  const tel = String(b.tel || '').replace(/\D/g, '').slice(-13);
  const fecha = String(b.fecha || ''), a = Number(b.a), horas = Number(b.horas);
  const espacio = b.espacio === 'salon' ? 'salon' : 'consultorio', uso = ESPACIOS[espacio];
  if (!folio || !FOLIO.test(folio)) return json({ ok: false, error: 'Folio inválido' }, 400);
  if (!nombre || tel.length < 10) return json({ ok: false, error: 'Faltan datos' }, 400);
  if (!diaISO.test(fecha) || !Number.isInteger(a) || a % 30 || !Number.isInteger(horas) || horas < cfg.minHoras || horas > cfg.maxHoras)
    return json({ ok: false, error: 'Horario inválido' }, 400);
  const z = a + horas * 60;

  await tablasSala(env);
  // Contra spam: 15 reservas por teléfono en 24 h y máximo 3 rentas pendientes a la vez.
  const corte = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM reservas WHERE tel = ? AND creado > ?').bind(tel, corte).first();
  if (n >= 15) return json({ ok: false, error: 'Demasiadas reservas' }, 429);
  const { p } = await env.DB.prepare("SELECT COUNT(*) AS p FROM reservas WHERE tel = ? AND tipo = 'Renta de sala' AND estado = 'pendiente' AND creado > ?").bind(tel, corte).first();
  if (p >= 3 && !b.usaPaquete) return json({ ok: false, error: 'pendientes' }, 429);

  // 1. ¿Cabe en una ventana libre? (clases, eventos y otras rentas ya descontados, con margen)
  const rentas = await leerRentas(env, fecha, fecha);
  const dia = infoDia(fecha, cfg, rentas);
  if (!dia.libres.some(([x, y]) => a >= x && z <= y)) return json({ ok: false, error: 'ocupado' }, 409);

  // Con un paquete de horas: se descuenta de las horas que ya compró (y Sadhana confirmó) ese WhatsApp.
  const usaPaquete = !!b.usaPaquete;
  if (usaPaquete && (await horasDisponibles(env, tel, fecha)) < horas) return json({ ok: false, error: 'sin_horas' }, 409);
  const monto = usaPaquete ? 0 : horas * precioDe(cfg, espacio);
  const ini = new Date(`${fecha}T${hhmm(a)}:00-06:00`).toISOString();
  const detalle = JSON.stringify([
    ['Espacio', 'Sala Sadhana'], ['Horario', `${hhmm(a)} a ${hhmm(z)}`], ['Duración', `${horas} h`], ['Uso', uso],
  ]);
  const ahora = new Date().toISOString();
  const utm = limpiarUtm(b.utm);
  const valores = [folio, ahora, 'Renta de sala', `Renta de sala · ${horas} h`, ini, detalle, nombre, tel, txt(b.email, 160), monto,
    usaPaquete ? 'paquete-horas' : 'transferencia', usaPaquete ? 'confirmado' : 'pendiente', ahora, b.aceptaPrivacidad ? 1 : 0, b.aceptaComunidad ? 1 : 0];
  const SQL = `INSERT OR IGNORE INTO reservas
     (folio, creado, tipo, titulo, ini, detalle, nombre, tel, email, monto, metodo, estado, actualizado, acepta_privacidad, acepta_comunidad`;
  let ins;
  try {
    ins = await env.DB.prepare(SQL + `, utm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...valores, utm).run();
  } catch (e) { // base sin la columna `utm` todavía: guarda la reserva sin el origen en vez de perderla
    if (!/utm/i.test(String(e && e.message))) throw e;
    ins = await env.DB.prepare(SQL + `) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...valores).run();
  }
  if (!ins.meta.changes) return json({ ok: false, error: 'folio_repetido' }, 409);

  // 2. Aparta el rango de forma atómica: si otra persona lo tomó entre el paso 1 y este, no se inserta.
  const tope = cfg.margen;
  const oc = await env.DB.prepare(
    `INSERT INTO sala_ocupacion (folio, fecha, a, b, uso, creado)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6
      WHERE NOT EXISTS (
        SELECT 1 FROM sala_ocupacion o JOIN reservas r ON r.folio = o.folio
         WHERE o.fecha = ?2 AND o.a < ?4 + ?7 AND o.b + ?7 > ?3 AND o.folio <> ?1
           AND (r.estado IN ('confirmado', 'asistio') OR (r.estado = 'pendiente' AND r.creado > ?8)))`
  ).bind(folio, fecha, a, z, uso, ahora, tope, corte).run();
  if (!oc.meta.changes) {
    await env.DB.prepare('DELETE FROM reservas WHERE folio = ?').bind(folio).run();
    return json({ ok: false, error: 'ocupado' }, 409);
  }
  return json({ ok: true, folio, estado: usaPaquete ? 'confirmado' : 'pendiente', monto, ini }, 201);
}

export async function sala(request, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/sala/disponibilidad' && request.method === 'GET') return disponibilidad(url, env);
  if (p === '/api/sala/reservar' && request.method === 'POST') return reservar(request, env);
  if (p === '/api/sala/calendario.ics' && request.method === 'GET') return calendario(url, env);
  return json({ ok: false, error: 'No encontrado' }, 404);
}

// ---------- Números de la sala para el tablero de KPIs ----------
// Por rango de fechas (hora de Monterrey): horas de clase y evento, horas rentadas, ocupación e ingreso por renta.
export async function salaKpis(env, desde, hasta) {
  const d0 = diaISO.test(desde || '') ? desde : sumaDias(hoyMTY(), -6);
  let d1 = diaISO.test(hasta || '') ? hasta : hoyMTY();
  if (d1 > sumaDias(d0, 92)) d1 = sumaDias(d0, 92);
  const cfg = await leerConfig(env);
  const rentas = await leerRentas(env, d0, d1);
  let abiertas = 0, clases = 0, rentadas = 0, ingresoRenta = 0;
  for (let f = d0; f <= d1; f = sumaDias(f, 1)) {
    const d = infoDia(f, cfg, rentas);
    if (!d.abierto) continue;
    abiertas += (d.cierra - d.abre) / 60;
    for (const b of d.bloques) {
      const h = (b.b - b.a) / 60;
      if (b.t === 'renta') rentadas += h; else clases += h;
    }
  }
  for (const r of rentas) if (r.estado !== 'pendiente') ingresoRenta += r.monto || 0; // solo pagadas y confirmadas
  const r1 = x => Math.round(x * 10) / 10;
  return {
    desde: d0, hasta: d1, horas_abiertas: r1(abiertas), horas_clases_eventos: r1(clases), horas_rentadas: r1(rentadas),
    horas_libres: r1(abiertas - clases - rentadas),
    ocupacion_pct: abiertas ? Math.round(((clases + rentadas) / abiertas) * 100) : 0,
    renta_pct: abiertas ? Math.round((rentadas / abiertas) * 100) : 0,
    ingreso_renta: ingresoRenta,
  };
}
