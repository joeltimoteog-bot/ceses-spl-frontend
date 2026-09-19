// Pruebas del Worker local: sync incremental, token, búsqueda FTS, ficha, listado paginado, permisos, tiempos
const crypto = require('crypto');
const B = 'http://localhost:8787', KEY = 'clave-local', SECRET = 'secreto-local';
const res = []; const ok = (n, c, d) => { res.push(c); console.log((c ? '✅ ' : '❌ ') + n + (d ? ' — ' + d : '')); };
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (u, perms, expMs) => { const p = b64u(JSON.stringify({ u, r: u === 'admin' ? 'admin' : 'analista', n: 'Prueba', p: perms, exp: expMs || Date.now() + 3600000 })); return p + '.' + b64u(crypto.createHmac('sha256', SECRET).update(p).digest()); };
const hash = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const get = async (path, tok) => { const t0 = Date.now(); const r = await fetch(B + path, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} }); return { status: r.status, ms: Date.now() - t0, j: await r.json() }; };
const post = async (path, body, key) => { const r = await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Api-Key': key || KEY }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const AP = ['GARCÍA', 'PÉREZ', 'QUISPE', 'HUAMÁN', 'LÓPEZ', 'FLORES', 'ROJAS', 'TORRES', 'MAMANI', 'CHÁVEZ'], NO = ['JUAN', 'MARÍA', 'JOSÉ', 'ANA', 'LUIS', 'ROSA', 'CARLOS', 'ELENA'];
const FUNDOS = ['SAN JUAN', 'LA HUACA', 'EL MILAGRO', 'SANTA ROSA', 'PAMPA', 'CHILCA', 'VIRÚ'];
(async () => {
  const analista = token('ana', ['buscar_trabajador.ver', 'programaciones.ver']), soloProg = token('ger', ['programaciones.ver']), admin = token('admin', []);
  // ---- sync trabajadores (12,000) en lotes de 500 ----
  const trab = []; for (let i = 0; i < 12000; i++) { const o = { dni: String(40000000 + i), empresa: i % 2 ? 'RAPEL' : 'VERFRUT', codigo: 'C' + i, ap_paterno: AP[i % 10], ap_materno: AP[(i * 3) % 10], nombres: NO[i % 8], nombre_completo: AP[i % 10] + ' ' + AP[(i * 3) % 10] + ' ' + NO[i % 8], fecha_inicio_periodo: '20' + (21 + i % 5) + '-0' + (1 + i % 9) + '-15', centro_costo: FUNDOS[i % 7], cargo: i % 50 ? 'OBRERO DE CAMPO' : 'SUPERVISOR', regimen: 'OBRERO AGRARIO', sincronizado_en: '2026-09-19 08:00:00' }; o.hash = hash(o); trab.push(o); }
  let t0 = Date.now(), cambios = 0;
  for (let i = 0; i < trab.length; i += 500) { const r = await post('/sync', { tabla: 'trabajadores', filas: trab.slice(i, i + 500), cerrar: i + 500 >= trab.length, insertadas: trab.length }); if (r.status !== 200) { console.log(r); process.exit(1); } cambios += r.j.cambios; }
  ok('Sync inicial 12,000 trabajadores', cambios === 12000, cambios + ' cambios · ' + (Date.now() - t0) + ' ms');
  // ---- sync programación (37,000) ----
  const prog = []; for (let i = 1; i <= 37000; i++) { const t = trab[i % 12000]; const est = ['FINIQUITO', 'SUSPENSIÓN', 'SIN EFECTO'][i % 3]; const d = new Date(Date.UTC(2024, 0, 1) + (i % 630) * 86400000).toISOString().slice(0, 10); const o = { id: i, dni: t.dni, nombres: t.nombre_completo, empresa: t.empresa, fundo: t.centro_costo, cargo: t.cargo, anios: i % 6, meses: i % 12, dias: i % 28, estado: i % 6 >= 4 ? 'INDETERMINADO' : 'CONTRATO A PLAZO FIJO', ruta: 'R' + (i % 40), codigo: 'SPP', fundo_zona: FUNDOS[i % 7], estatus: est, fecha_firma: d, mes: 'Mes', anio: Number(d.slice(0, 4)), fecha_doc: d, fecha_inicio_sl: est === 'SUSPENSIÓN' ? d : null, fecha_fin_sl: est === 'SUSPENSIÓN' ? d : null, fecha_retorno: est === 'SUSPENSIÓN' ? d : null, cant_dias: est === 'SUSPENSIÓN' ? 1 + i % 30 : null, observacion: 'OBS ' + i, estado_retorno: est === 'SUSPENSIÓN' ? 'RETORNA' : null, status02: 'RV', origen: 'macro-excel', creado_en: '2026-09-19' }; o.hash = hash(o); prog.push(o); }
  t0 = Date.now(); cambios = 0;
  for (let i = 0; i < prog.length; i += 500) { const r = await post('/sync', { tabla: 'programacion', filas: prog.slice(i, i + 500), cerrar: i + 500 >= prog.length }); cambios += r.j.cambios; }
  ok('Sync inicial 37,000 programaciones', cambios === 37000, cambios + ' cambios · ' + (Date.now() - t0) + ' ms');
  // ---- sync incremental: mismas filas → 0 cambios; 3 modificadas + 2 eliminadas ----
  let r = await post('/sync', { tabla: 'programacion', filas: prog.slice(0, 500) });
  ok('Reenviar filas sin cambios → 0 escrituras (hash igual)', r.j.cambios === 0, JSON.stringify(r.j));
  const mod = prog.slice(0, 3).map(o => ({ ...o, observacion: 'MODIFICADA', hash: 'nuevo' + o.id }));
  r = await post('/sync', { tabla: 'programacion', filas: mod, eliminar: [36999, 37000] });
  ok('3 modificadas + 2 eliminadas → 5 cambios', r.j.cambios === 5 && r.j.total === 36998, JSON.stringify(r.j));
  ok('Sync con API key incorrecta → 401', (await post('/sync', { tabla: 'programacion', filas: [] }, 'mala')).status === 401);
  // ---- auth ----
  ok('Sin token → 401', (await get('/buscar?q=garcia')).status === 401);
  ok('Token con firma alterada → 401', (await get('/buscar?q=garcia', analista.slice(0, -3) + 'abc')).status === 401);
  ok('Token vencido → 401', (await get('/buscar?q=garcia', token('ana', ['buscar_trabajador.ver'], Date.now() - 1000))).status === 401);
  ok('Sin permiso buscar_trabajador.ver → 403', (await get('/buscar?q=garcia', soloProg)).status === 403);
  ok('Admin sin lista de permisos → pasa', (await get('/buscar?q=garcia', admin)).status === 200);
  // ---- búsqueda ----
  r = await get('/buscar?q=garcia%20juan&limite=10', analista);
  ok('Buscar "garcia juan" (sin tildes, prefijos FTS, nombre pesa más que fundo)', r.status === 200 && r.j.filas.length === 10 && r.j.filas.every(x => /GARCÍA/.test(x.nombre_completo)) && r.j.filas.slice(0, 5).every(x => /JUAN/.test(x.nombre_completo)), r.ms + ' ms · mas=' + r.j.mas + ' · ' + r.j.filas.slice(0, 3).map(x => x.nombre_completo + '/' + x.centro_costo).join(' | '));
  r = await get('/buscar?q=400012', analista); ok('Buscar por DNI parcial', r.status === 200 && r.j.filas.length > 0 && r.j.filas[0].dni.startsWith('400012'), r.ms + ' ms');
  r = await get('/buscar?q=C777', analista); ok('Buscar por código', r.status === 200 && r.j.filas[0].codigo.startsWith('C777'), r.ms + ' ms');
  r = await get('/buscar?q=huaca%20rosa', analista); ok('Buscar por fundo + nombre', r.status === 200 && r.j.filas.length > 0, r.ms + ' ms · ' + r.j.filas.length);
  // ---- ficha ----
  r = await get('/trabajador/40000005', analista);
  ok('Ficha con historial, antigüedad, estado y acumulado', r.status === 200 && r.j.en_base && r.j.historial.length > 0 && r.j.antiguedad.anios != null && r.j.estado && r.j.regimen_clasificado === 'OBRERO', r.ms + ' ms · ' + r.j.historial.length + ' registros · ' + r.j.estado);
  r = await get('/trabajador/99999999', analista); ok('DNI inexistente → 404 con mensaje claro', r.status === 404 && /no existe/.test(r.j.error));
  // ---- programación por fechas ----
  r = await get('/programacion?fechas=2024-01-02,2024-01-03', analista);
  ok('Programación por fechas (2 fechas)', r.status === 200 && r.j.length > 0 && r.j.every(x => ['2024-01-02', '2024-01-03'].includes(x.fecha_doc)), r.ms + ' ms · ' + r.j.length + ' filas');
  // ---- listado paginado con filtros ----
  r = await get('/listado?estatus=SUSPENSI%C3%93N&fundo=LA%20HUACA&desde=2024-01-01&hasta=2024-12-31&por=25&pagina=2', analista);
  ok('Listado filtrado y paginado (25/pág, pág 2)', r.status === 200 && r.j.filas.length === 25 && r.j.pagina === 2 && r.j.total > 25 && r.j.filas.every(x => x.estatus === 'SUSPENSIÓN' && x.fundo_zona === 'LA HUACA'), r.ms + ' ms · total ' + r.j.total + ' · páginas ' + r.j.paginas);
  r = await get('/listado?q=obs%2012345', analista); ok('Listado por texto libre sobre el total', r.status === 200 && r.j.total >= 1 && r.j.filas.some(x => x.observacion === 'OBS 12345'), r.ms + ' ms · ' + r.j.total);
  r = await get('/listado', analista); ok('Listado sin filtros → últimos 90 días (no recorre todo)', r.status === 200 && r.j.filas.every(x => x.fecha_doc >= new Date(Date.now() - 91 * 86400000).toISOString().slice(0, 10)), r.ms + ' ms · ' + r.j.total);
  r = await get('/catalogos', analista); ok('Catálogos', r.status === 200 && r.j.fundos.length === 7 && r.j.rutas.length === 40, r.ms + ' ms');
  r = await get('/salud'); ok('Salud con conteos y estado de sync', r.j.ok && r.j.trabajadores === 12000 && r.j.programacion === 36998 && r.j.sync.length === 2, JSON.stringify(r.j).slice(0, 160));
  // ---- tiempos: 20 búsquedas seguidas ----
  const ts = []; for (let i = 0; i < 20; i++) { const q = ['garcia', 'perez ana', 'quispe', 'lopez luis', '40001'][i % 5]; ts.push((await get('/buscar?q=' + q, analista)).ms); }
  ok('20 búsquedas: promedio', true, Math.round(ts.reduce((a, b) => a + b) / ts.length) + ' ms (máx ' + Math.max(...ts) + ')');
  const c = await Promise.all(Array.from({ length: 10 }, (_, i) => get('/trabajador/4000010' + i, analista))); ok('10 fichas simultáneas', c.every(x => x.status === 200), 'máx ' + Math.max(...c.map(x => x.ms)) + ' ms');
  console.log('\nRESUMEN: ' + res.filter(Boolean).length + ' OK / ' + res.filter(x => !x).length + ' fallidas');
})().catch(e => { console.error(e); process.exit(1); });
