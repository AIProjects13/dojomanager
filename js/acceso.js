/* acceso.js: pantallas anteriores a los datos: ingreso, clave temporal, elegir membresía y aviso de aceptación. */
(function () {
  'use strict';
  var el = ui.el;
  var NIVELES = { general: 'Administrador general', 'admin-dojos': 'Administrador de dojos', admin: 'Administrador', tutor: 'Tutor', alumno: 'Alumno o encargado' };

  function contenido() { return document.getElementById('contenido'); }
  function pantalla(ancha) {
    document.body.dataset.modo = 'acceso';
    document.getElementById('franja').hidden = true;
    var tema = ui.temaDeUrl();
    ui.aplicarTema(tema);
    var c = ui.limpiar(contenido());
    var t = el('section', { class: 'tarjeta' + (ancha ? ' ancha' : '') });
    t.appendChild(ui.marca(tema));
    c.appendChild(t);
    return t;
  }
  function enfocar(t) { var h = t.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus(); } }

  function cargando() {
    var t = pantalla();
    t.appendChild(el('p', { class: 'cargando', texto: 'Entrando…' }));
  }
  function errorGrave(mensaje) {
    var t = pantalla();
    t.appendChild(el('h1', { texto: 'No pudimos continuar' }));
    t.appendChild(el('p', { class: 'error', role: 'alert', texto: mensaje || 'Ocurrió un error. Intenta de nuevo.' }));
    t.appendChild(el('button', { type: 'button', texto: 'Volver a intentar', al: { click: function () { auth.arrancar(); } } }));
    t.appendChild(el('button', { type: 'button', class: 'enlace', texto: 'Salir', al: { click: function () { auth.cerrarSesion(); } } }));
  }
  function configuracionVacia() {
    var t = pantalla();
    t.appendChild(el('h1', { texto: 'Aplicación sin configurar' }));
    t.appendChild(el('p', { class: 'error', role: 'alert', texto: 'La aplicación aún no está disponible. Avisa a la administración de tu dojo.' }));
  }

  function login(mensaje) {
    var t = pantalla();
    t.appendChild(el('h1', { texto: 'Entrar' }));
    if (mensaje) t.appendChild(el('p', { class: 'error', role: 'alert', texto: mensaje }));
    t.appendChild(ui.formulario([
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true, autocomplete: 'username' },
      { nombre: 'clave', etiqueta: 'Contraseña', tipo: 'password', requerido: true, autocomplete: 'current-password' }
    ], function (v) { return iniciarSesion(v.correo, v.clave); }, { textoBoton: 'Entrar' }));
    t.appendChild(el('p', null, el('button', { type: 'button', class: 'enlace', texto: '¿Olvidaste tu contraseña?', al: { click: function () { recuperar(); } } })));
    t.appendChild(el('p', { class: 'ayuda', texto: 'Si no puedes entrar, escribe a la administración de tu dojo.' }));
    enfocar(t);
  }

  /** Recuperar la contraseña con el correo. El mensaje es el mismo exista o no la cuenta. */
  function recuperar() {
    var t = pantalla();
    t.appendChild(el('h1', { texto: 'Recupera tu contraseña' }));
    t.appendChild(el('p', { texto: 'Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.' }));
    var aviso = el('p', { class: 'ayuda', role: 'status', 'aria-live': 'polite' });
    t.appendChild(ui.formulario([
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true, autocomplete: 'username' }
    ], async function (v) {
      await auth.recuperarClave(v.correo);
      aviso.textContent = 'Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja de entrada y el correo no deseado. Si no llega, escribe a la administración de tu dojo.';
    }, { textoBoton: 'Enviar enlace' }));
    t.appendChild(aviso);
    t.appendChild(el('p', null, el('button', { type: 'button', class: 'enlace', texto: 'Volver a entrar', al: { click: function () { login(); } } })));
    enfocar(t);
  }

  function cambioClave(usuario) {
    var t = pantalla();
    var correo = (usuario && usuario.correo) || auth.correo();
    t.appendChild(el('h1', { texto: 'Crea tu contraseña' }));
    t.appendChild(el('p', { texto: 'Entraste con una contraseña temporal. Crea la tuya para ver tus datos.' }));
    t.appendChild(ui.formulario([
      { nombre: 'nueva', etiqueta: 'Contraseña nueva', tipo: 'password', requerido: true, autocomplete: 'new-password', minlength: 10, maxlength: 128,
        ayuda: 'De 10 a 128 caracteres, con letras y números. No puede contener tu correo.' },
      { nombre: 'repetir', etiqueta: 'Repite la contraseña', tipo: 'password', requerido: true, autocomplete: 'new-password' }
    ], async function (v) {
      if (v.nueva.length < 10) throw api.ApiError('VALIDATION', 'La contraseña debe tener al menos 10 caracteres, con letras y números.');
      if (v.nueva !== v.repetir) throw api.ApiError('VALIDATION', 'Las contraseñas no coinciden.');
      var r = await api('cambiarClave', { claveNueva: v.nueva });
      if (r && r.reautenticar) await auth.reautenticar(correo, v.nueva);
    }, { textoBoton: 'Guardar contraseña' }));
    enfocar(t);
  }

  function elegir(membresias) {
    var t = pantalla();
    t.appendChild(el('h1', { texto: '¿Con cuál entras?' }));
    t.appendChild(el('p', { texto: 'Tu cuenta tiene más de una membresía. Elige con cuál quieres trabajar ahora.' }));
    membresias.forEach(function (m) {
      var lugar = m.dojoNombre || m.organizacionNombre || 'Toda la plataforma';
      t.appendChild(el('button', { type: 'button', class: 'opcion', al: { click: function () { auth.elegir(m); } } },
        NIVELES[m.nivel] || m.nivel, el('small', { texto: lugar })));
    });
    enfocar(t);
  }

  // ------------------------------------------------------------ Aviso de aceptación
  function aviso(av) {
    var t = pantalla(true);
    var pendientes = av.pendientes || [];
    var soloActualizar = !av.requiereNuevo;
    t.appendChild(el('h1', { texto: 'Aviso de privacidad' }));
    if (!pendientes.length) {
      // El servidor no dejó nada por aceptar, pero llegamos aquí: no se deja a la persona sin salida.
      t.appendChild(el('p', { class: 'error', role: 'alert', texto: 'No pudimos confirmar tu aceptación del aviso. Intenta de nuevo.' }));
      t.appendChild(el('button', { type: 'button', class: 'primario', texto: 'Volver a intentar', al: { click: function () { auth.arrancar(); } } }));
      t.appendChild(el('button', { type: 'button', class: 'enlace', texto: 'Salir', al: { click: function () { auth.cerrarSesion(); } } }));
      enfocar(t);
      return;
    }
    t.appendChild(el('p', { texto: soloActualizar
      ? 'El aviso cambió (versión ' + av.version + '). Léelo y acéptalo de nuevo para seguir usando tus datos en la aplicación.'
      : 'Antes de ver tus datos, lee y acepta el aviso (versión ' + av.version + ').' }));
    t.appendChild(el('div', { class: 'texto-aviso', tabindex: 0, role: 'region', 'aria-label': 'Texto del aviso', texto: av.texto }));
    if (soloActualizar) {
      t.appendChild(el('p', { class: 'ayuda', texto: 'Mientras no lo aceptes, solo podrás ver tus recibos.' }));
      t.appendChild(el('button', { type: 'button', class: 'enlace', texto: 'Ahora no: ver mis recibos', al: { click: function () { auth.marcarAvisoViejo(true); app.mostrar(); } } }));
    }
    pendientes.forEach(function (p) { t.appendChild(formularioAceptar(av, p)); });
    enfocar(t);
  }

  function formularioAceptar(av, p) {
    var previo = (av.permisos || []).filter(function (x) { return x.alumnoId === p.alumnoId; })[0] || {};
    // Sin aceptación previa las casillas opcionales nacen desmarcadas; al re-aceptar se precargan para no perderlas.
    var heredar = p.estado === 'actualizar';
    // Los permisos opcionales los decide el encargado de un menor o el propio adulto con cuenta; quien acepta por otro adulto no los ve.
    var campos = p.decidePermisos === false ? [] : [
      { nombre: 'promociones', tipo: 'checkbox', etiqueta: 'Acepto recibir promociones (opcional)', valor: heredar && previo.promociones },
      { nombre: 'imagen', tipo: 'checkbox', etiqueta: 'Autorizo el uso de fotos o videos (opcional)', valor: heredar && previo.imagen }
    ];
    if (p.esMenor) {
      campos.push(
        { nombre: 'mayorDeEdad', tipo: 'checkbox', etiqueta: 'Declaro que soy mayor de edad.', requerido: true },
        { nombre: 'esResponsable', tipo: 'checkbox', etiqueta: 'Soy su padre, madre o tutor, o tengo su autorización.', requerido: true },
        { nombre: 'supervisara', tipo: 'checkbox', etiqueta: 'Supervisaré su cuenta.', requerido: true }
      );
    }
    var f = ui.formulario(campos, async function (v) {
      var payload = { version: String(av.version), promociones: v.promociones, imagen: v.imagen };
      if (p.alumnoId) payload.alumnoId = p.alumnoId;
      if (p.esMenor) payload.declaracion = { mayorDeEdad: v.mayorDeEdad, esResponsable: v.esResponsable, supervisara: v.supervisara };
      var r = await api('aceptarAviso', payload);
      if (r.pendientes && r.pendientes.length) {
        aviso(Object.assign({}, av, { pendientes: r.pendientes, requiereNuevo: r.requiereNuevo, requiereActualizar: r.requiereActualizar }));
      } else {
        auth.marcarAvisoViejo(false);
        await auth.entrar(auth.estado.membresias.filter(function (m) { return m.membresiaId === auth.estado.membresiaId; })[0], null);
      }
    }, { textoBoton: p.alumnoId ? 'Acepto el aviso por ' + p.nombre : 'Acepto el aviso' });
    return el('fieldset', null, el('legend', { texto: p.alumnoId ? (p.esMenor ? 'Por ' + p.nombre + ' (menor de edad)' : 'Por ' + p.nombre) : 'Tu aceptación' }), f);
  }

  window.acceso = { cargando: cargando, login: login, cambioClave: cambioClave, elegir: elegir, aviso: aviso, errorGrave: errorGrave, configuracionVacia: configuracionVacia, NIVELES: NIVELES };
})();
