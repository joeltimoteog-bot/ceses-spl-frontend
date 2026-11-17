/* _TERMINOS_V1 (16-nov-2026) · TALVENIQ — aceptación obligatoria de términos y condiciones.
   Al entrar, consulta al servidor si el usuario ya aceptó la versión vigente. Si no, muestra una ventana
   que no se puede cerrar: o acepta (queda guardado con usuario, fecha y hora) o cierra sesión.
   Si la consulta falla (sin conexión, servidor ocupado) NO bloquea: el sistema sigue funcionando.
   Interruptor de emergencia: localStorage.setItem('tvq_terminos','off') y recargar. */
(function () {
  try { if (localStorage.getItem('tvq_terminos') === 'off') return; } catch (e) {}
  function usuario() { try { return String((JSON.parse(sessionStorage.getItem('ceses_yo') || 'null') || {}).usuario || '').toLowerCase(); } catch (e) { return ''; } }
  function clave(v) { var u = usuario(); return u ? 'tvq_term_' + u + '_' + v : ''; }
  function mostrar(version) {
    if (document.getElementById('tvqAceptar')) return;
    var d = document.createElement('div');
    d.innerHTML = '<div class="modal fade" id="tvqAceptar" tabindex="-1" aria-labelledby="tvqAceptarTit" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false"><div class="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="tvqAceptarTit">Términos y condiciones de uso · ' + version + '</h5></div>' +
      '<div class="modal-body" id="tvqTerminos">' +
      '<p>Antes de ingresar a TALVENIQ, confirme las condiciones de uso de la plataforma.</p>' +
      '<h3>1. Uso autorizado</h3><p>El acceso es personal e intransferible. Cada usuario ingresa únicamente a los módulos que el administrador principal le autorizó.</p>' +
      '<h3>2. Confidencialidad</h3><p>La información de los trabajadores es confidencial. No se copia, comparte ni exporta fuera de los fines laborales para los que fue autorizada.</p>' +
      '<h3>3. Registro de actividad</h3><p>Cada ingreso, registro, modificación y exportación queda guardado en la bitácora de auditoría con usuario, fecha y hora.</p>' +
      '<h3>4. Autoría del sistema</h3><p>TALVENIQ es un sistema creado por Joel Timoteo Gonza, creador y único autor.</p>' +
      '<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="tvqChk1"><label class="form-check-label" for="tvqChk1">He leído y acepto los términos y condiciones de uso.</label></div>' +
      '<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="tvqChk2"><label class="form-check-label" for="tvqChk2">Acepto el compromiso de confidencialidad de la información.</label></div>' +
      '<div class="text-danger small mt-2" id="tvqAceptarErr" role="alert"></div>' +
      '</div><div class="modal-footer"><span class="hint me-auto">Sin aceptación no se habilita ningún módulo.</span>' +
      '<button type="button" class="btn btn-light" id="tvqSalir">Cerrar sesión</button>' +
      '<button type="button" class="btn btn-primary" id="tvqOk" disabled>Aceptar e ingresar</button></div></div></div></div>';
    document.body.appendChild(d.firstChild);
    var c1 = document.getElementById('tvqChk1'), c2 = document.getElementById('tvqChk2'), ok = document.getElementById('tvqOk'), err = document.getElementById('tvqAceptarErr');
    var m = bootstrap.Modal.getOrCreateInstance(document.getElementById('tvqAceptar'));
    function act() { ok.disabled = !(c1.checked && c2.checked); }
    c1.addEventListener('change', act); c2.addEventListener('change', act);
    document.getElementById('tvqSalir').addEventListener('click', function () { try { salir(); } catch (e) { location.href = 'index.html'; } });
    ok.addEventListener('click', async function () {
      ok.disabled = true; err.textContent = ''; ok.textContent = 'Guardando…';
      try {
        var r = await gas('aceptarTerminos', { dispositivo: String(navigator.userAgent || '').slice(0, 120) });
        if (!r || !r.aceptado) throw new Error((r && r.error) || 'No se pudo registrar la aceptación');
        try { var k = clave(r.version || version); if (k) localStorage.setItem(k, r.fecha || '1'); } catch (e) {}
        m.hide();
      } catch (e) { err.textContent = 'No se pudo guardar la aceptación. Verifique su conexión y vuelva a intentar.'; ok.textContent = 'Aceptar e ingresar'; act(); }
    });
    m.show();
  }
  async function revisar() {
    try {
      if (typeof gas !== 'function' || !window.bootstrap) return;
      var r = await gas('terminosEstado');
      if (!r || r.error || !r.version) return;          // el servidor no respondió como se espera: no bloquear
      var k = clave(r.version);
      if (r.aceptado) { try { if (k) localStorage.setItem(k, r.fecha || '1'); } catch (e) {} return; }
      mostrar(r.version);
    } catch (e) { /* sin conexión o sesión vencida: lo maneja la aplicación; aquí no se bloquea */ }
  }
  function iniciar() { setTimeout(revisar, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
