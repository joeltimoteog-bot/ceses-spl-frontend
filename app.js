'use strict';
// ======================================================
// Programación de Ceses / SPL Web — frontend
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
  if (j && j.error) throw new Error(j.error);
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
  inicio: ['Inicio', 'Estado general del sistema'],
  dni: ['Buscar DNI', 'Ficha del trabajador, antigüedad e historial'],
  registro: ['Registro masivo', 'Suspensiones, finiquitos y sin efecto por lote'],
  resumen: ['Resumen por Fecha Doc.', 'Lo programado por sector, firmas y correo'],
  responsables: ['Responsables', 'Analista y supervisor por fundo'],
};
function ir(p) {
  if (!TITULOS[p]) p = 'inicio';
  document.querySelectorAll('.pantalla').forEach(s => s.classList.toggle('activa', s.id === 'p-' + p));
  document.querySelectorAll('.menu a[data-p]').forEach(a => a.classList.toggle('active', a.dataset.p === p));
  $('#titulo').textContent = TITULOS[p][0]; $('#subtitulo').textContent = TITULOS[p][1];
  document.getElementById('sidebar').classList.remove('open');
  const c = $('.content'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  if (p === 'inicio') cargarInicio();
  if (p === 'responsables') cargarResp();
  if (p === 'registro') cargarCatalogos();
}
document.querySelectorAll('.menu a[data-p]').forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.p); location.hash = a.dataset.p; });
async function salir() { await api('/api/logout', { method: 'POST' }); location.href = 'index.html'; }

// ---------- inicio ----------
async function cargarInicio() {
  const e = await api('/api/estado');
  const tot = e.trabajadores.reduce((s, t) => s + t.n, 0);
  $('#kpis').innerHTML = [
    ['Trabajadores en base', tot.toLocaleString('es-PE'), 'bi-people-fill', 'g1'],
    ['Registros históricos', e.programacion.n.toLocaleString('es-PE'), 'bi-archive-fill', 'g2'],
    ['Última Fecha Doc.', dmy(e.programacion.ultima) || '—', 'bi-calendar-event-fill', 'g3'],
    ['Programados hoy', e.hoy, 'bi-calendar-check-fill', 'g4'],
  ].map(([t, v, i, g]) => `<div class="col-6 col-lg-3"><div class="kpi-card ${g}"><div class="lbl">${t}</div><div class="val">${v}</div><i class="bi ${i} bg"></i></div></div>`).join('');
  $('#tSync tbody').innerHTML = ['VERFRUT', 'RAPEL'].map(emp => {
    const t = e.trabajadores.find(x => x.empresa === emp) || { n: 0 };
    const s = e.sync.find(x => x.empresa === emp);
    return `<tr><td><span class="badge rounded-pill" style="background:var(--navy)">${emp}</span></td><td><b>${t.n.toLocaleString('es-PE')}</b></td><td>${s ? '<i class="bi bi-check-circle-fill text-success"></i> ' + s.fecha : '<span class="text-danger">nunca</span>'}</td></tr>`;
  }).join('');
  const f = await api('/api/programacion/fechas');
  $('#tFechas tbody').innerHTML = f.slice(0, 15).map(x => `<tr><td>${dmy(x.fecha_doc)}</td><td>${x.n}</td><td>${x.fin}</td><td>${x.sus}</td><td><a href="#" class="btn btn-sm btn-outline-primary py-0" onclick="verFecha('${x.fecha_doc}');return false"><i class="bi bi-eye"></i> Ver</a></td></tr>`).join('');
}
async function subirExcel(inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 45 * 1048576) { $('#syncMsg').innerHTML = '<span class="text-danger">✖ El archivo supera 45 MB. Usa el Lite (más liviano) o la macro Sincronizar.</span>'; inp.value = ''; return; }
  $('#syncMsg').innerHTML = `<span class="text-muted">Subiendo ${esc(f.name)} (${(f.size / 1048576).toFixed(1)} MB) y actualizando VERFRUT / RAPEL… puede tardar 1–2 min</span>`;
  try {
    const base64 = await new Promise((ok, ko) => { const rd = new FileReader(); rd.onload = () => ok(rd.result.split(',')[1]); rd.onerror = ko; rd.readAsDataURL(f); });
    const j = await gas('subirExcel', { base64, nombre: f.name });
    $('#syncMsg').innerHTML = `<span class="text-success">✔ Bases actualizadas: VERFRUT ${j.filas.VERFRUT} · RAPEL ${j.filas.RAPEL}</span>`;
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
  if (!dni) return;
  try {
    const t = await api('/api/trabajador/' + dni);
    const a = t.antiguedad;
    const estCls = t.estado === 'INDETERMINADO' ? 'text-danger fw-bold' : t.estado === 'PERIODO DE PRUEBA' ? 'text-primary' : '';
    const aviso = t.en_base ? '' : `<div class="alert alert-warning py-2 small mb-2"><i class="bi bi-exclamation-triangle-fill"></i> <b>No está en la base activa VERFRUT / RAPEL</b> (cesado o no vigente). Último registro: ${badgeEst(t.ultimo_estatus)} ${dmy(t.ultimo_registro)}. Ficha tomada de su historial.</div>`;
    const reg = t.regimen_clasificado === 'EMPLEADO' ? '<span class="badge bg-purple" style="background:#6a1b9a">EMPLEADO — excluido</span>' : t.regimen_clasificado === 'OBRERO' ? '<span class="badge bg-success">OBRERO</span>' : '<span class="badge bg-warning text-dark">POR DEFINIR</span>';
    $('#ficha').innerHTML = `${aviso}
      <div class="ficha-nombre">${esc(t.nombre_completo)}</div>
      <div class="mb-2"><span class="badge rounded-pill" style="background:var(--navy)">${esc(t.empresa)}</span> ${t.en_base ? reg : '<span class="badge text-bg-secondary">NO VIGENTE</span>'}</div>
      <table class="table table-sm tbl m-0">
        <tr><th>Cargo</th><td>${esc(t.cargo)}</td></tr>
        <tr><th>Fundo</th><td>${esc(t.centro_costo)}</td></tr>
        <tr><th>Régimen</th><td>${esc(t.regimen)}</td></tr>
        <tr><th>F. inicio</th><td>${dmy(t.fecha_inicio_periodo)}</td></tr>
        <tr><th>Renov. / Término</th><td>${dmy(t.fecha_inicio_contrato)} → ${dmy(t.fecha_termino_contrato)}</td></tr>
        <tr><th>Antigüedad</th><td>${a.anios}a ${a.meses}m ${a.dias}d</td></tr>
        <tr><th>Estado</th><td class="${estCls}">${esc(t.estado)}</td></tr>
        <tr><th>Susp. acumulada ${new Date().getFullYear()}</th><td>${t.acum_anual} días</td></tr>
        <tr><th>Dirección</th><td class="text-wrap">${esc(t.direccion)} — ${esc(t.provincia)}</td></tr>
        <tr><th>Base actualizada</th><td>${esc(t.sincronizado_en || '—')}</td></tr>
      </table>`;
    histAct = t.historial; dniAct = dni;
    $('#hCount').textContent = `(${t.historial.length} registros)`;
    $('#btnHistXls').style.display = t.historial.length ? '' : 'none';
    const totF = t.historial.filter(h => h.estatus === 'FINIQUITO').length, totS = t.historial.filter(h => /^SUSPENSI/.test(h.estatus || '')).length, totSE = t.historial.filter(h => h.estatus === 'SIN EFECTO').length;
    $('#hResumen').innerHTML = t.historial.length ? `<div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="badge rounded-pill text-bg-danger">${totF} finiquito(s)</span><span class="badge rounded-pill text-bg-warning">${totS} suspensión(es)</span><span class="badge rounded-pill text-bg-secondary">${totSE} sin efecto</span>
      ${t.por_anio.map(a => `<span class="badge rounded-pill" style="background:#e9eef6;color:var(--navy)">${a.anio}: ${a.sus} SPL · ${a.dias} días · ${a.fin} finiq.</span>`).join('')}</div>` : '';
    $('#tHist tbody').innerHTML = t.historial.map((h, i) => `<tr>
      <td class="text-muted">${i + 1}</td><td><b>${dmy(h.fecha_doc)}</b></td><td>${badgeEst(h.estatus)}</td><td>${esc(h.empresa)}</td><td>${dmy(h.fecha_firma)}</td><td>${esc(h.semana_mes)}</td><td>${esc(h.mes)}</td><td>${h.anio ?? ''}</td>
      <td><b>${esc(h.fundo_zona)}</b></td><td>${esc(h.ruta)}</td><td>${esc(h.codigo)}</td>
      <td>${esc(h.fundo)}</td><td>${esc(h.cargo)}</td><td class="${/INDETERMINADO/i.test(h.estado || '') ? 'text-danger fw-bold' : ''}">${esc(h.estado)}</td><td>${h.anios ?? ''}a ${h.meses ?? ''}m ${h.dias ?? ''}d</td>
      <td>${dmy(h.f_inicio)}</td><td>${dmy(h.f_renovacion)}</td><td>${dmy(h.f_termino)}</td>
      <td>${dmy(h.fecha_inicio_sl)}</td><td>${dmy(h.fecha_fin_sl)}</td><td>${dmy(h.fecha_retorno)}</td><td>${h.cant_dias ?? ''}</td><td>${esc(h.estado_retorno)}</td><td>${esc(h.status02)}</td><td>${dmy(h.fecha_pago)}</td>
      <td class="text-wrap" style="min-width:220px;max-width:380px;font-size:12px">${esc(h.observacion)}</td><td>${esc(h.responsable_sector)}</td><td>${esc(h.apoyos)}</td><td>${esc(h.horario_firma)}</td><td>${esc(h.origen)}</td><td class="text-muted">${esc(h.creado_en)}</td></tr>`).join('') || '<tr><td colspan="31" class="empty">Sin programaciones previas</td></tr>';
  } catch (e) { $('#dniErr').textContent = e.message; }
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
async function validar() {
  $('#rErr').textContent = ''; previaOK = false; $('#btnGrabar').disabled = true;
  try {
    const v = await api('/api/programacion/validar', { method: 'POST', body: JSON.stringify(datosLote()) });
    pintarPrevia(v);
    previaOK = v.filas.length > 0; $('#btnGrabar').disabled = !previaOK;
  } catch (e) { $('#rErr').textContent = e.message; }
}
function pintarPrevia(v) {
  const f = v.filas;
  const nExc = f.filter(x => x.excluido).length;
  $('#rTot').innerHTML = `${f.length} encontrados · <b>${f.length - nExc}</b> a grabar · ${nExc} excluidos · ${v.noEncontrados.length} no encontrados`;
  // alertas por fundo (solo cantidades)
  const porTipo = {};
  for (const x of f) for (const a of x.alertas) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
  const nombres = { INDETERMINADO: 'Indeterminados', SIN_EFECTO: 'Finiquitos → SIN EFECTO', PROXIMO: 'Próximos a indeterminado', EMPLEADO_EXCLUIDO: 'Empleados excluidos', SUSP_30: 'Suspensiones > 30 días', SUSP_ACUM: 'Acumulado anual > 90 días', REGIMEN_POR_DEFINIR: 'Cargo por definir' };
  let html = Object.entries(porTipo).map(([t, n]) => `<span class="me-3 al-${t}"><i class="bi bi-exclamation-triangle"></i> ${nombres[t] || t}: ${n}</span>`).join('');
  if (v.noEncontrados.length) html += `<div class="text-danger small mt-1">No existen en la base: ${v.noEncontrados.join(', ')} → sincroniza VERFRUT/RAPEL si son ingresos recientes.</div>`;
  $('#rAlertas').innerHTML = html ? `<div class="alert alert-light border py-2 small">${html}</div>` : '';
  $('#tPrev tbody').innerHTML = f.map(x => `<tr class="${x.excluido ? 'table-secondary' : ''}">
    <td>${x.dni}</td><td>${esc(x.nombres)}</td><td>${x.empresa}</td><td>${esc(x.cargo)}</td>
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
    $('#rDnis').value = ''; $('#tPrev tbody').innerHTML = ''; $('#rAlertas').innerHTML = ''; $('#rTot').innerHTML = ''; previaOK = false;
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
  if (!fechasAct.length) { alert('Ingresa al menos una Fecha Doc.'); return; }
  const q = fechasAct.join(',');
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
  document.querySelectorAll('#tSect input.firma').forEach(inp => inp.onchange = () => guardarFirma(inp.closest('tr')));
  $('#tFin tbody').innerHTML = r.finiquitos.map(f => `<tr><td>${esc(f.fundo)}</td><td><b>${f.cant}</b></td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">—</td></tr>';
  $('#tSus tbody').innerHTML = r.suspensiones.map(s => `<tr><td>${esc(s.fundo)}</td><td>${dmy(s.inicio)}</td><td>${dmy(s.fin)}</td><td>${s.dias}</td><td><b>${s.cant}</b></td></tr>`).join('') || '<tr><td colspan="5" class="text-muted">—</td></tr>';
  const det = await api('/api/programacion?fechas=' + q);
  $('#dCount').textContent = `(${det.length})`;
  $('#tDet tbody').innerHTML = det.map(d => `<tr><td>${d.dni}</td><td>${esc(d.nombres)}</td><td>${esc(d.empresa)}</td><td>${esc(d.fundo_zona)}</td><td>${esc(d.ruta)}</td><td>${badgeEst(d.estatus)}</td><td>${esc(d.estado)}</td><td>${dmy(d.fecha_inicio_sl)}</td><td>${dmy(d.fecha_fin_sl)}</td><td>${d.cant_dias ?? ''}</td><td>${dmy(d.fecha_retorno)}</td><td>${esc(d.status02)}</td><td class="text-wrap">${esc(d.observacion)}</td><td><a href="#" class="text-danger" title="Eliminar" onclick="eliminar(${d.id});return false"><i class="bi bi-trash"></i></a></td></tr>`).join('');
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
  document.querySelectorAll('#pivWrap input.firma-piv').forEach(inp => inp.onchange = async () => {
    const tr = inp.closest('tr'); const body = { fecha_doc: inp.dataset.f, sector: inp.dataset.s };
    tr.querySelectorAll('input.firma-piv').forEach(i => body[i.dataset.k] = i.value.trim());
    await api('/api/firmas', { method: 'PUT', body: JSON.stringify(body) });
    const ok = body.horario && body.responsable && body.apoyos; const c = tr.lastElementChild;
    c.className = ok ? 'ok' : 'falta'; c.textContent = ok ? '✔ COMPLETO' : '✖ FALTA HORARIO O APOYOS';
    cargarResumen();
  });
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
  $('#cAsunto').value = c.asunto; $('#cHtml').innerHTML = c.html; $('#cPara').value = c.para; $('#cCC').value = c.cc;
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
    <td><a href="#" onclick='editarResp(${JSON.stringify(x)});return false'><i class="bi bi-pencil"></i></a></td></tr>`).join('');
}
function editarResp(x) { $('#nFundo').value = x.fundo; $('#nAna').value = x.analista || ''; $('#nAnaC').value = x.correo_analista || ''; $('#nSup').value = x.supervisor || ''; $('#nSupC').value = x.correo_supervisor || ''; }
async function guardarResp() {
  await api('/api/responsables', { method: 'PUT', body: JSON.stringify({ fundo: $('#nFundo').value, analista: $('#nAna').value, correo_analista: $('#nAnaC').value, supervisor: $('#nSup').value, correo_supervisor: $('#nSupC').value }) });
  ['#nFundo', '#nAna', '#nAnaC', '#nSup', '#nSupC'].forEach(s => $(s).value = ''); cargarResp();
}

// ---------- arranque ----------
(async () => {
  const yo = await api('/api/yo');
  if (!yo) { location.href = 'index.html'; return; }
  $('#quien').textContent = yo.nombre; $('#rol').textContent = yo.rol; $('#avatar').textContent = (yo.nombre || 'U').trim()[0].toUpperCase();
  $('#hoyTxt').textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  ir(location.hash.replace('#', '') || 'inicio');
})();
