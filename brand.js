/* ======================================================================
   TALVENIQ · Configuración de marca y presentación (capa visual)
   ----------------------------------------------------------------------
   Este archivo NO toca identificadores internos (nombres de hojas, IDs de
   empresa, filtros ni funciones). Solo define cómo se muestran las cosas.
   Para cambiar el logo: reemplaza los archivos en /assets manteniendo el
   nombre, o cambia las rutas de LOGO_ASSETS.
   ====================================================================== */
window.BRAND_CONFIG = {
  brandName: 'TALVENIQ',
  tagline: 'HUMAN STRATEGY & TECHNOLOGY',
  taglineTitle: 'Human Strategy & Technology',
  serviceDescription: 'Tecnología y servicios especializados para Recursos Humanos',
  founder: 'Joel Timoteo Gonza',
  founderLabel: 'Founded by Joel Timoteo Gonza',
  platformName: 'Plataforma de Gestión Humana',
  platformDescription: 'Tecnología segura para optimizar la gestión de personas, relaciones laborales y procesos organizacionales.',
  providedBy: 'Plataforma proporcionada por TALVENIQ',
  managedBy: 'Servicio tecnológico administrado por TALVENIQ',
  restrictedAccess: 'Acceso exclusivo para usuarios autorizados',
  copyright: '© 2026 TALVENIQ · Human Strategy & Technology · Todos los derechos reservados',
  version: 'v3.3',
  lastUpdate: '2026-09-13',
  // Módulo "Acerca de": deja vacío lo que aún no tengas; se mostrará "Por configurar"
  about: {
    description: 'TALVENIQ es una empresa especializada en consultoría y soluciones tecnológicas para Recursos Humanos. La plataforma permite gestionar procesos de personal, relaciones laborales, documentación, permisos, reportes, indicadores y operaciones organizacionales de manera segura y eficiente.',
    termsUrl: '',          // URL de los Términos de servicio
    privacyUrl: '',        // URL de la Política de privacidad
    supportChannel: '',    // Canal de soporte (p. ej. WhatsApp, mesa de ayuda)
    corporateEmail: '',    // Correo corporativo
  },
};

/* Identificadores internos → nombre visible. Las claves son los IDs reales que
   usan Google Sheets y el backend (NO cambiarlas). El administrador puede
   sobreescribir los nombres visibles desde la pestaña `config` de la hoja
   (claves ORG_VERFRUT, ORG_RAPEL); esos valores llegan en el login. */
window.ORGANIZATION_DISPLAY = {
  VERFRUT: 'Organización 01',
  RAPEL: 'Organización 02',
};

window.LOGO_ASSETS = {
  horizontal: 'assets/talveniq-logo.png',          // logo completo (fondo transparente)
  horizontalWhiteBg: 'assets/talveniq-logo-white-bg.png', // para documentos/correo
  mark: 'assets/talveniq-mark.png',                // isotipo compacto
  favicon: 'assets/favicon.png',
};

// Helpers de presentación (se usan en index.html y app.js)
window.orgNombre = function (id) {
  const k = String(id || '').trim().toUpperCase();
  if (!k) return '';
  return (window.ORGANIZATION_DISPLAY && window.ORGANIZATION_DISPLAY[k]) || k;
};
window.orgTexto = function (texto) {   // reemplaza IDs de organización dentro de un texto libre
  let t = String(texto || '');
  Object.keys(window.ORGANIZATION_DISPLAY || {}).forEach(k => { t = t.replace(new RegExp('\\b' + k + '\\b', 'g'), window.ORGANIZATION_DISPLAY[k]); });
  return t;
};
