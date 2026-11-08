/* ui.js: piezas de pantalla. Todo se arma con DOM (textContent); nunca se pasa texto de datos a innerHTML.
 * Las pantallas de las Tasks 15-17 deben usar ui.el para todo lo que lleve texto de personas o de la base.
 *
 * CONTRATO DE UNA VISTA: ui.vista('nombre', async function (contenedor, ctx) { ... })
 *  - `contenedor` es NUEVO en cada navegación. Escribe SOLO en él (nunca en document.getElementById('contenido')): si la
 *    persona navega o sale mientras esperas a Apps Script, ese contenedor queda suelto del documento y lo que escribas no se ve.
 *  - `ctx.vigente()` dice si esta vista sigue en pantalla. Antes de efectos fuera del contenedor (ui.aviso, cambiar location,
 *    abrir un diálogo) tras un await, revisa `if (!ctx.vigente()) return;`.
 *  - `api()` descarta por sí misma las respuestas de otra sesión o membresía (lanza un error `manejado`): déjalo subir.
 *  - `ctx.sesion` es auth.estado (nivel, dojo, herramientas, soloLectura, pausado...). Solo oculta; el servidor decide. */
(function () {
  'use strict';

  var BASE_WEB = new URL('../', document.currentScript && document.currentScript.src ? document.currentScript.src : location.href);
  var vistas = {};
  var PROHIBIDOS = /^(on|style$|srcdoc$|formaction$)/i;
  var PROTOCOLOS = ['http:', 'https:', 'mailto:', 'tel:'];

  /** URL con un protocolo permitido, o relativa. Bloquea javascript:, data: y similares. */
  function urlSegura(v) {
    try { return PROTOCOLOS.indexOf(new URL(String(v), location.href).protocol) !== -1; } catch (e) { return false; }
  }

  function agregar(nodo, h) {
    if (h === null || h === undefined || h === false) return;
    if (Array.isArray(h)) { h.forEach(function (x) { agregar(nodo, x); }); return; }
    if (h instanceof Node) nodo.appendChild(h);
    else nodo.appendChild(document.createTextNode(String(h)));
  }

  /**
   * ui.el('div', { class: 'x', texto: 'hola', al: { click: fn } }, hijo1, hijo2)
   * Los hijos que no son nodos se muestran como TEXTO. No admite atributos on*, style ni URLs peligrosas.
   */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'texto') n.textContent = String(v);
        else if (k === 'al') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
        else if (PROHIBIDOS.test(k)) throw new Error('Atributo no permitido: ' + k);
        else if ((k === 'href' || k === 'src' || k === 'action') && !urlSegura(v)) throw new Error('Dirección no permitida.');
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) agregar(n, arguments[i]);
    return n;
  }

  function limpiar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function ruta(rel) { return new URL(rel, BASE_WEB).href; }
  function moneda(v) {
    var n = Number(v);
    if (!isFinite(n)) return 'Q0.00';
    return 'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function nuevaClave() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  // ---------------------------------------------------------------- Color y tema
  function luz(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var x = luz(a), y = luz(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** Solo logo, nombre y color; el color solo se usa donde cumple 4.5:1. Nunca cambia permisos ni alcance. */
  function aplicarTema(tema) {
    var raiz = document.documentElement.style;
    ['--acento', '--boton', '--boton-h'].forEach(function (k) { raiz.removeProperty(k); });
    if (!tema || !/^#[0-9a-fA-F]{6}$/.test(tema.color || '')) return;
    if (contraste(tema.color, '#0b0b0c') >= 4.5) raiz.setProperty('--acento', tema.color);
    if (contraste(tema.color, '#ffffff') >= 4.5) { raiz.setProperty('--boton', tema.color); raiz.setProperty('--boton-h', tema.color); }
  }
  /** Tema por ?dojo=slug (antes de entrar). Un slug desconocido no cambia nada. */
  function temaDeUrl() {
    var s = new URLSearchParams(location.search).get('dojo') || '';
    var temas = window.DOJO_TEMAS || {};
    return /^[a-z0-9-]{1,40}$/.test(s) && Object.prototype.hasOwnProperty.call(temas, s) ? temas[s] : null;
  }
  function marca(tema) {
    var logo = tema && tema.logo && !/^[a-z]+:/i.test(tema.logo) ? el('img', { src: ruta(tema.logo), alt: '', width: 40, height: 40 }) : null;
    return el('div', { class: 'marca' }, logo, el('span', { texto: (tema && tema.nombre) || 'Dojo Manager' }));
  }

  // ---------------------------------------------------------------- Avisos, confirmación y franja
  function aviso(texto, tipo) {
    var caja = document.getElementById('avisos');
    var t = tipo || 'info';
    var n = el('div', { class: 'toast ' + t, role: t === 'error' ? 'alert' : 'status' }, el('span', { texto: texto }));
    var quitar = function () { if (n.parentNode) n.parentNode.removeChild(n); };
    n.appendChild(el('button', { type: 'button', 'aria-label': 'Cerrar aviso', texto: '×', al: { click: quitar } }));
    caja.appendChild(n);
    if (t !== 'error') setTimeout(quitar, 7000);
    return n;
  }

  /** Promesa<boolean>. Escape o Cancelar = false. */
  function confirmar(texto, op) {
    op = op || {};
    return new Promise(function (resolver) {
      var d = el('dialog', { 'aria-label': op.titulo || 'Confirmar' });
      var cerrar = function (v) { d.close(); if (d.parentNode) d.parentNode.removeChild(d); resolver(v); };
      var cancelar = el('button', { type: 'button', texto: op.cancelar || 'Cancelar', al: { click: function () { cerrar(false); } } });
      var aceptar = el('button', { type: 'button', class: op.peligro ? 'peligro' : 'primario', texto: op.aceptar || 'Aceptar', al: { click: function () { cerrar(true); } } });
      d.appendChild(el('p', { texto: texto }));
      d.appendChild(el('div', { class: 'acciones' }, cancelar, aceptar));
      d.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(false); });
      document.body.appendChild(d);
      d.showModal();
      (op.peligro ? cancelar : aceptar).focus();
    });
  }

  var FRANJAS = {
    'vencido': function () { return 'Tu dojo tiene un pago atrasado con la plataforma. Todo sigue funcionando, pero ponte al día pronto para no quedar en solo lectura.'; },
    'solo-lectura': function () { return 'Tu dojo está en solo lectura por un pago atrasado. Puedes ver tu información, pero no ingresar datos nuevos. Siguen activos los comprobantes, los pagos, las confirmaciones y los recibos de alumnos.'; },
    'por-confirmar': function () { return 'Tu comprobante está por confirmar. Tu cuenta sigue activa, pero las descargas se habilitan cuando se confirme el pago.'; },
    'rechazado': function (x) {
      return 'Tu último comprobante fue rechazado.' + (x.soloLectura ? ' Tu dojo está en solo lectura hasta que se confirme un pago válido.' : ' Sube uno válido a tiempo para no quedar en solo lectura.');
    },
    'dojo-solo-lectura': function () { return 'La cuenta de tu dojo está en solo lectura por ahora. Puedes consultar tu información, pero no registrar cambios.'; },
    'pausado': function () { return 'Tu credencial está pausada por un pago atrasado. Puedes ver tus cobros, tu saldo y tus recibos, subir tu comprobante y manejar tus permisos.'; }
  };

  /** Franja fija de estado. `extra` es el motivo (texto) o { motivo, diasAtraso, soloLectura }. Sin estado conocido la quita. */
  function franjaEstado(estado, extra) {
    var f = document.getElementById('franja');
    limpiar(f);
    f.className = '';
    if (!estado || !Object.prototype.hasOwnProperty.call(FRANJAS, estado)) { f.hidden = true; return; }
    var x = typeof extra === 'string' ? { motivo: extra } : (extra || {});
    var p = el('p', { texto: FRANJAS[estado](x) });
    if (x.motivo) p.appendChild(el('span', { texto: ' Motivo: ' + x.motivo }));
    f.appendChild(p);
    f.className = 'f-' + estado;
    f.hidden = false;
  }

  var GRAVEDAD = { 'solo-lectura': 4, 'rechazado': 3, 'vencido': 2, 'por-confirmar': 1 };
  var NOMBRES_ESTADO = { 'solo-lectura': 'en solo lectura', 'rechazado': 'con comprobante rechazado', 'vencido': 'con pago vencido', 'por-confirmar': 'con comprobante por confirmar' };

  /** Franja resumen para el administrador de dojos: cuentas = [{ nombre, estado, motivo, soloLectura }] de dojos que no están al día. */
  function franjaCuentas(cuentas) {
    var lista = (cuentas || []).filter(function (c) { return Object.prototype.hasOwnProperty.call(GRAVEDAD, c.estado); });
    if (!lista.length) { franjaEstado(null); return; }
    var peor = lista.slice().sort(function (a, b) { return GRAVEDAD[b.estado] - GRAVEDAD[a.estado]; })[0];
    var f = document.getElementById('franja');
    limpiar(f);
    var texto = (lista.length === 1 ? 'Un dojo tiene' : lista.length + ' dojos tienen') + ' pagos pendientes con la plataforma. El más urgente: ' + peor.nombre + ', ' + NOMBRES_ESTADO[peor.estado] + '.';
    var p = el('p', { texto: texto });
    if (peor.estado === 'rechazado' && peor.motivo) p.appendChild(el('span', { texto: ' Motivo: ' + peor.motivo }));
    f.appendChild(p);
    f.className = 'f-' + peor.estado;
    f.hidden = false;
  }

  // ---------------------------------------------------------------- Tabla
  /** columnas: [{ clave, titulo, alinear:'der', formato(valor, fila) -> texto o nodo }]. Los valores siempre como texto.
   * En pantallas angostas (CSS, menos de 760 px) cada fila se apila como tarjeta y cada celda lleva su etiqueta (data-etiqueta),
   * así no hay desplazamiento lateral ni acciones fuera de la vista. Los roles ARIA mantienen la semántica de tabla. */
  function tabla(columnas, filas, op) {
    op = op || {};
    var thead = el('tr', { role: 'row' }, columnas.map(function (c) { return el('th', { scope: 'col', role: 'columnheader', class: c.alinear === 'der' ? 'der' : '', texto: c.titulo }); }));
    var cuerpo = (filas || []).map(function (fila) {
      return el('tr', { role: 'row' }, columnas.map(function (c) {
        var v = fila[c.clave];
        var mostrado = c.formato ? c.formato(v, fila) : v;
        return el('td', { role: 'cell', 'data-etiqueta': c.titulo, class: c.alinear === 'der' ? 'der' : '' }, mostrado === undefined || mostrado === null ? '' : mostrado);
      }));
    });
    var t = el('table', { role: 'table', class: 'apilable' }, el('caption', { class: 'solo-lector', texto: op.titulo || 'Tabla' }), el('thead', { role: 'rowgroup' }, thead), el('tbody', { role: 'rowgroup' }, cuerpo));
    var cont = el('div', { class: 'tabla-cont', role: 'region', tabindex: 0, 'aria-label': op.titulo || 'Tabla' }, t);
    if (!filas || !filas.length) return el('p', { class: 'vacio', texto: op.vacio || 'Aún no hay datos.' });
    return cont;
  }

  // ---------------------------------------------------------------- Formulario
  var RECHAZOS_DEFINITIVOS = ['VALIDATION', 'FORBIDDEN', 'NOT_FOUND', 'READ_ONLY', 'PLAN_REQUIRED', 'PAUSED', 'DOWNLOADS_LOCKED', 'FULL', 'TOO_LARGE'];

  /**
   * campos: [{ nombre, etiqueta, tipo (text|email|password|number|date|tel|textarea|select|checkbox|file), requerido, valor,
   *            opciones:[{valor,etiqueta}], ayuda, autocomplete, minlength, maxlength, min, max, step }]
   * alEnviar(valores, { claveIdempotencia }) -> Promise. La clave es única por formulario y se REUSA al reintentar tras un
   * fallo incierto (red, respuesta ilegible); cambia tras un éxito, un rechazo definitivo o si los valores cambiaron.
   * El botón queda deshabilitado mientras la petición está en curso.
   */
  function formulario(campos, alEnviar, op) {
    op = op || {};
    var controles = {};
    var clave = nuevaClave();
    var ultimos = null;
    var enviando = false;
    var error = el('p', { class: 'error-form', role: 'alert' });
    var boton = el('button', { type: 'submit', class: 'primario', texto: op.textoBoton || 'Guardar' });
    var form = el('form', { novalidate: true });

    // Todo campo de contraseña lleva su botón para mostrar u ocultar lo escrito.
    function conMostrarClave(ctl) {
      var b = el('button', { type: 'button', class: 'ver-clave', texto: 'Mostrar', 'aria-pressed': 'false', 'aria-label': 'Mostrar contraseña' });
      b.addEventListener('click', function () {
        var ver = ctl.type === 'password';
        ctl.type = ver ? 'text' : 'password';
        b.textContent = ver ? 'Ocultar' : 'Mostrar';
        b.setAttribute('aria-pressed', ver ? 'true' : 'false');
        b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
      });
      return el('div', { class: 'con-ver-clave' }, ctl, b);
    }

    campos.forEach(function (c, i) {
      var id = 'campo-' + c.nombre + '-' + i + '-' + Math.random().toString(36).slice(2, 6);
      var tipo = c.tipo || 'text';
      var ctl;
      if (tipo === 'textarea') ctl = el('textarea', { rows: c.filas || 4 });
      else if (tipo === 'select') {
        ctl = el('select', null, (c.opciones || []).map(function (o) {
          var v = typeof o === 'object' ? o.valor : o;
          return el('option', { value: v, texto: typeof o === 'object' ? o.etiqueta : o });
        }));
      } else ctl = el('input', { type: tipo });
      ctl.id = id;
      ctl.name = c.nombre;
      if (c.requerido) ctl.required = true;
      ['autocomplete', 'minlength', 'maxlength', 'min', 'max', 'step', 'accept'].forEach(function (a) { if (c[a] !== undefined) ctl.setAttribute(a, c[a]); });
      if (tipo === 'checkbox') ctl.checked = !!c.valor;
      else if (c.valor !== undefined && c.valor !== null && tipo !== 'file') ctl.value = c.valor;
      if (c.ayuda) ctl.setAttribute('aria-describedby', id + '-ayuda');
      controles[c.nombre] = { ctl: ctl, tipo: tipo };
      var cuerpo = tipo === 'checkbox'
        ? el('label', { for: id }, ctl, el('span', { texto: c.etiqueta }))
        : [el('label', { for: id, texto: c.etiqueta }), tipo === 'password' ? conMostrarClave(ctl) : ctl];
      form.appendChild(el('div', { class: 'campo' + (tipo === 'checkbox' ? ' casilla' : '') }, cuerpo,
        c.ayuda ? el('p', { class: 'ayuda', id: id + '-ayuda', texto: c.ayuda }) : null));
    });
    form.appendChild(error);
    form.appendChild(boton);

    function valores() {
      var v = {};
      Object.keys(controles).forEach(function (n) {
        var c = controles[n];
        if (c.tipo === 'checkbox') v[n] = c.ctl.checked;
        else if (c.tipo === 'file') v[n] = c.ctl.files && c.ctl.files[0] ? c.ctl.files[0] : null;
        else if (c.tipo === 'number') v[n] = c.ctl.value === '' ? null : Number(c.ctl.value);
        else v[n] = c.tipo === 'password' ? c.ctl.value : c.ctl.value.trim();
      });
      return v;
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (enviando) return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      enviando = true;
      boton.disabled = true;
      var etiqueta = boton.textContent;
      boton.textContent = 'Enviando…';
      form.setAttribute('aria-busy', 'true');
      error.textContent = '';
      var v = valores();
      var huella = JSON.stringify(v, function (k, x) { return x instanceof File ? x.name + x.size : x; });
      if (ultimos !== null && ultimos !== huella) clave = nuevaClave();
      ultimos = huella;
      Promise.resolve().then(function () { return alEnviar(v, { claveIdempotencia: clave }); }).then(function (r) {
        clave = nuevaClave();
        ultimos = null;
        if (op.alExito) op.alExito(r);
      }, function (e) {
        if (e && RECHAZOS_DEFINITIVOS.indexOf(e.code) !== -1) { clave = nuevaClave(); ultimos = null; }
        if (!e || !e.manejado) error.textContent = (e && e.message) || 'No se pudo completar. Intenta de nuevo.';
      }).then(function () {
        enviando = false;
        boton.disabled = false;
        boton.textContent = etiqueta;
        form.removeAttribute('aria-busy');
      });
    });
    form.valores = valores;
    form.fijarError = function (m) { error.textContent = m; };
    return form;
  }

  // ---------------------------------------------------------------- Vistas
  /** Registra una pantalla: ui.vista('alumnos', function (contenedor, ctx) { ... }). `fn` puede ser async. */
  function vista(nombre, fn, opciones) {
    if (typeof nombre !== 'string' || !/^[a-z0-9-]+$/.test(nombre) || typeof fn !== 'function') throw new Error('Vista mal declarada.');
    vistas[nombre] = { fn: fn, opciones: opciones || {} };
  }
  function tieneVista(nombre) { return Object.prototype.hasOwnProperty.call(vistas, nombre); }

  /**
   * Pinta una vista en `contenedor`, que es NUEVO en cada navegación (lo crea app.js). Si la persona navega o cierra sesión
   * mientras la vista espera una respuesta, ese contenedor queda suelto del documento: lo que la vista escriba en él ya no
   * se ve. Un error solo se muestra si la vista sigue vigente (ctx.vigente()).
   */
  function mostrarVista(nombre, contenedor, ctx) {
    var vigente = ctx && ctx.vigente ? ctx.vigente : function () { return true; };
    if (!tieneVista(nombre)) {
      contenedor.appendChild(el('p', { class: 'vacio', texto: 'Esta pantalla se está preparando. Vuelve pronto.' }));
      return Promise.resolve();
    }
    return Promise.resolve().then(function () { return vistas[nombre].fn(contenedor, ctx); }).catch(function (e) {
      if ((e && e.manejado) || !vigente()) return;
      limpiar(contenedor);
      contenedor.appendChild(el('p', { class: 'error', role: 'alert', texto: (e && e.message) || 'No se pudo cargar esta pantalla.' }));
    });
  }

  window.ui = {
    el: el, limpiar: limpiar, ruta: ruta, moneda: moneda, urlSegura: urlSegura, nuevaClave: nuevaClave,
    contraste: contraste, aplicarTema: aplicarTema, temaDeUrl: temaDeUrl, marca: marca,
    aviso: aviso, confirmar: confirmar, franjaEstado: franjaEstado, franjaCuentas: franjaCuentas, tabla: tabla, formulario: formulario,
    vista: vista, tieneVista: tieneVista, mostrarVista: mostrarVista
  };
})();
