/* _RUTAS_NUEVOS_V1 (19-nov-2026) · TALVENIQ — tarjeta en Inicio: rutas cuyo personal suspendido vigente
   no cumple ni un mes de trabajo. Solo cantidades por ruta (sin nombres). Si falla la consulta no muestra nada.
   Interruptor: localStorage.setItem('tvq_rutas_nuevos','off') y recargar. */
(function () {
  try { if (localStorage.getItem('tvq_rutas_nuevos') === 'off') return; } catch (e) {}
  var ultimo = 0, enCurso = false;
  var e_ = function (v) { return typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var f_ = function (v) { return typeof dmy === 'function' ? dmy(v) : v; };
  function pintar(r) {
    var p = document.getElementById('p-inicio'); if (!p) return;
    var c = document.getElementById('tvqRutasNuevos');
    if (!r || !r.total_rutas) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'tvqRutasNuevos'; c.className = 'card p-3 mb-3'; c.style.borderLeft = '0'; c.style.borderTop = '3px solid #e69a00'; p.insertBefore(c, p.firstChild); }
    var filas = r.rutas.slice(0, 30).map(function (x) {
      return '<tr><td><b>' + e_(x.fundo) + '</b></td><td>' + e_(x.ruta) + '</td><td>' + e_(x.codigo || '—') + '</td><td class="text-end"><b>' + x.personas + '</b></td><td>' + f_(x.retorno) + '</td></tr>';
    }).join('');
    c.innerHTML = '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">' +
      '<h6 class="m-0"><i class="bi bi-exclamation-triangle-fill" style="color:#e69a00"></i> Rutas con personal de menos de ' + r.dias + ' días de trabajo</h6>' +
      '<span class="hint">' + r.total_rutas + ' ruta(s) · ' + r.total_personas + ' persona(s) · se avisa a Reclutamiento</span></div>' +
      '<div class="hint mb-2">Todo el personal suspendido de estas rutas tiene menos de ' + r.dias + ' días de antigüedad a la fecha de su programación. Evaluar con Reclutamiento.</div>' +
      '<div class="table-wrap"><table class="table tbl compact"><thead><tr><th>Fundo / sector</th><th>Ruta</th><th>Código</th><th class="text-end">Personas</th><th>Primer retorno</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      (r.rutas.length > 30 ? '<div class="hint">Se muestran 30 de ' + r.rutas.length + ' rutas.</div>' : '');
  }
  async function revisar() {
    if (enCurso || Date.now() - ultimo < 5 * 60000) return;   // como máximo cada 5 minutos
    if (typeof gas !== 'function') return;
    var p = document.getElementById('p-inicio'); if (!p || !p.classList.contains('activa')) return;
    enCurso = true;
    try { var r = await gas('alertaRutasNuevos'); if (r && !r.error) { ultimo = Date.now(); pintar(r); } } catch (e) {} finally { enCurso = false; }
  }
  function iniciar() {
    var p = document.getElementById('p-inicio'); if (!p) return;
    new MutationObserver(function () { if (p.classList.contains('activa')) setTimeout(revisar, 800); }).observe(p, { attributes: true, attributeFilter: ['class'] });
    setTimeout(revisar, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
