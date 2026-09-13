'use strict';
// ======================================================
// TALVENIQ · Plataforma de Gestión Humana — frontend (módulo Ceses / SPL)
// ======================================================
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dmy = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------- API hacia Google Apps Script ----------
const TOKEN_KEY = 'ceses_token';
function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
async function gas(action, data = {}) {
  const r = await fetch(window.API_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: token(), ...data }) });
  const j = await r.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));
  if (j && j.error === 'No autenticado') { try { localStorage.removeItem(TOKEN_KEY); } catch {} location.href = 'index.html'; throw new Error('sesión'); }
  if (j && j.error) throw new Error(orgTexto(j.error));
  return j;
}
// Traductor de las rutas antiguas (/api/...) a acciones del Apps Script
async function api(url, opt = {}) {
  const m = (opt.method || 'GET').toUpperCase();
  const body = opt.body ? JSON.parse(opt.body) : {};
  const [path, qs] = url.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  if (path === '/api/yo') return gas('yo');
  if (path === '/api/logout') { try { localStorage.removeItem(TOKEN_KEY); } catch {} return { ok: true }; }
  if (path === '/api/estado') return gas('estado');
  if (path === '/api/programacion/fechas') return gas('fechas');
  if (path === '/api/programacion/validar') return gas('validar', body);
  if (path === '/api/programacion' && m === 'POST') return gas('grabar', body);
  if (path === '/api/programacion') return gas('programacion', { fechas: q.fechas });
  if (path.startsWith('/api/programacion/') && m === 'DELETE') return gas('eliminar', { id: path.split('/').pop() });
  if (path.startsWith('/api/trabajador/')) return gas('trabajador', { dni: path.split('/')[3] });
  if (path === '/api/resumen') return gas('resumen', { fechas: q.fechas });
  if (path === '/api/firmas') return gas('firma', body);
  if (path === '/api/responsables' && m === 'PUT') return gas('guardarResponsable', body);
  if (path === '/api/responsables') return gas('responsables');
  if (path === '/api/catalogos') return gas('catalogos');
  if (path === '/api/correo/vista') return gas('correoVista', { fechas: q.fechas });
  if (path === '/api/correo/enviar') return gas('correoEnviar', body);
  throw new Error('Ruta no soportada: ' + url);
}
async function descargar(params) {   // Excel: el backend genera el archivo en Drive y devuelve el enlace
  const r = await gas('excelUrl', params);
  window.open(r.url, '_blank');
}
const badgeEst = e => {
  const m = { 'FINIQUITO': 'danger', 'SUSPENSIÓN': 'warning text-dark', 'SIN EFECTO': 'secondary' };
  return `<span class="badge badge-est bg-${m[e] || 'light text-dark'}">${esc(e || '—')}</span>`;
};

// ---------- navegación ----------
const TITULOS = {
  inicio: ['Inicio', 'Resumen ejecutivo del sistema'],
  dni: ['Buscar trabajador', 'Ficha del trabajador, antigüedad e historial'],
  registro: ['Registro masivo', 'Suspensiones, finiquitos y sin efecto por lote'],
  resumen: ['Programaciones', 'Lo programado por sector, firmas y correo'],
  responsables: ['Responsables', 'Analista y supervisor por fundo'],
  panel: ['Panel de Control', 'Usuarios, roles, permisos, auditoría y sesiones'],
  denegado: ['Acceso denegado', 'No cuentas con autorización para este módulo'],
};
// permiso que exige cada módulo (el backend lo vuelve a validar en cada acción)
const PERM_MODULO = { inicio: 'inicio.ver', dni: 'buscar_trabajador.ver', registro: 'registro_masivo.ver', resumen: 'programaciones.ver', responsables: 'responsables.ver', panel: 'panel.ver' };
let yoAct = null, PERM = {};
function puede(p) { return !!PERM[p]; }
function primerModulo() { return Object.keys(PERM_MODULO).find(m => puede(PERM_MODULO[m])) || 'denegado'; }
function aplicarPermisosUI() {
  document.querySelectorAll('.menu a[data-p]').forEach(a => { const req = PERM_MODULO[a.dataset.p]; a.style.display = (!req || puede(req)) ? '' : 'none'; });
  document.querySelectorAll('[data-perm]').forEach(el => { if (!puede(el.dataset.perm)) el.style.display = 'none'; });
}
function ir(p) {
  if (!TITULOS[p]) p = 'inicio';
  if (PERM_MODULO[p] && !puede(PERM_MODULO[p])) p = 'denegado';
  document.querySelectorAll('.pantalla').forEach(s => s.classList.toggle('activa', s.id === 'p-' + p));
  document.querySelectorAll('.menu a[data-p]').forEach(a => a.classList.toggle('active', a.dataset.p === p));
  $('#titulo').textContent = TITULOS[p][0]; $('#subtitulo').textContent = TITULOS[p][1];
  cerrarMenu();
  const c = $('.content'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  window.scrollTo({ top: 0 });
  if (p === 'inicio') cargarInicio();
  if (p === 'responsables') cargarResp();
  if (p === 'registro') cargarCatalogos();
  if (p === 'panel') cargarPanel();
}
window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (h && TITULOS[h] && !$('#p-' + h).classList.contains('activa')) ir(h); });
document.querySelectorAll('.menu a[data-p]').forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.p); location.hash = a.dataset.p; });
// menú lateral: móvil (hamburguesa) y escritorio (contraer)
function abrirMenu() { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); }
function cerrarMenu() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }
function toggleSidebar() { const mini = document.body.classList.toggle('sb-mini'); try { localStorage.setItem('ceses_sb', mini ? '1' : '0'); } catch {} }
try { if (localStorage.getItem('ceses_sb') === '1') document.body.classList.add('sb-mini'); } catch {}
async function salir() { try { await gas('logout'); } catch {} try { localStorage.removeItem(TOKEN_KEY); } catch {} location.href = 'index.html'; }

// ---------- inicio ----------
async function cargarInicio() {
  const e = await api('/api/estado');
  const tot = e.trabajadores.reduce((s, t) => s + t.n, 0);
  $('#kpis').innerHTML = [
    ['Trabajadores en base', tot.toLocaleString('es-PE'), 'bi-people-fill', 'b'],
    ['Registros históricos', e.programacion.n.toLocaleString('es-PE'), 'bi-archive-fill', 'n'],
    ['Última fecha documentada', dmy(e.programacion.ultima) || '—', 'bi-calendar-event-fill', 'g'],
    ['Programados para hoy', e.hoy, 'bi-calendar-check-fill', 'k'],
  ].map(([t, v, i, c]) => `<div class="kpi"><div class="ic ${c}"><i class="bi ${i}"></i></div><div><div class="lbl">${t}</div><div class="val">${v}</div></div></div>`).join('');
  $('#tSync tbody').innerHTML = Object.keys(window.ORGANIZATION_DISPLAY || {}).map(emp => {   // IDs internos; el nombre visible sale de ORGANIZATION_DISPLAY
    const t = e.trabajadores.find(x => x.empresa === emp) || { n: 0 };
    const s = e.sync.find(x => x.empresa === emp);
    const est = s ? '<span class="st ok"><i class="bi bi-check-circle-fill"></i> Sincronizada</span>' : '<span class="st bad"><i class="bi bi-exclamation-circle-fill"></i> Sin sincronizar</span>';
    return `<tr><td><span class="emp-tag">${esc(orgNombre(emp))}</span></td><td><b>${t.n.toLocaleString('es-PE')}</b></td><td>${s ? esc(s.fecha) : '<span class="text-muted">nunca</span>'}</td><td>${est}</td></tr>`;
  }).join('');
  const f = await api('/api/programacion/fechas');
  $('#tFechas tbody').innerHTML = f.slice(0, 5).map(x => `<tr><td><b>${dmy(x.fecha_doc)}</b></td><td>${x.n}</td><td>${x.fin}</td><td>${x.sus}</td><td class="text-end"><button class="btn-ico" title="Ver programación" onclick="verFecha('${x.fecha_doc}')"><i class="bi bi-arrow-right"></i></button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin programaciones registradas</td></tr>';
}
async function subirExcel(inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 45 * 1048576) { $('#syncMsg').innerHTML = '<span class="text-danger">✖ El archivo supera 45 MB. Usa el Lite (más liviano) o la macro Sincronizar.</span>'; inp.value = ''; return; }
  $('#syncMsg').innerHTML = `<span class="text-muted">Subiendo ${esc(f.name)} (${(f.size / 1048576).toFixed(1)} MB) y actualizando las bases de las organizaciones… puede tardar 1–2 min</span>`;
  try {
    const base64 = await new Promise((ok, ko) => { const rd = new FileReader(); rd.onload = () => ok(rd.result.split(',')[1]); rd.onerror = ko; rd.readAsDataURL(f); });
    const j = await gas('subirExcel', { base64, nombre: f.name });
    $('#syncMsg').innerHTML = `<span class="text-success">✔ Bases actualizadas: ${Object.keys(j.filas || {}).map(k => esc(orgNombre(k)) + ' ' + j.filas[k]).join(' · ')}</span>`;
    cargarInicio();
  } catch (e) { $('#syncMsg').innerHTML = `<span class="text-danger">✖ ${esc(e.message)}</span>`; }
  inp.value = '';
}
function verFecha(f) { $('#sFechas').value = f; ir('resumen'); cargarResumen(); }

// ---------- buscar DNI ----------
let histAct = [], dniAct = '';
function excelHistorial() { if (dniAct) descargar({ dni: dniAct }).catch(e => alert(e.message)); }
async function buscarDNI() {
  const dni = $('#dniIn').value.trim();
  $('#dniErr').textContent = ''; $('#ficha').innerHTML = ''; $('#tHist tbody').innerHTML = ''; $('#hResumen').innerHTML = ''; $('#hCount').textContent = ''; $('#btnHistXls').style.display = 'none';
  if (!dni) { $('#dniErr').innerHTML = '<i class="bi bi-exclamation-circle"></i> Ingresa un número de DNI'; return; }
  if (!/^\d{6,12}$/.test(dni)) { $('#dniErr').innerHTML = '<i class="bi bi-exclamation-circle"></i> El DNI debe contener solo números'; return; }
  const btnB = $('#btnBuscar'); btnB.classList.add('loading'); btnB.disabled = true;
  try {
    const t = await api('/api/trabajador/' + dni);
    const a = t.antiguedad;
    const estCls = t.estado === 'INDETERMINADO' ? 'danger' : t.estado === 'PERIODO DE PRUEBA' ? 'info' : '';
    const aviso = t.en_base ? '' : `<div class="alert alert-warning py-2 small mb-3"><i class="bi bi-exclamation-triangle-fill"></i> <b>No está en la base activa de las organizaciones</b> (cesado o no vigente). Último registro: ${badgeEst(t.ultimo_estatus)} ${dmy(t.ultimo_registro)}. Ficha tomada de su historial.</div>`;
    const reg = t.regimen_clasificado === 'EMPLEADO' ? '<span class="st purple">EMPLEADO — excluido</span>' : t.regimen_clasificado === 'OBRERO' ? '<span class="st ok">OBRERO</span>' : '<span class="st warn">POR DEFINIR</span>';
    const ini = (t.nombre_completo || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    const item = (k, v, ic, cls = '') => `<div class="f-item ${cls}"><div class="k"><i class="bi ${ic}"></i>${k}</div><div class="v">${v || '—'}</div></div>`;
    $('#ficha').innerHTML = `<div class="card p-3 ficha">${aviso}
      <div class="f-head"><div class="f-av">${esc(ini)}</div><div><div class="ficha-nombre">${esc(t.nombre_completo)}</div>
        <div class="f-tags"><span class="emp-tag">${esc(orgNombre(t.empresa))}</span> ${t.en_base ? reg : '<span class="st gris">NO VIGENTE</span>'} <span class="st info">DNI ${esc(dni)}</span></div></div></div>
      <div class="f-grid">
        ${item('Cargo', esc(t.cargo), 'bi-briefcase-fill')}
        ${item('Fundo', esc(t.centro_costo), 'bi-geo-alt-fill')}
        ${item('Régimen', esc(t.regimen), 'bi-file-earmark-text-fill')}
        ${item('Estado contractual', esc(t.estado), 'bi-shield-fill-check', estCls)}
        ${item('Fecha de inicio', dmy(t.fecha_inicio_periodo), 'bi-calendar-plus-fill')}
        ${item('Renovación / Término', `${dmy(t.fecha_inicio_contrato)} → ${dmy(t.fecha_termino_contrato)}`, 'bi-calendar-range-fill')}
        ${item('Antigüedad', `${a.anios}a ${a.meses}m ${a.dias}d`, 'bi-hourglass-split')}
        ${item(`Susp. acumulada ${new Date().getFullYear()}`, `${t.acum_anual} días`, 'bi-pause-circle-fill', t.acum_anual > 90 ? 'danger' : '')}
        ${item('Dirección', `${esc(t.direccion)} — ${esc(t.provincia)}`, 'bi-house-fill', 'span2')}
        ${item('Base actualizada', esc(t.sincronizado_en || '—'), 'bi-database-fill-check', 'span2')}
      </div></div>`;
    histAct = t.historial; dniAct = dni;
    $('#hCount').textContent = `(${t.historial.length} registros)`;
    $('#btnHistXls').style.display = t.historial.length ? '' : 'none';
    const totF = t.historial.filter(h => h.estatus === 'FINIQUITO').length, totS = t.historial.filter(h => /^SUSPENSI/.test(h.estatus || '')).length, totSE = t.historial.filter(h => h.estatus === 'SIN EFECTO').length;
    $('#hResumen').innerHTML = t.historial.length ? `<div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="badge rounded-pill text-bg-danger">${totF} finiquito(s)</span><span class="badge rounded-pill text-bg-warning">${totS} suspensión(es)</span><span class="badge rounded-pill text-bg-secondary">${totSE} sin efecto</span>
      ${t.por_anio.map(a => `<span class="badge rounded-pill" style="background:#e9eef6;color:var(--navy)">${a.anio}: ${a.sus} SPL · ${a.dias} días · ${a.fin} finiq.</span>`).join('')}</div>` : '';
    $('#tHist tbody').innerHTML = t.historial.map((h, i) => `<tr>
      <td class="text-muted">${i + 1}</td><td><b>${dmy(h.fecha_doc)}</b></td><td>${badgeEst(h.estatus)}</td><td>${esc(orgNombre(h.empresa))}</td><td>${dmy(h.fecha_firma)}</td><td>${esc(h.semana_mes)}</td><td>${esc(h.mes)}</td><td>${h.anio ?? ''}</td>
      <td><b>${esc(h.fundo_zona)}</b></td><td>${esc(h.ruta)}</td><td>${esc(h.codigo)}</td>
      <td>${esc(h.fundo)}</td><td>${esc(h.cargo)}</td><td class="${/INDETERMINADO/i.test(h.estado || '') ? 'text-danger fw-bold' : ''}">${esc(h.estado)}</td><td>${h.anios ?? ''}a ${h.meses ?? ''}m ${h.dias ?? ''}d</td>
      <td>${dmy(h.f_inicio)}</td><td>${dmy(h.f_renovacion)}</td><td>${dmy(h.f_termino)}</td>
      <td>${dmy(h.fecha_inicio_sl)}</td><td>${dmy(h.fecha_fin_sl)}</td><td>${dmy(h.fecha_retorno)}</td><td>${h.cant_dias ?? ''}</td><td>${esc(h.estado_retorno)}</td><td>${esc(h.status02)}</td><td>${dmy(h.fecha_pago)}</td>
      <td class="text-wrap" style="min-width:220px;max-width:380px;font-size:12px">${esc(h.observacion)}</td><td>${esc(h.responsable_sector)}</td><td>${esc(h.apoyos)}</td><td>${esc(h.horario_firma)}</td><td>${esc(h.origen)}</td><td class="text-muted">${esc(h.creado_en)}</td></tr>`).join('') || '<tr><td colspan="31" class="empty"><i class="bi bi-inbox"></i>Sin programaciones previas</td></tr>';
  } catch (e) { $('#dniErr').innerHTML = '<i class="bi bi-exclamation-circle"></i> ' + esc(e.message); }
  btnB.classList.remove('loading'); btnB.disabled = false;
}
$('#dniIn').addEventListener('keydown', e => { if (e.key === 'Enter') buscarDNI(); });

// ---------- registro masivo ----------
let catalogosOK = false;
async function cargarCatalogos() {
  if (catalogosOK) return;
  const c = await api('/api/catalogos');
  $('#lFundos').innerHTML = c.fundos.map(f => `<option value="${esc(f)}">`).join('');
  $('#lRutas').innerHTML = c.rutas.map(f => `<option value="${esc(f)}">`).join('');
  $('#lRet').innerHTML = c.estados_retorno.map(f => `<option value="${esc(f)}">`).join('');
  if (!$('#rFechaDoc').value) $('#rFechaDoc').value = hoyISO();
  catalogosOK = true;
}
function toggleSusp() {
  const s = $('#rMedida').value === 'SUSPENSIÓN';
  $('#rSusp').style.display = s ? '' : 'none'; $('#rRetW').style.display = s ? '' : 'none';
}
$('#rMedida').onchange = toggleSusp; toggleSusp();

function datosLote() {
  return {
    medida: $('#rMedida').value, fecha_doc: $('#rFechaDoc').value, fecha_firma: $('#rFechaFirma').value || $('#rFechaDoc').value,
    fecha_inicio_sl: $('#rIni').value, fecha_fin_sl: $('#rFin').value, fundo_zona: $('#rFundo').value.trim().toUpperCase(),
    ruta: $('#rRuta').value.trim().toUpperCase(), codigo: $('#rCodigo').value.trim(), estado_retorno: $('#rRet').value.trim().toUpperCase(),
    observacion: $('#rObs').value.trim().toUpperCase(), dnis: $('#rDnis').value,
  };
}
let previaOK = false;
function paso(n) { document.querySelectorAll('.stepper .stp').forEach((s, i) => s.classList.toggle('on', i < n)); }
async function validar() {
  $('#rErr').textContent = ''; previaOK = false; $('#btnGrabar').disabled = true; paso(2);
  try {
    const v = await api('/api/programacion/validar', { method: 'POST', body: JSON.stringify(datosLote()) });
    pintarPrevia(v);
    previaOK = v.filas.length > 0; $('#btnGrabar').disabled = !previaOK; if (previaOK) paso(3);
  } catch (e) { $('#rErr').textContent = e.message; }
}
function pintarPrevia(v) {
  const f = v.filas;
  const nExc = f.filter(x => x.excluido).length;
  const nAl = f.reduce((s, x) => s + x.alertas.length, 0);
  $('#rTot').innerHTML = [['Encontrados', f.length, ''], ['A grabar', f.length - nExc, 'ok'], ['Excluidos', nExc, 'gris'], ['No encontrados', v.noEncontrados.length, v.noEncontrados.length ? 'bad' : ''], ['Alertas', nAl, nAl ? 'bad' : '']]
    .map(([t, n, c]) => `<span class="stat-chip ${c}"><b>${n}</b> ${t}</span>`).join('');
  // alertas por fundo (solo cantidades)
  const porTipo = {};
  for (const x of f) for (const a of x.alertas) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  const nombres = { INDETERMINADO: 'Indeterminados', SIN_EFECTO: 'Finiquitos → SIN EFECTO', PROXIMO: 'Próximos a indeterminado', EMPLEADO_EXCLUIDO: 'Empleados excluidos', SUSP_30: 'Suspensiones > 30 días', SUSP_ACUM: 'Acumulado anual > 90 días', REGIMEN_POR_DEFINIR: 'Cargo por definir' };
  let html = Object.entries(porTipo).map(([t, n]) => `<span class="me-3 al-${t}"><i class="bi bi-exclamation-triangle"></i> ${nombres[t] || t}: ${n}</span>`).join('');
  if (v.noEncontrados.length) html += `<div class="text-danger small mt-1">No existen en la base: ${v.noEncontrados.join(', ')} → sincroniza las bases si son ingresos recientes.</div>`;
  $('#rAlertas').innerHTML = html ? `<div class="alert alert-light border py-2 small">${html}</div>` : '';
  $('#tPrev tbody').innerHTML = f.map(x => `<tr class="${x.excluido ? 'table-secondary' : ''}">
    <td>${x.dni}</td><td>${esc(x.nombres)}</td><td>${esc(orgNombre(x.empresa))}</td><td>${esc(x.cargo)}</td>
    <td>${x.anios ?? '?'}a ${x.meses ?? '?'}m ${x.dias ?? '?'}d</td><td class="${x.estado === 'INDETERMINADO' ? 'text-danger fw-bold' : ''}">${esc(x.estado)}</td>
    <td>${x.excluido ? '<span class="badge bg-secondary">EXCLUIDO</span>' : badgeEst(x.estatus)}</td>
    <td>${x.cant_dias ?? ''}${x.domingos ? ` <small class="text-muted">(${x.domingos} dom)</small>` : ''}</td><td>${dmy(x.fecha_retorno)}</td><td>${esc(x.status02)}</td>
    <td>${x.alertas.map(a => `<div class="al-${a.tipo}" title="${esc(a.msg)}">${esc(a.msg)}</div>`).join('')}</td></tr>`).join('');
}
async function grabar() {
  if (!previaOK) return;
  if (!confirm('¿Grabar el lote validado?')) return;
  $('#btnGrabar').disabled = true;
  try {
    const r = await api('/api/programacion', { method: 'POST', body: JSON.stringify(datosLote()) });
    let msg = `Grabados: ${r.grabados} · Excluidos (empleados): ${r.excluidos}`;
    const al = Object.entries(r.alertasPorFundo);
    if (al.length) msg += '\n\nAlertas por fundo:\n' + al.map(([f, t]) => `  ${f}: ` + Object.entries(t).map(([k, n]) => `${k}=${n}`).join(', ')).join('\n');
    alert(msg);
    $('#rDnis').value = ''; $('#tPrev tbody').innerHTML = '<tr><td colspan="11" class="empty"><i class="bi bi-check2-circle"></i>Lote grabado. Completa un nuevo lote y presiona <b>Validar información</b></td></tr>'; $('#rAlertas').innerHTML = ''; $('#rTot').innerHTML = ''; previaOK = false; paso(1);
  } catch (e) { $('#rErr').textContent = e.message; $('#btnGrabar').disabled = false; }
}

// ---------- resumen ----------
let fechasAct = [];
$('#sPick').onchange = () => { const v = $('#sPick').value; if (!v) return; const cur = $('#sFechas').value.trim(); $('#sFechas').value = cur ? cur + ', ' + v : v; $('#sPick').value = ''; };
function fechasSel() {
  return $('#sFechas').value.split(',').map(s => s.trim()).map(s => /^(\d{2})\/(\d{2})\/(\d{4})$/.test(s) ? s.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1') : s).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
}
async function cargarResumen() {
  fechasAct = fechasSel();
  if (!fechasAct.length) { $('#sAlertas').innerHTML = '<div class="alert alert-warning py-2"><i class="bi bi-exclamation-triangle-fill"></i> Ingresa al menos una Fecha Doc. válida (AAAA-MM-DD o DD/MM/AAAA), por ejemplo <b>2026-08-20</b>.</div>'; return; }
  const q = fechasAct.join(',');
  const btn = $('#btnConsultar'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Consultando…'; }
  $('#sAlertas').innerHTML = `<div class="alert alert-light border py-2"><span class="spinner-border spinner-border-sm text-primary me-2"></span> Consultando ${fechasAct.map(dmy).join(', ')}… (puede tardar 5–10 s)</div>`;
  try { await cargarResumen_(q); }
  catch (e) { $('#sAlertas').innerHTML = `<div class="alert alert-danger py-2"><i class="bi bi-x-octagon-fill"></i> <b>No se pudo cargar la consulta:</b> ${esc(e.message)}</div>`; console.error(e); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-search"></i> Consultar'; }
}
async function cargarResumen_(q) {
  const r = await api('/api/resumen?fechas=' + q);
  const t = r.totales;
  $('#sKpis').innerHTML = [['Registros', t.registros, ''], ['Finiquitos', t.finiquitos, 'rojo'], ['Suspensiones', t.suspensiones, 'amb'], ['Sin efecto', t.sin_efecto, 'gris'], ['Indeterminados', t.indeterminados, 'rojo'], ['Próximos', t.proximos, 'amb']]
    .map(([n, v, c]) => `<div class="col-6 col-md-2"><div class="kpi-mini ${c}"><div class="t">${n}</div><div class="n">${v}</div></div></div>`).join('');
  let al = '';
  if (r.indeterminados.length) al += `<div class="alert alert-danger py-2"><b>⚠ ALERTA CRÍTICA — PERSONAL INDETERMINADO (${t.indeterminados})</b><br>` + r.indeterminados.map(i => `• <b>${esc(i.fundo)}</b>: ${i.cant} trabajador(es) — Rutas: ${esc(i.rutas.join(', '))}`).join('<br>') + '</div>';
  if (r.proximos.length) al += `<div class="alert alert-warning py-2"><b>⚠ ALERTA PREVENTIVA — PRÓXIMOS A INDETERMINADO (${t.proximos})</b><br>` + r.proximos.map(i => `• <b>${esc(i.fundo)}</b>: ${i.cant}`).join('<br>') + '</div>';
  $('#sAlertas').innerHTML = al;
  pintarDinamica(r);
  $('#tSect tbody').innerHTML = r.sectores.map(s => {
    const ok = s.horario && s.responsable && s.apoyos;
    return `<tr data-f="${s.fecha_doc}" data-s="${esc(s.sector)}"><td>${dmy(s.fecha_doc)}</td><td><b>${esc(s.sector)}</b></td><td class="text-wrap">${esc(s.rutas.join(', '))}</td>
      <td>${s.finiquitos}</td><td>${s.suspensiones}</td><td>${s.sin_efecto}</td><td><b>${s.total}</b></td>
      <td><input class="form-control form-control-sm firma" data-k="horario" value="${esc(s.horario || '')}" placeholder="14:30"></td>
      <td><input class="form-control form-control-sm firma" data-k="responsable" value="${esc(s.responsable || '')}" style="min-width:180px"></td>
      <td><input class="form-control form-control-sm firma" data-k="apoyos" value="${esc(s.apoyos || '')}" style="min-width:180px"></td>
      <td class="rec ${ok ? 'ok' : 'falta'}">${ok ? '✔ COMPLETO' : '✖ FALTA HORARIO O APOYOS'}</td></tr>`;
  }).join('') || '<tr><td colspan="11" class="text-muted">Sin registros para esa(s) fecha(s)</td></tr>';
  document.querySelectorAll('#tSect input.firma').forEach(inp => { if (!puede('programaciones.editar')) { inp.readOnly = true; return; } inp.onchange = () => guardarFirma(inp.closest('tr')); });
  $('#tFin tbody').innerHTML = r.finiquitos.map(f => `<tr><td>${esc(f.fundo)}</td><td><b>${f.cant}</b></td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">—</td></tr>';
  $('#tSus tbody').innerHTML = r.suspensiones.map(s => `<tr><td>${esc(s.fundo)}</td><td>${dmy(s.inicio)}</td><td>${dmy(s.fin)}</td><td>${s.dias}</td><td><b>${s.cant}</b></td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">—</td></tr>';
  const det = await api('/api/programacion?fechas=' + q);
  $('#dCount').textContent = `(${det.length})`;
  $('#tDet tbody').innerHTML = det.map(d => `<tr><td>${d.dni}</td><td>${esc(d.nombres)}</td><td>${esc(orgNombre(d.empresa))}</td><td>${esc(d.fundo_zona)}</td><td>${esc(d.ruta)}</td><td>${badgeEst(d.estatus)}</td><td>${esc(d.estado)}</td><td>${dmy(d.fecha_inicio_sl)}</td><td>${dmy(d.fecha_fin_sl)}</td><td>${d.cant_dias ?? ''}</td><td>${dmy(d.fecha_retorno)}</td><td>${esc(d.status02)}</td><td class="text-wrap">${esc(d.observacion)}</td><td class="text-end">${puede('programaciones.eliminar') ? `<button class="btn-ico danger" title="Eliminar" onclick="eliminar(${d.id})"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="14" class="empty">Sin registros para esa(s) fecha(s)</td></tr>';
}
function pintarDinamica(r) {
  const fechas = r.fechas;
  const nF = fechas.length;
  const celdas = pf => fechas.map(f => `<td class="n">${pf[f] || ''}</td>`).join('');
  let h = `<table class="piv"><thead>
    <tr><th class="grp" colspan="6">PROGRAMACIÓN</th><th class="grp" colspan="${nF}">FECHA DOC.</th><th class="grp" rowspan="2">Total general</th><th class="grp">SECTOR REASIGNADO</th><th class="grp">HORARIO DE FIRMA</th><th class="grp">RESPONSABLE</th><th class="grp">APOYOS</th><th class="grp">RECORDATORIO</th></tr>
    <tr><th>ESTATUS</th><th>SECTOR</th><th>RUTA</th><th>CODIGO</th><th>Cant. Días</th><th>Estado Retorno</th>${fechas.map(f => `<th>${dmy(f)}</th>`).join('')}<th></th><th></th><th></th><th></th><th></th></tr></thead><tbody>`;
  for (const e of r.dinamica) {
    let primeraEst = true;
    for (const s of e.sectores) {
      let primeraSec = true;
      for (const x of s.rutas) {
        h += `<tr class="${primeraEst ? 'est' : ''}"><td>${primeraEst ? esc(e.estatus) : ''}</td><td class="${primeraSec ? 'fw-bold' : ''}">${primeraSec ? esc(s.sector) : ''}</td><td>${esc(x.ruta)}</td><td class="n">${esc(x.codigo)}</td><td class="n">${esc(x.dias)}</td><td>${esc(x.retorno)}</td>${celdas(x.porFecha)}<td class="n"><b>${x.total}</b></td>`;
        if (primeraSec) {
          const ok = s.recordatorio === 'COMPLETO';
          h += `<td><input class="firma-piv" data-f="${s.fecha_doc}" data-s="${esc(s.sector)}" data-k="sector_reasignado" value="${esc(s.sector_reasignado)}"></td>
                <td><input class="firma-piv" data-f="${s.fecha_doc}" data-s="${esc(s.sector)}" data-k="horario" value="${esc(s.horario)}" placeholder="14:30" style="min-width:70px"></td>
                <td><input class="firma-piv" data-f="${s.fecha_doc}" data-s="${esc(s.sector)}" data-k="responsable" value="${esc(s.responsable)}"></td>
                <td><input class="firma-piv" data-f="${s.fecha_doc}" data-s="${esc(s.sector)}" data-k="apoyos" value="${esc(s.apoyos)}"></td>
                <td class="${ok ? 'ok' : 'falta'}">${ok ? '✔ COMPLETO' : '✖ FALTA HORARIO O APOYOS'}</td>`;
        } else h += '<td></td><td></td><td></td><td></td><td></td>';
        h += '</tr>';
        primeraEst = false; primeraSec = false;
      }
      h += `<tr class="sub"><td></td><td colspan="5">Total ${esc(s.sector)}</td>${celdas(s.porFecha)}<td class="n">${s.total}</td><td colspan="5"></td></tr>`;
    }
    h += `<tr class="subest"><td colspan="6">Total ${esc(e.estatus)}</td>${celdas(e.porFecha)}<td class="n">${e.total}</td><td colspan="5"></td></tr>`;
  }
  const tg = {}; let tt = 0;
  for (const e of r.dinamica) { tt += e.total; for (const [f, n] of Object.entries(e.porFecha)) tg[f] = (tg[f] || 0) + n; }
  h += `<tr class="gral"><td colspan="6">Total general</td>${fechas.map(f => `<td class="n">${tg[f] || ''}</td>`).join('')}<td class="n">${tt}</td><td colspan="5"></td></tr></tbody></table>`;
  $('#pivWrap').innerHTML = r.dinamica.length ? h : '<div class="empty">Sin registros para esa(s) fecha(s)</div>';
  document.querySelectorAll('#pivWrap input.firma-piv').forEach(inp => { if (!puede('programaciones.editar')) { inp.readOnly = true; return; } inp.onchange = async () => {
    const tr = inp.closest('tr'); const body = { fecha_doc: inp.dataset.f, sector: inp.dataset.s };
    tr.querySelectorAll('input.firma-piv').forEach(i => body[i.dataset.k] = i.value.trim());
    await api('/api/firmas', { method: 'PUT', body: JSON.stringify(body) });
    const ok = body.horario && body.responsable && body.apoyos; const c = tr.lastElementChild;
    c.className = ok ? 'ok' : 'falta'; c.textContent = ok ? '✔ COMPLETO' : '✖ FALTA HORARIO O APOYOS';
    cargarResumen();
  }; });
}
async function guardarFirma(tr) {
  const body = { fecha_doc: tr.dataset.f, sector: tr.dataset.s };
  tr.querySelectorAll('input.firma').forEach(i => body[i.dataset.k] = i.value.trim());
  await api('/api/firmas', { method: 'PUT', body: JSON.stringify(body) });
  const ok = body.horario && body.responsable && body.apoyos;
  const c = tr.querySelector('.rec'); c.className = 'rec ' + (ok ? 'ok' : 'falta'); c.textContent = ok ? '✔ COMPLETO' : '✖ FALTA HORARIO O APOYOS';
}
async function eliminar(id) {
  if (!confirm('¿Eliminar este registro de la programación?')) return;
  try { await api('/api/programacion/' + id, { method: 'DELETE' }); cargarResumen(); } catch (e) { alert(e.message); }
}
function descargarExcel() {
  const f = fechasAct.length ? fechasAct : fechasSel();
  if (!f.length) return alert('Genera primero el resumen');
  descargar({ fechas: f.join(',') }).catch(e => alert(e.message));
}
async function vistaCorreo() {
  const f = fechasAct.length ? fechasAct : fechasSel();
  if (!f.length) return alert('Genera primero el resumen');
  const c = await api('/api/correo/vista?fechas=' + f.join(','));
  $('#cAsunto').value = orgTexto(c.asunto); $('#cHtml').innerHTML = orgTexto(c.html); $('#cPara').value = c.para; $('#cCC').value = c.cc;
  $('#btnEnviar').disabled = !c.smtp; $('#cMsg').innerHTML = '<span class="text-muted">Se enviará desde tu cuenta de Gmail con el Excel adjunto. También puedes <b>Copiar</b> y pegar en Outlook.</span>';
  new bootstrap.Modal('#mCorreo').show();
}
async function copiarHtml() {
  const el = $('#cHtml');
  try {
    const item = new ClipboardItem({ 'text/html': new Blob([el.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([el.innerText], { type: 'text/plain' }) });
    await navigator.clipboard.write([item]);
    $('#cMsg').innerHTML = '<span class="text-success">Copiado. Pega en Outlook (Ctrl+V).</span>';
  } catch { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); $('#cMsg').textContent = 'Copiado.'; }
}
async function enviarCorreo() {
  $('#btnEnviar').disabled = true;
  try {
    await api('/api/correo/enviar', { method: 'POST', body: JSON.stringify({ fechas: fechasAct.join(','), para: $('#cPara').value, cc: $('#cCC').value }) });
    $('#cMsg').innerHTML = '<span class="text-success">Correo enviado ✔</span>';
  } catch (e) { $('#cMsg').innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; $('#btnEnviar').disabled = false; }
}

// ---------- responsables ----------
async function cargarResp() {
  const r = await api('/api/responsables');
  $('#tResp tbody').innerHTML = r.map(x => `<tr><td><b>${esc(x.fundo)}</b></td><td>${esc(x.analista)}</td><td>${esc(x.correo_analista)}</td><td>${esc(x.supervisor)}</td><td>${esc(x.correo_supervisor)}</td>
    <td class="text-end">${puede('responsables.editar') ? `<button class="btn-ico" title="Editar" onclick='editarResp(${JSON.stringify(x)})'><i class="bi bi-pencil-fill"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin responsables registrados</td></tr>';
}
function editarResp(x) { $('#nFundo').value = x.fundo; $('#nAna').value = x.analista || ''; $('#nAnaC').value = x.correo_analista || ''; $('#nSup').value = x.supervisor || ''; $('#nSupC').value = x.correo_supervisor || ''; $('#nAna').focus(); $('#nFundo').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
async function guardarResp() {
  await api('/api/responsables', { method: 'PUT', body: JSON.stringify({ fundo: $('#nFundo').value, analista: $('#nAna').value, correo_analista: $('#nAnaC').value, supervisor: $('#nSup').value, correo_supervisor: $('#nSupC').value }) });
  ['#nFundo', '#nAna', '#nAnaC', '#nSup', '#nSupC'].forEach(s => $(s).value = ''); cargarResp();
}

// ======================================================
// ---------- utilidades de interfaz (toast, confirmación, contraseñas) ----------
// ======================================================
function toast(msg, tipo = 'ok', ms = 3800) {
  const ic = { ok: 'bi-check-circle-fill', err: 'bi-x-octagon-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[tipo] || 'bi-info-circle-fill';
  const el = document.createElement('div'); el.className = 'toastx ' + tipo; el.innerHTML = `<i class="bi ${ic}"></i><div>${msg}</div>`;
  $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}
// confirmar({titulo, msg, extra:'CONFIRMAR'|'texto', peligro}) → Promise<{ok, extra}>
function confirmar(o) {
  return new Promise(res => {
    $('#cfTit').textContent = o.titulo || 'Confirmar'; $('#cfMsg').innerHTML = o.msg || '';
    $('#cfExtra').innerHTML = o.extra === 'CONFIRMAR' ? '<div class="alert alert-warning py-2 mb-0"><b>Acción sobre el administrador principal.</b> Escribe <b>CONFIRMAR</b> para continuar:<input class="form-control form-control-sm mt-2" id="cfInput" placeholder="CONFIRMAR"></div>' : (o.extra || '');
    const ok = $('#cfOk'); ok.className = 'btn ' + (o.peligro ? 'btn-danger' : 'btn-primary'); ok.textContent = o.btn || 'Confirmar';
    const m = bootstrap.Modal.getOrCreateInstance('#mConfirm'); let done = false;
    ok.onclick = () => { done = true; const inp = $('#cfInput'); m.hide(); res({ ok: true, extra: inp ? inp.value.trim() : '' }); };
    $('#mConfirm').addEventListener('hidden.bs.modal', () => { if (!done) res({ ok: false }); }, { once: true });
    m.show();
  });
}
const PW_RULES = [['8+ caracteres', c => c.length >= 8], ['Mayúscula', c => /[A-Z]/.test(c)], ['Minúscula', c => /[a-z]/.test(c)], ['Número', c => /\d/.test(c)], ['Símbolo', c => /[^A-Za-z0-9]/.test(c)]];
function pwRules(v, id) { $('#' + id).innerHTML = PW_RULES.map(([t, f]) => `<span class="${f(v) ? 'ok' : ''}">${t}</span>`).join(''); }
function pwOk(v) { return PW_RULES.every(([, f]) => f(v)); }
function pwMsg() { return 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.'; }
const fmtFecha = s => s ? String(s).slice(0, 16) : '—';
const stEstado = u => !u.activo ? '<span class="st gris"><i class="bi bi-x-circle-fill"></i> Inactivo</span>' : u.bloqueado ? '<span class="st bad"><i class="bi bi-lock-fill"></i> Bloqueado</span>' : u.vencido ? '<span class="st warn"><i class="bi bi-calendar-x-fill"></i> Vencido</span>' : '<span class="st ok"><i class="bi bi-check-circle-fill"></i> Activo</span>';
const stRol = r => `<span class="st ${r === 'admin' ? 'info' : r === 'gerencia' ? 'purple' : 'gris'}">${esc(r)}</span>`;

// ======================================================
// ---------- mi contraseña ----------
// ======================================================
function abrirMiClave(obligatorio) {
  ['#cActual', '#cNueva', '#cNueva2'].forEach(x => $(x).value = ''); $('#cClaveMsg').innerHTML = ''; pwRules('', 'cRules');
  $('#mClaveAviso').style.display = obligatorio ? '' : 'none'; $('#mClaveClose').style.display = obligatorio ? 'none' : '';
  bootstrap.Modal.getOrCreateInstance('#mClave', { backdrop: 'static', keyboard: !obligatorio }).show();
}
async function cambiarMiClave() {
  const actual = $('#cActual').value, a = $('#cNueva').value, b = $('#cNueva2').value, msg = $('#cClaveMsg');
  if (!actual) { msg.innerHTML = '<span class="text-danger">Ingresa tu contraseña actual</span>'; return; }
  if (!pwOk(a)) { msg.innerHTML = `<span class="text-danger">${pwMsg()}</span>`; return; }
  if (a !== b) { msg.innerHTML = '<span class="text-danger">Las contraseñas no coinciden</span>'; return; }
  try {
    const r = await gas('cambiarClave', { actual, nueva: a, confirmacion: b });
    yoAct.debe_cambiar_clave = false; bootstrap.Modal.getOrCreateInstance('#mClave').hide();
    toast('Contraseña actualizada' + (r.sesiones_cerradas ? ` · ${r.sesiones_cerradas} sesión(es) en otros dispositivos cerradas` : ''));
  } catch (e) { msg.innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
}

// ======================================================
// ---------- PANEL DE CONTROL ----------
// ======================================================
let CAT = null, usuariosAct = [], rolesAct = [], uPag = 1;
const U_POR_PAG = 12;
async function cargarPanel() {
  if (!CAT) { CAT = await gas('catalogoPermisos'); $('#aModulo').innerHTML = '<option value="">Todos los módulos</option>' + CAT.modulos.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('') + '<option value="acceso">Acceso (login/logout)</option>'; }
  const tab = document.querySelector('#pcTabs button.on')?.dataset.tab || 'resumen';
  pcTab(tab, true);
}
function pcTab(t, forzar) {
  if (t === 'usuarios' && !puede('usuarios.ver')) return toast('No tienes acceso a Usuarios', 'warn');
  if (t === 'roles' && !puede('permisos.ver')) return toast('No tienes acceso a Roles y permisos', 'warn');
  if (t === 'auditoria' && !puede('auditoria.ver')) return toast('No tienes acceso a Auditoría', 'warn');
  if (t === 'seguridad' && !puede('seguridad.ver')) return toast('No tienes acceso a Seguridad y sesiones', 'warn');
  document.querySelectorAll('#pcTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pc-tab').forEach(d => d.classList.toggle('on', d.id === 'pc-' + t));
  if (t === 'resumen') cargarResumenPanel();
  if (t === 'usuarios') cargarUsuarios();
  if (t === 'roles') cargarRoles();
  if (t === 'auditoria' && (forzar || !$('#tAud tbody tr td.empty') === false)) cargarAuditoria();
  if (t === 'seguridad') cargarSesiones();
}
// ---------- Resumen ----------
async function cargarResumenPanel() {
  try {
    const r = await gas('panelResumen'); const k = r.kpis;
    $('#pcKpis').innerHTML = [['Total de usuarios', k.usuarios, 'bi-people-fill', 'n'], ['Usuarios activos', k.activos, 'bi-person-check-fill', 'k'], ['Usuarios inactivos', k.inactivos, 'bi-person-dash-fill', 'gr'], ['Usuarios bloqueados', k.bloqueados, 'bi-lock-fill', 'r'],
      ['Sesiones activas', k.sesiones, 'bi-pc-display', 'b'], ['Intentos fallidos (24 h)', k.fallidos24, 'bi-exclamation-octagon-fill', 'w'], ['Roles creados', k.roles, 'bi-diagram-3-fill', 'p'], ['Cambios de permisos (7 d)', k.cambios_permisos7, 'bi-sliders', 'g']]
      .map(([t, v, i, c]) => `<div class="kpi mini"><div class="ic ${c}"><i class="bi ${i}"></i></div><div><div class="lbl">${t}</div><div class="val">${v}</div></div></div>`).join('');
    $('#cntUsr').textContent = k.usuarios;
    $('#pcAlertas').innerHTML = r.alertas.length ? r.alertas.map(a => `<div class="alert alert-${a.tipo === 'danger' ? 'danger' : a.tipo === 'warning' ? 'warning' : 'light border'} py-2 mb-2"><i class="bi ${a.tipo === 'danger' ? 'bi-exclamation-octagon-fill' : a.tipo === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'}"></i> ${esc(a.msg)}</div>`).join('') : '<div class="alert alert-light border py-2 mb-0"><i class="bi bi-shield-check text-success"></i> Sin alertas de seguridad.</div>';
    $('#tAct tbody').innerHTML = r.actividad.map(filaAud).join('') || '<tr><td colspan="6" class="empty">Sin actividad registrada</td></tr>';
  } catch (e) { toast(e.message, 'err'); }
}
const stRes = r => `<span class="st ${r === 'ok' ? 'ok' : r === 'denegado' || r === 'bloqueado' ? 'bad' : 'warn'}">${esc(r)}</span>`;
const filaAud = a => `<tr><td class="text-muted">${fmtFecha(a.fecha_hora)}</td><td><b>${esc(a.actor)}</b></td><td>${esc(a.evento)}</td><td>${esc(a.objetivo)}</td><td>${esc(a.modulo)}</td><td>${stRes(a.resultado)}</td></tr>`;

// ---------- Usuarios ----------
async function cargarUsuarios() {
  try {
    [usuariosAct, rolesAct] = await Promise.all([gas('usuarios'), gas('roles')]);
    $('#cntUsr').textContent = usuariosAct.length;
    const opts = rolesAct.map(r => `<option value="${r.id_rol}">${esc(r.nombre)}</option>`).join('');
    $('#uFRol').innerHTML = '<option value="">Todos los roles</option>' + opts;
    $('#uRol').innerHTML = rolesAct.filter(r => r.activo).map(r => `<option value="${r.id_rol}">${esc(r.nombre)}</option>`).join('');
    $('#permUsuarioSel').innerHTML = '<option value="">— Selecciona un usuario —</option>' + usuariosAct.map(u => `<option value="${u.usuario}">${esc(u.usuario)} · ${esc(u.nombre)}</option>`).join('');
    $('#btnNuevoUsr').style.display = puede('usuarios.crear') ? '' : 'none';
    pintarUsuarios(1);
  } catch (e) { $('#tUsr tbody').innerHTML = `<tr><td colspan="8" class="empty text-danger">${esc(e.message)}</td></tr>`; }
}
function usuariosFiltrados() {
  const q = $('#uBuscar').value.trim().toLowerCase(), rol = $('#uFRol').value, est = $('#uFEstado').value, acc = $('#uFAcceso').value, hoy = Date.now();
  return usuariosAct.filter(u => {
    if (q && !(u.usuario + ' ' + u.nombre + ' ' + u.correo).toLowerCase().includes(q)) return false;
    if (rol && u.rol !== rol) return false;
    if (est === 'activo' && !(u.activo && !u.bloqueado && !u.vencido)) return false;
    if (est === 'inactivo' && u.activo) return false;
    if (est === 'bloqueado' && !u.bloqueado) return false;
    if (est === 'vencido' && !u.vencido) return false;
    if (acc) { const t = u.ultimo_acceso ? new Date(String(u.ultimo_acceso).replace(' ', 'T')).getTime() : 0; const d = (hoy - t) / 86400000;
      if (acc === 'nunca' && t) return false; if (acc === '7' && !(t && d <= 7)) return false; if (acc === '30' && !(t && d <= 30)) return false; if (acc === '90' && !(!t || d > 90)) return false; }
    return true;
  });
}
function pintarUsuarios(pag) {
  const lista = usuariosFiltrados(), tot = lista.length, pags = Math.max(1, Math.ceil(tot / U_POR_PAG));
  uPag = Math.min(pag || uPag, pags);
  const vista = lista.slice((uPag - 1) * U_POR_PAG, uPag * U_POR_PAG);
  const acciones = u => {
    const yo = u.usuario === yoAct.usuario, adm = puede('usuarios.administrar'), ed = puede('usuarios.editar'), seg = puede('seguridad.administrar');
    let items = `<li><a class="dropdown-item" onclick="verDetalle('${u.usuario}')"><i class="bi bi-eye-fill"></i> Ver detalle</a></li>`;
    if (ed) items += `<li><a class="dropdown-item" onclick="editarUsuario('${u.usuario}')"><i class="bi bi-pencil-fill"></i> Editar usuario</a></li>`;
    if (puede('permisos.ver')) items += `<li><a class="dropdown-item" onclick="pcTab('roles');cargarMatriz({usuario:'${u.usuario}'})"><i class="bi bi-sliders"></i> Permisos personalizados</a></li>`;
    if (puede('auditoria.ver')) items += `<li><a class="dropdown-item" onclick="verHistorial('${u.usuario}')"><i class="bi bi-clock-history"></i> Historial de actividad</a></li>`;
    if (adm && !yo) {
      items += '<li><hr class="dropdown-divider"></li>';
      items += u.activo ? `<li><a class="dropdown-item" onclick="opUsuario('${u.usuario}','desactivar')"><i class="bi bi-person-dash-fill"></i> Desactivar</a></li>` : `<li><a class="dropdown-item" onclick="opUsuario('${u.usuario}','activar')"><i class="bi bi-person-check-fill"></i> Activar</a></li>`;
      items += u.bloqueado ? `<li><a class="dropdown-item" onclick="opUsuario('${u.usuario}','desbloquear')"><i class="bi bi-unlock-fill"></i> Desbloquear</a></li>` : `<li><a class="dropdown-item" onclick="opUsuario('${u.usuario}','bloquear')"><i class="bi bi-lock-fill"></i> Bloquear (24 h)</a></li>`;
      items += `<li><a class="dropdown-item" onclick="resetClave('${u.usuario}')"><i class="bi bi-key-fill"></i> Restablecer contraseña</a></li>`;
      items += `<li><a class="dropdown-item" onclick="forzarCambio('${u.usuario}')"><i class="bi bi-arrow-repeat"></i> Forzar cambio de contraseña</a></li>`;
      if (puede('permisos.autorizar')) items += `<li><a class="dropdown-item" onclick="duplicarPermisos('${u.usuario}')"><i class="bi bi-copy"></i> Duplicar permisos desde otro usuario</a></li>`;
    }
    if (seg && u.sesiones) items += `<li><a class="dropdown-item text-danger" onclick="cerrarSesionesDe('${u.usuario}')"><i class="bi bi-door-closed-fill"></i> Cerrar todas sus sesiones (${u.sesiones})</a></li>`;
    return `<div class="dropdown"><button class="btn-ico" data-bs-toggle="dropdown" title="Acciones"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end dd-menu">${items}</ul></div>`;
  };
  $('#tUsr tbody').innerHTML = vista.map(u => `<tr class="${u.activo ? '' : 'table-secondary'}">
    <td><div class="u-name"><b>${esc(u.nombre)}</b><span>@${esc(u.usuario)}${u.usuario === CAT?.admin_principal ? ' · <i class="bi bi-star-fill text-warning"></i> principal' : ''}</span></div></td>
    <td>${esc(u.correo) || '<span class="text-muted">—</span>'}</td><td>${stRol(u.rol)}</td><td>${stEstado(u)}${u.debe_cambiar_clave ? ' <span class="st warn" title="Debe cambiar su contraseña"><i class="bi bi-key"></i></span>' : ''}</td>
    <td class="text-muted">${fmtFecha(u.ultimo_acceso)}</td><td class="text-muted">${fmtFecha(u.creado_en).slice(0, 10)}</td><td>${u.sesiones ? `<span class="st info">${u.sesiones}</span>` : '<span class="text-muted">0</span>'}</td>
    <td><div class="acts">${acciones(u)}</div></td></tr>`).join('') || '<tr><td colspan="8" class="empty"><i class="bi bi-people"></i>Sin usuarios que coincidan</td></tr>';
  $('#uCards').innerHTML = vista.map(u => `<div class="u-card"><div class="top"><div class="u-name"><b>${esc(u.nombre)}</b><span>@${esc(u.usuario)} · ${esc(u.correo || '')}</span></div>${acciones(u)}</div><div class="d-flex gap-2 flex-wrap mt-2">${stRol(u.rol)} ${stEstado(u)} <span class="st gris">Último acceso: ${fmtFecha(u.ultimo_acceso)}</span></div></div>`).join('');
  $('#uCount').textContent = tot ? `Mostrando ${(uPag - 1) * U_POR_PAG + 1}–${Math.min(uPag * U_POR_PAG, tot)} de ${tot} usuario(s)` : '0 resultados';
  let pg = `<button ${uPag === 1 ? 'disabled' : ''} onclick="pintarUsuarios(${uPag - 1})">‹</button>`;
  for (let i = 1; i <= pags; i++) if (pags <= 7 || Math.abs(i - uPag) <= 2 || i === 1 || i === pags) pg += `<button class="${i === uPag ? 'on' : ''}" onclick="pintarUsuarios(${i})">${i}</button>`;
  pg += `<button ${uPag === pags ? 'disabled' : ''} onclick="pintarUsuarios(${uPag + 1})">›</button>`;
  $('#uPag').innerHTML = pg;
}
let uEditando = null;
function nuevoUsuario() {
  uEditando = null; $('#ocTit').textContent = 'Nuevo usuario';
  ['#uUsuario', '#uNombre', '#uCorreo', '#uClave', '#uClave2', '#uObs', '#uVence', '#uConfirmExtra'].forEach(x => $(x).value = '');
  $('#uUsuario').readOnly = false; $('#uRol').value = 'analista'; $('#uActivo').value = 'SI'; $('#uDebe').checked = true; $('#uClaveHint').textContent = '*'; $('#uMsg').innerHTML = ''; pwRules('', 'uRules');
  $('#uConfirmWrap').style.display = 'none'; $('#btnUsrPerm').style.display = 'none';
  bootstrap.Offcanvas.getOrCreateInstance('#ocUsuario').show(); setTimeout(() => $('#uUsuario').focus(), 300);
}
function editarUsuario(usuario) {
  const u = usuariosAct.find(x => x.usuario === usuario); if (!u) return;
  uEditando = u; $('#ocTit').textContent = 'Editar: ' + u.usuario;
  $('#uUsuario').value = u.usuario; $('#uUsuario').readOnly = true; $('#uNombre').value = u.nombre; $('#uCorreo').value = u.correo || ''; $('#uRol').value = u.rol; $('#uActivo').value = u.activo ? 'SI' : 'NO';
  $('#uClave').value = ''; $('#uClave2').value = ''; $('#uClaveHint').textContent = '(vacía = no cambia)'; $('#uDebe').checked = u.debe_cambiar_clave; $('#uVence').value = u.vence_en || ''; $('#uObs').value = u.observacion || ''; $('#uMsg').innerHTML = ''; pwRules('', 'uRules');
  $('#uConfirmWrap').style.display = u.usuario === CAT?.admin_principal ? '' : 'none'; $('#uConfirmExtra').value = '';
  $('#btnUsrPerm').style.display = puede('permisos.ver') ? '' : 'none';
  const yo = u.usuario === yoAct.usuario; $('#uRol').disabled = yo; $('#uActivo').disabled = yo;
  bootstrap.Offcanvas.getOrCreateInstance('#ocUsuario').show();
}
function permisosDelUsuarioActual() { if (uEditando) { bootstrap.Offcanvas.getOrCreateInstance('#ocUsuario').hide(); pcTab('roles'); cargarMatriz({ usuario: uEditando.usuario }); } }
async function guardarUsuario() {
  const b = { usuario: $('#uUsuario').value.trim(), nombre: $('#uNombre').value.trim(), correo: $('#uCorreo').value.trim(), rol: $('#uRol').value, activo: $('#uActivo').value, clave: $('#uClave').value, confirmacion: $('#uClave2').value, debe_cambiar_clave: $('#uDebe').checked ? 'SI' : 'NO', vence_en: $('#uVence').value, observacion: $('#uObs').value.trim(), confirmacion_extra: $('#uConfirmExtra').value.trim() };
  const msg = $('#uMsg');
  if (!b.usuario || !b.nombre) { msg.innerHTML = '<span class="text-danger">Usuario y nombre son obligatorios</span>'; return; }
  if (!uEditando && !b.clave) { msg.innerHTML = '<span class="text-danger">Ingresa la contraseña temporal</span>'; return; }
  if (b.clave && !pwOk(b.clave)) { msg.innerHTML = `<span class="text-danger">${pwMsg()}</span>`; return; }
  if (b.clave !== b.confirmacion) { msg.innerHTML = '<span class="text-danger">Las contraseñas no coinciden</span>'; return; }
  if (b.rol === 'admin' && (!uEditando || uEditando.rol !== 'admin')) { const c = await confirmar({ titulo: 'Otorgar rol Administrador', msg: `<b>${esc(b.usuario)}</b> tendrá acceso completo al sistema, incluida la gestión de usuarios y permisos. ¿Continuar?`, peligro: true }); if (!c.ok) return; }
  if (uEditando && uEditando.activo && b.activo === 'NO') { const c = await confirmar({ titulo: 'Desactivar usuario', msg: `Se desactivará a <b>${esc(b.usuario)}</b> y se cerrarán sus sesiones activas.`, peligro: true }); if (!c.ok) return; }
  $('#btnUsr').disabled = true; msg.innerHTML = '<span class="text-muted">Guardando…</span>';
  try {
    const r = await gas('guardarUsuario', b);
    toast(`Usuario ${r.modo}`); bootstrap.Offcanvas.getOrCreateInstance('#ocUsuario').hide(); cargarUsuarios();
  } catch (e) { msg.innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
  $('#btnUsr').disabled = false;
}
async function opUsuario(usuario, op) {
  const txt = { activar: ['Activar usuario', `Se reactivará el acceso de <b>${esc(usuario)}</b>.`, false], desactivar: ['Desactivar usuario', `Se desactivará a <b>${esc(usuario)}</b> y se cerrarán sus sesiones. El historial se conserva.`, true], bloquear: ['Bloquear usuario', `<b>${esc(usuario)}</b> no podrá ingresar durante 24 horas y sus sesiones se cerrarán.`, true], desbloquear: ['Desbloquear usuario', `Se retirará el bloqueo de <b>${esc(usuario)}</b> y se reiniciarán sus intentos fallidos.`, false] }[op];
  const c = await confirmar({ titulo: txt[0], msg: txt[1], peligro: txt[2], extra: usuario === CAT?.admin_principal ? 'CONFIRMAR' : '' }); if (!c.ok) return;
  try { const r = await gas('estadoUsuario', { usuario, operacion: op, confirmacion_extra: c.extra }); toast(txt[0] + ' ✔' + (r.sesiones_cerradas ? ` · sesiones cerradas: ${r.sesiones_cerradas}` : '')); cargarUsuarios(); } catch (e) { toast(e.message, 'err', 6000); }
}
async function resetClave(usuario) {
  const c = await confirmar({ titulo: 'Restablecer contraseña', msg: `Define una contraseña temporal para <b>${esc(usuario)}</b>. Sus sesiones se cerrarán y deberá cambiarla al ingresar.`, btn: 'Restablecer', peligro: true,
    extra: `<label class="form-label small">Nueva contraseña temporal</label><input class="form-control mb-2" id="rcClave" type="text" autocomplete="off" oninput="pwRules(this.value,'rcRules')"><div class="pw-rules mb-2" id="rcRules"></div><label class="form-label small">Confirmar</label><input class="form-control" id="rcClave2" type="text" autocomplete="off">${usuario === CAT?.admin_principal ? '<input class="form-control form-control-sm mt-2" id="cfInput" placeholder="Escribe CONFIRMAR (administrador principal)">' : ''}` });
  if (!c.ok) return;
  const clave = $('#rcClave')?.value || '', conf = $('#rcClave2')?.value || '';
  if (!pwOk(clave)) return toast(pwMsg(), 'warn', 6000); if (clave !== conf) return toast('Las contraseñas no coinciden', 'warn');
  try { const r = await gas('resetClave', { usuario, clave, confirmacion: conf, confirmacion_extra: c.extra }); toast(`Contraseña restablecida · sesiones cerradas: ${r.sesiones_cerradas}`); cargarUsuarios(); } catch (e) { toast(e.message, 'err', 6000); }
}
async function forzarCambio(usuario) {
  const c = await confirmar({ titulo: 'Forzar cambio de contraseña', msg: `<b>${esc(usuario)}</b> deberá cambiar su contraseña en su próximo ingreso.` }); if (!c.ok) return;
  try { await gas('forzarCambio', { usuario }); toast('Cambio de contraseña forzado'); cargarUsuarios(); } catch (e) { toast(e.message, 'err'); }
}
async function cerrarSesionesDe(usuario) {
  const c = await confirmar({ titulo: 'Cerrar sesiones', msg: `Se cerrarán todas las sesiones activas de <b>${esc(usuario)}</b>.`, peligro: true }); if (!c.ok) return;
  try { const r = await gas('cerrarSesionesUsuario', { usuario }); toast(`Sesiones cerradas: ${r.sesiones_cerradas}`); cargarUsuarios(); if ($('#pc-seguridad').classList.contains('on')) cargarSesiones(); } catch (e) { toast(e.message, 'err'); }
}
async function duplicarPermisos(destino) {
  const opts = usuariosAct.filter(u => u.usuario !== destino).map(u => `<option value="${u.usuario}">${esc(u.usuario)} · ${esc(u.nombre)} (${esc(u.rol)})</option>`).join('');
  const c = await confirmar({ titulo: 'Duplicar permisos', msg: `<b>${esc(destino)}</b> quedará con los mismos permisos efectivos que el usuario elegido (se registran como excepciones sobre su rol).`, btn: 'Duplicar', extra: `<label class="form-label small">Copiar desde</label><select class="form-select" id="dpOrigen">${opts}</select>${destino === CAT?.admin_principal ? '<input class="form-control form-control-sm mt-2" id="cfInput" placeholder="Escribe CONFIRMAR (administrador principal)">' : ''}` });
  if (!c.ok) return;
  try { const r = await gas('copiarPermisos', { origen: $('#dpOrigen').value, destino, confirmacion_extra: c.extra }); toast(`Permisos duplicados · ${r.overrides} excepción(es)`); } catch (e) { toast(e.message, 'err', 6000); }
}
async function verDetalle(usuario) {
  $('#dTit').textContent = usuario; $('#dBody').innerHTML = '<div class="empty">Cargando…</div>'; bootstrap.Modal.getOrCreateInstance('#mDetalle').show();
  try {
    const u = await gas('usuarioDetalle', { usuario });
    const item = (k, v) => `<div class="f-item"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
    $('#dBody').innerHTML = `<div class="f-grid" style="grid-template-columns:repeat(3,1fr)">
      ${item('Nombre', esc(u.nombre))}${item('Correo', esc(u.correo))}${item('Rol', stRol(u.rol))}${item('Estado', stEstado(u))}${item('Sesiones activas', u.sesiones)}${item('Intentos fallidos', u.intentos_fallidos)}
      ${item('Último acceso', fmtFecha(u.ultimo_acceso))}${item('Último cambio de clave', fmtFecha(u.ultimo_cambio_clave))}${item('Debe cambiar clave', u.debe_cambiar_clave ? 'Sí' : 'No')}
      ${item('Creado', `${fmtFecha(u.creado_en)} · ${esc(u.creado_por)}`)}${item('Actualizado', `${fmtFecha(u.actualizado_en)} · ${esc(u.actualizado_por)}`)}${item('Vence el acceso', u.vence_en || '—')}
      <div class="f-item span2" style="grid-column:span 3"><div class="k">Observación</div><div class="v">${esc(u.observacion) || '—'}</div></div></div>
      <h6 class="mt-3"><i class="bi bi-shield-check"></i> Permisos efectivos <span class="hint">(${u.efectivos.length})</span></h6>
      <div class="d-flex flex-wrap gap-1">${u.efectivos.map(p => `<span class="st ${u.overrides.some(o => o.permiso === p && o.permitido) ? 'warn' : 'gris'}">${p}</span>`).join('') || '<span class="text-muted">Sin permisos</span>'}</div>
      ${u.overrides.length ? `<h6 class="mt-3"><i class="bi bi-sliders"></i> Excepciones individuales</h6><div class="d-flex flex-wrap gap-1">${u.overrides.map(o => `<span class="st ${o.permitido ? 'ok' : 'bad'}">${o.permitido ? '+' : '−'} ${o.permiso}</span>`).join('')}</div>` : ''}`;
  } catch (e) { $('#dBody').innerHTML = `<div class="empty text-danger">${esc(e.message)}</div>`; }
}
async function verHistorial(usuario) {
  $('#dTit').textContent = 'Historial de ' + usuario; $('#dBody').innerHTML = '<div class="empty">Cargando…</div>'; bootstrap.Modal.getOrCreateInstance('#mDetalle').show();
  try { const h = await gas('historialUsuario', { usuario }); $('#dBody').innerHTML = `<div class="table-wrap"><table class="table tbl"><thead><tr><th>Fecha</th><th>Actor</th><th>Evento</th><th>Afectado</th><th>Módulo</th><th>Resultado</th></tr></thead><tbody>${h.map(filaAud).join('') || '<tr><td colspan="6" class="empty">Sin actividad</td></tr>'}</tbody></table></div>`; }
  catch (e) { $('#dBody').innerHTML = `<div class="empty text-danger">${esc(e.message)}</div>`; }
}

// ---------- Roles ----------
let rolSel = null;
async function cargarRoles() {
  try {
    rolesAct = await gas('roles');
    if (!usuariosAct.length && puede('usuarios.ver')) { usuariosAct = await gas('usuarios'); $('#permUsuarioSel').innerHTML = '<option value="">— Selecciona un usuario —</option>' + usuariosAct.map(u => `<option value="${u.usuario}">${esc(u.usuario)} · ${esc(u.nombre)}</option>`).join(''); }
    $('#btnNuevoRol').style.display = puede('permisos.crear') ? '' : 'none';
    $('#rolList').innerHTML = rolesAct.map(r => `<div class="rol-card ${rolSel === r.id_rol ? 'on' : ''}" onclick="cargarMatriz({id_rol:'${r.id_rol}'})">
      <div class="d-flex justify-content-between align-items-start gap-2"><b>${esc(r.nombre)} ${r.es_sistema ? '<i class="bi bi-patch-check-fill text-primary" title="Rol de sistema"></i>' : ''}</b>${puede('permisos.editar') ? `<button class="btn-ico" title="Editar rol" onclick="event.stopPropagation();editarRol('${r.id_rol}')"><i class="bi bi-pencil-fill"></i></button>` : ''}</div>
      <small>${esc(r.descripcion)}</small>
      <div class="meta"><span class="st ${r.activo ? 'ok' : 'gris'}">${r.activo ? 'Activo' : 'Inactivo'}</span><span class="st gris"><i class="bi bi-people-fill"></i> ${r.usuarios}</span><span class="st info">${r.permisos} permisos</span></div>
      <small class="mt-1">Creado ${fmtFecha(r.creado_en).slice(0, 10)} · ${esc(r.creado_por)}</small></div>`).join('');
    $('#mxCopiar').innerHTML = rolesAct.map(r => `<li><a class="dropdown-item" onclick="mxCopiarDe('${r.id_rol}')"><i class="bi bi-diagram-3"></i> ${esc(r.nombre)}</a></li>`).join('');
  } catch (e) { toast(e.message, 'err'); }
}
async function nuevoRol() {
  const c = await confirmar({ titulo: 'Nuevo rol', btn: 'Crear rol', extra: `<label class="form-label small">Nombre *</label><input class="form-control mb-2" id="nrNombre" placeholder="ej. Supervisor de campo"><label class="form-label small">Descripción</label><input class="form-control mb-2" id="nrDesc"><label class="form-label small">Copiar permisos de</label><select class="form-select" id="nrCopiar"><option value="">— Sin permisos iniciales —</option>${rolesAct.filter(r => r.id_rol !== 'admin').map(r => `<option value="${r.id_rol}">${esc(r.nombre)}</option>`).join('')}</select>` });
  if (!c.ok) return;
  try { const r = await gas('guardarRol', { nombre: $('#nrNombre').value, descripcion: $('#nrDesc').value, copiar_de: $('#nrCopiar').value }); toast('Rol creado'); await cargarRoles(); cargarMatriz({ id_rol: r.id_rol }); } catch (e) { toast(e.message, 'err', 6000); }
}
async function editarRol(id) {
  const r = rolesAct.find(x => x.id_rol === id); if (!r) return;
  const c = await confirmar({ titulo: 'Editar rol', btn: 'Guardar', extra: `<label class="form-label small">Nombre</label><input class="form-control mb-2" id="nrNombre" value="${esc(r.nombre)}"><label class="form-label small">Descripción</label><input class="form-control mb-2" id="nrDesc" value="${esc(r.descripcion)}"><label class="form-label small">Estado</label><select class="form-select" id="nrActivo" ${id === 'admin' ? 'disabled' : ''}><option value="SI" ${r.activo ? 'selected' : ''}>Activo</option><option value="NO" ${!r.activo ? 'selected' : ''}>Inactivo</option></select>` });
  if (!c.ok) return;
  try { await gas('guardarRol', { id_rol: id, nombre: $('#nrNombre').value, descripcion: $('#nrDesc').value, activo: $('#nrActivo').value }); toast('Rol actualizado'); cargarRoles(); } catch (e) { toast(e.message, 'err', 6000); }
}

// ---------- Matriz de permisos ----------
let MX = null;   // { tipo, id, base:{}, actual:{}, rolBase:{} }
async function cargarMatriz(q) {
  try {
    const r = await gas('permisos', q);
    if (q.id_rol) { rolSel = q.id_rol; $('#permUsuarioSel').value = ''; const base = {}; r.permisos.forEach(p => base[p] = true); MX = { tipo: 'rol', id: r.id, base, actual: { ...base }, editable: r.editable && puede('permisos.autorizar') }; $('#mxTitulo').textContent = 'Permisos del rol: ' + (rolesAct.find(x => x.id_rol === r.id)?.nombre || r.id); }
    else { rolSel = null; const rolBase = {}; r.permisos_rol.forEach(p => rolBase[p] = true); const base = {}; r.efectivos.forEach(p => base[p] = true); MX = { tipo: 'usuario', id: r.id, rol: r.rol, base, actual: { ...base }, rolBase, editable: puede('permisos.autorizar') && r.id !== yoAct.usuario }; $('#mxTitulo').textContent = `Permisos de ${r.id} (rol ${r.rol} + excepciones)`; }
    document.querySelectorAll('.rol-card').forEach(c => c.classList.toggle('on', c.textContent.includes(rolesAct.find(x => x.id_rol === rolSel)?.nombre || '§')));
    pintarMatriz();
  } catch (e) { toast(e.message, 'err'); }
}
function pintarMatriz() {
  if (!MX) return;
  const crit = new Set(CAT.criticos), acc = CAT.acciones, ACC_N = { ver: 'Ver', crear: 'Crear', registrar: 'Registrar', editar: 'Editar', eliminar: 'Eliminar', exportar: 'Exportar', enviar_correo: 'Enviar correo', actualizar_bases: 'Actualizar bases', administrar: 'Administrar', autorizar: 'Autorizar permisos' };
  let h = `<table class="matrix"><thead><tr><th>Módulo</th>${acc.map(a => `<th>${ACC_N[a] || a}${MX.editable ? `<span class="col-all" onclick="mxCol('${a}')">toda la columna</span>` : ''}</th>`).join('')}</tr></thead><tbody>`;
  CAT.modulos.forEach(m => {
    h += `<tr data-mod="${m.id}" data-nombre="${esc(m.nombre).toLowerCase()}"><td>${esc(m.nombre)}${MX.editable ? `<span class="row-all" onclick="mxFila('${m.id}')">toda la fila</span>` : ''}</td>`;
    acc.forEach(a => {
      const k = m.id + '.' + a, aplica = m.acciones.includes(a);
      if (!aplica) { h += '<td class="na">·</td>'; return; }
      const on = !!MX.actual[k], chg = !!MX.actual[k] !== !!MX.base[k], inh = MX.tipo === 'usuario' && !!MX.rolBase[k] && on && !chg;
      h += `<td class="${chg ? 'chg' : ''} ${inh ? 'inh' : ''} ${crit.has(k) ? 'crit' : ''}" data-k="${k}"><input type="checkbox" ${on ? 'checked' : ''} ${MX.editable ? '' : 'disabled'} onchange="mxSet('${k}',this.checked)" title="${k}${crit.has(k) ? ' (crítico)' : ''}"></td>`;
    });
    h += '</tr>';
  });
  $('#mxWrap').innerHTML = h + '</tbody></table>';
  if (!MX.editable) $('#mxWrap').insertAdjacentHTML('afterbegin', `<div class="alert alert-light border py-2 m-2 mb-0"><i class="bi bi-lock-fill"></i> ${MX.tipo === 'rol' && MX.id === 'admin' ? 'El rol Administrador es de sistema y conserva acceso completo.' : MX.tipo === 'usuario' && MX.id === yoAct.usuario ? 'No puedes modificar tus propios permisos.' : 'Solo lectura: no tienes permiso para autorizar permisos.'}</div>`);
  mxFiltrar(); mxActualizarBoton();
}
function mxCambios() { const add = [], del = []; new Set([...Object.keys(MX.base), ...Object.keys(MX.actual)]).forEach(k => { const a = !!MX.actual[k], b = !!MX.base[k]; if (a && !b) add.push(k); if (!a && b) del.push(k); }); return { add, del }; }
function mxActualizarBoton() { const { add, del } = mxCambios(); const n = add.length + del.length; $('#btnMxGuardar').disabled = !n || !MX.editable; $('#mxCnt').textContent = n ? n : ''; }
function mxSet(k, v) { if (v) MX.actual[k] = true; else delete MX.actual[k]; const td = document.querySelector(`.matrix td[data-k="${k}"]`); if (td) td.classList.toggle('chg', !!MX.actual[k] !== !!MX.base[k]); mxActualizarBoton(); }
function mxFila(mod) { const m = CAT.modulos.find(x => x.id === mod), todos = m.acciones.every(a => MX.actual[mod + '.' + a]); m.acciones.forEach(a => { if (todos) delete MX.actual[mod + '.' + a]; else MX.actual[mod + '.' + a] = true; }); pintarMatriz(); }
function mxCol(a) { const ms = CAT.modulos.filter(m => m.acciones.includes(a)), todos = ms.every(m => MX.actual[m.id + '.' + a]); ms.forEach(m => { if (todos) delete MX.actual[m.id + '.' + a]; else MX.actual[m.id + '.' + a] = true; }); pintarMatriz(); }
function mxTodos(v) { if (!MX?.editable) return; MX.actual = {}; if (v) CAT.modulos.forEach(m => m.acciones.forEach(a => MX.actual[m.id + '.' + a] = true)); pintarMatriz(); }
function mxRestablecer() { if (!MX) return; MX.actual = { ...MX.base }; pintarMatriz(); }
async function mxCopiarDe(rol) { if (!MX?.editable) return; try { const r = await gas('permisos', { id_rol: rol }); MX.actual = {}; r.permisos.forEach(p => MX.actual[p] = true); pintarMatriz(); toast('Permisos copiados de ' + rol + ' (sin guardar)', 'info'); } catch (e) { toast(e.message, 'err'); } }
function mxFiltrar() { const q = $('#mxBuscar').value.trim().toLowerCase(), solo = $('#mxSoloActivos').checked; document.querySelectorAll('.matrix tbody tr').forEach(tr => { const ok = (!q || tr.dataset.nombre.includes(q)) && (!solo || [...tr.querySelectorAll('input')].some(i => i.checked)); tr.classList.toggle('hide', !ok); }); }
async function mxResumen() {
  const { add, del } = mxCambios(); if (!add.length && !del.length) return;
  const crit = new Set(CAT.criticos), critDel = del.filter(k => crit.has(k)), critAdd = add.filter(k => crit.has(k));
  const c = await confirmar({ titulo: `Guardar permisos de ${MX.id}`, btn: 'Guardar', peligro: critDel.length > 0,
    msg: `<div class="diff">${add.length ? `<div class="add"><b><i class="bi bi-plus-circle-fill"></i> Se agregarán (${add.length}):</b><br>${add.map(esc).join(', ')}</div>` : ''}${del.length ? `<div class="del mt-2"><b><i class="bi bi-dash-circle-fill"></i> Se retirarán (${del.length}):</b><br>${del.map(esc).join(', ')}</div>` : ''}${critDel.length || critAdd.length ? `<div class="alert alert-warning py-2 mt-2 mb-0"><i class="bi bi-exclamation-triangle-fill"></i> Involucra permisos críticos${critDel.length ? '; se cerrarán las sesiones de los usuarios afectados' : ''}.</div>` : ''}${MX.tipo === 'usuario' ? '<div class="text-muted mt-2">Los cambios se guardan como excepciones sobre el rol del usuario.</div>' : ''}</div>`,
    extra: MX.tipo === 'usuario' && MX.id === CAT.admin_principal ? 'CONFIRMAR' : '' });
  if (!c.ok) return;
  try {
    if (MX.tipo === 'rol') await gas('guardarPermisosRol', { id_rol: MX.id, permisos: Object.keys(MX.actual) });
    else { const ov = []; new Set([...Object.keys(MX.rolBase), ...Object.keys(MX.actual)]).forEach(k => { const a = !!MX.actual[k], r = !!MX.rolBase[k]; if (a !== r) ov.push({ permiso: k, permitido: a }); }); await gas('guardarPermisosUsuario', { usuario: MX.id, overrides: ov, confirmacion_extra: c.extra }); }
    toast('Permisos guardados'); await cargarRoles(); cargarMatriz(MX.tipo === 'rol' ? { id_rol: MX.id } : { usuario: MX.id });
  } catch (e) { toast(e.message, 'err', 7000); }
}

// ---------- Auditoría ----------
async function cargarAuditoria() {
  $('#tAud tbody').innerHTML = '<tr><td colspan="10" class="empty">Consultando…</td></tr>';
  try {
    const f = { usuario: $('#aUsuario').value.trim(), modulo: $('#aModulo').value, accion: $('#aAccion').value.trim(), resultado: $('#aResultado').value, desde: $('#aDesde').value, hasta: $('#aHasta').value };
    const r = await gas('auditoria', { filtros: f, limite: 500 });
    $('#lEventos').innerHTML = [...new Set(r.map(a => a.evento))].map(e => `<option value="${esc(e)}">`).join('');
    $('#tAud tbody').innerHTML = r.map(a => `<tr><td class="text-muted">${fmtFecha(a.fecha_hora)}</td><td><b>${esc(a.actor)}</b></td><td>${esc(a.evento)}</td><td>${esc(a.modulo)}</td><td>${esc(a.accion)}</td><td>${esc(a.objetivo)}</td><td class="text-wrap" style="max-width:220px;font-size:12px">${esc(a.valor_anterior)}</td><td class="text-wrap" style="max-width:220px;font-size:12px">${esc(a.valor_nuevo)}</td><td>${stRes(a.resultado)}</td><td class="text-wrap" style="max-width:220px;font-size:12px">${esc(a.observacion)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Sin eventos para esos filtros</td></tr>';
    $('#aCount').textContent = `${r.length} evento(s) · se muestran los más recientes (máx. 500)`;
    $('#btnAudXls').style.display = puede('auditoria.exportar') ? '' : 'none';
  } catch (e) { $('#tAud tbody').innerHTML = `<tr><td colspan="10" class="empty text-danger">${esc(e.message)}</td></tr>`; }
}
async function exportarAuditoria() {
  try { const f = { usuario: $('#aUsuario').value.trim(), modulo: $('#aModulo').value, accion: $('#aAccion').value.trim(), resultado: $('#aResultado').value, desde: $('#aDesde').value, hasta: $('#aHasta').value }; const r = await gas('auditoriaExcel', { filtros: f, limite: 2000 }); window.open(r.url, '_blank'); toast('Exportación generada'); } catch (e) { toast(e.message, 'err'); }
}

// ---------- Seguridad y sesiones ----------
let sesionesAct = [];
async function cargarSesiones() {
  try {
    sesionesAct = await gas('sesiones'); pintarSesiones();
    const bloq = (usuariosAct.length ? usuariosAct : await gas('usuarios').catch(() => [])).filter(u => u.bloqueado);
    $('#sBloq').innerHTML = bloq.length ? bloq.map(u => `<div class="d-flex justify-content-between align-items-center gap-2 mb-2"><div><b>${esc(u.usuario)}</b><div class="text-muted" style="font-size:11.5px">hasta ${esc(u.bloqueado_hasta)}</div></div>${puede('usuarios.administrar') ? `<button class="btn btn-light btn-sm" onclick="opUsuario('${u.usuario}','desbloquear')"><i class="bi bi-unlock-fill"></i> Desbloquear</button>` : ''}</div>`).join('') : '<span class="text-muted">Ninguna cuenta bloqueada</span>';
    $('#btnCerrarOtras').style.display = puede('seguridad.administrar') ? '' : 'none';
  } catch (e) { toast(e.message, 'err'); }
}
function pintarSesiones() {
  const f = $('#sFEstado').value, lista = sesionesAct.filter(s => !f || s.estado === f);
  $('#sCount').textContent = `(${lista.length})`;
  $('#tSes tbody').innerHTML = lista.map(s => `<tr class="${s.actual ? 'table-primary' : ''}"><td><b>${esc(s.usuario)}</b>${s.actual ? ' <span class="st info">esta sesión</span>' : ''}</td><td class="text-muted">${fmtFecha(s.inicio)}</td><td class="text-muted">${fmtFecha(s.ultima_actividad)}</td><td class="text-muted">${fmtFecha(s.vencimiento)}</td><td><span class="st ${s.estado === 'activa' ? 'ok' : s.estado === 'vencida' ? 'warn' : 'gris'}">${s.estado}</span></td><td class="text-muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(s.dispositivo)}">${esc(s.dispositivo).slice(0, 48) || '—'}</td>
    <td class="text-end">${s.estado === 'activa' && !s.actual && puede('seguridad.administrar') ? `<button class="btn-ico danger" title="Cerrar sesión" onclick="cerrarSesionId('${s.id_sesion}','${esc(s.usuario)}')"><i class="bi bi-x-lg"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin sesiones</td></tr>';
}
async function cerrarSesionId(id, usuario) {
  const c = await confirmar({ titulo: 'Cerrar sesión', msg: `Se cerrará la sesión de <b>${esc(usuario)}</b>.`, peligro: true }); if (!c.ok) return;
  try { await gas('cerrarSesion', { id_sesion: id }); toast('Sesión cerrada'); cargarSesiones(); } catch (e) { toast(e.message, 'err'); }
}
async function cerrarMisOtras() {
  const c = await confirmar({ titulo: 'Cerrar mis otras sesiones', msg: 'Se cerrarán todas tus sesiones excepto la actual.' }); if (!c.ok) return;
  try { const r = await gas('cerrarSesionesUsuario', { usuario: yoAct.usuario, excepto_actual: true }); toast(`Sesiones cerradas: ${r.sesiones_cerradas}`); cargarSesiones(); } catch (e) { toast(e.message, 'err'); }
}

// ---------- marca, organización activa, notificaciones, acerca de ----------
function aplicarMarca() {
  const B = window.BRAND_CONFIG || {};
  try { document.title = B.brandName + ' · ' + B.platformName; } catch {}
  if (B.copyright) $('#footTxt').textContent = B.copyright;
  $('#orgChips').innerHTML = Object.keys(window.ORGANIZATION_DISPLAY || {}).map(k => `<span class="pill" data-org="${esc(k)}"><i class="bi bi-building"></i>${esc(orgNombre(k))}</span>`).join('');
}
function abrirAcerca() {
  const B = window.BRAND_CONFIG || {}, A = B.about || {};
  const item = (k, v, link) => `<div class="f-item"><div class="k">${k}</div><div class="v ${v ? '' : 'pend'}">${v ? (link ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)) : 'Por configurar'}</div></div>`;
  $('#acercaBody').innerHTML = `<img class="about-logo" src="${(window.LOGO_ASSETS || {}).horizontal || 'assets/talveniq-logo.png'}" alt="${esc(B.brandName)}">
    <div class="text-center"><b style="font-size:16px;color:var(--navy);letter-spacing:1px">${esc(B.brandName)}</b><div style="font-size:11.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--navy-3);font-weight:600">${esc(B.taglineTitle)}</div></div>
    <p class="mt-3" style="line-height:1.6">${esc(A.description || '')}</p>
    <div class="text-center" style="font-size:13px"><b>${esc(B.managedBy && B.managedBy.replace('administrado', 'proporcionado') || 'Servicio tecnológico proporcionado por ' + B.brandName)}</b><div class="text-muted" style="font-size:12px;margin-top:3px">${esc(B.founderLabel)}</div></div>
    <div class="about-grid">${item('Versión del sistema', B.version)}${item('Última actualización', B.lastUpdate)}${item('Términos de servicio', A.termsUrl, true)}${item('Política de privacidad', A.privacyUrl, true)}${item('Canal de soporte', A.supportChannel)}${item('Correo corporativo', A.corporateEmail)}</div>
    <div class="text-center text-muted mt-3" style="font-size:11.5px">${esc(B.copyright)}</div>`;
  bootstrap.Modal.getOrCreateInstance('#mAcerca').show();
}
let notifCache = null;
async function cargarNotificaciones() {
  const body = $('#notifBody');
  const base = [];
  if (yoAct && yoAct.debe_cambiar_clave) base.push({ tipo: 'warning', msg: 'Debes cambiar tu contraseña.' });
  if (!puede('panel.ver')) { body.innerHTML = base.length ? base.map(nItem).join('') : '<div class="empty">Sin notificaciones</div>'; return; }
  body.innerHTML = '<div class="empty">Cargando…</div>';
  try {
    const r = await gas('panelResumen'); notifCache = r;
    const lista = base.concat(r.alertas || []);
    const k = r.kpis || {};
    if (k.fallidos24) lista.push({ tipo: 'info', msg: `${k.fallidos24} intento(s) de ingreso fallido(s) en las últimas 24 h.` });
    body.innerHTML = lista.length ? lista.map(nItem).join('') : '<div class="ni ok"><i class="bi bi-check-circle-fill"></i><div>Sin alertas de seguridad. Todo en orden.</div></div>';
    $('#notifDot').hidden = !(r.alertas || []).some(a => a.tipo === 'danger' || a.tipo === 'warning');
  } catch (e) { body.innerHTML = `<div class="empty text-danger">${esc(e.message)}</div>`; }
}
const nItem = a => `<div class="ni ${a.tipo}"><i class="bi ${a.tipo === 'danger' ? 'bi-exclamation-octagon-fill' : a.tipo === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'}"></i><div>${esc(orgTexto(a.msg))}</div></div>`;

// ---------- arranque ----------
(async () => {
  let yo; try { yo = await api('/api/yo'); } catch { return; }
  if (!yo || !yo.usuario) { location.href = 'index.html'; return; }
  yoAct = yo; PERM = yo.permisos || {};
  if (yo.organizaciones) Object.assign(window.ORGANIZATION_DISPLAY, yo.organizaciones);   // alias configurados por el administrador (pestaña config)
  aplicarMarca();
  $('#quien').textContent = yo.nombre; $('#rol').textContent = yo.rol; $('#avatar').textContent = (yo.nombre || 'U').trim()[0].toUpperCase();
  $('#hoyTxt').textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  aplicarPermisosUI();
  const destino = location.hash.replace('#', '') || primerModulo();
  ir(destino);
  if (yo.debe_cambiar_clave) abrirMiClave(true);
  if (puede('panel.ver')) gas('panelResumen').then(r => { $('#notifDot').hidden = !(r.alertas || []).some(a => a.tipo === 'danger' || a.tipo === 'warning'); }).catch(() => {});
})();
