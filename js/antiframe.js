/* Protección contra incrustación (R17): una meta frame-ancestors no sirve, así que la página se niega a
 * mostrarse dentro de otra. La protección real es la cabecera de publicar/_headers. */
(function () {
  'use strict';
  if (window.top === window.self) return;
  window.__enmarcado = true;
  document.documentElement.classList.add('enmarcado');
  try { window.top.location.href = window.self.location.href; } catch (e) { /* otro origen: queda oculta */ }
})();
