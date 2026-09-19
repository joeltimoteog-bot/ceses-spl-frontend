// ======================================================================
//  TALVENIQ · Ceses/SPL — API de consulta (Cloudflare Worker + D1)  v1.0
//  Fase 2: Excel Lite → Google Sheets → (Apps Script sync incremental) → D1 → este API → navegador
//  - Login, permisos, grabado, correos y exportaciones siguen en Apps Script.
//  - Este API solo LEE (búsquedas, fichas, listados paginados) y recibe la sincronización (API key).
//  - Autenticación: token HMAC-SHA256 firmado por Apps Script en el login (mismo secreto: D1_TOKEN_SECRET).
// ======================================================================
const VERSION = '1.0-d1';
const COLS_TRAB = ['dni', 'empresa', 'codigo', 'ap_paterno', 'ap_materno', 'nombres', 'nombre_completo', 'fecha_inicio_periodo', 'fecha_inicio_contrato', 'fecha_termino_contrato', 'centro_costo', 'cargo', 'provincia', 'direccion', 'regimen', 'sexo', 'afp', 'asig_familiar', 'fecha_nacimiento', 'sincronizado_en'];
const COLS_PROG = ['id', 'dni', 'nombres', 'empresa', 'f_inicio', 'f_renovacion', 'f_termino', 'fundo', 'cargo', 'direccion', 'anios', 'meses', 'dias', 'estado', 'ruta', 'codigo', 'fundo_zona', 'estatus', 'semana_mes', 'fecha_firma', 'mes', 'anio', 'fecha_doc', 'fecha_inicio_sl', 'fecha_fin_sl', 'fecha_retorno', 'cant_dias', 'observacion', 'estado_retorno', 'fecha_pago', 'status02', 'responsable_sector', 'apoyos', 'horario_firma', 'origen', 'creado_en'];
const DIAS_PERIODO_PRUEBA = 90;
const PAL_EMPLEADO = 'JEFE|JEFA|SUPERVISOR|COORDINADOR|ASISTENTE|ANALISTA|ADMINISTRADOR|ADMINISTRATIVO|GERENTE|SUBGERENTE|INGENIERO|CONTADOR|SECRETARIA|PRACTICANTE|ESPECIALISTA|SUPERINTENDENTE|DIGITADOR|PLANILLERO|RECLUTADOR|MEDICO|ENFERMER|PSICOLOG|TRABAJADOR SOCIAL|RECURSOS HUMANOS|CONTABILIDAD|SISTEMAS|TESORERIA|LOGISTICA|COMPRAS|CONTROLLER|SUPERVISION'.split('|');
const PAL_OBRERO = 'OBRERO|OPERARIO|PEON|COSECHA|EMPAQUE|EMPACADOR|ESTIBADOR|SELECCIONADOR|PACKING|CAMPO|REGADOR|RIEGO|TRACTORISTA|PODADOR|APLICADOR|FUMIGADOR|CUADRILLERO|CAPATAZ|JORNALERO|LIMPIEZA|ALMACEN|EMBALAJE|PALETIZADOR|MONTACARGUISTA|AUXILIAR DE CAMPO|AUXILIAR DE PLANTA'.split('|');

// ---------- utilidades ----------
const norm = s => String(s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const hoyLima = () => { const d = new Date(Date.now() - 5 * 3600000); return d.toISOString().slice(0, 10); };   // Lima = UTC-5 sin horario de verano
const ahoraLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const parseISO = s => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const diffDias = (a, b) => Math.round((b - a) / 86400000);
function antiguedad(inicioISO, hasta) {
  hasta = hasta || parseISO(hoyLima()); const ini = parseISO(inicioISO);
  if (!ini) return { anios: null, meses: null, dias: null };
  let anios = hasta.getUTCFullYear() - ini.getUTCFullYear(), meses = hasta.getUTCMonth() - ini.getUTCMonth(), dias = hasta.getUTCDate() - ini.getUTCDate();
  if (dias < 0) { meses -= 1; dias += new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 0)).getUTCDate(); }
  if (meses < 0) { anios -= 1; meses += 12; }
  return { anios, meses, dias };
}
const esIndet = (a, m) => a != null && (a > 4 || (a === 4 && m >= 6));
function estadoContrato(inicioISO, declarado) {
  if (declarado && /indeterminad/i.test(declarado)) return 'INDETERMINADO';
  const ini = parseISO(inicioISO); if (!ini) return null;
  const a = antiguedad(inicioISO);
  if (diffDias(ini, parseISO(hoyLima())) <= DIAS_PERIODO_PRUEBA) return 'PERIODO DE PRUEBA';
  if (esIndet(a.anios, a.meses)) return 'INDETERMINADO';
  return 'CONTRATO A PLAZO FIJO';
}
function clasificarRegimen(regimen, cargo) {
  const r = String(regimen || '').toUpperCase();
  if (r.indexOf('OBRERO') === 0) return 'OBRERO';
  if (r.indexOf('EMPLEADO') >= 0 || r.indexOf('ADMINISTRATIVO') >= 0) return 'EMPLEADO';
  const c = String(cargo || '').toUpperCase();
  if (PAL_EMPLEADO.some(p => c.indexOf(p) >= 0)) return 'EMPLEADO';
  if (PAL_OBRERO.some(p => c.indexOf(p) >= 0)) return 'OBRERO';
  return 'POR DEFINIR';
}
const acumAnual = hist => { const y = new Date().getUTCFullYear(); return hist.filter(h => Number(h.anio) === y && /^SUSPENSI/i.test(h.estatus || '')).reduce((s, h) => s + (Number(h.cant_dias) || 0), 0); };

// ---------- respuestas / CORS ----------
function cors(env, req) {
  const origen = req.headers.get('Origin') || '';
  const permitidos = String(env.ORIGENES || '*').split(',').map(s => s.trim());
  const ok = permitidos.includes('*') || permitidos.includes(origen);
  return { 'Access-Control-Allow-Origin': ok ? (origen || '*') : 'null', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Api-Key', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
}
const json = (obj, status, extra) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {}) });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---------- token HMAC (emitido por Apps Script) ----------
const b64u = { enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)) };
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u.enc(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}
async function verificarToken(env, req) {
  const auth = req.headers.get('Authorization') || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!tok) throw new HttpError(401, 'No autenticado');
  const [p, s] = tok.split('.'); if (!p || !s) throw new HttpError(401, 'Token inválido');
  const esperado = await hmac(env.D1_TOKEN_SECRET || '', p);
  if (esperado.length !== s.length || !timingSafeEqual(esperado, s)) throw new HttpError(401, 'Token inválido');
  let u; try { u = JSON.parse(new TextDecoder().decode(b64u.dec(p))); } catch { throw new HttpError(401, 'Token inválido'); }
  if (!u.exp || Date.now() > u.exp) throw new HttpError(401, 'Sesión vencida');
  return u;   // { u: usuario, r: rol, n: nombre, p: [permisos], exp }
}
function timingSafeEqual(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const exigir = (u, perm) => { if (!(u.p || []).includes(perm) && u.r !== 'admin') throw new HttpError(403, 'Acceso denegado. No cuenta con autorización para realizar esta acción.'); };

// ---------- sincronización (Apps Script → D1) ----------
async function sync(env, body) {
  const tabla = body.tabla, filas = Array.isArray(body.filas) ? body.filas : [], borrar = Array.isArray(body.eliminar) ? body.eliminar : [];
  if (tabla !== 'trabajadores' && tabla !== 'programacion') throw new HttpError(400, 'tabla inválida');
  if (filas.length > 500 || borrar.length > 2000) throw new HttpError(400, 'lote demasiado grande (máx. 500 filas / 2000 eliminaciones)');
  const ahora = ahoraLima(), stmts = [];
  let ins = 0, upd = 0;
  if (tabla === 'trabajadores') {
    const cols = COLS_TRAB.concat(['nombre_norm', 'hash', 'actualizado_en']);
    const sql = `INSERT INTO trabajadores (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(dni) DO UPDATE SET ${cols.filter(c => c !== 'dni').map(c => c + '=excluded.' + c).join(',')} WHERE trabajadores.hash <> excluded.hash`;
    for (const f of filas) {
      const dni = String(f.dni || '').trim(); if (!/^\d{6,12}$/.test(dni) || !f.hash) continue;
      const v = COLS_TRAB.map(c => c === 'dni' ? dni : (f[c] ?? null)); v.push(norm(f.nombre_completo), String(f.hash), ahora);
      stmts.push(env.DB.prepare(sql).bind(...v));
    }
    for (const dni of borrar) stmts.push(env.DB.prepare('DELETE FROM trabajadores WHERE dni = ?').bind(String(dni)));
  } else {
    const cols = COLS_PROG.concat(['texto_norm', 'hash', 'actualizado_en']);
    const sql = `INSERT INTO programacion (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => c + '=excluded.' + c).join(',')} WHERE programacion.hash <> excluded.hash`;
    for (const f of filas) {
      const id = Number(f.id); if (!id || !f.hash) continue;
      const v = COLS_PROG.map(c => c === 'id' ? id : (f[c] ?? null)); v.push(norm([f.nombres, f.dni, f.fundo_zona, f.ruta, f.codigo, f.observacion, f.estado_retorno, f.status02].join(' ')), String(f.hash), ahora);
      stmts.push(env.DB.prepare(sql).bind(...v));
    }
    for (const id of borrar) stmts.push(env.DB.prepare('DELETE FROM programacion WHERE id = ?').bind(Number(id)));
  }
  let cambios = 0;
  for (let i = 0; i < stmts.length; i += 100) { const rs = await env.DB.batch(stmts.slice(i, i + 100)); rs.forEach(r => { if ((r.meta.changes || 0) > 0) cambios++; }); }   // 1 por fila afectada (los triggers FTS no se cuentan)
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first()).n;
  if (body.cerrar) await env.DB.prepare('INSERT INTO sync_estado (tabla, ultimo, filas, insertadas, actualizadas, eliminadas, detalle) VALUES (?,?,?,?,?,?,?) ON CONFLICT(tabla) DO UPDATE SET ultimo=excluded.ultimo, filas=excluded.filas, insertadas=excluded.insertadas, actualizadas=excluded.actualizadas, eliminadas=excluded.eliminadas, detalle=excluded.detalle')
    .bind(tabla, ahora, total, Number(body.insertadas) || 0, Number(body.actualizadas) || 0, Number(body.eliminadas) || 0, String(body.detalle || '').slice(0, 200)).run();
  return { ok: true, tabla, recibidas: filas.length, eliminadas: borrar.length, cambios, total };
}

// ---------- consultas ----------
async function buscar(env, q, limite) {
  const toks = norm(q).split(' ').filter(t => t.length >= 2);
  if (!toks.length) return { q, total: 0, filas: [] };
  // FTS5 con prefijos: "garcia* juan*"; los tokens que son solo dígitos buscan también por dni/código
  const match = toks.map(t => '"' + t.replace(/"/g, '') + '"*').join(' ');
  const lim = Math.min(Math.max(Number(limite) || 30, 5), 100);
  const rs = await env.DB.prepare(`SELECT t.dni, t.nombre_completo, t.empresa, t.centro_costo, t.cargo, t.codigo FROM trab_fts f JOIN trabajadores t ON t.rowid = f.rowid WHERE trab_fts MATCH ? ORDER BY bm25(trab_fts, 1.0, 10.0, 5.0, 1.0), t.nombre_completo LIMIT ?`).bind(match, lim + 1).all();
  const filas = rs.results.slice(0, lim);
  return { q, total: rs.results.length > lim ? lim + 1 : filas.length, mas: rs.results.length > lim, filas };
}
async function trabajador(env, dni) {
  dni = String(dni || '').trim();
  const t = await env.DB.prepare('SELECT * FROM trabajadores WHERE dni = ?').bind(dni).first();
  const hist = (await env.DB.prepare('SELECT * FROM programacion WHERE dni = ? ORDER BY COALESCE(fecha_doc, fecha_firma) DESC, id DESC').bind(dni).all()).results.map(limpiarProg);
  let base = t, enBase = !!t;
  if (!base) {
    if (!hist.length) throw new HttpError(404, 'DNI ' + dni + ' no existe en las bases de las organizaciones ni tiene historial. Actualiza las bases si es un ingreso reciente.');
    const u = hist[0];
    base = { dni, empresa: u.empresa, nombre_completo: u.nombres, cargo: u.cargo, centro_costo: u.fundo, direccion: u.direccion, provincia: null, regimen: null, fecha_inicio_periodo: u.f_inicio, fecha_inicio_contrato: u.f_renovacion, fecha_termino_contrato: u.f_termino, sincronizado_en: null, ultimo_registro: u.fecha_doc || u.fecha_firma, ultimo_estatus: u.estatus };
  } else { delete base.hash; delete base.actualizado_en; delete base.nombre_norm; }
  const porAnio = {};
  hist.forEach(h => { if (!h.anio) return; const p = porAnio[h.anio] = porAnio[h.anio] || { anio: h.anio, fin: 0, sus: 0, se: 0, dias: 0 }; if (h.estatus === 'FINIQUITO') p.fin++; else if (/^SUSPENSI/i.test(h.estatus || '')) { p.sus++; p.dias += Number(h.cant_dias) || 0; } else if (h.estatus === 'SIN EFECTO') p.se++; });
  return { ...base, en_base: enBase, antiguedad: antiguedad(base.fecha_inicio_periodo), estado: estadoContrato(base.fecha_inicio_periodo), regimen_clasificado: clasificarRegimen(base.regimen, base.cargo), acum_anual: acumAnual(hist), historial: hist, por_anio: Object.values(porAnio).sort((a, b) => b.anio - a.anio), fuente: 'd1' };
}
function limpiarProg(r) { delete r.hash; delete r.actualizado_en; delete r.texto_norm; return r; }
async function programacionPorFechas(env, fechas) {
  const fs = String(fechas || '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(0, 31);
  if (!fs.length) return [];
  const rs = await env.DB.prepare(`SELECT * FROM programacion WHERE fecha_doc IN (${fs.map(() => '?').join(',')}) ORDER BY fundo_zona, ruta, nombres`).bind(...fs).all();
  return rs.results.map(limpiarProg);
}
// Listado paginado con filtros (búsqueda sobre el total, no sobre la página)
async function listado(env, p) {
  const where = [], args = [];
  const txt = norm(p.q); if (txt) txt.split(' ').filter(Boolean).forEach(t => { where.push('texto_norm LIKE ?'); args.push('%' + t + '%'); });
  if (p.dni) { where.push('dni = ?'); args.push(String(p.dni).trim()); }
  if (p.empresa) { where.push('empresa = ?'); args.push(String(p.empresa).toUpperCase()); }
  if (p.estatus) { where.push('estatus = ?'); args.push(String(p.estatus).toUpperCase()); }
  if (p.fundo) { where.push('fundo_zona = ?'); args.push(String(p.fundo).toUpperCase()); }
  if (p.ruta) { where.push('ruta = ?'); args.push(String(p.ruta).toUpperCase()); }
  if (p.estado) { where.push('estado LIKE ?'); args.push('%' + String(p.estado).toUpperCase() + '%'); }
  if (p.estado_retorno) { where.push('estado_retorno = ?'); args.push(String(p.estado_retorno).toUpperCase()); }
  if (p.desde) { where.push('fecha_doc >= ?'); args.push(p.desde); }
  if (p.hasta) { where.push('fecha_doc <= ?'); args.push(p.hasta); }
  if (p.retorno_desde) { where.push('fecha_retorno >= ?'); args.push(p.retorno_desde); }
  if (p.retorno_hasta) { where.push('fecha_retorno <= ?'); args.push(p.retorno_hasta); }
  if (!where.length) { where.push('fecha_doc >= ?'); args.push(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)); }   // sin filtros: últimos 90 días (no recorrer 37k filas)
  const por = [25, 50, 100].includes(Number(p.por)) ? Number(p.por) : 50, pag = Math.max(1, Number(p.pagina) || 1);
  const W = 'WHERE ' + where.join(' AND ');
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM programacion ' + W).bind(...args).first()).n;
  const filas = (await env.DB.prepare('SELECT * FROM programacion ' + W + ' ORDER BY fecha_doc DESC, fundo_zona, ruta, nombres LIMIT ? OFFSET ?').bind(...args, por, (pag - 1) * por).all()).results.map(limpiarProg);
  const tot = await env.DB.prepare(`SELECT SUM(estatus='FINIQUITO') AS fin, SUM(estatus LIKE 'SUSPENSI%') AS sus, SUM(estatus='SIN EFECTO') AS se FROM programacion ${W}`).bind(...args).first();
  return { total, pagina: pag, por, paginas: Math.max(1, Math.ceil(total / por)), filas, totales: { finiquitos: tot.fin || 0, suspensiones: tot.sus || 0, sin_efecto: tot.se || 0 } };
}
async function catalogos(env) {
  const desde = new Date(Date.now() - 548 * 86400000).toISOString().slice(0, 10);
  const q = async (col) => (await env.DB.prepare(`SELECT DISTINCT ${col} AS v FROM programacion WHERE fecha_doc >= ? AND ${col} IS NOT NULL AND ${col} <> '' ORDER BY 1`).bind(desde).all()).results.map(r => r.v);
  return { fundos: await q('fundo_zona'), rutas: await q('ruta'), estados_retorno: await q('estado_retorno'), estatus: ['FINIQUITO', 'SUSPENSIÓN', 'SIN EFECTO'] };
}
async function salud(env) {
  const t0 = Date.now(); let bd = 'error', n = null, sync = [];
  try { n = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM trabajadores) AS t, (SELECT COUNT(*) FROM programacion) AS p').first(); sync = (await env.DB.prepare('SELECT * FROM sync_estado').all()).results; bd = 'ok'; } catch (e) { bd = 'error: ' + e.message; }
  return { ok: bd === 'ok', version: VERSION, hora: ahoraLima(), bd, ms: Date.now() - t0, trabajadores: n && n.t, programacion: n && n.p, sync };
}

// ---------- router ----------
export default {
  async fetch(req, env, ctx) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/', p = Object.fromEntries(url.searchParams), t0 = Date.now();
    let usuario = '';
    try {
      if (path === '/salud' || path === '/') return json(await salud(env), 200, h);
      if (path === '/sync') {
        if (req.method !== 'POST') throw new HttpError(405, 'POST requerido');
        const key = req.headers.get('X-Api-Key') || '';
        if (!env.D1_API_KEY || key !== env.D1_API_KEY) throw new HttpError(401, 'API key inválida');
        const r = await sync(env, await req.json()); usuario = 'apps-script';
        ctx.waitUntil(registrar(env, usuario, path, Date.now() - t0, 'ok', ''));
        return json(r, 200, h);
      }
      const u = await verificarToken(env, req); usuario = u.u;
      let r;
      if (path === '/buscar') { exigir(u, 'buscar_trabajador.ver'); r = await buscar(env, p.q, p.limite); }
      else if (path.startsWith('/trabajador/')) { exigir(u, 'buscar_trabajador.ver'); r = await trabajador(env, decodeURIComponent(path.slice(12))); }
      else if (path === '/programacion') { exigir(u, 'programaciones.ver'); r = await programacionPorFechas(env, p.fechas); }
      else if (path === '/listado') { exigir(u, 'programaciones.ver'); r = await listado(env, p); }
      else if (path === '/catalogos') { r = await catalogos(env); }
      else if (path === '/yo') { r = { usuario: u.u, rol: u.r, nombre: u.n, exp: u.exp }; }
      else throw new HttpError(404, 'Ruta no encontrada');
      const ms = Date.now() - t0; if (ms > 1500) ctx.waitUntil(registrar(env, usuario, path, ms, 'lenta', ''));
      return json(r, 200, Object.assign({ 'X-Ms': String(ms) }, h));
    } catch (e) {
      const status = e.status || 500, msg = e.status ? e.message : 'Error interno del servicio de consulta';
      if (status >= 500 || status === 401) ctx.waitUntil(registrar(env, usuario, path, Date.now() - t0, 'error', String(e.message).slice(0, 300)));
      return json({ error: msg }, status, h);
    }
  },
};
async function registrar(env, usuario, ruta, ms, resultado, error) {
  try { await env.DB.prepare('INSERT INTO log_api (fecha_hora, usuario, ruta, ms, resultado, error) VALUES (?,?,?,?,?,?)').bind(ahoraLima(), usuario, ruta, ms, resultado, error).run(); } catch {}
}
