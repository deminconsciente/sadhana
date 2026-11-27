// Tablero de KPIs de Sadhana (módulo "Tablero" de Proyección).
//
// Los 16 indicadores del plan maestro 2027, con semáforo, reglas de decisión de publicidad,
// CAC, LTV, LTV/CAC, ROAS de equilibrio y punto de equilibrio del espacio.
// Todo sale del CRM (D1) y de lo que el equipo captura cada semana (colección `kpis` de proyeccion_docs):
//   cfg            supuestos y umbrales editables (se recalibran con 60 días de datos)
//   sem-YYYY-MM-DD captura de la semana que empieza ese lunes (gasto, contactos, impresiones…)
//   resumen-…      resumen de los lunes que genera el cron (ver scheduled en src/index.js)
// Las semanas van de lunes a domingo en hora de Monterrey (UTC-6 todo el año).

const MTY = -6 * 3600e3;
const DIA = 864e5;

// ---------- Fechas ----------
const dn = ymd => Math.floor(Date.parse(ymd + 'T00:00:00Z') / DIA);
const ymdDe = d => new Date(d * DIA).toISOString().slice(0, 10);
const suma = (ymd, n) => ymdDe(dn(ymd) + n);
const hoyMTY = () => new Date(Date.now() + MTY).toISOString().slice(0, 10);
const lunesDe = ymd => suma(ymd, -((new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7));
const isoMTY = ymd => new Date(Date.parse(ymd + 'T00:00:00Z') - MTY).toISOString();
const ymdDeISO = iso => new Date(Date.parse(iso) + MTY).toISOString().slice(0, 10);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = ymd => `${+ymd.slice(8)} ${MESES[+ymd.slice(5, 7) - 1]}`;
const rangoTxt = (a, b) => `${corto(a)} al ${corto(suma(b, -1))}`;
const FACTOR_MES = 30 / 28; // las 4 semanas se llevan a un mes de 30 días

// ---------- Supuestos (todo editable en el tablero) ----------
// null = automático (cpl y cac salen del LTV) o por calibrar (cont).
export const CFG0 = {
  fijos: 25000, // renta 20k + mantenimiento 3k + servicios 2k
  cupo: 12,
  margenAmbar: 20, // % de tolerancia antes de pasar de ámbar a rojo
  costoVarPct: 35, // pago a maestros y otros costos variables, si no se captura el pago real
  horasDisp: 117, // horas de sala vendibles al mes para residentes
  ltv: { precio: 1600, margenPct: 65, permanencia: 4, convPct: 5, ratioMeta: 3 },
  pauta: { minContactos: 30, minGasto: 300, cplCambiaPct: 30, frecCambia: 3, frecEscala: 2.5, ltvMantener: 1.5, diasCorte: 60, escalaPct: 20 },
  umbrales: {
    cpl: null, frec: 2.5, cac: null, ltvcac: 3,
    c2p: 30, p2m: 20, ret2: 70, ret3: 55,
    asist: 4, ocupLo: 60, ocupHi: 80,
    util: 0, eq: 100, fuera: 12000,
    com: 50, ref: 20, cont: null, resH: 60, resR: 80,
  },
};

export function mezclarCfg(g) {
  g = g && typeof g === 'object' ? g : {};
  const m = { ...CFG0, ...g };
  for (const k of ['ltv', 'pauta', 'umbrales']) m[k] = { ...CFG0[k], ...(g[k] || {}) };
  for (const k of Object.keys(CFG0.umbrales)) if (m.umbrales[k] === '') m.umbrales[k] = null;
  return m;
}

// ---------- Definición de los 16 KPIs ----------
// dir: max (menos es mejor), min (más es mejor), rango; nMin = muestra mínima para dar semáforo.
const DEF = [
  { id: 'cpl', grupo: 'Publicidad', nombre: 'Costo por contacto (CPL)', formula: 'gasto ÷ contactos', frec: 'Semanal', decision: 'Pausar o cambiar creatividad', dir: 'max', u: '$', nMin: 10, nTxt: 'contactos' },
  { id: 'frec', grupo: 'Publicidad', nombre: 'Frecuencia', formula: 'impresiones ÷ alcance', frec: 'Semanal', decision: 'Cambiar audiencia o anuncio', dir: 'max', u: '×', nMin: 1, nTxt: 'semana con datos' },
  { id: 'cac', grupo: 'Publicidad', nombre: 'CAC', formula: 'gasto ÷ clientes nuevos', frec: 'Mensual', decision: 'Escalar, mantener o cortar', dir: 'max', u: '$', nMin: 3, nTxt: 'clientes nuevos' },
  { id: 'ltvcac', grupo: 'Publicidad', nombre: 'LTV/CAC', formula: 'LTV ÷ CAC', frec: 'Mensual', decision: 'Subir presupuesto 20%', dir: 'min', u: '×', nMin: 3, nTxt: 'clientes nuevos' },
  { id: 'c2p', grupo: 'Embudo', nombre: 'Contacto → clase de prueba', formula: 'pruebas ÷ contactos', frec: 'Semanal', decision: 'Mejorar mensaje y seguimiento', dir: 'min', u: '%', nMin: 10, nTxt: 'contactos' },
  { id: 'p2m', grupo: 'Embudo', nombre: 'Prueba → membresía', formula: 'membresías ÷ pruebas', frec: 'Semanal', decision: 'Ajustar la oferta al final de la clase', dir: 'min', u: '%', nMin: 5, nTxt: 'pruebas' },
  { id: 'ret', grupo: 'Embudo', nombre: 'Retención al mes 2 y 3', formula: 'activos mes n ÷ activos mes 1', frec: 'Mensual', decision: 'Reforzar seguimiento de 7 días', dir: 'min', u: '%', nMin: 5, nTxt: 'alumnos con ese mes cumplido' },
  { id: 'asist', grupo: 'Operación', nombre: 'Asistencia por clase', formula: 'asistentes ÷ clases', frec: 'Semanal', decision: 'Abrir, mover o cerrar horario', dir: 'min', u: '', nMin: 4, nTxt: 'clases' },
  { id: 'ocup', grupo: 'Operación', nombre: 'Ocupación', formula: 'asistencias ÷ plazas', frec: 'Mensual', decision: 'Abrir otra clase si pasa de 80%', dir: 'rango', u: '%', nMin: 8, nTxt: 'clases' },
  { id: 'util', grupo: 'Finanzas', nombre: 'Utilidad del mes', formula: 'ingresos − pago a maestros − gastos fijos − anuncios', frec: 'Mensual', decision: 'Reinvertir 20% en anuncios', dir: 'min', u: '$', nMin: 0, nTxt: '' },
  { id: 'eq', grupo: 'Finanzas', nombre: 'Avance al punto de equilibrio', formula: 'utilidad de contribución ÷ gastos fijos', frec: 'Mensual', decision: 'Compuerta de cada fase', dir: 'min', u: '%', nMin: 0, nTxt: '' },
  { id: 'fuera', grupo: 'Finanzas', nombre: 'Ingreso fuera de membresías', formula: 'terapias + talleres + eventos + comisiones', frec: 'Mensual', decision: 'Compuerta de la fase 2', dir: 'min', u: '$', nMin: 0, nTxt: '' },
  { id: 'com', grupo: 'Comunidad', nombre: 'Personas en la comunidad', formula: 'suscritos al grupo', frec: 'Semanal', decision: 'Ritmo de contenido', dir: 'min', u: '', nMin: 0, nTxt: '' },
  { id: 'ref', grupo: 'Comunidad', nombre: 'Referidos', formula: 'nuevos que llegan por alumno ÷ nuevos', frec: 'Mensual', decision: 'Invertir en invitación de acompañante', dir: 'min', u: '%', nMin: 5, nTxt: 'nuevos' },
  { id: 'cont', grupo: 'Contenido', nombre: 'Guardados y compartidos por reel', formula: '(guardados + compartidos) ÷ alcance', frec: 'Semanal', decision: 'Qué temas repetir', dir: 'min', u: '%', nMin: 0, nTxt: '' },
  { id: 'res', grupo: 'Residentes', nombre: 'Horas vendidas y renovación', formula: 'horas vendidas ÷ disponibles; renovados ÷ vencidos', frec: 'Mensual', decision: 'Abrir o frenar venta de residencias', dir: 'min', u: '%', nMin: 0, nTxt: '' },
];

// ---------- Lectura de datos ----------
async function tablaDocs(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS proyeccion_docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, actualizado TEXT NOT NULL, por TEXT, PRIMARY KEY (col, id))`
  ).run();
}

async function cargar(env, sincronizar) {
  if (sincronizar) await sincronizar(env);
  await tablaDocs(env);
  const [res, alu, mem, docs] = await Promise.all([
    env.DB.prepare(`SELECT folio, creado, tipo, titulo, ini, monto, metodo, estado, tel FROM reservas`).all(),
    env.DB.prepare(`SELECT id, tel, origen, creado, acepta_comunidad FROM alumnos`).all(),
    env.DB.prepare(`SELECT alumno_id, monto, inicio, fin, estado, creado FROM membresias`).all(),
    env.DB.prepare(`SELECT id, data FROM proyeccion_docs WHERE col = 'kpis'`).all(),
  ]);
  const D = { res: res.results, alu: alu.results, mem: mem.results, sem: [], resumenes: [], cfg: null };
  const telDe = new Map(D.alu.map(a => [a.id, a.tel]));
  D.mem = D.mem.map(m => ({ ...m, tel: telDe.get(m.alumno_id) })).filter(m => m.tel);
  for (const d of docs.results) {
    let x; try { x = JSON.parse(d.data); } catch (e) { continue; }
    if (d.id === 'cfg') D.cfg = x;
    else if (d.id.startsWith('sem-')) D.sem.push({ ...x, ws: d.id.slice(4) });
    else if (d.id.startsWith('resumen-')) D.resumenes.push({ id: d.id, ...x });
  }
  D.sem.sort((a, b) => a.ws.localeCompare(b.ws));
  D.resumenes.sort((a, b) => b.id.localeCompare(a.id));
  return D;
}

const num = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
const slug = o => String(o || 'web').split(':')[0].toLowerCase();
const esMeta = o => ['meta', 'facebook', 'fb', 'instagram-ads', 'ig-ads', 'anuncio'].includes(slug(o));
const esReferido = o => ['referido', 'recomendacion', 'recomendación', 'alumno', 'invitacion', 'invitación'].includes(slug(o));
const DENTRO = /^(Clase|Paquete|Clase \+ paquete|Acceso activado)$/;
const cuenta = r => (r.estado === 'confirmado' || r.estado === 'asistio') && r.metodo !== 'membresia' && r.metodo !== 'primera-gratis' && r.monto > 0;

// ---------- Medición de una semana ----------
function medir(D, cfg, ws) {
  const we = suma(ws, 7);
  const w0 = ws, m0 = suma(ws, -21);
  const W = { da: w0, db: we, a: isoMTY(w0), b: isoMTY(we) };
  const M = { da: m0, db: we, a: isoMTY(m0), b: isoMTY(we) };
  const dentro = (iso, V) => iso != null && iso >= V.a && iso < V.b;
  const semEn = V => D.sem.filter(s => s.ws >= V.da && s.ws < V.db);
  const sumSem = (campo, V) => {
    let t = null;
    for (const s of semEn(V)) { const v = num(s[campo]); if (v != null) t = (t || 0) + v; }
    return t;
  };
  const ultimo = (campo, hasta = we) => {
    for (let i = D.sem.length - 1; i >= 0; i--) if (D.sem[i].ws < hasta) { const v = num(D.sem[i][campo]); if (v != null) return v; }
    return null;
  };

  // Primer pago de cada persona (clientes nuevos) y lo que dejan en sus primeros 30 días.
  const pagos = new Map(); // tel → [{c, m}]
  const guarda = (tel, c, m) => { if (!pagos.has(tel)) pagos.set(tel, []); pagos.get(tel).push({ c, m }); };
  for (const r of D.res) if (cuenta(r)) guarda(r.tel, r.creado, r.monto);
  for (const m of D.mem) if (m.estado !== 'cancelada' && m.monto > 0) guarda(m.tel, m.creado, m.monto);
  const origenDe = new Map(D.alu.map(a => [a.tel, a.origen]));
  const clientes = []; // {tel, primero, origen, ingreso30}
  for (const [tel, ev] of pagos) {
    ev.sort((x, y) => x.c.localeCompare(y.c));
    const primero = ev[0].c, lim = new Date(Date.parse(primero) + 30 * DIA).toISOString();
    clientes.push({ tel, primero, origen: origenDe.get(tel) || 'web', ingreso30: ev.filter(e => e.c <= lim).reduce((s, e) => s + e.m, 0) });
  }
  const nuevosEn = V => clientes.filter(c => dentro(c.primero, V));

  // Ingresos
  const ingresos = V => {
    let dentroM = 0, fuera = 0;
    for (const r of D.res) if (cuenta(r) && dentro(r.creado, V)) (DENTRO.test(r.tipo || '') ? (dentroM += r.monto) : (fuera += r.monto));
    for (const m of D.mem) if (m.estado !== 'cancelada' && dentro(m.creado, V)) dentroM += m.monto || 0;
    fuera += sumSem('otrosIngresos', V) || 0;
    return { dentro: dentroM, fuera, total: dentroM + fuera };
  };

  // Economía de la publicidad
  const mc = (cfg.ltv.precio * cfg.ltv.margenPct) / 100;
  const ltv = mc * cfg.ltv.permanencia;
  const cacMax = ltv / cfg.ltv.ratioMeta;
  const roasEq = cfg.ltv.margenPct > 0 ? 100 / cfg.ltv.margenPct : null;
  const fichasNuevas = V => D.alu.filter(a => dentro(a.creado, V));
  const contactosAds = V => sumSem('contactos', V);
  const conv = cfg.ltv.convPct / 100;
  const cplMax = cacMax * conv;

  const eco = V => {
    const gasto = sumSem('gasto', V);
    const cts = contactosAds(V);
    const nuevos = nuevosEn(V), meta = nuevos.filter(c => esMeta(c.origen));
    const usa = meta.length ? meta : nuevos; // con origen medido se atribuye; si no, se reparte entre todos
    const cac = gasto != null && usa.length ? gasto / usa.length : null;
    const ing = usa.reduce((s, c) => s + c.ingreso30, 0);
    return {
      gasto, contactos: cts, clientes: usa.length, atribuido: meta.length > 0, cac,
      cpl: gasto != null && cts ? gasto / cts : null,
      ltvcac: cac ? ltv / cac : null,
      roas: gasto ? ing / gasto : null,
    };
  };
  const ecoW = eco(W), ecoM = eco(M);

  // Embudo
  const pruebas = V => new Set(D.res.filter(r => r.metodo === 'primera-gratis' && r.estado !== 'cancelado' && dentro(r.creado, V)).map(r => r.tel));
  const conPrueba = new Set(D.res.filter(r => r.metodo === 'primera-gratis' && r.estado !== 'cancelado').map(r => r.tel));
  const embudo = V => {
    const ads = contactosAds(V) || 0;
    const orgManual = sumSem('contactosOrg', V);
    const org = orgManual != null ? orgManual : fichasNuevas(V).filter(a => !esMeta(a.origen)).length;
    const contactos = ads + org;
    const p = pruebas(V).size;
    const compras = new Set(D.mem.filter(m => m.estado !== 'cancelada' && dentro(m.creado, V) && conPrueba.has(m.tel)).map(m => m.tel));
    return { contactos, pruebas: p, membresias: compras.size };
  };

  // Operación (clases con fecha ya pasada)
  const ahoraISO = new Date().toISOString();
  const ops = V => {
    const ses = new Map();
    let hayAsistio = false;
    for (const r of D.res) {
      if (r.tipo !== 'Clase' || r.estado === 'cancelado' || !r.ini || !dentro(r.ini, V) || r.ini > ahoraISO) continue;
      const k = r.titulo + '|' + r.ini;
      if (!ses.has(k)) ses.set(k, { a: 0, r: 0 });
      ses.get(k).r++;
      if (r.estado === 'asistio') { ses.get(k).a++; hayAsistio = true; }
    }
    let asistentes = 0;
    for (const s of ses.values()) asistentes += hayAsistio ? s.a : s.r;
    return { clases: ses.size, asistentes, base: hayAsistio ? 'asistencias' : 'reservas' };
  };

  // Finanzas
  const fin = V => {
    const ing = ingresos(V), gasto = sumSem('gasto', V) || 0;
    const real = sumSem('pagoMaestros', V);
    const variable = real != null ? real : (ing.total * cfg.costoVarPct) / 100;
    const contrib = (ing.total - variable - gasto) * FACTOR_MES;
    return { ing, gasto, variable, contribMes: contrib, utilMes: contrib - cfg.fijos, fueraMes: ing.fuera * FACTOR_MES };
  };
  const finM = fin(M);

  // Retención por cohortes (todo el historial, hasta el fin de la semana)
  const retencion = () => {
    const porTel = new Map();
    for (const m of D.mem) if (m.estado !== 'cancelada') { if (!porTel.has(m.tel)) porTel.set(m.tel, []); porTel.get(m.tel).push(m); }
    const asistio = new Map();
    for (const r of D.res) if (r.estado === 'asistio' && r.ini) { if (!asistio.has(r.tel)) asistio.set(r.tel, []); asistio.get(r.tel).push(ymdDeISO(r.ini)); }
    const out = { 2: { e: 0, a: 0 }, 3: { e: 0, a: 0 } };
    for (const [tel, ms] of porTel) {
      const F = ms.map(m => m.inicio).sort()[0];
      for (const k of [2, 3]) {
        const ini = suma(F, 30 * (k - 1)), fin2 = suma(F, 30 * k); // [ini, fin2)
        if (fin2 > we) continue; // ese mes aún no se cumple
        out[k].e++;
        const activo = ms.some(m => m.inicio < fin2 && m.fin >= ini) || (asistio.get(tel) || []).some(d => d >= ini && d < fin2);
        if (activo) out[k].a++;
      }
    }
    return out;
  };
  const ret = retencion();

  // Valores de cada KPI. v = valor; n = muestra; ventana = 'semana' | '4 semanas'
  const vals = {};
  const E = embudo(W), EM = embudo(M);
  const O = ops(W), OM = ops(M);
  const finW = fin(W);

  // Semanales: si la semana trae muestra chica, se usa el acumulado de 4 semanas (se avisa en la ventana).
  const cplW = ecoW.cpl != null ? { v: ecoW.cpl, n: ecoW.contactos } : null;
  vals.cpl = cplW && cplW.n >= 10 ? { ...cplW, vent: 'semana' } : { v: ecoM.cpl, n: ecoM.contactos || 0, vent: '4 semanas' };
  const impr = num(semEn(W).map(s => num(s.impresiones)).filter(x => x != null).reduce((a, b) => (a == null ? b : a + b), null));
  const alc = num(semEn(W).map(s => num(s.alcance)).filter(x => x != null).reduce((a, b) => (a == null ? b : a + b), null));
  vals.frec = { v: impr != null && alc ? impr / alc : null, n: alc ? 1 : 0, vent: 'semana' };
  vals.cac = { v: ecoM.cac, n: ecoM.clientes, vent: '4 semanas' };
  vals.ltvcac = { v: ecoM.ltvcac, n: ecoM.clientes, vent: '4 semanas' };
  const c2p = e => (e.contactos ? (e.pruebas / e.contactos) * 100 : null);
  vals.c2p = E.contactos >= 10 ? { v: c2p(E), n: E.contactos, vent: 'semana' } : { v: c2p(EM), n: EM.contactos, vent: '4 semanas' };
  const p2m = e => (e.pruebas ? (e.membresias / e.pruebas) * 100 : null);
  vals.p2m = E.pruebas >= 5 ? { v: p2m(E), n: E.pruebas, vent: 'semana' } : { v: p2m(EM), n: EM.pruebas, vent: '4 semanas' };
  const r2 = ret[2].e ? (ret[2].a / ret[2].e) * 100 : null, r3 = ret[3].e ? (ret[3].a / ret[3].e) * 100 : null;
  vals.ret = { v: r2, v2: r3, n: ret[2].e, n2: ret[3].e, vent: 'cohortes' };
  const asist = o => (o.clases ? o.asistentes / o.clases : null);
  vals.asist = O.clases >= 4 ? { v: asist(O), n: O.clases, vent: 'semana', base: O.base } : { v: asist(OM), n: OM.clases, vent: '4 semanas', base: OM.base };
  vals.ocup = { v: OM.clases ? (OM.asistentes / (OM.clases * cfg.cupo)) * 100 : null, n: OM.clases, vent: '4 semanas', base: OM.base };
  vals.util = { v: finM.utilMes, n: 0, vent: '4 semanas (a mes)' };
  vals.eq = { v: (finM.contribMes / cfg.fijos) * 100, n: 0, vent: '4 semanas (a mes)' };
  vals.fuera = { v: finM.fueraMes, n: 0, vent: '4 semanas (a mes)' };
  const comCap = ultimo('comunidad');
  vals.com = { v: comCap != null ? comCap : D.alu.filter(a => a.acepta_comunidad).length, n: 0, vent: comCap != null ? 'captura' : 'fichas que aceptan', previa: ultimoAntes(D, 'comunidad', suma(we, -28)) };
  const nuevosM = fichasNuevas(M);
  vals.ref = { v: nuevosM.length ? (nuevosM.filter(a => esReferido(a.origen)).length / nuevosM.length) * 100 : null, n: nuevosM.length, vent: '4 semanas' };
  const gu = sumSem('guardados', W), alR = sumSem('alcanceReels', W);
  vals.cont = { v: gu != null && alR ? (gu / alR) * 100 : null, n: alR ? 1 : 0, vent: 'semana' };
  const hv = ultimo('horasVendidas'), ren = ultimo('renovados'), ven = ultimo('vencidos');
  vals.res = { v: hv != null && cfg.horasDisp ? (hv / cfg.horasDisp) * 100 : null, v2: ven ? ((ren || 0) / ven) * 100 : null, n: 0, vent: 'captura' };

  return { vals, aux: { ecoW, ecoM, E, EM, O, OM, finW, finM, ltv, mc, cacMax, roasEq, cplMax, ing: ingresos(M), clientes, we } };
}

function ultimoAntes(D, campo, hasta) {
  for (let i = D.sem.length - 1; i >= 0; i--) if (D.sem[i].ws < hasta) { const v = num(D.sem[i][campo]); if (v != null) return v; }
  return null;
}

// ---------- Semáforo ----------
function semaforo(dir, v, ok, hi, m) {
  if (v == null || !isFinite(v)) return 'sin';
  const tol = (x, base) => (x !== 0 ? Math.abs(x) * m : base * m);
  if (dir === 'max') return v <= ok ? 'verde' : v <= ok + tol(ok, 1) ? 'ambar' : 'rojo';
  if (dir === 'min') return v >= ok ? 'verde' : v >= ok - tol(ok, 25000) ? 'ambar' : 'rojo';
  if (dir === 'rango') return v >= ok && v <= hi ? 'verde' : v > hi ? 'ambar' : v >= ok - ok * m ? 'ambar' : 'rojo';
  return 'sin';
}
const peor = (...e) => (e.includes('rojo') ? 'rojo' : e.includes('ambar') ? 'ambar' : e.every(x => x === 'sin') ? 'sin' : 'verde');

// ---------- Formato ----------
const miles = n => Math.round(n).toLocaleString('es-MX');
const f$ = n => (n < 0 ? '−$' : '$') + miles(Math.abs(n));
const f1 = n => (Math.round(n * 10) / 10).toLocaleString('es-MX');
const fp = n => Math.round(n) + '%';
const FMT = { $: f$, '×': n => f1(n) + '×', '%': fp, '': f1 };

// ---------- Evaluación completa ----------
export async function calcular(env, params = {}, sincronizar) {
  const D = await cargar(env, sincronizar);
  const cfg = mezclarCfg(D.cfg);
  const hoy = hoyMTY();
  const ultima = suma(lunesDe(hoy), -7); // última semana completa
  const ws = /^\d{4}-\d{2}-\d{2}$/.test(params.semana || '') ? lunesDe(params.semana) : ultima;
  const we = suma(ws, 7);
  const m = cfg.margenAmbar / 100;

  const actual = medir(D, cfg, ws);
  const serie = [];
  for (let i = 7; i >= 0; i--) serie.push(medir(D, cfg, suma(ws, -7 * i)).vals);
  const { aux } = actual;

  // Umbrales (null = automático / por calibrar)
  const U = cfg.umbrales;
  const auto = { cpl: aux.cplMax, cac: aux.cacMax };
  const um = k => (U[k] != null && U[k] !== '' ? +U[k] : auto[k] != null ? auto[k] : null);

  // Mediana de las últimas semanas para calibrar "contenido"
  const contSerie = serie.map(s => s.cont.v).filter(x => x != null).sort((a, b) => a - b);
  const contMed = contSerie.length >= 4 ? contSerie[Math.floor(contSerie.length / 2)] : null;

  const kpis = DEF.map(def => {
    const x = actual.vals[def.id];
    const f = FMT[def.u] || FMT[''];
    const k = { id: def.id, grupo: def.grupo, nombre: def.nombre, formula: def.formula, frec: def.frec, decision: def.decision, valor: x.v, ventana: x.vent, n: x.n, nMin: def.nMin, nTxt: def.nTxt, u: def.u, serie: serie.map(s => s[def.id].v) };
    let est = 'sin', ok = null, ok2 = null, txt = x.v == null ? '—' : f(x.v), umbralTxt = '', extra = '';
    switch (def.id) {
      case 'cpl': ok = um('cpl'); est = semaforo('max', x.v, ok, null, m); umbralTxt = ok != null ? `≤ ${f$(ok)}${U.cpl == null ? ' (sale del LTV)' : ''}` : ''; break;
      case 'frec': ok = um('frec'); est = semaforo('max', x.v, ok, null, m); umbralTxt = `< ${f1(ok)}`; break;
      case 'cac': ok = um('cac'); est = semaforo('max', x.v, ok, null, m); umbralTxt = ok != null ? `≤ ${f$(ok)}${U.cac == null ? ' (LTV ÷ 3)' : ''}` : ''; extra = aux.ecoM.atribuido ? 'Solo clientes con origen de anuncio.' : 'Aún sin origen medido: se reparte entre todos los clientes nuevos.'; break;
      case 'ltvcac': ok = um('ltvcac'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${f1(ok)}`; break;
      case 'c2p': ok = um('c2p'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${fp(ok)}`; break;
      case 'p2m': ok = um('p2m'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${fp(ok)}`; break;
      case 'ret': {
        const a = semaforo('min', x.v, U.ret2, null, m), b = semaforo('min', x.v2, U.ret3, null, m);
        est = peor(a, b); umbralTxt = `mes 2 ≥ ${fp(U.ret2)} · mes 3 ≥ ${fp(U.ret3)}`;
        txt = (x.v == null ? '—' : fp(x.v)) + ' · ' + (x.v2 == null ? '—' : fp(x.v2));
        extra = `Alumnos con el mes 2 cumplido: ${x.n}; con el mes 3: ${x.n2}.`; k.n = Math.min(x.n, x.n2 || x.n); if (x.v2 == null) k.n = x.n; break;
      }
      case 'asist': ok = um('asist'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${f1(ok)}`; extra = `Cuenta ${x.base}.`; break;
      case 'ocup': est = semaforo('rango', x.v, U.ocupLo, U.ocupHi, m); umbralTxt = `${fp(U.ocupLo)} a ${fp(U.ocupHi)}`; extra = x.v > U.ocupHi ? 'Pasó de 80%: abre otra clase.' : `Cuenta ${x.base} sobre cupo de ${cfg.cupo}.`; break;
      case 'util': ok = um('util'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${f$(ok)}`; extra = 'Pago a maestros: capturado si lo registras; si no, ' + cfg.costoVarPct + '% de los ingresos.'; break;
      case 'eq': ok = um('eq'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `${fp(ok)} de ${f$(cfg.fijos)}`; break;
      case 'fuera': ok = um('fuera'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${f$(ok)}`; break;
      case 'com': ok = um('com'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `${miles(ok)} → 200`; extra = x.previa != null ? `Hace 4 semanas: ${miles(x.previa)}.` : (x.vent === 'captura' ? '' : 'Captura el total del grupo cada semana.'); break;
      case 'ref': ok = um('ref'); est = semaforo('min', x.v, ok, null, m); umbralTxt = `≥ ${fp(ok)} de los nuevos`; break;
      case 'cont': {
        ok = U.cont != null ? +U.cont : null;
        est = ok != null ? semaforo('min', x.v, ok, null, m) : 'calibrar';
        txt = x.v == null ? '—' : f1(x.v) + '%'; umbralTxt = ok != null ? `≥ ${f1(ok)}%` : 'por calibrar';
        extra = contMed != null && ok == null ? `Mediana de las últimas semanas: ${f1(contMed)}%. Úsala como umbral inicial.` : ''; break;
      }
      case 'res': {
        const a = semaforo('min', x.v, U.resH, null, m), b = semaforo('min', x.v2, U.resR, null, m);
        est = peor(a, b); umbralTxt = `horas ≥ ${fp(U.resH)} · renovación ≥ ${fp(U.resR)}`;
        txt = (x.v == null ? '—' : fp(x.v)) + ' · ' + (x.v2 == null ? '—' : fp(x.v2)); break;
      }
    }
    if (est !== 'sin' && est !== 'calibrar' && def.nMin && x.n < def.nMin) { est = 'poca'; }
    Object.assign(k, { estado: est, umbral: ok, umbralTxt, texto: txt, extra, v2: x.v2 ?? null });
    return k;
  });

  // ---- Publicidad: números base y veredicto ----
  const arranque = D.sem.find(s => (num(s.gasto) || 0) > 0);
  const P = cfg.pauta;
  const desde = arranque ? arranque.ws : null;
  const acumV = desde ? { da: desde, db: we, a: isoMTY(desde), b: isoMTY(we) } : null;
  let publicidad = { veredicto: 'Sin pauta', color: 'sin', porque: 'Captura el gasto de anuncios de la semana para activar las reglas.', siguiente: '' };
  if (acumV) {
    const sumAcum = campo => D.sem.filter(s => s.ws >= desde && s.ws < we).reduce((t, s) => t + (num(s[campo]) || 0), 0);
    const gasto = sumAcum('gasto'), cts = sumAcum('contactos');
    const nuevos = aux.clientes.filter(c => c.primero >= acumV.a && c.primero < acumV.b);
    const meta = nuevos.filter(c => esMeta(c.origen)), usa = meta.length ? meta : nuevos;
    const cac = usa.length ? gasto / usa.length : null;
    const ltvcac = cac ? aux.ltv / cac : 0;
    const roas = gasto ? usa.reduce((s, c) => s + c.ingreso30, 0) / gasto : 0;
    const dias = dn(we) - dn(desde);
    const semanas = D.sem.filter(s => s.ws >= suma(ws, -7) && s.ws <= ws);
    const cplSem = s => (num(s.contactos) ? (num(s.gasto) || 0) / num(s.contactos) : null);
    const cplOk2 = semanas.length === 2 && semanas.every(s => { const c = cplSem(s); return c != null && c <= aux.cplMax; });
    const cplActual = cplSem(D.sem.find(s => s.ws === ws) || {});
    const frec = actual.vals.frec.v;
    const base = { gasto, contactos: cts, clientes: usa.length, cac, ltvcac, roas, dias, desde };
    const cambia = cplActual != null && cplActual > aux.cplMax * (1 + P.cplCambiaPct / 100);
    if (cts < P.minContactos || gasto < P.minGasto) {
      publicidad = { veredicto: 'Esperar', color: 'ambar', porque: `La muestra es chica: ${cts} de ${P.minContactos} contactos y ${f$(gasto)} de ${f$(P.minGasto)} gastados. Con unos 25 contactos al mes, una venta cambia el CAC al doble o a la mitad.`, siguiente: 'Seguir con el mismo anuncio y revisar al juntar la muestra.' };
      if (frec != null && frec > P.frecCambia) publicidad.siguiente += ` Ojo: la frecuencia (${f1(frec)}) ya pasó de ${P.frecCambia}; cambia la audiencia o el anuncio.`;
    } else if ((ltvcac < 1 && dias >= P.diasCorte) || (roasEq(aux) != null && roas < roasEq(aux))) {
      publicidad = { veredicto: 'Cortar', color: 'rojo', porque: ltvcac < 1 && dias >= P.diasCorte ? `LTV/CAC de ${f1(ltvcac)} pasados ${dias} días.` : `ROAS de ${f1(roas)}× contra ${f1(aux.roasEq)}× de equilibrio con ${cts} contactos.`, siguiente: 'Pausar el anuncio y probar otra oferta o audiencia.' };
    } else if (cambia || (frec != null && frec > P.frecCambia)) {
      publicidad = { veredicto: 'Cambiar la creatividad', color: 'ambar', porque: cambia ? `El CPL de la semana (${f$(cplActual)}) está ${P.cplCambiaPct}% o más sobre el máximo de ${f$(aux.cplMax)}.` : `Frecuencia de ${f1(frec)}: la gente ya vio el anuncio demasiadas veces.`, siguiente: 'Cambiar imagen, gancho o audiencia; mantener el presupuesto.' };
    } else if (cplOk2 && ltvcac >= um('ltvcac') && (frec == null || frec < P.frecEscala) && usa.length >= 3) {
      publicidad = { veredicto: `Escalar ${P.escalaPct}%`, color: 'verde', porque: `CPL dentro del máximo 2 semanas seguidas, LTV/CAC de ${f1(ltvcac)} y frecuencia baja.`, siguiente: `Subir el presupuesto ${P.escalaPct}% y volver a medir en 2 semanas.` };
    } else {
      publicidad = { veredicto: 'Mantener', color: ltvcac >= P.ltvMantener ? 'verde' : 'ambar', porque: usa.length < 3 ? `Solo ${usa.length} cliente${usa.length === 1 ? '' : 's'} nuevo${usa.length === 1 ? '' : 's'} con esta pauta: con tan pocas ventas el CAC no es confiable. Para escalar se piden 3 o más.` : ltvcac >= P.ltvMantener ? `LTV/CAC de ${f1(ltvcac)}: rinde, pero falta para escalar (meta ${f1(um('ltvcac'))} y 2 semanas seguidas dentro del CPL máximo).` : `Sin señal clara: LTV/CAC de ${f1(ltvcac)}.`, siguiente: 'Mismo presupuesto y mismo anuncio.' };
    }
    publicidad.base = base;
  }

  // ---- Economía y equilibrio ----
  const mcMem = aux.mc;
  const faltante = Math.max(0, cfg.fijos - aux.finM.contribMes);
  const equilibrio = {
    fijos: cfg.fijos, contribucion: aux.finM.contribMes, avance: (aux.finM.contribMes / cfg.fijos) * 100, faltante,
    membresiasFaltan: mcMem > 0 ? Math.ceil(faltante / mcMem) : null,
    membresiasTotal: mcMem > 0 ? Math.ceil(cfg.fijos / mcMem) : null,
    ingresos: aux.ing.total * FACTOR_MES, fuera: aux.finM.fueraMes,
  };
  const economia = {
    ltv: aux.ltv, mc: aux.mc, cacMax: aux.cacMax, cplMax: aux.cplMax, roasEq: aux.roasEq,
    paybackMeses: aux.mc > 0 && aux.ecoM.cac ? aux.ecoM.cac / aux.mc : null,
    cac: aux.ecoM.cac, ltvcac: aux.ecoM.ltvcac, cpl: aux.ecoM.cpl, gasto: aux.ecoM.gasto, contactos: aux.ecoM.contactos, clientes: aux.ecoM.clientes,
    convReal: aux.ecoM.contactos ? aux.ecoM.clientes / aux.ecoM.contactos : null,
    permanenciaReal: (() => { const r = actual.vals.ret.v; return r != null && actual.vals.ret.n >= 10 && r < 100 ? Math.min(12, 100 / (100 - r)) : null; })(),
  };

  const cuentaE = e => kpis.filter(k => k.estado === e).length;
  const sem = D.sem.find(s => s.ws === ws) || null;
  const faltan = [];
  if (!sem || num(sem.gasto) == null) faltan.push('gasto de anuncios');
  if (!sem || num(sem.contactos) == null) faltan.push('contactos de anuncios');
  if (!sem || num(sem.impresiones) == null || num(sem.alcance) == null) faltan.push('impresiones y alcance');
  if (!sem || num(sem.comunidad) == null) faltan.push('personas en la comunidad');
  const out = {
    ok: true, semana: ws, fin: we, etiqueta: rangoTxt(ws, we), hoy,
    kpis, publicidad, economia, equilibrio,
    conteo: { verde: cuentaE('verde'), ambar: cuentaE('ambar'), rojo: cuentaE('rojo'), poca: cuentaE('poca'), sin: cuentaE('sin') + cuentaE('calibrar') },
    captura: sem, faltan, cfg, cfgAuto: { cpl: aux.cplMax, cac: aux.cacMax, cont: contMed },
    resumenes: D.resumenes.slice(0, 12).map(r => ({ id: r.id, ws: r.ws, creado: r.creado, texto: r.texto })),
  };
  out.texto = textoResumen(out);
  return out;
}

const roasEq = aux => aux.roasEq;

// ---------- Resumen de los lunes ----------
const PUNTO = { verde: '🟢', ambar: '🟡', rojo: '🔴', poca: '⚪', sin: '⚪', calibrar: '⚪' };
export function textoResumen(r) {
  const L = [];
  L.push(`*Sadhana · resumen de la semana* (${r.etiqueta})`);
  L.push('');
  const p = r.publicidad;
  L.push(`*Publicidad: ${p.veredicto}.* ${p.porque}${p.siguiente ? ' ' + p.siguiente : ''}`);
  L.push('');
  const c = r.conteo;
  L.push(`Semáforo: 🟢 ${c.verde} · 🟡 ${c.ambar} · 🔴 ${c.rojo} · ⚪ ${c.poca + c.sin} (sin datos o muestra chica)`);
  const rojos = r.kpis.filter(k => k.estado === 'rojo');
  const ambar = r.kpis.filter(k => k.estado === 'ambar');
  if (rojos.length || ambar.length) {
    L.push('');
    L.push('*A decidir esta semana:*');
    for (const k of [...rojos, ...ambar].slice(0, 5)) L.push(`${PUNTO[k.estado]} ${k.nombre}: ${k.texto} (meta ${k.umbralTxt}) → ${k.decision}`);
  }
  const e = r.equilibrio;
  L.push('');
  L.push(`*Equilibrio del espacio:* ${f$(e.contribucion)} de ${f$(e.fijos)} al mes (${fp(e.avance)}).${e.faltante > 0 && e.membresiasFaltan != null ? ` Faltan ${f$(e.faltante)}, unas ${e.membresiasFaltan} membresías.` : ' Ya se cubren los gastos fijos.'}`);
  const x = r.economia;
  L.push(`LTV ${f$(x.ltv)} · CAC máximo ${f$(x.cacMax)} · CPL máximo ${f$(x.cplMax)} · ROAS de equilibrio ${x.roasEq != null ? f1(x.roasEq) + '×' : '—'}.`);
  if (r.faltan.length) { L.push(''); L.push(`Falta capturar: ${r.faltan.join(', ')}.`); }
  L.push('');
  L.push('Los umbrales son supuestos; se recalibran con 60 días de datos.');
  return L.join('\n');
}

// Guarda el resumen de la última semana completa (lo llama el cron de los lunes).
export async function guardarResumenSemanal(env, sincronizar) {
  const r = await calcular(env, {}, sincronizar);
  const id = 'resumen-' + r.semana;
  const data = { ws: r.semana, creado: new Date().toISOString(), texto: r.texto, conteo: r.conteo, veredicto: r.publicidad.veredicto, estados: r.kpis.map(k => [k.id, k.estado, k.valor]) };
  await env.DB.prepare(
    `INSERT INTO proyeccion_docs (col, id, data, actualizado, por) VALUES ('kpis', ?, ?, ?, 'cron')
     ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado, por = excluded.por`
  ).bind(id, JSON.stringify(data), data.creado).run();
  return { id, semana: r.semana, conteo: r.conteo, veredicto: r.publicidad.veredicto };
}
