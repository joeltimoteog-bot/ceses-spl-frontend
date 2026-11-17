/* _TEMA_EMP_V1 (16-nov-2026) · TALVENIQ — capa visual empresarial (aditiva).
   1) Activa el estilo empresarial (clase tvq-emp).  2) Muestra el número de cada barra / porción en los gráficos.
   3) Pie de página con Términos y condiciones, Acceso a módulos y la autoría del sistema.
   Interruptor del estilo y los números: localStorage.setItem('tvq_tema','off') y recargar. El pie queda siempre. */
(function () {
  var activo = true;
  try { activo = localStorage.getItem('tvq_tema') !== 'off'; } catch (e) {}
  if (activo) document.documentElement.classList.add('tvq-emp');

  // ---------- 2) números en los gráficos ----------
  try {
    if (activo && window.Chart) {
      var fmt = function (n) { try { return Number(n).toLocaleString('es-PE'); } catch (e) { return String(n); } };
      Chart.defaults.font.family = "Inter, 'Segoe UI', sans-serif";
      Chart.defaults.color = '#55637a';
      Chart.register({
        id: 'tvqNumeros',
        afterDatasetsDraw: function (c) {
          try {
            var total = 0; c.data.datasets.forEach(function (d) { total += (d.data || []).length; });
            if (!total || total > 90) return;   // demasiados puntos: los números se montarían
            var sc = c.options.scales || {}, apilado = !!((sc.x && sc.x.stacked) || (sc.y && sc.y.stacked));
            var horizontal = c.options.indexAxis === 'y', ctx = c.ctx;
            ctx.save(); ctx.font = "600 11px Inter, 'Segoe UI', sans-serif"; ctx.textBaseline = 'middle';
            c.data.datasets.forEach(function (ds, i) {
              if (!c.isDatasetVisible(i)) return;
              var meta = c.getDatasetMeta(i), tipo = meta.type || c.config.type;
              meta.data.forEach(function (el, j) {
                var v = ds.data[j]; if (v && typeof v === 'object') v = horizontal ? v.x : v.y;
                v = Number(v); if (!v || !isFinite(v)) return;
                var t = fmt(v);
                if (tipo === 'doughnut' || tipo === 'pie') {
                  if ((el.endAngle - el.startAngle) < 0.28) return;
                  var p = el.tooltipPosition(); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(t, p.x, p.y); return;
                }
                if (tipo === 'bar') {
                  var b = el.getProps(['x', 'y', 'base', 'width', 'height'], true);
                  if (apilado) {
                    var largo = horizontal ? Math.abs(b.x - b.base) : Math.abs(b.y - b.base);
                    if (largo < (horizontal ? ctx.measureText(t).width + 6 : 14)) return;
                    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
                    ctx.fillText(t, horizontal ? (b.x + b.base) / 2 : b.x, horizontal ? b.y : (b.y + b.base) / 2);
                  } else if (horizontal) { ctx.fillStyle = '#1c2b3a'; ctx.textAlign = 'left'; ctx.fillText(t, b.x + 5, b.y); }
                  else { ctx.fillStyle = '#1c2b3a'; ctx.textAlign = 'center'; ctx.fillText(t, b.x, b.y - 8); }
                  return;
                }
                if (tipo === 'line') { ctx.fillStyle = '#1c2b3a'; ctx.textAlign = 'center'; ctx.fillText(t, el.x, el.y - 10); }
              });
            });
            ctx.restore();
          } catch (e) {}
        }
      });
      // espacio arriba / a la derecha para que el número de la barra más alta no se corte
      Chart.defaults.layout = Chart.defaults.layout || {};
      Chart.defaults.layout.padding = { top: 18, right: 22 };
    }
  } catch (e) {}

  // ---------- 3) pie de página ----------
  function modalTerminos() {
    if (document.getElementById('tvqTerminos')) return;
    var d = document.createElement('div');
    d.innerHTML = '<div class="modal fade" id="tvqTerminos" tabindex="-1" aria-labelledby="tvqTerminosTit" aria-hidden="true"><div class="modal-dialog modal-dialog-scrollable modal-lg"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="tvqTerminosTit">Términos y condiciones de uso</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>' +
      '<div class="modal-body">' +
      '<h3>1. Uso autorizado</h3><p>El acceso es personal e intransferible. Cada usuario ingresa únicamente a los módulos que el administrador principal le autorizó.</p>' +
      '<h3>2. Confidencialidad</h3><p>La información de los trabajadores es confidencial. No se copia, comparte ni exporta fuera de los fines laborales para los que fue autorizada.</p>' +
      '<h3>3. Registro de actividad</h3><p>Cada ingreso, registro, modificación y exportación queda guardado en la bitácora de auditoría con usuario, fecha y hora.</p>' +
      '<h3>4. Autoría del sistema</h3><p>TALVENIQ es un sistema creado por Joel Timoteo Gonza, creador y único autor.</p>' +
      '</div><div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Entendido</button></div></div></div></div>';
    document.body.appendChild(d.firstChild);
  }
  var HTML_PIE = '© ' + new Date().getFullYear() + ' TALVENIQ · <button type="button" data-tvq="terminos">Términos y condiciones</button> · ' +
    '<button type="button" data-tvq="accesos">Acceso a módulos</button> · <b>Creador del sistema y único autor: Joel Timoteo Gonza</b>';
  function pie() {
    var f = document.getElementById('footTxt'); if (!f) return;
    if (f.getAttribute('data-tvq-ok') === '1' && f.querySelector('[data-tvq]')) return;
    f.classList.add('tvq-foot'); f.innerHTML = HTML_PIE; f.setAttribute('data-tvq-ok', '1');
  }
  function iniciar() {
    try {
      pie();
      var f = document.getElementById('footTxt'); if (!f) return;
      new MutationObserver(function () { if (!f.querySelector('[data-tvq]')) pie(); }).observe(f, { childList: true, characterData: true, subtree: true });
      f.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-tvq]') : null; if (!b) return;
        if (b.getAttribute('data-tvq') === 'accesos') { try { if (typeof ir === 'function') ir('panel'); else location.hash = '#panel'; } catch (e) { location.hash = '#panel'; } }
        else { try { modalTerminos(); bootstrap.Modal.getOrCreateInstance(document.getElementById('tvqTerminos')).show(); } catch (e) {} }
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
