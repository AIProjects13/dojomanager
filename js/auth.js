/* auth.js: Firebase Auth (único SDK externo), estado de la sesión y flujo de entrada.
 * La sesión de Firebase la guarda el propio SDK con persistencia de sesión (se cierra con la pestaña); aquí no se guarda
 * ningún token ni dato personal. Lo único que esta pantalla recuerda, en sessionStorage, es el id de la membresía elegida. */
(function () {
  'use strict';
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var CLAVE_MEMBRESIA = 'dm_membresia';
  var fb = null;
  var usuarioFb = null;
  var reautenticando = false;
  var ronda = 0;                 // generación: sube al entrar, cambiar de membresía o salir; descarta respuestas de la anterior
  var mensajeSalida = '';        // aviso para la pantalla de ingreso (p. ej. sesión vencida)

  function vacio() {
    return { usuario: null, membresias: [], membresiaId: '', nivel: '', dojo: null, herramientas: [], cuenta: null, cuentas: [], soloLectura: false, pausado: false, avisoViejo: false };
  }
  var estado = vacio();

  function guardada() { try { return sessionStorage.getItem(CLAVE_MEMBRESIA) || ''; } catch (e) { return ''; } }
  function recordar(id) { try { if (id) sessionStorage.setItem(CLAVE_MEMBRESIA, id); else sessionStorage.removeItem(CLAVE_MEMBRESIA); } catch (e) { /* sin almacenamiento */ } }

  var MSG_LOGIN = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-email': 'Escribe un correo válido.',
    'auth/user-disabled': 'Tu cuenta no está activa. Contacta a la administración.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
    'auth/network-request-failed': 'No hay conexión. Revisa tu internet e intenta de nuevo.'
  };

  /** La clave de la página, restringida por sitio, puede rechazar la petición: el SDK lo avisa con auth/requests-from-referer-... */
  var MSG_REFERER = 'El inicio de sesión no está disponible desde esta dirección. Avisa a la administración de Dojo Manager.';
  function esBloqueoDeClave(code) { return typeof code === 'string' && code.indexOf('auth/requests-from-referer-') === 0; }

  async function iniciar() {
    var c = window.DOJO_CONFIG || {};
    var f = c.FIREBASE || {};
    if (!c.API_URL || !f.apiKey || !f.projectId) {
      acceso.configuracionVacia();
      return;
    }
    try {
      var mods = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
      fb = { app: mods[0], mod: mods[1] };
      fb.auth = fb.mod.initializeAuth(fb.app.initializeApp(f), { persistence: fb.mod.browserSessionPersistence });
      fb.mod.onAuthStateChanged(fb.auth, function (u) {
        usuarioFb = u;
        if (u) arrancar();
        else if (!reautenticando) { limpiarSesion(); app.ocultarCascaron(); acceso.login(mensajeSalida); }
      });
    } catch (e) {
      acceso.errorGrave('No se pudo cargar el inicio de sesión. Revisa tu conexión y recarga la página.');
    }
  }

  /** Inicia sesión con correo y contraseña. Lanza { code, message } en español. */
  async function iniciarSesion(correo, clave) {
    if (!fb) throw api.ApiError('CONFIG', api.MENSAJES.CONFIG);
    try {
      await fb.mod.signInWithEmailAndPassword(fb.auth, String(correo).trim(), clave);
    } catch (e) {
      throw api.ApiError('AUTH', MSG_LOGIN[e && e.code] || (esBloqueoDeClave(e && e.code) ? MSG_REFERER : 'No pudimos iniciar sesión. Intenta de nuevo.'));
    }
  }

  /** Deja la pantalla sin rastro de la sesión: estado, membresía recordada, contenido, avisos y respuestas en vuelo. */
  function limpiarSesion() {
    ronda++;
    recordar('');
    estado = vacio();
    ['contenido', 'avisos'].forEach(function (id) { ui.limpiar(document.getElementById(id)); });
    ui.franjaEstado(null);
  }

  /**
   * "¿Olvidaste tu contraseña?": Firebase envía el correo por su cuenta (SDK del cliente). La respuesta es siempre la misma exista
   * o no la cuenta; solo un correo mal escrito o la falta de conexión se dicen, porque no revelan nada de la cuenta.
   */
  async function recuperarClave(correo) {
    if (!fb) throw api.ApiError('CONFIG', api.MENSAJES.CONFIG);
    var c = String(correo || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) throw api.ApiError('VALIDATION', 'Escribe un correo válido.');
    try {
      await fb.mod.sendPasswordResetEmail(fb.auth, c);
    } catch (e) {
      var code = e && e.code;
      if (code === 'auth/invalid-email') throw api.ApiError('VALIDATION', 'Escribe un correo válido.');
      if (code === 'auth/network-request-failed') throw api.ApiError('NETWORK', api.MENSAJES.NETWORK);
      // Un bloqueo de la clave sí se dice: no depende de la cuenta y, si no, la persona espera un correo que nunca saldrá.
      if (esBloqueoDeClave(code)) throw api.ApiError('AUTH', MSG_REFERER);
      // Cualquier otro fallo (cuenta inexistente, límite de envíos) se responde igual que un envío.
    }
  }

  async function cerrarSesion() {
    mensajeSalida = '';
    limpiarSesion();
    if (fb && fb.auth) await fb.mod.signOut(fb.auth);
  }

  /** Tras cambiar la clave, Firebase revoca las sesiones: se entra otra vez con la clave nueva. */
  async function reautenticar(correo, clave) {
    reautenticando = true;
    try {
      await fb.mod.signOut(fb.auth);
      await iniciarSesion(correo, clave);
    } catch (e) {
      reautenticando = false;
      limpiarSesion();
      acceso.login('Tu contraseña se cambió. Inicia sesión con la nueva.');
      return;
    }
    reautenticando = false;
  }

  /** Sesión vencida o revocada: sale y muestra el ingreso con el aviso, gane quien gane entre esto y el oyente de Firebase. */
  async function sesionVencida() {
    var m = 'Tu sesión expiró. Inicia sesión de nuevo.';
    try { await cerrarSesion(); } catch (e) { limpiarSesion(); }   // si el SDK no pudo cerrar, la limpieza local ya quedó hecha
    mensajeSalida = m;
    app.ocultarCascaron();
    acceso.login(m);
  }

  /** Token de Firebase. Si el SDK no puede dar uno (cuenta revocada, sin red al renovar), no se muestran errores crudos. */
  async function token(forzar) {
    var falla = function () { return api.ApiError('UNAUTHENTICATED', api.MENSAJES.UNAUTHENTICATED); };
    var err = falla();
    if (usuarioFb) {
      try { return await usuarioFb.getIdToken(!!forzar); } catch (e) { /* sin token: se trata como vencida abajo */ }
    }
    if (forzar) { err.manejado = true; sesionVencida(); }
    throw err;
  }

  function aplicar(s) {
    var ctx = s.contexto || {};
    estado.usuario = s.usuario;
    estado.membresias = s.membresias || [];
    estado.nivel = (estado.membresias.filter(function (m) { return m.membresiaId === estado.membresiaId; })[0] || {}).nivel || '';
    estado.dojo = ctx.dojo || null;
    estado.herramientas = ctx.herramientas || [];
    estado.cuenta = ctx.cuenta || null;
    estado.cuentas = ctx.cuentas || [];
    estado.cortesia = ctx.cortesia === true;
    estado.soloLectura = !!ctx.soloLectura;
    estado.pausado = !!ctx.pausado;
  }

  /** Primer paso tras iniciar sesión: clave temporal, membresía, aviso, y entra. */
  async function arrancar() {
    var yo = ++ronda;
    mensajeSalida = '';
    acceso.cargando();
    try {
      estado = vacio();
      estado.membresiaId = guardada();
      var s;
      try { s = await api('sesion', {}); } catch (e) {
        if (e.code !== 'FORBIDDEN' || !estado.membresiaId) throw e;
        recordar(''); estado.membresiaId = '';          // membresía recordada que ya no sirve
        s = await api('sesion', {});
      }
      if (yo !== ronda) return;
      if (s.debeCambiarClave) { acceso.cambioClave(s.usuario); return; }
      estado.usuario = s.usuario;
      estado.membresias = s.membresias;
      var m = s.membresias.filter(function (x) { return x.membresiaId === estado.membresiaId; })[0];
      if (!m && s.membresias.length === 1) m = s.membresias[0];
      if (!m) { estado.membresiaId = ''; acceso.elegir(s.membresias); return; }
      await entrar(m, s);
    } catch (e) {
      if (!e.manejado) acceso.errorGrave(e.message);
    }
  }

  /** Fija la membresía, trae el contexto (menú, plan, estado) y revisa la puerta del aviso. */
  async function entrar(m, previa) {
    estado.membresiaId = m.membresiaId;
    recordar(m.membresiaId);
    var s = previa && previa.membresiaId === m.membresiaId ? previa : await api('sesion', {});
    aplicar(s);
    estado.avisoViejo = false;
    if (estado.nivel === 'alumno') {
      var av = await api('verAviso', {});
      if (av.requiereNuevo || av.requiereActualizar) { acceso.aviso(av); return; }
    }
    app.mostrar();
  }

  async function elegir(m) {
    ronda++;
    acceso.cargando();
    try { await entrar(m, null); } catch (e) { if (!e.manejado) acceso.errorGrave(e.message); }
  }

  /** Vuelve a pedir el contexto de la membresía actual (menú, franja) sin cambiar de pantalla. */
  var refrescando = false;
  async function refrescar() {
    if (refrescando || !estado.membresiaId) return;
    refrescando = true;
    try { aplicar(await api('sesion', {})); app.pintarCascaron(); } catch (e) { /* el error original ya se mostró */ } finally { refrescando = false; }
  }

  window.auth = {
    get estado() { return estado; },
    iniciar: iniciar, token: token, recuperarClave: recuperarClave, cerrarSesion: cerrarSesion, reautenticar: reautenticar, sesionVencida: sesionVencida,
    get generacion() { return ronda; },
    arrancar: arrancar, entrar: entrar, elegir: elegir, refrescar: refrescar,
    correo: function () { return usuarioFb ? usuarioFb.email : ''; },
    marcarAvisoViejo: function (v) { estado.avisoViejo = !!v; }
  };
  window.iniciarSesion = iniciarSesion;

  // Puertas del servidor: la pantalla correcta según el código.
  api.puerta('PASSWORD_CHANGE_REQUIRED', function () { acceso.cambioClave({ correo: auth.correo(), nombre: '' }); return 'manejado'; });
  api.puerta('NOTICE_REQUIRED', function () {
    api('verAviso', {}).then(function (av) { acceso.aviso(av); }, function () { /* ya se informó */ });
    return 'manejado';
  });
  api.puerta('PAUSED', function () {
    auth.refrescar().then(function () { location.hash = '#/cobros'; });
    return 'manejado';
  });
  // READ_ONLY y PLAN_REQUIRED: se vuelve a pedir el contexto para que la franja y el menú reflejen el estado real
  // (admin: detalle; admin-dojos: resumen de sus dojos; tutor y alumno: aviso neutro). general no tiene franja de dojo.
  function refrescarSegunNivel() { if (auth.estado.nivel && auth.estado.nivel !== 'general') auth.refrescar(); }
  api.puerta('READ_ONLY', refrescarSegunNivel);
  api.puerta('PLAN_REQUIRED', refrescarSegunNivel);
})();
