/* espera.js: mientras el servidor responde (puede tardar varios segundos), una animación de artes marciales
 * y consejos para sacarle provecho a la herramienta según el perfil. Aparece solo si la espera pasa de medio segundo. */
(function () {
  'use strict';
  var CONSEJOS = {
    'admin-dojos': [
      'En "Mis dojos" entra a cada dojo para ver su administrador, tutores, alumnos y clases en un solo lugar.',
      'El dashboard junta todos tus dojos: usa las casillas para comparar uno contra otro.',
      'Compara el mes actual con el mismo mes del año pasado para ver si tu dojo crece.',
      'Asigna un administrador a cada dojo para que él lleve el día a día y tú solo supervises.',
      'En "Avisos y plantillas" prepara una vez el mensaje de cobro y úsalo con todos los alumnos.'
    ],
    admin: [
      'Revisa "Pagos de alumnos" a diario: confirmar rápido evita que alguien quede pausado sin razón.',
      'Al confirmar un pago, el recibo se genera solo y el alumno lo ve al instante.',
      'Los cupos de cada clase se respetan solos: nadie puede inscribirse de más.',
      'En "Suspendidos" ves quién se atrasó y le escribes por WhatsApp con un clic.',
      'Usa las plantillas: el desglose de lo que debe cada alumno se arma automáticamente.',
      'Si un alumno cumple 18, la alerta te avisa para pasarle la cuenta a su nombre.'
    ],
    tutor: [
      'Marca la asistencia al final de cada clase: así el administrador ve quién empieza a faltar.',
      'Mantén tu disponibilidad al día para que te asignen las clases que puedes dar.',
      'Puedes marcar a todos los alumnos de una clase de una sola vez.'
    ],
    alumno: [
      'Sube tu comprobante apenas deposites: tu pago queda en revisión y no se pausa tu credencial.',
      'Tus recibos siempre están disponibles en "Recibos", aunque tengas un atraso.',
      'En "Mis cobros" ves cuánto debes, de qué mes y hasta qué fecha puedes pagar.',
      'Si eres encargado de varios menores, un solo depósito puede cubrir a todos.',
      'Revisa tu asistencia para ver tu constancia mes a mes.'
    ],
    general: ['Revisa los comprobantes por confirmar ordenados del más antiguo al más reciente.']
  };
  var GENERALES = ['Un momento: estamos consultando tus datos de forma segura.'];

  var pendientes = 0, temporizador = null, rotar = null, capa = null, texto = null;

  function consejos() {
    var nivel = window.auth && auth.estado && auth.estado.nivel;
    return (nivel && CONSEJOS[nivel]) || GENERALES;
  }
  function crear() {
    var el = ui.el;
    texto = el('p', { class: 'espera-consejo' });
    capa = el('div', { class: 'espera', role: 'status', 'aria-live': 'polite' },
      el('div', { class: 'espera-escena', 'aria-hidden': 'true' },
        el('span', { class: 'espera-cadena' }), el('span', { class: 'espera-saco' }), el('span', { class: 'espera-guante' })),
      el('p', { class: 'espera-titulo', texto: 'Cargando…' }), texto);
    document.body.appendChild(capa);
  }
  function mostrar() {
    if (!capa) crear();
    var lista = consejos();
    var i = Math.floor(Math.random() * lista.length);
    texto.textContent = 'Consejo: ' + lista[i];
    clearInterval(rotar);
    rotar = setInterval(function () { i = (i + 1) % lista.length; texto.textContent = 'Consejo: ' + lista[i]; }, 5000);
    capa.classList.add('visible');
  }
  function ocultar() {
    clearInterval(rotar);
    if (capa) capa.classList.remove('visible');
  }
  window.espera = {
    inicio: function () {
      pendientes++;
      if (pendientes === 1) temporizador = setTimeout(mostrar, 500);
    },
    fin: function () {
      pendientes = Math.max(0, pendientes - 1);
      if (pendientes === 0) { clearTimeout(temporizador); ocultar(); }
    },
    consejos: CONSEJOS
  };
})();
