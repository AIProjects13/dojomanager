/* app.js: cascarón de la aplicación (cabecera, menú por nivel y herramientas, franja de estado) y enrutador por #/vista.
 * Las pantallas se registran con ui.vista(nombre, fn). El menú solo OCULTA: cada ruta vuelve a decidir en el servidor. */
(function () {
  'use strict';
  if (window.__enmarcado) return;
  var el = ui.el;
  var TODOS = ['general', 'admin-dojos', 'admin', 'tutor', 'alumno'];

  /**
   * Menú. v = nombre de la vista (la registra la Task 15, 16 o 17), n = niveles, h = herramienta del plan (solo oculta,
   * y solo para admin, tutor y alumno, que están ligados a un dojo), pausa = visible con la credencial pausada,
   * viejo = visible mientras el aviso nuevo está sin aceptar (solo recibos).
   */
  var MENU = [
    { v: 'inicio', t: 'Inicio', n: TODOS },
    { v: 'dashboard', t: 'Dashboard', n: ['general', 'admin-dojos', 'admin', 'tutor', 'alumno'], h: 'dashboard', hn: ['admin'], pausa: true, viejo: true },
    { v: 'dojos', t: 'Dojos y planes', n: ['general'] },
    { v: 'dojos', t: 'Mis dojos', n: ['admin-dojos'] },
    { v: 'cobros-plataforma', t: 'Cobros a dojos', n: ['general', 'admin-dojos', 'admin'] },
    { v: 'cuentas', t: 'Cuentas', n: ['general', 'admin-dojos', 'admin'] },
    { v: 'mi-cuenta', t: 'Mi cuenta', n: ['general', 'admin-dojos', 'admin', 'tutor'] },
    { v: 'alumnos', t: 'Alumnos', n: ['general', 'admin-dojos', 'admin'], h: 'alumnos-cobros' },
    { v: 'tutores', t: 'Tutores', n: ['general', 'admin-dojos', 'admin'], h: 'alumnos-cobros' },
    { v: 'clases', t: 'Clases', n: ['general', 'admin-dojos', 'admin', 'tutor', 'alumno'], h: 'clases' },
    { v: 'planes', t: 'Planes del dojo', n: ['general', 'admin-dojos', 'admin'], h: 'alumnos-cobros' },
    { v: 'disponibilidad', t: 'Disponibilidad', n: ['tutor'], h: 'disponibilidad' },
    { v: 'asistencia', t: 'Asistencia', n: ['admin', 'tutor', 'alumno'], h: 'asistencia' },
    { v: 'pagos', t: 'Pagos de alumnos', n: ['general', 'admin-dojos', 'admin'], h: 'alumnos-cobros' },
    { v: 'cobros', t: 'Mis cobros', n: ['alumno'], pausa: true },
    { v: 'comprobantes', t: 'Subir comprobante', n: ['alumno'], pausa: true },
    { v: 'recibos', t: 'Recibos', n: ['general', 'admin-dojos', 'admin', 'alumno'], pausa: true, viejo: true },
    { v: 'permisos', t: 'Mis permisos', n: ['alumno'], pausa: true, viejo: true },
    { v: 'datos', t: 'Mis datos', n: ['alumno'], pausa: true, viejo: true },
    { v: 'plantillas', t: 'Avisos y plantillas', n: ['admin-dojos', 'admin'], h: 'plantillas' },
    { v: 'suspendidos', t: 'Suspendidos', n: ['admin-dojos', 'admin'], h: 'seguimiento' },
    { v: 'config-dojo', t: 'Ajustes del dojo', n: ['general', 'admin-dojos', 'admin'], h: 'alumnos-cobros' },
    { v: 'aviso-editar', t: 'Aviso de privacidad', n: ['general', 'admin'] },
    { v: 'uso', t: 'Uso de hojas', n: ['general'] },
    { v: 'seguridad', t: 'Seguridad', n: ['general'] }
  ];

  function entradas() {
    var e = auth.estado;
    return MENU.filter(function (m) {
      if (m.n.indexOf(e.nivel) === -1) return false;
      var ligado = e.nivel === 'admin' || e.nivel === 'tutor' || e.nivel === 'alumno';
      var exige = m.h && ligado && (!m.hn || m.hn.indexOf(e.nivel) !== -1);
      if (exige && e.herramientas.indexOf(m.h) === -1) return false;
      if (e.pausado && !m.pausa) return false;
      if (e.avisoViejo && !m.viejo) return false;
      return true;
    });
  }
  function porDefecto() {
    var e = auth.estado;
    if (e.avisoViejo) return 'recibos';
    return e.pausado ? 'cobros' : 'inicio';
  }

  function ocultarCascaron() {
    ['cabecera', 'menu'].forEach(function (id) { document.getElementById(id).hidden = true; });
  }

  function pintarCascaron() {
    var e = auth.estado;
    var dojo = e.dojo;
    var tema = ui.temaDeUrl();
    var porSlug = dojo && window.DOJO_TEMAS && Object.prototype.hasOwnProperty.call(window.DOJO_TEMAS, dojo.slug) ? window.DOJO_TEMAS[dojo.slug] : null;
    // Decorativo: logo y color del dojo (del servidor ya validados, o de la tabla local por slug).
    // El servidor guarda el logo relativo a la raíz publicada (assets/logo/x.svg); desde web/ se sube un nivel.
    var visual = porSlug || (dojo ? { nombre: dojo.nombre, logo: dojo.logo ? '../' + dojo.logo : '', color: dojo.color } : tema);
    ui.aplicarTema(visual);
    document.body.dataset.modo = 'app';

    var cab = ui.limpiar(document.getElementById('cabecera'));
    var actual = e.membresias.filter(function (m) { return m.membresiaId === e.membresiaId; })[0] || {};
    cab.appendChild(ui.marca(visual && visual.nombre ? Object.assign({}, visual, { nombre: dojo ? dojo.nombre : visual.nombre }) : { nombre: 'Dojo Manager' }));
    var u = el('div', { class: 'usuario' },
      el('span', null, el('b', { texto: (e.usuario && e.usuario.nombre) || '' }), ' · ', acceso.NIVELES[e.nivel] || e.nivel,
        actual.dojoNombre || actual.organizacionNombre ? ' · ' + (actual.dojoNombre || actual.organizacionNombre) : ''));
    if (e.nivel === 'alumno') u.appendChild(el('a', { href: '#/aviso', texto: 'Aviso de privacidad' }));
    if (e.membresias.length > 1) {
      u.appendChild(el('button', { type: 'button', class: 'enlace', texto: 'Cambiar de membresía', al: { click: function () { acceso.elegir(e.membresias); } } }));
    }
    u.appendChild(el('button', { type: 'button', class: 'enlace', texto: 'Salir', al: { click: function () { auth.cerrarSesion(); } } }));
    cab.appendChild(u);
    cab.hidden = false;

    var menu = ui.limpiar(document.getElementById('menu'));
    var lista = el('ul');
    var boton = el('button', { type: 'button', id: 'alternar-menu', 'aria-expanded': 'false', 'aria-controls': 'lista-menu', texto: 'Menú' });
    lista.id = 'lista-menu';
    boton.addEventListener('click', function () {
      var abierto = menu.classList.toggle('cerrado') === false;
      boton.setAttribute('aria-expanded', String(abierto));
    });
    entradas().forEach(function (m) {
      lista.appendChild(el('li', null, el('a', { href: '#/' + m.v, texto: m.t, 'data-vista': m.v })));
    });
    menu.classList.add('cerrado');
    menu.appendChild(boton);
    menu.appendChild(lista);
    menu.hidden = false;

    // Franja fija de estado, según lo que el servidor le dio a este nivel:
    //  alumno pausado; admin: estado de pago de su dojo con motivo; admin-dojos: resumen del peor de sus dojos;
    //  tutor y alumno: aviso neutro de solo lectura (sin montos ni motivos); general no tiene franja (tiene su panel).
    if (e.pausado) ui.franjaEstado('pausado');
    else if (e.cuenta && e.cuenta.estado !== 'al-dia') {
      ui.franjaEstado(e.cuenta.estado, { motivo: e.cuenta.motivo, diasAtraso: e.cuenta.diasAtraso, soloLectura: e.cuenta.soloLectura });
    } else if (e.nivel === 'admin-dojos' && e.cuentas.length) ui.franjaCuentas(e.cuentas);
    else if ((e.nivel === 'tutor' || e.nivel === 'alumno') && e.soloLectura) ui.franjaEstado('dojo-solo-lectura');
    else ui.franjaEstado(null);
    marcarActual();
  }

  function nombreActual() {
    var m = /^#\/([a-z0-9-]+)/.exec(location.hash);
    return m ? m[1] : '';
  }
  function marcarActual() {
    var v = nombreActual();
    Array.prototype.forEach.call(document.querySelectorAll('#menu a'), function (a) {
      if (a.getAttribute('data-vista') === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  var arrancado = false;
  var navegacion = 0;
  function ir() {
    if (document.body.dataset.modo !== 'app') return;
    var v = nombreActual();
    var permitidas = entradas().map(function (m) { return m.v; }).concat(['aviso']);
    if (!v || permitidas.indexOf(v) === -1) { v = porDefecto(); if (location.hash !== '#/' + v) { location.hash = '#/' + v; return; } }
    marcarActual();
    ui.limpiar(document.getElementById('avisos'));   // los avisos de la pantalla anterior no se quedan
    // Contenedor NUEVO por navegación: una vista lenta que termina tarde escribe en uno ya suelto del documento y no se ve.
    var raizContenido = document.getElementById('contenido');
    var c = el('div', { class: 'vista' });
    var mia = ++navegacion;
    ui.limpiar(raizContenido).appendChild(c);
    var vigente = function () { return mia === navegacion && c.parentNode === raizContenido; };
    var titulo = (MENU.filter(function (m) { return m.v === v; })[0] || { t: 'Aviso de privacidad' }).t;
    document.title = titulo + ' · ' + ((auth.estado.dojo && auth.estado.dojo.nombre) || 'Dojo Manager');
    ui.mostrarVista(v, c, { sesion: auth.estado, contenedor: c, vigente: vigente }).then(function () { if (vigente()) raizContenido.focus({ preventScroll: true }); });
  }

  function mostrar() {
    pintarCascaron();
    if (!arrancado) { window.addEventListener('hashchange', ir); arrancado = true; }
    ir();
  }

  // ------------------------------------------------------------ Pantallas propias de la base
  ui.vista('inicio', function (c) {
    var e = auth.estado;
    c.appendChild(el('h1', { texto: 'Hola, ' + ((e.usuario && e.usuario.nombre) || '') }));
    c.appendChild(el('p', { texto: 'Esto es lo que puedes hacer:' }));
    c.appendChild(el('div', { class: 'tiles' }, entradas().filter(function (m) { return m.v !== 'inicio'; }).map(function (m) {
      return el('a', { class: 'tile', href: '#/' + m.v, texto: m.t });
    })));
  });

  ui.vista('aviso', async function (c) {
    var av = await api('verAviso', {});
    c.appendChild(el('h1', { texto: 'Aviso de privacidad' }));
    c.appendChild(el('p', { class: 'ayuda', texto: 'Versión ' + av.version + ' (' + av.fecha + ').' }));
    c.appendChild(el('div', { class: 'texto-aviso', tabindex: 0, role: 'region', 'aria-label': 'Texto del aviso', texto: av.texto }));
  });

  window.app = { mostrar: mostrar, pintarCascaron: pintarCascaron, ocultarCascaron: ocultarCascaron, MENU: MENU };

  ui.aplicarTema(ui.temaDeUrl());
  auth.iniciar();
})();
