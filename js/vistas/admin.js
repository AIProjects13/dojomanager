/* admin.js: pantallas del dojo para el personal (Task 16): alumnos y fichas, tutores, clases, planes, pagos, plantillas y avisos,
 * suspendidos y ajustes. Las usan el administrador del dojo y, con un selector de dojo arriba, el administrador general y el de
 * dojos (spec 4: mismas operaciones dentro de su alcance). Cobrar (efectivo, confirmar, cobros únicos, descuentos) es solo del
 * administrador del dojo. Todo texto de personas entra por ui.el (textContent). Siguen el contrato de ui.js: contenedor nuevo
 * por navegación y ctx.vigente() tras cada await.
 * También deja en `plat.d` las ayudas que comparten tutor.js y alumno.js. */
(function () {
  'use strict';
  var el = ui.el;
  var P = plat;
  var D = {};
  var Q = P.dinero;

  // ------------------------------------------------------------------ Texto, fechas y piezas pequeñas
  var DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  var DIA_TXT = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
  var ABREV = { lun: 'lunes', mar: 'martes', mie: 'miercoles', jue: 'jueves', vie: 'viernes', sab: 'sabado', dom: 'domingo' };
  var ESTADOS = { activo: ['Activo', 'ok'], pausado: ['Pausado por atraso', 'mal'], congelado: ['Congelado', 'info'], baja: ['Dado de baja', 'alerta'] };
  var contador = 0;

  function diaCanon(d) {
    var s = String(d === undefined || d === null ? '' : d).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (/^[1-7]$/.test(s)) return DIAS[Number(s) - 1];
    return ABREV[s] || s;
  }
  function diaTxt(d) { return DIA_TXT[diaCanon(d)] || String(d || ''); }
  function horarioTxt(c) { return diaTxt(c.dia) + ' ' + c.horaInicio + ' a ' + c.horaFin; }
  function claseTxt(c) { return (c.disciplina || 'Clase') + ' · ' + horarioTxt(c); }
  function hoyGT() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function edadDe(nac) {
    var h = hoyGT();
    var a = Number(h.slice(0, 4)) - Number(nac.slice(0, 4));
    if (h.slice(5) < nac.slice(5)) a--;
    return a;
  }
  function esMenorFecha(nac) { return /^\d{4}-\d{2}-\d{2}$/.test(String(nac || '')) && edadDe(nac) < 18; }
  function etiquetaEstado(e) { var x = ESTADOS[e] || [String(e || ''), 'info']; return P.etiqueta(x[0], x[1]); }
  function campoManual(etiqueta, ctl, ayuda) {
    var id = 'cm-' + (++contador);
    ctl.id = id;
    return el('div', { class: 'campo' }, el('label', { for: id, texto: etiqueta }), ctl, ayuda ? el('p', { class: 'ayuda', texto: ayuda }) : null);
  }
  function opciones(lista, vacio) {
    var o = vacio ? [el('option', { value: '', texto: vacio })] : [];
    lista.forEach(function (x) { o.push(el('option', { value: x[0], texto: x[1] })); });
    return o;
  }
  function vacio(texto) { return el('p', { class: 'vacio', texto: texto }); }
  function panel(clase) { return el('section', { class: 'panel' + (clase ? ' ' + clase : '') }, Array.prototype.slice.call(arguments, 1)); }
  /** Botones de acción de una vista: cada clic deshabilita todas las acciones de la vista hasta que termina (un doble clic envía una sola petición). */
  function acciones_(raiz) { return function (texto, clase, aria, fn) { return P.boton(texto, clase, aria, P.protegido(raiz, fn)); }; }

  function copiar(texto, mensaje, nodo) {
    var listo = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(texto) : Promise.reject(new Error('sin portapapeles'));
    listo.then(function () { ui.aviso(mensaje || 'Copiado.', 'ok'); }, function () {
      if (nodo) {
        var rango = document.createRange();
        rango.selectNodeContents(nodo);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rango);
      }
      ui.aviso('No se pudo copiar solo. Quedó seleccionado: cópialo con Ctrl+C.', 'error');
    });
  }
  function esCelular() {
    var u = navigator.userAgentData;
    if (u && typeof u.mobile === 'boolean' && u.mobile) return true;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  // ------------------------------------------------------------------ Diálogos con formulario
  function abrirDialogo(d) {
    d.addEventListener('close', function () { if (d.parentNode) d.parentNode.removeChild(d); });
    document.body.appendChild(d);
    d.showModal();
  }
  /** op: { titulo, texto (texto o lista), campos, boton, peligro, alEnviar(v, { claseIdempotencia }) }. Promesa con el resultado, o null si cancela. */
  function dialogoForm(op) {
    return new Promise(function (resolver) {
      var d = el('dialog', { 'aria-label': op.titulo, class: 'dialogo-grande' });
      var listo = false;
      var cerrar = function (v) { if (listo) return; listo = true; d.close(); resolver(v); };
      var form = ui.formulario(op.campos, op.alEnviar, { textoBoton: op.boton || 'Guardar', alExito: function (r) { cerrar(r === undefined ? true : r); } });
      if (op.peligro) form.querySelector('button[type=submit]').className = 'peligro';
      form.appendChild(el('button', { type: 'button', texto: 'Cancelar', al: { click: function () { cerrar(null); } } }));
      d.appendChild(el('h2', { texto: op.titulo }));
      [].concat(op.texto || []).forEach(function (t) { d.appendChild(el('p', { texto: t })); });
      d.appendChild(form);
      d.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(null); });
      abrirDialogo(d);
      var primero = form.querySelector('input,select,textarea');
      if (primero) primero.focus();
    });
  }

  // ------------------------------------------------------------------ Vistas por nivel
  var tablaVistas = {};
  function sinAcceso(c) { c.appendChild(el('p', { class: 'error', role: 'alert', texto: 'No tienes acceso a esta pantalla.' })); }
  /** Varias pantallas comparten nombre en el menú: aquí cada nivel registra la suya y se reparte por el nivel de la sesión. */
  function vista(nombre, niveles, fn) {
    var t = tablaVistas[nombre];
    if (!t) {
      t = tablaVistas[nombre] = {};
      ui.vista(nombre, function (c, ctx) { var f = t[ctx.sesion.nivel]; return f ? f(c, ctx) : sinAcceso(c); });
    }
    [].concat(niveles).forEach(function (n) { t[n] = fn; });
  }

  var elegido = { gen: -1, id: '' };
  // El panel de un dojo (Mis dojos) deja elegido ese dojo antes de abrir una de estas pantallas.
  window.elegirDojoTrabajo = function (id) { elegido = { gen: auth.generacion, id: id }; };
  async function correr(zona, k, cuerpo) {
    try { await cuerpo(zona, k); } catch (e) {
      if ((e && e.manejado) || !k.vigente()) return;
      ui.limpiar(zona);
      zona.appendChild(el('p', { class: 'error', role: 'alert', texto: (e && e.message) || 'No se pudo cargar esta pantalla.' }));
    }
  }
  /**
   * Prepara el contexto de trabajo `k` de una pantalla del dojo: { nivel, dojoId, dojoNombre, llamar(accion, payload), tiene(herramienta), vigente() }.
   * El administrador trabaja en su dojo. General y admin-dojos eligen el dojo arriba y cada petición lleva su dojoId (el servidor lo
   * revisa contra su alcance). `tiene` solo oculta; un PLAN_REQUIRED del servidor se muestra tal cual.
   */
  async function alcance(c, ctx, op, cuerpo) {
    var s = ctx.sesion;
    var nivel = s.nivel;
    P.encabezado(c, op.titulo, op.intro);
    var hc = null;
    var hostClave = function () {
      if (!hc) {
        hc = el('div', { class: 'resultado-cuenta', role: 'region', 'aria-label': 'Cuenta creada', 'aria-live': 'polite' });
        c.insertBefore(hc, c.children[2] || null);
      }
      return hc;
    };
    if (nivel !== 'general' && nivel !== 'admin-dojos') {
      var zonaA = el('div');
      c.appendChild(zonaA);
      return correr(zonaA, {
        hostClave: hostClave,
        nivel: nivel, dojoId: s.dojo ? s.dojo.dojoId : '', dojoNombre: s.dojo ? s.dojo.nombre : '',
        llamar: function (a, p) { return api(a, p || {}); },
        tiene: function (h) { return s.herramientas.indexOf(h) !== -1; },
        vigente: ctx.vigente
      }, cuerpo);
    }
    var d = await api('listarDojos', {});
    if (!ctx.vigente()) return;
    var dojos = d.dojos.filter(function (x) { return x.estado === 'activo'; });
    if (!dojos.length) { c.appendChild(vacio('Aún no hay dojos activos. Crea el primero en "' + (nivel === 'general' ? 'Dojos y planes' : 'Mis dojos') + '".')); return; }
    if (elegido.gen !== auth.generacion || !dojos.some(function (x) { return x.dojoId === elegido.id; })) elegido = { gen: auth.generacion, id: dojos[0].dojoId };
    var sel = el('select', { 'aria-label': 'Dojo' }, dojos.map(function (x) { return el('option', { value: x.dojoId, texto: x.nombre }); }));
    sel.value = elegido.id;
    c.appendChild(campoManual('Dojo en el que trabajas', sel));
    c.lastChild.classList.add('selector-dojo');
    var host = el('div');
    c.appendChild(host);
    var actual = null;
    function pintar() {
      var dj = dojos.filter(function (x) { return x.dojoId === sel.value; })[0];
      elegido = { gen: auth.generacion, id: dj.dojoId };
      var zona = el('div');
      actual = zona;
      ui.limpiar(host).appendChild(zona);
      return correr(zona, {
        hostClave: hostClave, nivel: nivel, dojoId: dj.dojoId, dojoNombre: dj.nombre,
        llamar: function (a, p) { return api(a, Object.assign({}, p || {}, { dojoId: dj.dojoId })); },
        tiene: function (h) { return nivel === 'general' || (!!dj.plan && dj.plan.herramientas.indexOf(h) !== -1); },
        vigente: function () { return ctx.vigente() && actual === zona; }
      }, cuerpo);
    }
    sel.addEventListener('change', pintar);
    await pintar();
  }

  // ------------------------------------------------------------------ Cuentas: crear (o encontrar por correo) y entregar la clave
  /** La clave temporal se muestra una vez y se borra al salir de la pantalla. Sin la vista, un diálogo que no se cierra con Escape. */
  function armarClave(r, v, alEntregar, dojoNombre) {
    var clave = el('code', { class: 'clave-temporal', texto: r.claveTemporal });
    return [
      el('h3', { texto: 'Cuenta lista' }),
      el('p', { texto: 'Cuenta para ' + v.nombre + ' (' + v.correo + ')' + (dojoNombre ? ', del dojo ' + dojoNombre : '') + '.' }),
      el('p', { class: 'ayuda', texto: 'Clave temporal:' }),
      clave,
      el('p', { texto: r.mensaje }),
      el('p', { class: 'advertencia', role: 'alert', texto: 'Esta clave no se vuelve a mostrar. Cópiala y entrégala ahora; al salir de esta pantalla se borra.' }),
      el('div', { class: 'acciones-fila' },
        el('button', { type: 'button', class: 'primario', texto: 'Copiar clave', al: { click: function () { copiar(clave.textContent, 'Clave copiada.', clave); } } }),
        el('button', { type: 'button', texto: 'Ya la entregué', al: { click: alEntregar } }))
    ];
  }
  function claveModal(r, v, dojoNombre) {
    var d = el('dialog', { 'aria-label': 'Cuenta creada', class: 'dialogo-clave' });
    armarClave(r, v, function () { d.close(); }, dojoNombre).forEach(function (n) { d.appendChild(n); });
    d.addEventListener('cancel', function (e) { e.preventDefault(); });
    d.addEventListener('close', function () { ui.limpiar(d); });
    abrirDialogo(d);
  }
  /**
   * Formulario para crear la cuenta de una persona (nivel `alumno` o `tutor`). Si el correo ya tiene cuenta, el servidor solo le
   * agrega la membresía y la responde igual: así sirve también para "buscar por correo". op: { boton, alCrear(r, v) }.
   */
  function formCuenta(k, nivel, op) {
    // `k.hostClave()` es un bloque fuera del área que se repinta (la ficha, la lista): así la clave sigue a la vista hasta "Ya la entregué".
    var host = k.hostClave ? k.hostClave() : el('div', { class: 'resultado-cuenta', role: 'region', 'aria-label': 'Cuenta creada', 'aria-live': 'polite' });
    var limpiarClave = function () { window.removeEventListener('hashchange', limpiarClave); ui.limpiar(host); };
    var form = ui.formulario([
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true, maxlength: 254, autocomplete: 'off' },
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 120, autocomplete: 'off' },
      { nombre: 'telefono', etiqueta: 'Teléfono (opcional)', tipo: 'tel', maxlength: 30, autocomplete: 'off', ayuda: 'Con este número se abre WhatsApp para los avisos de cobro.' }
    ], async function (v) {
      var datos = { correo: v.correo, nombre: v.nombre, telefono: v.telefono };
      var r = nivel === 'tutor' ? await k.llamar('crearTutor', datos) : await k.llamar('crearCuenta', Object.assign({ nivel: nivel }, datos));
      if (!k.vigente()) { claveModal(r, v, k.dojoNombre); return; }
      ui.limpiar(host);
      armarClave(r, v, limpiarClave, k.dojoNombre).forEach(function (n) { host.appendChild(n); });
      window.addEventListener('hashchange', limpiarClave);
      host.querySelector('.clave-temporal').scrollIntoView({ block: 'nearest' });
      form.reset();
      if (op.alCrear) await op.alCrear(r, v);
    }, { textoBoton: op.boton || 'Crear cuenta' });
    return k.hostClave ? form : el('div', null, form, host);
  }

  // ------------------------------------------------------------------ Recibo recién emitido
  function panelRecibo(k, raiz, recibo, titulo) {
    var acc = acciones_(raiz);
    return el('div', { class: 'panel ok', role: 'status' },
      el('h3', { texto: titulo }),
      el('p', { texto: 'Recibo ' + recibo.numero + '. También queda siempre en la pantalla Recibos.' }),
      acc('Descargar recibo ' + recibo.numero, 'primario', 'Descargar el recibo ' + recibo.numero, async function () {
        var d = await k.llamar('descargarRecibo', { reciboId: recibo.reciboId });
        P.descargar(d.nombre, d.mime, d.base64);
        ui.aviso('Recibo ' + d.numero + ' descargado.', 'ok');
      }));
  }

  // ------------------------------------------------------------------ Avisos por WhatsApp y Gmail (spec 7 y 10)
  var TIPOS_AVISO = [
    ['recordatorio', 'Recordatorio de pago'], ['atraso', 'Pago atrasado'], ['ultimo-aviso', 'Último aviso'],
    ['credencial-pausada', 'Credencial pausada'], ['cambio-clase', 'Cambio de clase']
  ];
  var MARCADORES_TXT = {
    nombre: 'el alumno', encargado: 'quien recibe el aviso', dojo: 'el nombre del dojo', desglose: 'cada mes que se debe y su monto',
    total: 'lo que se debe en total', dias_atraso: 'los días de atraso', fecha_pago: 'la fecha de pago más antigua'
  };

  /** Una tarjeta con el mensaje listo. Los enlaces se abren solo cuando la persona los toca; luego se anota "abierto para enviar". */
  function tarjetaAviso(k, a, tipo) {
    var cerrojo = false;
    function anotar(canal) {
      return function (ev) {
        if (cerrojo) { ev.preventDefault(); return; }
        cerrojo = true;
        setTimeout(function () { cerrojo = false; }, 1500);
        k.llamar('anotarEnvio', { alumnoId: a.alumnoId, tipo: tipo, canal: canal }).then(function () {
          if (k.vigente()) ui.aviso('Anotado: aviso abierto para enviar a ' + (a.destinatario || a.nombre) + '. Revisa el mensaje y envíalo tú.', 'ok');
        }, P.fallo);
      };
    }
    var cel = esCelular();
    var botones = [];
    var notas = [];
    var texto = el('div', { class: 'texto-aviso texto-largo', tabindex: 0, role: 'region', 'aria-label': 'Mensaje para ' + a.nombre }, a.texto);
    var quien = a.destinatario ? 'Para ' + a.destinatario + (a.esEncargado ? ' (encargado de ' + a.nombre + ')' : '') + '.' : 'No hay a quién escribirle: este alumno no tiene cuenta activa.';

    var wa = null;
    if (a.sinTelefono) notas.push('No hay un número de WhatsApp válido para ' + (a.destinatario || a.nombre) + '. Usa el correo o pide que actualicen su teléfono.');
    else {
      wa = Enlaces.enlaceWhatsApp(a.telefono, a.texto);
      if (a.urlLarga.whatsapp || Enlaces.enlaceLargo(wa)) {
        wa = null;
        notas.push('El mensaje es demasiado largo para abrirse en WhatsApp con seguridad: el teléfono podría cortarlo sin avisar. Copia el texto y pégalo en WhatsApp.');
      }
    }
    if (wa) botones.push(el('a', { class: 'boton primario', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir WhatsApp con el aviso para ' + a.nombre, texto: 'Abrir WhatsApp', al: { click: anotar('whatsapp') } }));

    var correo = null;
    if (a.sinCorreo) notas.push('No hay correo para ' + (a.destinatario || a.nombre) + '.');
    else {
      correo = cel ? Enlaces.enlaceCorreo(a.correo, a.asunto, a.texto) : Enlaces.enlaceGmailWeb(a.correo, a.asunto, a.texto);
      if (a.urlLarga.correo || Enlaces.enlaceLargo(correo)) {
        correo = null;
        notas.push('El mensaje es demasiado largo para abrirse por correo con seguridad. Copia el texto y pégalo en tu correo.');
      }
    }
    if (correo) {
      botones.push(el('a', {
        class: 'boton', href: correo, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': (cel ? 'Abrir el correo con el aviso para ' : 'Abrir Gmail con el aviso para ') + a.nombre,
        texto: cel ? 'Abrir correo' : 'Abrir Gmail', al: { click: anotar(cel ? 'correo' : 'gmail') }
      }));
    }
    botones.push(el('button', { type: 'button', texto: 'Copiar texto', 'aria-label': 'Copiar el mensaje para ' + a.nombre, al: { click: function () { copiar(a.texto, 'Texto copiado.', texto); } } }));
    return el('div', { class: 'panel' },
      el('h3', { texto: a.nombre }), el('p', { texto: quien }),
      a.asunto ? el('p', { class: 'ayuda', texto: 'Asunto del correo: ' + a.asunto }) : null,
      texto,
      notas.map(function (n) { return el('p', { class: 'advertencia', role: 'status', texto: n }); }),
      el('div', { class: 'acciones-fila' }, botones),
      el('p', { class: 'ayuda', texto: 'La app no envía nada: se abre con el mensaje escrito y tú lo revisas y lo envías.' }));
  }

  /**
   * Prepara un aviso. op: { alumnoId, nombre } (alumno fijo), { alumnos: [{alumnoId, nombre}] } (se elige) o { claseId } (cambio de clase
   * para todos los inscritos). `puedePromocion` muestra la opción de promoción; también se descubre al preparar o al elegir al alumno.
   */
  function panelAviso(k, op) {
    var raiz = el('section', { class: 'panel panel-aviso', 'aria-label': 'Preparar un aviso' });
    var salida = el('div', { 'aria-live': 'polite' });
    var acc = acciones_(raiz);
    var puede = !!op.puedePromocion;
    var selAlumno = null;
    var selTipo = el('select', { 'aria-label': 'Tipo de aviso' });
    function llenarTipos(actual) {
      ui.limpiar(selTipo);
      var lista = op.claseId ? [TIPOS_AVISO[4]] : TIPOS_AVISO.concat(puede ? [['promocion', 'Promoción']] : []);
      opciones(lista).forEach(function (o) { selTipo.appendChild(o); });
      var quiere = actual || op.tipo || '';
      if (lista.some(function (x) { return x[0] === quiere; })) selTipo.value = quiere;
    }
    llenarTipos(op.tipo);
    raiz.appendChild(el('h3', { texto: op.claseId ? 'Avisar un cambio de clase' : 'Enviar un aviso' }));
    if (op.nombre) raiz.appendChild(el('p', { texto: 'Para ' + op.nombre + '.' }));
    if (op.alumnos) {
      selAlumno = el('select', { 'aria-label': 'Alumno' }, opciones(op.alumnos.map(function (a) { return [a.alumnoId, a.nombre]; }), 'Elige a un alumno'));
      raiz.appendChild(campoManual('Alumno', selAlumno));
      selAlumno.addEventListener('change', function () {
        ui.limpiar(salida);
        if (!selAlumno.value) return;
        // Sondeo silencioso para saber si se le pueden ofrecer promociones (el servidor lo decide, aquí solo se muestra la opción).
        var id = selAlumno.value;
        k.llamar('prepararAviso', { alumnoId: id, tipo: 'cambio-clase' }).then(function (r) {
          if (selAlumno.value !== id || !k.vigente()) return;
          puede = !!r.puedePromocion;
          llenarTipos(selTipo.value);
        }, function () { /* sin sondeo: la opción de promoción no aparece */ });
      });
    }
    if (!op.claseId) raiz.appendChild(campoManual('Tipo de aviso', selTipo, 'Los avisos de cobro arman solos el desglose de lo que se debe.'));
    raiz.appendChild(acc(op.claseId ? 'Preparar el aviso de la clase' : 'Preparar el aviso', 'primario', null, async function () {
      var alumnoId = op.alumnoId || (selAlumno && selAlumno.value);
      if (!op.claseId && !alumnoId) { ui.aviso('Elige primero a un alumno.', 'error'); return; }
      var tipo = op.claseId ? 'cambio-clase' : selTipo.value;
      var r = await k.llamar('prepararAviso', op.claseId ? { claseId: op.claseId, tipo: tipo } : { alumnoId: alumnoId, tipo: tipo });
      if (!k.vigente()) return;
      ui.limpiar(salida);
      if (op.claseId) {
        salida.appendChild(el('p', { texto: r.destinatarios.length ? 'Un mensaje por alumno. Abre cada uno con su botón.' : 'Esta clase no tiene alumnos inscritos todavía.' }));
        r.destinatarios.forEach(function (a) { salida.appendChild(tarjetaAviso(k, a, tipo)); });
        return;
      }
      if (r.puedePromocion !== puede) { puede = !!r.puedePromocion; llenarTipos(tipo); }
      salida.appendChild(tarjetaAviso(k, r, tipo));
    }));
    raiz.appendChild(salida);
    return raiz;
  }

  // ------------------------------------------------------------------ Diálogos de cobro (solo el administrador del dojo)
  /** Cada uno devuelve una promesa con el resultado del servidor, o null si la persona cancela. */
  function dialogoCobroUnico(k, a) {
    return dialogoForm({
      titulo: 'Cobro único para ' + a.nombre,
      texto: 'Para inscripción, examen, uniforme u otro cobro fuera de la mensualidad.',
      campos: [
        { nombre: 'concepto', etiqueta: 'Concepto', requerido: true, minlength: 3, maxlength: 120, ayuda: 'Por ejemplo: Inscripción, Examen de cinta, Uniforme.' },
        { nombre: 'monto', etiqueta: 'Monto (Q)', tipo: 'number', requerido: true, min: '0.01', step: '0.01' },
        { nombre: 'fechaPago', etiqueta: 'Pagar antes del (opcional)', tipo: 'date', ayuda: 'Si la dejas vacía, se usan los días de plazo del dojo.' }
      ],
      boton: 'Agregar cobro',
      alEnviar: async function (v) {
        var p = { alumnoId: a.alumnoId, concepto: v.concepto, monto: String(v.monto) };
        if (v.fechaPago) p.fechaPago = v.fechaPago;
        await k.llamar('agregarCobroUnico', p);
        ui.aviso('Cobro agregado.', 'ok');
      }
    });
  }
  function dialogoDescuento(k, c) {
    return dialogoForm({
      titulo: 'Descuento en ' + c.concepto,
      texto: 'El cobro es de ' + Q(c.monto) + '. Escribe cuánto se descuenta (0 quita un descuento) y el motivo; queda en la bitácora.',
      campos: [
        { nombre: 'descuento', etiqueta: 'Descuento (Q)', tipo: 'number', requerido: true, min: '0', max: String(c.monto), step: '0.01', valor: c.descuento || '' },
        { nombre: 'motivo', etiqueta: 'Motivo (beca, hermano, ajuste...)', requerido: true, minlength: 3, maxlength: 300 }
      ],
      boton: 'Aplicar descuento',
      alEnviar: async function (v) {
        await k.llamar('aplicarDescuento', { cobroId: c.cobroId, descuento: String(v.descuento), motivo: v.motivo });
        ui.aviso('Descuento aplicado.', 'ok');
      }
    });
  }
  /** Devuelve la respuesta de registrarEfectivo (con el recibo) o null. */
  async function dialogoEfectivo(k, a) {
    var cb = await k.llamar('listarCobrosAlumnos', { alumnoId: a.alumnoId });
    if (!k.vigente()) return null;
    var pend = cb.cobros.filter(function (c) { return c.sinCubrir > 0; });
    var total = pend.reduce(function (s, c) { return s + c.sinCubrir; }, 0);
    var campos = [{ nombre: 'monto', etiqueta: 'Monto recibido (Q)', tipo: 'number', requerido: true, min: '0.01', step: '0.01', valor: total > 0 ? Math.round(total * 100) / 100 : '' }];
    pend.forEach(function (c, i) {
      campos.push({ nombre: 'c' + i, etiqueta: c.concepto + ' (' + c.periodo + '): faltan ' + Q(c.sinCubrir), tipo: 'checkbox' });
    });
    var salida = null;
    var r = await dialogoForm({
      titulo: 'Pago en efectivo de ' + a.nombre,
      texto: pend.length
        ? ['Registra lo que te entregaron. Genera recibo al instante y queda en la bitácora con tu nombre.', 'Si no marcas ningún cobro, el pago cubre los más antiguos primero. Si marcas algunos, solo esos.']
        : 'No hay cobros pendientes: lo que recibas quedará como saldo a favor.',
      campos: campos, boton: 'Registrar pago',
      alEnviar: async function (v, o) {
        var ids = [];
        pend.forEach(function (c, i) { if (v['c' + i]) ids.push(c.cobroId); });
        var p = { alumnoId: a.alumnoId, monto: String(v.monto), claveIdempotencia: o.claveIdempotencia };
        if (ids.length) p.cobroIds = ids;
        salida = await k.llamar('registrarEfectivo', p);
        return salida;
      }
    });
    return r ? salida : null;
  }

  // ------------------------------------------------------------------ Alumnos: lista, alertas y alta
  async function alumnos(zona, k) {
    var acc = acciones_(zona);
    var datos = null;
    var ver = { estado: '', texto: '' };
    var abrirFichaAlIniciar = D.pendiente;
    D.pendiente = null;

    async function cargar() {
      var r = await Promise.all([
        k.llamar('listarAlumnos', {}), k.llamar('listarPlanesDojo', {}),
        k.nivel === 'general' ? Promise.resolve({ alertas: [] }) : k.llamar('listarAlertas', {})
      ]);
      datos = { alumnos: r[0].alumnos, planes: r[1].planes, alertas: r[2].alertas };
      datos.planPorId = {};
      datos.planes.forEach(function (p) { datos.planPorId[p.planDojoId] = p; });
    }

    async function lista() {
      await cargar();
      if (!k.vigente()) return;
      ui.limpiar(zona);
      var cont = el('div');
      // Avisos
      if (datos.alertas.length) {
        var tarjetas = datos.alertas.map(function (a) {
          return el('li', null,
            el('p', { texto: a.mensaje }),
            el('div', { class: 'acciones-fila' },
              a.tipo === 'cumple-18'
                ? acc('Asignar su cuenta', 'primario', 'Asignar su propia cuenta a ' + a.nombre, function () { return ficha(a.alumnoId, { enfocar: 'cuenta' }); })
                : acc('Abrir la ficha', '', 'Abrir la ficha de ' + a.nombre, function () { return ficha(a.alumnoId, {}); })));
        });
        cont.appendChild(panel('destacado',
          el('h2', { texto: 'Avisos para ti (' + datos.alertas.length + ')' }),
          el('p', { class: 'ayuda', texto: 'Mayoría de edad y clases seguidas sin asistir. Se calculan solos.' }),
          el('ul', { class: 'lista-simple' }, tarjetas)));
      }
      // Barra: nuevo, estado y búsqueda
      var panelNuevoHost = el('div');
      var botonNuevo = el('button', { type: 'button', class: 'primario', 'aria-expanded': 'false', texto: 'Nuevo alumno', al: { click: function () {
        var abierto = botonNuevo.getAttribute('aria-expanded') === 'true';
        ui.limpiar(panelNuevoHost);
        botonNuevo.setAttribute('aria-expanded', String(!abierto));
        if (!abierto) { panelNuevoHost.appendChild(panelNuevo()); panelNuevoHost.scrollIntoView({ block: 'nearest' }); }
      } } });
      var selEstado = el('select', null, opciones([['', 'Todos'], ['activo', 'Activos'], ['pausado', 'Pausados por atraso'], ['congelado', 'Congelados'], ['baja', 'Dados de baja']]));
      var buscar = el('input', { type: 'search', placeholder: 'Escribe un nombre', autocomplete: 'off', maxlength: 80 });
      var tablaHost = el('div');
      selEstado.value = ver.estado;
      buscar.value = ver.texto;
      cont.appendChild(el('div', { class: 'barra' }, botonNuevo,
        campoManual('Ver', selEstado), campoManual('Buscar', buscar)));
      cont.appendChild(panelNuevoHost);
      cont.appendChild(tablaHost);
      function pintarTabla() {
        ver.estado = selEstado.value;
        ver.texto = buscar.value.trim().toLowerCase();
        var filas = datos.alumnos.filter(function (a) {
          return (!ver.estado || a.estado === ver.estado) && (!ver.texto || a.nombre.toLowerCase().indexOf(ver.texto) !== -1);
        });
        ui.limpiar(tablaHost);
        tablaHost.appendChild(ui.tabla([
          {
            clave: 'nombre', titulo: 'Alumno', formato: function (v, f) {
              return el('div', null, el('b', { texto: f.nombre }), f.esMenor ? [' ', P.etiqueta('Menor', 'info')] : null,
                el('p', { class: 'ayuda', texto: 'Nació el ' + P.fechaCorta(f.fechaNacimiento) }));
            }
          },
          { clave: 'titularNombre', titulo: 'Encargado o titular', formato: function (v) { return v || '—'; } },
          { clave: 'planDojoId', titulo: 'Plan', formato: function (v) { return v && datos.planPorId[v] ? datos.planPorId[v].nombre : 'Sin plan'; } },
          { clave: 'estado', titulo: 'Estado', formato: function (v) { return etiquetaEstado(v); } },
          { clave: 'alumnoId', titulo: 'Ficha', formato: function (v, f) { return acc('Abrir ficha', '', 'Abrir la ficha de ' + f.nombre, function () { return ficha(v, {}); }); } }
        ], filas, {
          titulo: 'Alumnos',
          vacio: datos.alumnos.length ? 'Nadie coincide con lo que buscas. Cambia el filtro o el nombre.' : 'Aún no hay alumnos. Toca "Nuevo alumno" para registrar al primero.'
        }));
      }
      selEstado.addEventListener('change', pintarTabla);
      buscar.addEventListener('input', pintarTabla);
      pintarTabla();
      zona.appendChild(cont);
    }

    // ---- Alta de un alumno: primero la cuenta (quien recibe los cobros y entra a la app), luego la ficha
    function panelNuevo() {
      var conocidas = {};   // usuarioId -> nombre
      datos.alumnos.forEach(function (a) { if (a.titularUsuarioId) conocidas[a.titularUsuarioId] = a.titularNombre || 'Cuenta sin nombre'; });
      var selTitular = el('select', { 'aria-label': 'Cuenta del encargado o titular' });
      function llenar(elegir) {
        ui.limpiar(selTitular);
        opciones(Object.keys(conocidas).map(function (id) { return [id, conocidas[id]]; }), 'Elige una cuenta').forEach(function (o) { selTitular.appendChild(o); });
        selTitular.appendChild(el('option', { value: '__nueva', texto: 'Otra persona: crear su cuenta o buscarla por correo' }));
        selTitular.value = elegir || '';
      }
      llenar('');
      var bloqueCuenta = el('div', { hidden: true },
        el('p', { class: 'ayuda', texto: 'Escribe el correo de la persona. Si ya tiene cuenta en la plataforma se usa esa misma; si no, se crea y recibes una clave temporal para entregársela.' }),
        formCuenta(k, 'alumno', {
          boton: 'Crear o buscar cuenta',
          alCrear: function (r, v) {
            conocidas[r.usuarioId] = v.nombre + ' (' + v.correo + ')';
            llenar(r.usuarioId);
            bloqueCuenta.hidden = false;
            ui.aviso('Cuenta lista. Ya está elegida abajo: completa los datos del alumno.', 'ok');
          }
        }));
      selTitular.addEventListener('change', function () { bloqueCuenta.hidden = selTitular.value !== '__nueva'; });

      var campos = [
        { nombre: 'nombre', etiqueta: 'Nombre del alumno', requerido: true, maxlength: 120, autocomplete: 'off' },
        { nombre: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'date', requerido: true, max: hoyGT() },
        { nombre: 'fechaIngreso', etiqueta: 'Fecha de ingreso (opcional)', tipo: 'date', max: hoyGT(), ayuda: 'Si la dejas vacía es hoy.' },
        { nombre: 'planDojoId', etiqueta: 'Plan', tipo: 'select', opciones: [{ valor: '', etiqueta: 'Sin plan por ahora (no se le cobra)' }].concat(datos.planes.map(function (p) { return { valor: p.planDojoId, etiqueta: p.nombre + ' · ' + Q(p.precio) }; })) },
        { nombre: 'cuentaPropia', etiqueta: 'Es una persona adulta y entra con esa misma cuenta', tipo: 'checkbox', ayuda: 'Márcalo si el alumno es mayor de edad y usa su propia cuenta. Si es menor, su cuenta es la del encargado.' },
        { nombre: 'encargadoFechaNacimiento', etiqueta: 'Fecha de nacimiento del encargado', tipo: 'date', max: hoyGT(), ayuda: 'Un menor necesita un encargado mayor de edad. Si el encargado tiene su propia ficha de alumno aquí, no hace falta; si el sistema la necesita, te la pide. No se guarda.' }
      ];
      var form = ui.formulario(campos, async function (v) {
        if (!selTitular.value || selTitular.value === '__nueva') throw new Error('Primero elige la cuenta del encargado o titular, o créala arriba.');
        var menor = esMenorFecha(v.fechaNacimiento);
        var payload = { nombre: v.nombre, fechaNacimiento: v.fechaNacimiento, titularUsuarioId: selTitular.value };
        if (v.fechaIngreso) payload.fechaIngreso = v.fechaIngreso;
        if (v.planDojoId) payload.planDojoId = v.planDojoId;
        if (!menor && v.cuentaPropia) payload.usuarioId = selTitular.value;
        if (menor && v.encargadoFechaNacimiento) payload.encargadoFechaNacimiento = v.encargadoFechaNacimiento;
        try {
          var r = await k.llamar('crearAlumno', payload);
          ui.aviso('Alumno creado. Ahora puedes inscribirlo en sus clases.', 'ok');
          if (k.vigente()) await ficha(r.alumnoId, {});
        } catch (e) {
          if (e && /encargadoFechaNacimiento|encargado/i.test(e.message || '')) { mostrarCampoEncargado(true); }
          throw e;
        }
      }, { textoBoton: 'Crear alumno' });
      function campoForm(n) { return form.querySelector('[name=' + n + ']'); }
      function mostrarCampoEncargado(foco) {
        var menor = esMenorFecha(campoForm('fechaNacimiento').value);
        campoForm('encargadoFechaNacimiento').closest('.campo').hidden = !menor;
        campoForm('cuentaPropia').closest('.campo').hidden = menor;
        if (menor && foco) campoForm('encargadoFechaNacimiento').focus();
      }
      campoForm('fechaNacimiento').addEventListener('change', function () { mostrarCampoEncargado(false); });
      mostrarCampoEncargado(false);
      return panel('destacado',
        el('h2', { texto: 'Nuevo alumno' }),
        el('h3', { texto: 'Paso 1: la cuenta' }),
        el('p', { class: 'ayuda', texto: 'Cada alumno cuelga de una cuenta: la del encargado (si es menor) o la suya (si es adulto). Esa cuenta ve los cobros y sube los comprobantes.' }),
        campoManual('Cuenta del encargado o titular', selTitular), bloqueCuenta,
        el('h3', { texto: 'Paso 2: el alumno' }), form);
    }

    // ---- Ficha: datos, estado, clases, cobros y pagos juntos
    async function ficha(alumnoId, op) {
      var r = await Promise.all([
        k.llamar('fichaAlumno', { alumnoId: alumnoId }),
        k.llamar('listarCobrosAlumnos', { alumnoId: alumnoId }),
        k.llamar('listarPagosAlumnos', {}),
        k.tiene('clases') ? k.llamar('listarClases', {}) : Promise.resolve({ clases: [], disciplinas: [] }),
        k.llamar('listarPlanesDojo', {}),
        k.nivel === 'general' ? Promise.resolve({ alertas: [] }) : k.llamar('listarAlertas', {})
      ]);
      if (!k.vigente()) return;
      var f = r[0];
      var a = f.alumno;
      var cobros = r[1].cobros;
      var pagos = r[2].pagos.filter(function (p) { return p.titularUsuarioId === f.titular.usuarioId; });
      var clasesDojo = r[3].clases;
      var planes = r[4].planes;
      var sinCuentaPropia = r[5].alertas.some(function (x) { return x.tipo === 'cumple-18' && x.alumnoId === alumnoId; });
      var cobra = k.nivel === 'admin';
      var avisa = k.nivel !== 'general' && k.tiene('plantillas');
      var estadoCalc = f.cuenta ? f.cuenta.estado : a.estado;
      var repintar = function (o) { return ficha(alumnoId, o || {}); };

      ui.limpiar(zona);
      zona.appendChild(acc('← Volver a la lista', '', null, function () { return lista(); }));
      zona.appendChild(el('h2', { texto: a.nombre }));
      zona.appendChild(el('p', null, etiquetaEstado(estadoCalc), a.esMenor ? [' ', P.etiqueta('Menor de edad', 'info')] : null));
      if (estadoCalc === 'pausado') {
        zona.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'Su credencial está pausada por un pago atrasado' + (f.cuenta ? ' (' + f.cuenta.diasAtraso + ' días de atraso)' : '') + '. Puede ver sus cobros y subir su comprobante, pero no entrena hasta ponerse al día.' }));
      }
      zona.appendChild(el('div', { class: 'datos' },
        P.dato('Nació', P.fecha(a.fechaNacimiento) + ' (' + edadDe(a.fechaNacimiento) + ' años)'),
        P.dato('Ingresó', P.fecha(a.fechaIngreso)),
        P.dato('Plan', f.plan ? f.plan.nombre + ' · ' + Q(f.plan.precio) : 'Sin plan'),
        P.dato('Encargado o titular', f.titular.nombre || '—'),
        P.dato('Correo de contacto', f.titular.correo || '—'),
        P.dato('Teléfono de contacto', f.titular.telefono || 'Sin teléfono')));

      // Asistencia, saldo y pagos juntos
      zona.appendChild(el('h3', { texto: 'Este mes (' + f.periodo + ')' }));
      zona.appendChild(el('div', { class: 'datos' },
        P.dato('Días esperados', String(f.diasEsperados)), P.dato('Días asistidos', String(f.diasAsistidos)),
        f.saldo ? P.dato('Debe en total', Q(f.saldo.total)) : null,
        f.saldo ? P.dato('De eso, vencido', Q(f.saldo.vencido)) : null,
        f.saldo ? P.dato('Por confirmar', Q(f.saldo.porConfirmar)) : null,
        P.dato('Cobrado este mes', Q(f.pagos.cobrado))));

      // Cumple 18
      if (sinCuentaPropia) {
        zona.appendChild(el('p', { class: 'advertencia', role: 'status', texto: a.nombre + ' ya es mayor de edad y todavía no tiene su propia cuenta. Más abajo, en "Cuenta", puedes asignársela.' }));
      }

      // Estado
      var seccionEstado = panel(null, el('h3', { texto: 'Estado de ' + a.nombre }));
      seccionEstado.appendChild(el('ul', { class: 'lista-simple' },
        el('li', null, el('b', { texto: 'Congelar: ' }), 'la pausa sin darla de baja. No se le generan cobros y no cuenta como esperado; conserva su lugar en las clases.'),
        el('li', null, el('b', { texto: 'Dar de baja: ' }), 'libera su lugar en todas las clases y deja de cobrársele. Se conservan su historial, pagos y recibos.'),
        el('li', null, el('b', { texto: 'Reactivar: ' }), 'vuelve a estar activo y se le cobra desde hoy. Si estaba dado de baja, hay que inscribirlo otra vez.')));
      var bs = [];
      if (a.estado === 'activo') bs.push(acc('Congelar', '', 'Congelar a ' + a.nombre, function () { return cambiarEstado(a, 'congelado', repintar); }));
      if (a.estado !== 'baja') bs.push(acc('Dar de baja', 'peligro', 'Dar de baja a ' + a.nombre, function () { return cambiarEstado(a, 'baja', repintar); }));
      if (a.estado !== 'activo') bs.push(acc('Reactivar', 'primario', 'Reactivar a ' + a.nombre, function () { return cambiarEstado(a, 'activo', repintar); }));
      seccionEstado.appendChild(P.acciones.apply(null, bs));
      zona.appendChild(seccionEstado);

      // Clases
      var idsInscrito = f.clases.map(function (c) { return c.claseId; });
      var porId = {};
      clasesDojo.forEach(function (c) { porId[c.claseId] = c; });
      var seccionClases = panel(null, el('h3', { texto: 'Clases' }));
      seccionClases.appendChild(ui.tabla([
        { clave: 'claseId', titulo: 'Clase', formato: function (v, c) { return porId[v] ? claseTxt(porId[v]) : horarioTxt(c); } },
        {
          clave: 'claseId', titulo: 'Lugares', formato: function (v) {
            var c = porId[v];
            return c ? c.inscritos + ' de ' + c.cupo + (c.inscritos >= c.cupo ? ' (llena)' : '') : '—';
          }
        },
        {
          clave: 'claseId', titulo: 'Retirar', formato: function (v, c) {
            return acc('Retirar de la clase', '', 'Retirar a ' + a.nombre + ' de ' + (porId[v] ? claseTxt(porId[v]) : 'la clase'), async function () {
              var ok = await ui.confirmar('¿Retirar a ' + a.nombre + ' de esta clase? Se libera su lugar; su asistencia anterior se conserva.', { aceptar: 'Retirar' });
              if (!ok) return;
              await k.llamar('retirarInscripcion', { alumnoId: alumnoId, claseId: v });
              ui.aviso('Retirado de la clase.', 'ok');
              if (k.vigente()) await repintar();
            });
          }
        }
      ], f.clases, { titulo: 'Clases de ' + a.nombre, vacio: 'Aún no está inscrito en ninguna clase. Elige una abajo.' }));
      var libres = clasesDojo.filter(function (c) { return idsInscrito.indexOf(c.claseId) === -1; });
      if (a.estado === 'baja') seccionClases.appendChild(el('p', { class: 'ayuda', texto: 'Para inscribirlo otra vez, primero reactívalo.' }));
      else if (!clasesDojo.length) seccionClases.appendChild(el('p', { class: 'ayuda', texto: 'Este dojo aún no tiene clases. Créalas en "Clases".' }));
      else if (libres.length) {
        var selClase = el('select', { 'aria-label': 'Clase para inscribir' }, opciones(libres.map(function (c) {
          return [c.claseId, claseTxt(c) + ' (' + c.inscritos + ' de ' + c.cupo + (c.inscritos >= c.cupo ? ', llena' : '') + ')'];
        }), 'Elige una clase'));
        var mensajeClase = el('p', { class: 'error-form', role: 'alert' });
        seccionClases.appendChild(campoManual('Inscribir en otra clase', selClase));
        seccionClases.appendChild(acc('Inscribir', 'primario', 'Inscribir a ' + a.nombre + ' en la clase elegida', async function () {
          mensajeClase.textContent = '';
          if (!selClase.value) { mensajeClase.textContent = 'Elige primero una clase.'; return; }
          try {
            await k.llamar('inscribir', { alumnoId: alumnoId, claseId: selClase.value });
          } catch (e) {
            if (e && e.code === 'FULL') {
              var c = porId[selClase.value];
              mensajeClase.textContent = 'Esa clase ya está llena' + (c ? ' (' + c.inscritos + ' de ' + c.cupo + ')' : '') + ': no se puede inscribir a nadie más. Sube su cupo en "Clases" o elige otra clase.';
              return;
            }
            throw e;
          }
          ui.aviso(a.nombre + ' quedó inscrito.', 'ok');
          if (k.vigente()) await repintar();
        }));
        seccionClases.appendChild(mensajeClase);
      }
      zona.appendChild(seccionClases);

      // Cuenta
      zona.appendChild(seccionCuenta(f, a, sinCuentaPropia, repintar));

      // Datos
      zona.appendChild(seccionDatos(f, a, planes, repintar));

      // Cobros
      var seccionCobros = panel(null, el('h3', { texto: 'Cobros' }));
      seccionCobros.appendChild(tablaCobros(cobros, cobra, a, repintar));
      if (cobra) {
        var pendientes = cobros.filter(function (c) { return c.pendiente > 0; });
        seccionCobros.appendChild(P.acciones(
          acc('Registrar pago en efectivo', 'primario', 'Registrar un pago en efectivo de ' + a.nombre, async function () {
            var out = await dialogoEfectivo(k, a);
            if (!out || !k.vigente()) return;
            await repintar();
            if (out.recibo) zona.insertBefore(panelRecibo(k, zona, out.recibo, 'Pago en efectivo registrado' + (out.exceso > 0 ? ' (sobran ' + Q(out.exceso) + ': quedan como saldo a favor)' : '')), zona.children[1] || null);
          }),
          acc('Agregar cobro único', '', 'Agregar un cobro único a ' + a.nombre, async function () { if (await dialogoCobroUnico(k, a) && k.vigente()) await repintar(); })));
        if (!pendientes.length) seccionCobros.appendChild(el('p', { class: 'ayuda', texto: 'No debe nada ahora. Un pago en efectivo sin cobros pendientes queda como saldo a favor.' }));
      }
      zona.appendChild(seccionCobros);

      // Pagos
      var seccionPagos = panel(null, el('h3', { texto: 'Pagos de la cuenta de ' + (f.titular.nombre || 'esta ficha') }));
      seccionPagos.appendChild(tablaPagos(pagos, a));
      zona.appendChild(seccionPagos);

      // Avisos
      if (avisa && a.estado !== 'baja') {
        var avisoHost = el('div');
        zona.appendChild(panel(null, el('h3', { texto: 'Avisar a ' + (f.titular.nombre || a.nombre) }),
          acc('Preparar un aviso', '', 'Preparar un aviso para ' + a.nombre, async function () {
            ui.limpiar(avisoHost);
            avisoHost.appendChild(panelAviso(k, { alumnoId: alumnoId, nombre: a.nombre, tipo: estadoCalc === 'pausado' ? 'credencial-pausada' : (f.saldo && f.saldo.vencido > 0 ? 'atraso' : 'recordatorio'), puedePromocion: a.permisoPromociones && k.tiene('seguimiento') }));
          }), avisoHost));
      }
      if (op && op.enfocar === 'cuenta') {
        var x = zona.querySelector('[data-seccion=cuenta]');
        if (x) { x.scrollIntoView({ block: 'start' }); var h = x.querySelector('h3'); if (h) { h.tabIndex = -1; h.focus(); } }
      } else window.scrollTo(0, 0);
    }

    async function cambiarEstado(a, nuevo, repintar) {
      if (nuevo === 'activo') {
        var ok = await ui.confirmar('Reactivar a ' + a.nombre + ': vuelve a estar activo y se le cobra desde hoy.' + (a.estado === 'baja' ? ' Sus clases no se restauran: hay que inscribirlo otra vez.' : ''), { titulo: 'Reactivar', aceptar: 'Reactivar' });
        if (!ok) return;
        await k.llamar('cambiarEstadoAlumno', { alumnoId: a.alumnoId, estado: 'activo' });
        ui.aviso(a.nombre + ' está activo otra vez.', 'ok');
        if (k.vigente()) await repintar();
        return;
      }
      var baja = nuevo === 'baja';
      var hecho = await P.pedirMotivo({
        titulo: baja ? 'Dar de baja a ' + a.nombre : 'Congelar a ' + a.nombre,
        texto: baja
          ? 'Se libera su lugar en todas las clases y deja de cobrársele. Su historial, pagos y recibos se conservan. Escribe el motivo; queda en la bitácora.'
          : 'No se le generan cobros nuevos y no cuenta como esperado, pero conserva su lugar en las clases. Escribe el motivo; queda en la bitácora.',
        etiqueta: baja ? 'Motivo de la baja' : 'Motivo para congelar', aceptar: baja ? 'Dar de baja' : 'Congelar', peligro: baja
      });
      if (!hecho) return;
      await k.llamar('cambiarEstadoAlumno', { alumnoId: a.alumnoId, estado: nuevo, motivo: hecho.motivo });
      ui.aviso(baja ? a.nombre + ' quedó dado de baja y su lugar se liberó.' : a.nombre + ' quedó congelado.', 'ok');
      if (k.vigente()) await repintar();
    }

    function seccionCuenta(f, a, sinPropia, repintar) {
      var menor = a.esMenor;
      var s = panel(null, el('h3', { texto: 'Cuenta' }));
      s.setAttribute('data-seccion', 'cuenta');
      s.appendChild(el('p', { texto: menor
        ? 'La cuenta de un menor es la de su encargado. Si cambia quién se encarga, créale o búscale la cuenta aquí.'
        : (sinPropia ? 'Esta persona es adulta y todavía no entra con su propia cuenta. Créale una (o busca la que ya tiene por su correo) para pasársela.' : 'Puedes cambiar a quién se le cobra y avisa, o dar cuenta propia a esta persona.') }));
      var rol = el('select', { 'aria-label': 'Qué hará esa cuenta' }, menor
        ? opciones([['titular', 'Será el encargado: recibe los cobros y avisos']])
        : opciones([['ambos', 'Cuenta propia del alumno, y también quien paga'], ['propia', 'Cuenta propia del alumno (otra persona sigue pagando)'], ['titular', 'Solo quien paga y recibe los avisos']]));
      var fechaEnc = menor ? el('input', { type: 'date', max: hoyGT() }) : null;
      var alCrear = async function (r, v) {
        var payload = { alumnoId: a.alumnoId };
        if (rol.value === 'ambos' || rol.value === 'propia') payload.usuarioId = r.usuarioId;
        if (rol.value === 'ambos' || rol.value === 'titular') payload.titularUsuarioId = r.usuarioId;
        if (fechaEnc && fechaEnc.value) payload.encargadoFechaNacimiento = fechaEnc.value;
        await k.llamar('editarAlumno', payload);
        ui.aviso('Cuenta asignada a ' + a.nombre + '. Entrega la clave si es nueva y luego toca "Actualizar ficha".', 'ok');
      };
      s.appendChild(campoManual('Qué hará la cuenta', rol));
      if (fechaEnc) s.appendChild(campoManual('Fecha de nacimiento del encargado (solo si el sistema la pide)', fechaEnc, 'Un menor necesita un encargado mayor de edad. No se guarda.'));
      s.appendChild(formCuenta(k, 'alumno', { boton: 'Crear o buscar la cuenta y asignarla', alCrear: alCrear }));
      s.appendChild(el('div', { class: 'pie-tarjeta' }, acc('Actualizar ficha', '', null, function () { return repintar(); })));
      return s;
    }

    function seccionDatos(f, a, planes, repintar) {
      var campos = [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 120, valor: a.nombre },
        { nombre: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'date', requerido: true, max: hoyGT(), valor: a.fechaNacimiento },
        { nombre: 'fechaIngreso', etiqueta: 'Fecha de ingreso', tipo: 'date', requerido: true, max: hoyGT(), valor: a.fechaIngreso },
        {
          nombre: 'planDojoId', etiqueta: 'Plan', tipo: 'select', valor: f.plan ? f.plan.planDojoId : '',
          opciones: [{ valor: '', etiqueta: 'Sin plan' }].concat(planes.map(function (p) { return { valor: p.planDojoId, etiqueta: p.nombre + ' · ' + Q(p.precio) }; })),
          ayuda: 'Un cambio de plan aplica desde el siguiente periodo; lo ya cobrado no cambia.'
        },
        { nombre: 'encargadoFechaNacimiento', etiqueta: 'Fecha de nacimiento del encargado (solo si el sistema la pide)', tipo: 'date', max: hoyGT(), ayuda: 'No se guarda.' }
      ];
      var form = ui.formulario(campos, async function (v) {
        var cambios = {};
        if (v.nombre !== a.nombre) cambios.nombre = v.nombre;
        if (v.fechaNacimiento !== a.fechaNacimiento) cambios.fechaNacimiento = v.fechaNacimiento;
        if (v.fechaIngreso !== a.fechaIngreso) cambios.fechaIngreso = v.fechaIngreso;
        if (v.planDojoId !== (f.plan ? f.plan.planDojoId : '')) cambios.planDojoId = v.planDojoId;
        if (!Object.keys(cambios).length) throw new Error('No cambiaste nada.');
        if (v.encargadoFechaNacimiento) cambios.encargadoFechaNacimiento = v.encargadoFechaNacimiento;
        cambios.alumnoId = a.alumnoId;
        await k.llamar('editarAlumno', cambios);
        ui.aviso('Datos guardados.', 'ok');
        if (k.vigente()) await ficha(a.alumnoId, {});
      }, { textoBoton: 'Guardar datos' });
      return panel(null, el('h3', { texto: 'Datos de ' + a.nombre }), form);
    }

    function tablaCobros(cobros, cobra, a, repintar) {
      return ui.tabla([
        { clave: 'concepto', titulo: 'Cobro', formato: function (v, c) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: 'Periodo ' + c.periodo })); } },
        { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: Q },
        { clave: 'descuento', titulo: 'Descuento', alinear: 'der', formato: function (v) { return v > 0 ? Q(v) : '—'; } },
        { clave: 'cobrado', titulo: 'Cobrado', alinear: 'der', formato: function (v, c) { return Q(c.cobrado + c.credito); } },
        { clave: 'pendiente', titulo: 'Pendiente', alinear: 'der', formato: Q },
        {
          clave: 'fechaPago', titulo: 'Estado', formato: function (v, c) {
            var e = c.pendiente <= 0 ? P.etiqueta('Pagado', 'ok')
              : (c.vencido ? P.etiqueta('Vencido ' + c.diasAtraso + (c.diasAtraso === 1 ? ' día' : ' días'), 'mal') : P.etiqueta('Pagar antes del ' + P.fechaCorta(v), 'info'));
            return el('div', null, e, c.porConfirmar > 0 ? el('p', { class: 'ayuda', texto: 'Hay ' + Q(c.porConfirmar) + ' en un comprobante por confirmar.' }) : null);
          }
        },
        {
          clave: 'cobroId', titulo: 'Ajustar', formato: function (v, c) {
            if (!cobra) return '—';
            if (c.cobrado > 0 || c.porConfirmar > 0 || c.credito > 0) return el('span', { class: 'ayuda', texto: 'Ya tiene pagos' });
            return acciones_(zona)('Aplicar descuento', '', 'Aplicar un descuento al cobro ' + c.concepto + ' de ' + a.nombre, async function () { if (await dialogoDescuento(k, c) && k.vigente()) await repintar(); });
          }
        }
      ], cobros, { titulo: 'Cobros de ' + a.nombre, vacio: 'Todavía no tiene cobros. Se generan solos cada mes si tiene un plan, o agrega un cobro único.' });
    }

    function tablaPagos(pagos, a) {
      return ui.tabla([
        { clave: 'fecha', titulo: 'Fecha', formato: P.fechaCorta },
        { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: Q },
        { clave: 'metodo', titulo: 'Forma', formato: function (v) { return v === 'efectivo' ? 'Efectivo' : 'Depósito'; } },
        {
          clave: 'estado', titulo: 'Estado', formato: function (v, p) {
            return el('div', null, P.etiquetaPago(v), v === 'rechazado' && p.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + p.motivo }) : null);
          }
        },
        { clave: 'recibo', titulo: 'Recibo', formato: function (v) { return v ? v.numero : '—'; } },
        {
          clave: 'archivoId', titulo: 'Comprobante', formato: function (v) {
            return v ? acciones_(zona)('Ver', '', 'Ver el comprobante de ' + a.nombre, function () { return P.verComprobante(v, { vigente: k.vigente }); }) : '—';
          }
        }
      ], pagos, { titulo: 'Pagos', vacio: 'Aún no hay pagos de esta cuenta.' });
    }

    if (abrirFichaAlIniciar) await ficha(abrirFichaAlIniciar, {}); else await lista();
  }

  // ------------------------------------------------------------------ Tutores y asignación según disponibilidad
  function cabe(bloques, c) {
    var dia = diaCanon(c.dia);
    return bloques.some(function (b) { return diaCanon(b.dia) === dia && b.horaInicio <= c.horaInicio && c.horaFin <= b.horaFin; });
  }
  function bloquesTxt(bloques) {
    return bloques.length ? bloques.map(function (b) { return diaTxt(b.dia) + ' ' + b.horaInicio + ' a ' + b.horaFin; }) : [];
  }

  async function tutores(zona, k) {
    var acc = acciones_(zona);
    var conDisp = k.tiene('disponibilidad');
    var r = await Promise.all([
      k.llamar('listarTutores', {}), k.tiene('clases') ? k.llamar('listarClases', {}) : Promise.resolve({ clases: [] }),
      conDisp ? k.llamar('verDisponibilidad', {}) : Promise.resolve({ tutores: [] })
    ]);
    if (!k.vigente()) return;
    var lista = r[0].tutores;
    var clases = r[1].clases;
    var dispPor = {};
    r[2].tutores.forEach(function (t) { dispPor[t.tutorUsuarioId] = t.bloques; });

    zona.appendChild(ui.tabla([
      { clave: 'nombre', titulo: 'Tutor', formato: function (v, t) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: t.correo + (t.telefono ? ' · ' + t.telefono : '') })); } },
      {
        clave: 'usuarioId', titulo: 'Clases', formato: function (v) {
          var suyas = clases.filter(function (c) { return c.tutorUsuarioId === v; });
          return suyas.length ? el('ul', { class: 'lista-simple' }, suyas.map(function (c) { return el('li', { texto: claseTxt(c) }); })) : 'Sin clases';
        }
      }
    ].concat(conDisp ? [{
      clave: 'usuarioId', titulo: 'Disponibilidad', formato: function (v) {
        var b = bloquesTxt(dispPor[v] || []);
        return b.length ? el('ul', { class: 'lista-simple' }, b.map(function (x) { return el('li', { texto: x }); })) : 'Aún no la ha marcado';
      }
    }] : []), lista, { titulo: 'Tutores', vacio: 'Aún no hay tutores. Crea la cuenta del primero abajo.' }));

    // Asignación
    if (conDisp) {
      zona.appendChild(el('h2', { texto: 'Quién da cada clase' }));
      zona.appendChild(el('p', { class: 'intro', texto: 'Junto a cada clase ves cuándo puede el tutor. El servidor solo deja asignar a quien está libre toda la clase y sin otra clase encima.' }));
      var tutorPor = {};
      lista.forEach(function (t) { tutorPor[t.usuarioId] = t; });
      zona.appendChild(ui.tabla([
        { clave: 'claseId', titulo: 'Clase', formato: function (v, c) { return claseTxt(c); } },
        {
          clave: 'tutorUsuarioId', titulo: 'Tutor actual', formato: function (v, c) {
            if (!v) return P.etiqueta('Sin tutor', 'alerta');
            var fuera = !cabe(dispPor[v] || [], c);
            return el('div', null, el('b', { texto: c.tutorNombre || (tutorPor[v] && tutorPor[v].nombre) || 'Tutor' }),
              fuera ? el('p', { class: 'motivo', texto: 'Esta clase queda fuera de su disponibilidad. Habla con el tutor o cámbialo.' }) : el('p', { class: 'ayuda', texto: 'Dentro de su disponibilidad.' }));
          }
        },
        {
          clave: 'dia', titulo: 'Disponibles ese día', formato: function (v, c) {
            var libres = lista.filter(function (t) { return cabe(dispPor[t.usuarioId] || [], c); });
            var delDia = lista.map(function (t) {
              var b = (dispPor[t.usuarioId] || []).filter(function (x) { return diaCanon(x.dia) === diaCanon(c.dia); });
              return b.length ? t.nombre + ': ' + b.map(function (x) { return x.horaInicio + ' a ' + x.horaFin; }).join(', ') : null;
            }).filter(Boolean);
            return el('div', null, el('b', { texto: libres.length ? 'Pueden dar esta clase: ' + libres.map(function (t) { return t.nombre; }).join(', ') : 'Nadie tiene libre todo este horario' }),
              delDia.length ? el('ul', { class: 'lista-simple' }, delDia.map(function (x) { return el('li', { texto: x }); })) : null);
          }
        },
        {
          clave: 'claseId', titulo: 'Asignar', formato: function (v, c) {
            var sel = el('select', { 'aria-label': 'Tutor para ' + claseTxt(c) }, opciones(lista.map(function (t) {
              return [t.usuarioId, t.nombre + (cabe(dispPor[t.usuarioId] || [], c) ? ' (libre)' : ' (no disponible)')];
            }), 'Sin tutor'));
            sel.value = c.tutorUsuarioId || '';
            return el('div', { class: 'asignar-plan' }, sel, acc('Asignar', '', 'Asignar el tutor elegido a ' + claseTxt(c), async function () {
              if (sel.value === (c.tutorUsuarioId || '')) { ui.aviso('Ya es el tutor de esa clase.'); return; }
              await k.llamar('asignarTutor', { claseId: v, tutorUsuarioId: sel.value });
              ui.aviso('Tutor asignado.', 'ok');
              if (k.vigente()) { ui.limpiar(zona); await tutores(zona, k); }
            }));
          }
        }
      ], clases, { titulo: 'Clases y tutores', vacio: 'Aún no hay clases. Créalas en "Clases".' }));
    } else {
      zona.appendChild(el('p', { class: 'ayuda' }, 'Para asignar tutores edita cada clase en ', el('a', { href: '#/clases', texto: 'Clases' }), '. La disponibilidad de tutores es una herramienta de planes superiores.'));
    }

    zona.appendChild(el('h2', { texto: 'Nuevo tutor' }));
    zona.appendChild(panel(null, el('p', { class: 'ayuda', texto: 'Se crea su cuenta y recibes una clave temporal para entregársela; la cambia en su primer ingreso.' }),
      formCuenta(k, 'tutor', { boton: 'Crear tutor', alCrear: function () { ui.aviso('Tutor creado.', 'ok'); } })));
  }

  // ------------------------------------------------------------------ Clases y cupos
  function ocupacion(c) {
    var llena = c.inscritos >= c.cupo;
    var casi = !llena && c.cupo > 0 && c.inscritos / c.cupo >= 0.8;
    return el('div', { class: 'ocupacion' },
      el('b', { texto: c.inscritos + ' de ' + c.cupo + ' lugares' }),
      el('meter', { min: 0, max: c.cupo, value: Math.min(c.inscritos, c.cupo), 'aria-label': 'Ocupación de la clase' }),
      llena ? P.etiqueta('Llena', 'mal') : (casi ? P.etiqueta('Casi llena', 'alerta') : P.etiqueta('Con lugar', 'ok')));
  }

  async function clasesAdmin(zona, k) {
    var acc = acciones_(zona);
    async function pintar() {
      var r = await Promise.all([k.llamar('listarClases', {}), k.llamar('listarTutores', {})]);
      if (!k.vigente()) return;
      var clases = r[0].clases;
      var disciplinas = r[0].disciplinas;
      var tuts = r[1].tutores;
      ui.limpiar(zona);
      var regionInscritos = el('div');

      zona.appendChild(el('div', { class: 'barra' },
        acc('Nueva clase', 'primario', null, function () { return dialogoClase(null); })));
      zona.appendChild(ui.tabla([
        { clave: 'claseId', titulo: 'Clase', formato: function (v, c) { return el('b', { texto: claseTxt(c) }); } },
        { clave: 'tutorNombre', titulo: 'Tutor', formato: function (v) { return v || P.etiqueta('Sin tutor', 'alerta'); } },
        { clave: 'inscritos', titulo: 'Lugares', formato: function (v, c) { return ocupacion(c); } },
        {
          clave: 'claseId', titulo: 'Acciones', formato: function (v, c) {
            var b = [
              acc('Ver inscritos', '', 'Ver los inscritos de ' + claseTxt(c), function () { return verInscritos(c, regionInscritos); }),
              acc('Editar', '', 'Editar ' + claseTxt(c), function () { return dialogoClase(c); })
            ];
            if (k.nivel !== 'general' && k.tiene('plantillas')) {
              b.push(acc('Avisar cambio', '', 'Avisar un cambio de ' + claseTxt(c), function () {
                ui.limpiar(regionInscritos).appendChild(panelAviso(k, { claseId: v }));
                regionInscritos.scrollIntoView({ block: 'nearest' });
              }));
            }
            return P.acciones.apply(null, b);
          }
        }
      ], clases, { titulo: 'Clases', vacio: disciplinas.length ? 'Aún no hay clases. Toca "Nueva clase" para crear la primera.' : 'Aún no hay clases. Primero crea una disciplina abajo y luego tu primera clase.' }));
      zona.appendChild(regionInscritos);

      zona.appendChild(el('h2', { texto: 'Disciplinas' }));
      var chips = disciplinas.map(function (d) {
        return el('li', { class: 'chip' }, d.nombre, ' ', el('button', { type: 'button', class: 'enlace', 'aria-label': 'Renombrar ' + d.nombre, texto: 'Renombrar', al: { click: function () { renombrar(d); } } }));
      });
      zona.appendChild(chips.length ? el('ul', { class: 'chips' }, chips) : vacio('Aún no hay disciplinas. Crea la primera: por ejemplo Jiu jitsu o Muay thai.'));
      zona.appendChild(panel(null, ui.formulario([
        { nombre: 'nombre', etiqueta: 'Nueva disciplina', requerido: true, maxlength: 60, autocomplete: 'off' }
      ], async function (v) {
        await k.llamar('guardarDisciplina', { nombre: v.nombre });
        ui.aviso('Disciplina creada.', 'ok');
        if (k.vigente()) await pintar();
      }, { textoBoton: 'Crear disciplina' })));

      function renombrar(d) {
        dialogoForm({
          titulo: 'Renombrar ' + d.nombre,
          campos: [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 60, valor: d.nombre }],
          boton: 'Guardar nombre',
          alEnviar: async function (v) { await k.llamar('guardarDisciplina', { disciplinaId: d.disciplinaId, nombre: v.nombre }); ui.aviso('Disciplina renombrada.', 'ok'); }
        }).then(function (ok) { if (ok && k.vigente()) return pintar(); });
      }

      function dialogoClase(c) {
        if (!disciplinas.length) { ui.aviso('Primero crea una disciplina (abajo, en "Disciplinas").', 'error'); return Promise.resolve(); }
        return dialogoForm({
          titulo: c ? 'Editar ' + claseTxt(c) : 'Nueva clase',
          texto: c ? 'El cupo no puede ser menor que los alumnos inscritos (' + c.inscritos + ').' : 'Define el día, la hora y el cupo. El servidor no deja inscribir a nadie por encima del cupo.',
          campos: [
            { nombre: 'disciplinaId', etiqueta: 'Disciplina', tipo: 'select', requerido: true, valor: c ? c.disciplinaId : '', opciones: disciplinas.map(function (d) { return { valor: d.disciplinaId, etiqueta: d.nombre }; }) },
            { nombre: 'dia', etiqueta: 'Día', tipo: 'select', requerido: true, valor: c ? diaCanon(c.dia) : 'lunes', opciones: DIAS.map(function (d) { return { valor: d, etiqueta: DIA_TXT[d] }; }) },
            { nombre: 'horaInicio', etiqueta: 'Hora de inicio', tipo: 'time', requerido: true, valor: c ? c.horaInicio : '18:00' },
            { nombre: 'horaFin', etiqueta: 'Hora de fin', tipo: 'time', requerido: true, valor: c ? c.horaFin : '19:00' },
            { nombre: 'cupo', etiqueta: 'Cupo (lugares)', tipo: 'number', requerido: true, min: '1', max: '999', step: '1', valor: c ? c.cupo : '12' },
            {
              nombre: 'tutorUsuarioId', etiqueta: 'Tutor', tipo: 'select', valor: c ? (c.tutorUsuarioId || '') : '',
              opciones: [{ valor: '', etiqueta: 'Sin tutor por ahora' }].concat(tuts.map(function (t) { return { valor: t.usuarioId, etiqueta: t.nombre }; })),
              ayuda: k.tiene('disponibilidad') ? 'Debe estar libre todo el horario según su disponibilidad.' : null
            }
          ],
          boton: c ? 'Guardar cambios' : 'Crear clase',
          alEnviar: async function (v) {
            var p = { disciplinaId: v.disciplinaId, dia: v.dia, horaInicio: v.horaInicio, horaFin: v.horaFin, cupo: v.cupo, tutorUsuarioId: v.tutorUsuarioId };
            if (c) p.claseId = c.claseId;
            await k.llamar('guardarClase', p);
            ui.aviso(c ? 'Clase actualizada.' : 'Clase creada.', 'ok');
          }
        }).then(function (ok) { if (ok && k.vigente()) return pintar(); });
      }

      async function verInscritos(c, host) {
        var rr = await Promise.all([k.llamar('listarInscritos', { claseId: c.claseId }), k.llamar('listarAlumnos', {})]);
        if (!k.vigente()) return;
        var ins = rr[0];
        var enClase = {};
        ins.alumnos.forEach(function (a) { enClase[a.alumnoId] = true; });
        var libres = rr[1].alumnos.filter(function (a) { return !enClase[a.alumnoId] && a.estado !== 'baja'; });
        ui.limpiar(host);
        var mensaje = el('p', { class: 'error-form', role: 'alert' });
        var selA = el('select', { 'aria-label': 'Alumno para inscribir' }, opciones(libres.map(function (a) { return [a.alumnoId, a.nombre]; }), 'Elige a un alumno'));
        host.appendChild(panel('destacado',
          el('h3', { texto: 'Inscritos en ' + claseTxt(c) }),
          el('div', { class: 'ocupacion' }, ocupacion({ inscritos: ins.inscritos, cupo: ins.cupo })),
          ui.tabla([
            { clave: 'nombre', titulo: 'Alumno' },
            { clave: 'estado', titulo: 'Estado', formato: function (v) { return etiquetaEstado(v); } },
            {
              clave: 'alumnoId', titulo: 'Retirar', formato: function (v, a) {
                return acc('Retirar', '', 'Retirar a ' + a.nombre + ' de ' + claseTxt(c), async function () {
                  var ok = await ui.confirmar('¿Retirar a ' + a.nombre + ' de esta clase? Se libera su lugar.', { aceptar: 'Retirar' });
                  if (!ok) return;
                  await k.llamar('retirarInscripcion', { alumnoId: v, claseId: c.claseId });
                  ui.aviso('Retirado.', 'ok');
                  if (k.vigente()) await pintar();
                });
              }
            }
          ], ins.alumnos, { titulo: 'Inscritos', vacio: 'Nadie está inscrito todavía. Elige un alumno abajo.' }),
          libres.length ? campoManual('Inscribir a otro alumno', selA) : null,
          libres.length ? acc('Inscribir', 'primario', 'Inscribir al alumno elegido en ' + claseTxt(c), async function () {
            mensaje.textContent = '';
            if (!selA.value) { mensaje.textContent = 'Elige primero a un alumno.'; return; }
            try { await k.llamar('inscribir', { alumnoId: selA.value, claseId: c.claseId }); } catch (e) {
              if (e && e.code === 'FULL') {
                mensaje.textContent = 'Esta clase ya está llena (' + ins.inscritos + ' de ' + ins.cupo + '): no se puede inscribir a nadie más. Sube el cupo con "Editar" o elige otra clase.';
                return;
              }
              throw e;
            }
            ui.aviso('Alumno inscrito.', 'ok');
            if (k.vigente()) { await pintar(); }
          }) : null,
          mensaje));
        host.scrollIntoView({ block: 'nearest' });
      }
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Planes del dojo
  async function planes(zona, k) {
    var acc = acciones_(zona);
    async function pintar() {
      var r = await Promise.all([k.llamar('listarPlanesDojo', {}), k.tiene('clases') ? k.llamar('listarClases', {}) : Promise.resolve({ clases: [], disciplinas: [] })]);
      if (!k.vigente()) return;
      var lista = r[0].planes;
      var clases = r[1].clases;
      var disciplinas = r[1].disciplinas;
      var porClase = {};
      clases.forEach(function (c) { porClase[c.claseId] = c; });
      ui.limpiar(zona);
      zona.appendChild(el('div', { class: 'barra' }, acc('Nuevo plan', 'primario', null, function () { return dialogo(null); })));
      zona.appendChild(ui.tabla([
        { clave: 'nombre', titulo: 'Plan', formato: function (v) { return el('b', { texto: v }); } },
        { clave: 'diasSemana', titulo: 'Días por semana', formato: function (v) { return v === 'libre' ? 'Libre (sin límite)' : v + (v === '1' ? ' día' : ' días'); } },
        { clave: 'precio', titulo: 'Precio al mes', alinear: 'der', formato: Q },
        {
          clave: 'claseIds', titulo: 'Horarios', formato: function (v, p) {
            var hs = v.map(function (id) { return porClase[id] ? claseTxt(porClase[id]) : null; }).filter(Boolean);
            return el('div', null, p.disciplina ? el('b', { texto: p.disciplina }) : null, hs.length ? el('ul', { class: 'lista-simple' }, hs.map(function (x) { return el('li', { texto: x }); })) : el('p', { class: 'ayuda', texto: 'Cualquier clase' }));
          }
        },
        { clave: 'planDojoId', titulo: 'Editar', formato: function (v, p) { return acc('Editar', '', 'Editar el plan ' + p.nombre, function () { return dialogo(p); }); } }
      ], lista, { titulo: 'Planes del dojo', vacio: 'Aún no hay planes. Toca "Nuevo plan" para crear el primero: sin plan, a un alumno no se le cobra.' }));
      zona.appendChild(el('p', { class: 'ayuda', texto: 'Un cambio de precio aplica desde el siguiente periodo: lo ya cobrado no cambia.' }));

      function dialogo(p) {
        var campos = [
          { nombre: 'nombre', etiqueta: 'Nombre del plan', requerido: true, maxlength: 60, valor: p ? p.nombre : '' },
          { nombre: 'diasSemana', etiqueta: 'Días por semana', tipo: 'select', requerido: true, valor: p ? p.diasSemana : '2', opciones: ['1', '2', '3', '4', '5', '6', '7', 'libre'].map(function (d) { return { valor: d, etiqueta: d === 'libre' ? 'Libre (sin límite)' : d + (d === '1' ? ' día' : ' días') }; }) },
          { nombre: 'precio', etiqueta: 'Precio al mes (Q)', tipo: 'number', requerido: true, min: '0.01', step: '0.01', valor: p ? p.precio : '' }
        ];
        if (disciplinas.length) campos.push({ nombre: 'disciplinaId', etiqueta: 'Disciplina (opcional)', tipo: 'select', valor: p ? p.disciplinaId : '', opciones: [{ valor: '', etiqueta: 'Todas' }].concat(disciplinas.map(function (d) { return { valor: d.disciplinaId, etiqueta: d.nombre }; })) });
        clases.forEach(function (c, i) {
          campos.push({ nombre: 'c' + i, etiqueta: claseTxt(c), tipo: 'checkbox', valor: !!(p && p.claseIds.indexOf(c.claseId) !== -1) });
        });
        return dialogoForm({
          titulo: p ? 'Editar ' + p.nombre : 'Nuevo plan',
          texto: clases.length ? 'Si no marcas ninguna clase, el plan sirve para cualquiera. Si marcas algunas, solo esas.' : null,
          campos: campos, boton: p ? 'Guardar plan' : 'Crear plan',
          alEnviar: async function (v) {
            var pl = { nombre: v.nombre, diasSemana: v.diasSemana, precio: String(v.precio), claseIds: clases.filter(function (c, i) { return v['c' + i]; }).map(function (c) { return c.claseId; }) };
            if (disciplinas.length) pl.disciplinaId = v.disciplinaId;
            if (p) pl.planDojoId = p.planDojoId;
            await k.llamar('guardarPlanDojo', pl);
            ui.aviso(p ? 'Plan guardado.' : 'Plan creado.', 'ok');
          }
        }).then(function (ok) { if (ok && k.vigente()) return pintar(); });
      }
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Ajustes del dojo
  async function config(zona, k) {
    var v = await k.llamar('verConfigDojo', {});
    if (!k.vigente()) return;
    var campos = [
      {
        nombre: 'modoCobro', etiqueta: 'Cuándo se cobra', tipo: 'select', valor: v.modoCobro,
        opciones: [{ valor: 'adelantado', etiqueta: 'Por adelantado: la mensualidad se cobra al empezar el mes' }, { valor: 'vencido', etiqueta: 'A mes vencido: se cobra al terminar el mes' }]
      },
      { nombre: 'diasPagoAlumno', etiqueta: 'Días de plazo para pagar', tipo: 'number', requerido: true, min: '0', max: '30', step: '1', valor: v.diasPagoAlumno, ayuda: 'Desde que se emite el cobro hasta su fecha de pago.' },
      { nombre: 'diaPausaAlumno', etiqueta: 'Días de atraso para pausar la credencial', tipo: 'number', requerido: true, min: '1', max: '60', step: '1', valor: v.diaPausaAlumno, ayuda: 'Pasado este atraso, la persona solo puede ver sus cobros y subir su comprobante.' }
    ];
    if (k.tiene('ausencias')) campos.push({ nombre: 'ausenciasAviso', etiqueta: 'Clases seguidas sin asistir para avisarte', tipo: 'number', requerido: true, min: '1', max: '20', step: '1', valor: v.ausenciasAviso });
    zona.appendChild(panel(null, ui.formulario(campos, async function (x) {
      var p = { modoCobro: x.modoCobro, diasPagoAlumno: x.diasPagoAlumno, diaPausaAlumno: x.diaPausaAlumno };
      if (k.tiene('ausencias')) p.ausenciasAviso = x.ausenciasAviso;
      await k.llamar('guardarConfigDojo', p);
      ui.aviso('Ajustes guardados.', 'ok');
    }, { textoBoton: 'Guardar ajustes' })));
    zona.appendChild(el('p', { class: 'ayuda', texto: 'Los cambios valen para los cobros que se generen desde ahora.' }));
  }

  // ------------------------------------------------------------------ Pagos: comprobantes por confirmar, efectivo, cobros y recibos
  async function pagos(zona, k) {
    var acc = acciones_(zona);
    var cobra = k.nivel === 'admin';
    var ultimoRecibo = null;
    async function pintar() {
      var rs = await Promise.all([
        k.llamar('listarPagosAlumnos', {}), k.llamar('listarCobrosAlumnos', {})
      ]);
      if (!k.vigente()) return;
      var todos = rs[0].pagos;
      var porConfirmar = todos.filter(function (p) { return p.estado === 'por-confirmar'; });
      var mes = rs[1].cobros;
      // Lo que debe cada cuenta: todos los cobros de las fichas del pago (no solo del mes)
      var ids = {};
      porConfirmar.forEach(function (p) { p.lineas.forEach(function (l) { ids[l.alumnoId] = true; }); });
      var deben = {};
      await Promise.all(Object.keys(ids).slice(0, 25).map(function (id) {
        return k.llamar('listarCobrosAlumnos', { alumnoId: id }).then(function (x) { deben[id] = x.cobros.reduce(function (s, c) { return s + c.pendiente; }, 0); });
      }));
      if (!k.vigente()) return;
      ui.limpiar(zona);
      if (ultimoRecibo) zona.appendChild(ultimoRecibo);

      if (cobra) {
        zona.appendChild(panel(null, el('h2', { texto: 'Generar cobros' }),
          el('p', { texto: 'Los cobros del mes se generan solos. Si acabas de inscribir a alguien o cambiar un plan y quieres verlos ya, tócalo aquí: no duplica los que existen.' }),
          acc('Generar cobros del mes', 'primario', null, async function () {
            var ok = await ui.confirmar('Se generan los cobros que falten del mes para los alumnos activos con plan. No duplica los que ya existen.', { titulo: 'Generar cobros', aceptar: 'Generar cobros' });
            if (!ok) return;
            var r = await k.llamar('generarCobros', {});
            ui.aviso(r.creados ? 'Se generaron ' + r.creados + (r.creados === 1 ? ' cobro nuevo.' : ' cobros nuevos.') : 'No faltaba ningún cobro: todo estaba al día.', 'ok');
            if (k.vigente()) await pintar();
          })));
      }

      // Por confirmar
      zona.appendChild(el('h2', { texto: 'Comprobantes por confirmar (' + porConfirmar.length + ')' }));
      zona.appendChild(ui.tabla([
        { clave: 'fecha', titulo: 'Subido', formato: P.fechaCorta },
        { clave: 'titularNombre', titulo: 'Cuenta', formato: function (v) { return el('b', { texto: v || 'Sin nombre' }); } },
        {
          clave: 'monto', titulo: 'Declaró', alinear: 'der', formato: function (v) { return el('b', { texto: Q(v) }); }
        },
        {
          clave: 'lineas', titulo: 'Debe y cubre', formato: function (v, p) {
            var cubre = v.reduce(function (s, l) { return s + l.monto; }, 0);
            var debe = 0;
            var conocido = true;
            var vistos = {};
            v.forEach(function (l) { if (vistos[l.alumnoId]) return; vistos[l.alumnoId] = true; if (deben[l.alumnoId] === undefined) conocido = false; else debe += deben[l.alumnoId]; });
            var nota;
            if (!v.length) nota = 'No cubre ningún cobro: todo quedaría como saldo a favor.';
            else if (conocido && p.monto < debe - 0.005) nota = 'Declaró menos de lo que debe: es un pago parcial y quedarán ' + Q(Math.round((debe - p.monto) * 100) / 100) + ' pendientes.';
            else if (p.exceso > 0.005) nota = 'Declaró de más: ' + Q(p.exceso) + ' quedarían como saldo a favor.';
            else nota = 'El monto coincide con lo que cubre.';
            return el('div', { class: 'cobro-cuadro' },
              conocido && v.length ? el('span', { texto: 'Debe en total: ' + Q(debe) }) : null,
              el('span', { texto: 'Cubre: ' + Q(cubre) }),
              el('ul', { class: 'lista-simple' }, v.map(function (l) { return el('li', { texto: l.alumnoNombre + ' · ' + l.concepto + ' · ' + Q(l.monto) }); })),
              el('p', { class: p.exceso > 0.005 || (conocido && p.monto < debe - 0.005) ? 'motivo' : 'ayuda', texto: nota }));
          }
        },
        {
          clave: 'pagoId', titulo: 'Acciones', formato: function (v, p) {
            var b = [];
            if (p.archivoId) b.push(acc('Ver comprobante', '', 'Ver el comprobante de ' + (p.titularNombre || 'la cuenta') + ' por ' + Q(p.monto), function () { return P.verComprobante(p.archivoId, { vigente: k.vigente }); }));
            if (cobra) {
              b.push(acc('Confirmar', 'primario', 'Confirmar el pago de ' + (p.titularNombre || 'la cuenta') + ' por ' + Q(p.monto), async function () {
                var ok = await ui.confirmar('Confirmar el pago de ' + (p.titularNombre || 'esta cuenta') + ' por ' + Q(p.monto) + ' (lo que declaró). Se genera el recibo y los cobros quedan pagados.' + (p.exceso > 0.005 ? ' Sobran ' + Q(p.exceso) + ' que quedan como saldo a favor.' : ''), { titulo: 'Confirmar pago', aceptar: 'Confirmar pago' });
                if (!ok) return;
                var r = await k.llamar('confirmarPago', { pagoId: v });
                ultimoRecibo = panelRecibo(k, zona, r.recibo, 'Pago confirmado' + (r.exceso > 0 ? ' (sobran ' + Q(r.exceso) + ': saldo a favor)' : ''));
                ui.aviso('Pago confirmado. Recibo ' + r.recibo.numero + '.', 'ok');
                if (k.vigente()) await pintar();
              }));
              b.push(acc('Rechazar', 'peligro', 'Rechazar el pago de ' + (p.titularNombre || 'la cuenta') + ' por ' + Q(p.monto), async function () {
                var h = await P.pedirMotivo({ titulo: 'Rechazar el comprobante', texto: 'La persona verá el motivo y podrá subir otro comprobante.', etiqueta: 'Motivo del rechazo', aceptar: 'Rechazar comprobante', peligro: true });
                if (!h) return;
                await k.llamar('rechazarPago', { pagoId: v, motivo: h.motivo });
                ui.aviso('Comprobante rechazado.', 'ok');
                if (k.vigente()) await pintar();
              }));
            }
            return P.acciones.apply(null, b);
          }
        }
      ], porConfirmar, { titulo: 'Comprobantes por confirmar', vacio: 'No hay comprobantes esperando. Cuando alguien suba uno, aparecerá aquí.' }));
      if (!cobra) zona.appendChild(el('p', { class: 'ayuda', texto: 'Confirmar o rechazar lo hace el administrador del dojo; aquí solo lo ves.' }));

      // Cobros pendientes
      var pend = mes.filter(function (c) { return c.pendiente > 0; });
      zona.appendChild(el('h2', { texto: 'Cobros pendientes de este mes' }));
      zona.appendChild(ui.tabla([
        { clave: 'alumnoNombre', titulo: 'Alumno', formato: function (v, c) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: 'Cuenta de ' + (c.titularNombre || '—') })); } },
        { clave: 'concepto', titulo: 'Cobro' },
        { clave: 'pendiente', titulo: 'Pendiente', alinear: 'der', formato: Q },
        {
          clave: 'fechaPago', titulo: 'Estado', formato: function (v, c) {
            return el('div', null, c.vencido ? P.etiqueta('Vencido ' + c.diasAtraso + (c.diasAtraso === 1 ? ' día' : ' días'), 'mal') : P.etiqueta('Pagar antes del ' + P.fechaCorta(v), 'info'),
              c.porConfirmar > 0 ? el('p', { class: 'ayuda', texto: 'En revisión: ' + Q(c.porConfirmar) }) : null);
          }
        },
        {
          clave: 'alumnoId', titulo: 'Acciones', formato: function (v, c) {
            var b = [acc('Ver ficha', '', 'Ver la ficha de ' + c.alumnoNombre, function () { D.pendiente = v; location.hash = '#/alumnos'; })];
            if (cobra) b.unshift(acc('Registrar efectivo', 'primario', 'Registrar un pago en efectivo de ' + c.alumnoNombre, function () { return efectivoRapido(v, c.alumnoNombre); }));
            return P.acciones.apply(null, b);
          }
        }
      ], pend, { titulo: 'Cobros pendientes', vacio: 'Nadie debe nada de este mes. Si faltan cobros, usa "Generar cobros del mes".' }));

      // Historial
      var hist = todos.filter(function (p) { return p.estado !== 'por-confirmar'; });
      zona.appendChild(el('h2', { texto: 'Pagos anteriores' }));
      zona.appendChild(ui.tabla([
        { clave: 'fecha', titulo: 'Fecha', formato: P.fechaCorta },
        { clave: 'titularNombre', titulo: 'Cuenta', formato: function (v) { return v || '—'; } },
        { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: Q },
        { clave: 'metodo', titulo: 'Forma', formato: function (v) { return v === 'efectivo' ? 'Efectivo' : 'Depósito'; } },
        {
          clave: 'estado', titulo: 'Estado', formato: function (v, p) {
            return el('div', null, P.etiquetaPago(v), p.revisadoPor ? el('p', { class: 'ayuda', texto: 'Revisó ' + p.revisadoPor }) : null, v === 'rechazado' && p.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + p.motivo }) : null);
          }
        },
        {
          clave: 'recibo', titulo: 'Recibo', formato: function (v) {
            if (!v) return '—';
            return acc('Descargar ' + v.numero, '', 'Descargar el recibo ' + v.numero, async function () {
              var d = await k.llamar('descargarRecibo', { reciboId: v.reciboId });
              P.descargar(d.nombre, d.mime, d.base64);
              ui.aviso('Recibo ' + d.numero + ' descargado.', 'ok');
            });
          }
        },
        {
          clave: 'archivoId', titulo: 'Comprobante', formato: function (v, p) {
            return v ? acc('Ver', '', 'Ver el comprobante de ' + (p.titularNombre || 'la cuenta'), function () { return P.verComprobante(v, { vigente: k.vigente }); }) : '—';
          }
        }
      ], hist, { titulo: 'Pagos anteriores', vacio: 'Aún no hay pagos confirmados ni rechazados.' }));
    }

    async function efectivoRapido(alumnoId, nombre) {
      var out = await dialogoEfectivo(k, { alumnoId: alumnoId, nombre: nombre });
      if (!out || !k.vigente()) return;
      if (out.recibo) ultimoRecibo = panelRecibo(k, zona, out.recibo, 'Pago en efectivo registrado' + (out.exceso > 0 ? ' (sobran ' + Q(out.exceso) + ': quedan como saldo a favor)' : ''));
      await pintar();
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Plantillas editables y envío de avisos
  function insertarEnCursor(ta, texto) {
    var ini = ta.selectionStart === undefined ? ta.value.length : ta.selectionStart;
    var fin = ta.selectionEnd === undefined ? ini : ta.selectionEnd;
    ta.value = ta.value.slice(0, ini) + texto + ta.value.slice(fin);
    ta.focus();
    ta.setSelectionRange(ini + texto.length, ini + texto.length);
  }

  async function plantillas(zona, k) {
    var acc = acciones_(zona);
    var r = await Promise.all([k.llamar('listarPlantillas', {}), k.llamar('listarAlumnos', {}), k.tiene('clases') ? k.llamar('listarClases', {}) : Promise.resolve({ clases: [] })]);
    if (!k.vigente()) return;
    var alumnosLista = r[1].alumnos.filter(function (a) { return a.estado !== 'baja'; });
    var clases = r[2].clases;

    // Enviar un aviso
    zona.appendChild(el('h2', { texto: 'Enviar un aviso' }));
    var region = el('div');
    var modo = el('select', { 'aria-label': 'A quién avisar' }, opciones([['alumno', 'A una persona (cobro, recordatorio, promoción)'], ['clase', 'A todos los de una clase (cambio de clase)']]));
    var selClase = el('select', { 'aria-label': 'Clase' }, opciones(clases.map(function (c) { return [c.claseId, claseTxt(c)]; }), 'Elige una clase'));
    var campoClase = campoManual('Clase', selClase);
    campoClase.hidden = true;
    function mostrar() {
      ui.limpiar(region);
      campoClase.hidden = modo.value !== 'clase';
      if (modo.value === 'alumno') {
        region.appendChild(alumnosLista.length ? panelAviso(k, { alumnos: alumnosLista }) : vacio('Aún no hay alumnos a quienes avisar.'));
      }
    }
    modo.addEventListener('change', mostrar);
    selClase.addEventListener('change', function () {
      ui.limpiar(region);
      if (selClase.value) region.appendChild(panelAviso(k, { claseId: selClase.value }));
    });
    zona.appendChild(panel(null, campoManual('Qué quieres hacer', modo), campoClase, region));
    mostrar();

    // Plantillas
    zona.appendChild(el('h2', { texto: 'Plantillas' }));
    zona.appendChild(el('p', { class: 'intro', texto: 'Edita el texto de cada aviso. Los marcadores entre llaves se llenan solos con los datos de cada persona. Se guardan para tu dojo.' }));
    r[0].plantillas.forEach(function (pl) {
      var campos = [
        { nombre: 'nombre', etiqueta: 'Nombre de la plantilla', requerido: true, maxlength: 80, valor: pl.nombre },
        { nombre: 'asunto', etiqueta: 'Asunto (para el correo)', requerido: true, maxlength: 150, valor: pl.asunto },
        { nombre: 'texto', etiqueta: 'Mensaje', tipo: 'textarea', filas: 7, requerido: true, maxlength: 2000, valor: pl.texto }
      ];
      var form = ui.formulario(campos, async function (v) {
        await k.llamar('guardarPlantilla', { tipo: pl.tipo, plantillaId: pl.plantillaId || undefined, nombre: v.nombre, asunto: v.asunto, texto: v.texto });
        ui.aviso('Plantilla "' + v.nombre + '" guardada.', 'ok');
      }, { textoBoton: 'Guardar plantilla' });
      var area = form.querySelector('textarea');
      var chips = r[0].marcadores.map(function (m) {
        return el('li', null, el('button', {
          type: 'button', class: 'chip', title: MARCADORES_TXT[m] || '', 'aria-label': 'Insertar {{' + m + '}} (' + (MARCADORES_TXT[m] || m) + ')',
          texto: '{{' + m + '}}', al: { click: function () { insertarEnCursor(area, '{{' + m + '}}'); } }
        }));
      });
      zona.appendChild(panel(null, el('h3', { texto: pl.nombre }),
        el('p', { class: 'ayuda', texto: 'Toca un marcador para ponerlo donde está el cursor:' }), el('ul', { class: 'chips' }, chips),
        el('ul', { class: 'lista-simple' }, r[0].marcadores.map(function (m) { return el('li', { texto: '{{' + m + '}}: ' + (MARCADORES_TXT[m] || '') }); })), form));
    });
  }

  // ------------------------------------------------------------------ Suspendidos
  async function suspendidos(zona, k) {
    var acc = acciones_(zona);
    var r = await k.llamar('listarSuspendidos', {});
    if (!k.vigente()) return;
    var host = el('div');
    zona.appendChild(ui.tabla([
      { clave: 'nombre', titulo: 'Alumno', formato: function (v, s) { return el('div', null, el('b', { texto: v }), s.esMenor ? [' ', P.etiqueta('Menor', 'info')] : null); } },
      { clave: 'diasAtraso', titulo: 'Días de atraso', alinear: 'der', formato: function (v) { return String(v); } },
      { clave: 'total', titulo: 'Debe', alinear: 'der', formato: Q },
      {
        clave: 'contacto', titulo: 'Contacto', formato: function (v) {
          var medio = v.medio === 'whatsapp' ? 'WhatsApp' : (v.medio === 'correo' ? 'Solo correo' : 'Sin forma de contacto');
          return el('div', null, el('b', { texto: v.nombre || '—' }), el('p', { class: 'ayuda', texto: medio + (v.telefono ? ' · +' + v.telefono : '') + (v.correo ? ' · ' + v.correo : '') }));
        }
      },
      {
        clave: 'ultimoAviso', titulo: 'Último aviso', formato: function (v) { return v ? P.fechaCorta(String(v.fecha).slice(0, 10)) + ' · ' + v.canal : 'Ninguno'; }
      },
      {
        clave: 'alumnoId', titulo: 'Acciones', formato: function (v, s) {
          var b = [acc('Avisar', 'primario', 'Preparar un aviso para ' + s.nombre, function () {
            ui.limpiar(host).appendChild(panelAviso(k, { alumnoId: v, nombre: s.nombre, tipo: 'credencial-pausada', puedePromocion: s.puedePromocion }));
            host.scrollIntoView({ block: 'nearest' });
          })];
          if (s.puedePromocion) {
            b.push(acc('Ofrecer promoción', '', 'Preparar una promoción para ' + s.nombre, function () {
              ui.limpiar(host).appendChild(panelAviso(k, { alumnoId: v, nombre: s.nombre, tipo: 'promocion', puedePromocion: true }));
              host.scrollIntoView({ block: 'nearest' });
            }));
          }
          b.push(acc('Ver ficha', '', 'Ver la ficha de ' + s.nombre, function () { D.pendiente = v; location.hash = '#/alumnos'; }));
          return P.acciones.apply(null, b);
        }
      }
    ], r.suspendidos, { titulo: 'Suspendidos', vacio: 'Nadie tiene la credencial pausada. Aquí aparecen quienes llegan al límite de atraso.' }));
    zona.appendChild(host);
    zona.appendChild(el('p', { class: 'ayuda', texto: 'La promoción solo se ofrece a quien dio su permiso; sin permiso el botón no aparece. Los avisos de cobro no dependen de ese permiso.' }));
  }

  // ------------------------------------------------------------------ Registro de las vistas
  function registrar(nombre, niveles, op, fn) {
    vista(nombre, niveles, function (c, ctx) { return alcance(c, ctx, op, fn); });
  }
  var PERSONAL = ['general', 'admin-dojos', 'admin'];
  var AVISADORES = ['admin-dojos', 'admin'];
  registrar('alumnos', PERSONAL, { titulo: 'Alumnos', intro: 'Registra a tus alumnos, mira su ficha y cambia su estado.' }, alumnos);
  registrar('tutores', PERSONAL, { titulo: 'Tutores', intro: 'Quién da clases y cuándo puede. Asigna cada clase a quien está libre.' }, tutores);
  registrar('clases', PERSONAL, { titulo: 'Clases', intro: 'Tus clases, sus cupos y quién está inscrito. El servidor no deja pasar del cupo.' }, clasesAdmin);
  registrar('planes', PERSONAL, { titulo: 'Planes del dojo', intro: 'Lo que cobras: días por semana, horarios y precio mensual, en quetzales.' }, planes);
  registrar('pagos', PERSONAL, { titulo: 'Pagos de alumnos', intro: 'Comprobantes por confirmar, pagos en efectivo, cobros y recibos.' }, pagos);
  registrar('plantillas', AVISADORES, { titulo: 'Avisos y plantillas', intro: 'Abre WhatsApp o Gmail con el mensaje ya escrito. Tú lo revisas y lo envías.' }, plantillas);
  registrar('suspendidos', AVISADORES, { titulo: 'Suspendidos', intro: 'Quienes tienen la credencial pausada por atraso, con su contacto.' }, suspendidos);
  registrar('config-dojo', PERSONAL, { titulo: 'Ajustes del dojo', intro: 'Cuándo se cobra, cuánto plazo hay y cuándo se pausa una credencial.' }, config);

  D.el = el; D.alcance = alcance; D.vista = vista; D.sinAcceso = sinAcceso; D.acciones_ = acciones_; D.panel = panel; D.vacio = vacio; D.campoManual = campoManual; D.opciones = opciones;
  D.dialogoForm = dialogoForm; D.diaCanon = diaCanon; D.diaTxt = diaTxt; D.DIAS = DIAS; D.DIA_TXT = DIA_TXT; D.horarioTxt = horarioTxt; D.claseTxt = claseTxt;
  D.hoyGT = hoyGT; D.edadDe = edadDe; D.etiquetaEstado = etiquetaEstado; D.copiar = copiar; D.cabe = cabe; D.ocupacion = ocupacion; D.panelRecibo = panelRecibo;
  D.esCelular = esCelular; D.tarjetaAviso = tarjetaAviso; D.panelAviso = panelAviso;
  plat.d = D;
})();
