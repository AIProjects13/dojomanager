// Animaciones de la landing: aparición al hacer scroll y barra superior sólida al bajar.
// Sin JavaScript, o con "reducir movimiento", todo se ve igual pero quieto.
(function () {
  'use strict';
  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.getElementById('nav');
  function alBajar() { if (nav) nav.classList.toggle('solida', window.scrollY > 40); }
  window.addEventListener('scroll', alBajar, { passive: true });
  alBajar();

  if (quieto || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('anima');
  var obs = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('visto');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  Array.prototype.forEach.call(document.querySelectorAll('.revelar'), function (n, i) {
    // Retraso escalonado entre hermanos para que las tarjetas entren una tras otra.
    var hermanos = n.parentNode ? Array.prototype.filter.call(n.parentNode.children, function (h) { return h.classList.contains('revelar'); }) : [n];
    n.style.setProperty('--retraso', (hermanos.indexOf(n) * 110) + 'ms');
    obs.observe(n);
  });
})();
