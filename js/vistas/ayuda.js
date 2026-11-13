/* Ayuda: manual de uso dentro de la app, según el perfil con el que se entró (administrador de dojos, administrador,
 * tutor o alumno/encargado). Solo explica lo que ese perfil puede hacer. */
(function () {
  'use strict';
  var el = ui.el;

  var MANUAL = {
    'admin-dojos': {
      titulo: 'Manual del administrador de dojos',
      intro: 'Tú creas y supervisas tus dojos. El día a día de cada dojo lo lleva su administrador; tú puedes entrar a todo.',
      temas: [
        ['Ver y crear tus dojos', ['Entra a "Mis dojos". Arriba ves cada dojo con su plan y el estado de su cuenta.', 'Para abrir un dojo nuevo, llena "Crear un dojo" al final de la página y elige el plan viendo su precio.']],
        ['Entrar a un dojo', ['En "Mis dojos" > "Administrar un dojo", toca la tarjeta del dojo.', 'Verás quién lo administra y sus tutores, y accesos a Alumnos, Tutores, Clases, Planes, Pagos, Suspendidos, Plantillas y Ajustes de ese dojo.']],
        ['Nombrar al administrador de un dojo', ['Dentro del dojo, toca "Crear administrador o tutor". Escribe el correo y el nombre y elige "Administrador".', 'Se muestra una clave temporal una sola vez: entrégala en persona. La persona la cambia al entrar. Los administradores se crean uno por uno.']],
        ['Cargar muchos tutores o alumnos', ['Dentro del dojo, en Tutores o Alumnos, abre "Cargar varios … con Excel". Descarga la plantilla, llénala y súbela.', 'Al terminar se descarga un Excel con cada correo y su clave temporal, una sola vez: guárdalo y entrega cada clave en persona.']],
        ['Cuenta con la plataforma', ['En "Cobros a dojos" ves lo que debe cada dojo y subes el comprobante del depósito. Si tus dojos son de cortesía, esta sección no aparece porque no hay nada que pagar.']],
        ['Ver resultados', ['En "Dashboard" junta todos tus dojos y filtra con las casillas por dojo y disciplina. Compara contra el mes anterior o el mismo mes del año pasado.', 'Toca cualquier cifra para ver los pagos que la forman.']]
      ]
    },
    admin: {
      titulo: 'Manual del administrador del dojo',
      intro: 'Llevas el día a día: alumnos, clases, tutores y los pagos de los alumnos.',
      temas: [
        ['Inscribir un alumno', ['Si la persona no tiene cuenta, primero créala en "Cuentas" (nivel Alumno) y entrégale la clave temporal.', 'Luego en "Alumnos" > nuevo alumno: nombre, fecha de nacimiento, plan y titular. Un menor necesita un encargado mayor de edad.']],
        ['Cargar muchos alumnos o tutores', ['En Alumnos o Tutores abre "Cargar varios … con Excel", descarga la plantilla, llénala y súbela. Al terminar se descarga un Excel con las claves temporales, una sola vez.']],
        ['Clases y cupos', ['En "Clases" defines disciplina, día, horario, cupo y tutor. El sistema no deja inscribir por encima del cupo.']],
        ['Confirmar pagos', ['En "Pagos de alumnos" ves los comprobantes que subieron los alumnos, con la imagen. Compara el monto con lo que debe y toca "Confirmar" o "Rechazar" con un motivo.', 'Al confirmar, el recibo se genera solo y el alumno lo ve al instante. Un pago en efectivo lo registras tú ahí mismo.']],
        ['Atrasos y avisos', ['En "Suspendidos" ves quién se atrasó y cuántos días. Con "Avisos y plantillas" el mensaje de cobro sale con el desglose ya calculado y se abre WhatsApp o Gmail listo para enviar.']],
        ['Recibos', ['En "Recibos" están todos los recibos del dojo. Si uno salió mal, se anula con un motivo y se emite otro; nunca se borra.']],
        ['Ajustes', ['En "Ajustes del dojo" eliges si cobras por adelantado o a mes vencido y los días de gracia antes de pausar.']]
      ]
    },
    tutor: {
      titulo: 'Manual del tutor',
      intro: 'Das clases y llevas la asistencia de tus alumnos.',
      temas: [
        ['Tu disponibilidad', ['En "Disponibilidad" marca los días y horas en que puedes dar clase. El administrador te asigna clases dentro de esos horarios.']],
        ['Tomar asistencia', ['En "Asistencia" elige la clase y la fecha, marca presente o ausente con un toque por alumno y guarda.', 'Si un alumno aparece como no disponible, quítalo de la lista y guarda a los demás.']],
        ['Tus clases', ['En "Clases" ves tus horarios y cupos.']]
      ]
    },
    alumno: {
      titulo: 'Manual del alumno y del encargado',
      intro: 'Aquí ves tus cobros, pagas con tu comprobante y tienes tus recibos siempre a mano. Si eres encargado, ves también a los menores a tu cargo.',
      temas: [
        ['Cuánto debo', ['En "Mis cobros" ves cada mes, su monto, la fecha límite y tu saldo. Si eres encargado, cambias entre tus menores y ves el total.']],
        ['Pagar', ['Haz el depósito y en "Subir comprobante" sube la foto o el PDF, escribe el monto y elige qué cobros cubre (o déjalo automático).', 'Tu pago queda "en revisión" hasta que el dojo lo confirme. Un solo depósito puede cubrir varios meses o varios menores.']],
        ['Recibos', ['En "Recibos" descargas cualquier recibo, incluso si tienes un atraso.']],
        ['Si mi credencial está pausada', ['Pasa cuando el atraso llega al límite del dojo. Sube un comprobante por todo lo vencido y vuelves a operar mientras lo revisan.']],
        ['Mis datos y permisos', ['En "Mis permisos" das o retiras el permiso de promociones y de uso de tu imagen. En "Mis datos" descargas tu información.']]
      ]
    }
  };

  ui.vista('ayuda', function (c, ctx) {
    var nivel = ctx.sesion.nivel;
    var m = MANUAL[nivel] || MANUAL.alumno;
    c.appendChild(el('h1', { texto: m.titulo }));
    c.appendChild(el('p', { class: 'ayuda-intro', texto: m.intro }));
    m.temas.forEach(function (t, i) {
      var det = el('details', { class: 'tema-ayuda' }, el('summary', { texto: t[0] }), el('ul', null, t[1].map(function (p) { return el('li', { texto: p }); })));
      if (i === 0) det.open = true;
      c.appendChild(det);
    });
    var consejos = window.espera && espera.consejos[nivel];
    if (consejos && consejos.length) {
      c.appendChild(el('h2', { texto: 'Consejos' }));
      c.appendChild(el('ul', { class: 'consejos' }, consejos.map(function (p) { return el('li', { texto: p }); })));
    }
  });
})();
