/* plataforma.js: piezas y pantallas compartidas por los niveles de plataforma (Task 15).
 *  - Ayudas: fechas en español, etiquetas de estado, lectura de comprobantes en base64, descarga y visor por blob:,
 *    diálogo de motivo, aviso literal del spec 6.1 y tablas de cobros y pagos.
 *  - Vistas de varios niveles: `cuentas` (general, admin-dojos, admin; crea cuentas y quita el acceso al personal), `mi-cuenta` (personal),
 *    `recibos` (todos) y `aviso-editar` (general, admin).
 * Todo texto de personas o de la base entra por ui.el (textContent). Las vistas siguen el contrato de ui.js. */
(function () {
  'use strict';
  var el = ui.el;

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var TIPOS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'application/pdf': 'PDF' };
  var MAX_BYTES = 5 * 1024 * 1024;
  var ESTADO_CUENTA = {
    'al-dia': ['Al día', 'ok'], 'vencido': ['Vencido', 'alerta'], 'solo-lectura': ['En solo lectura', 'mal'],
    'por-confirmar': ['Comprobante por confirmar', 'info'], 'rechazado': ['Comprobante rechazado', 'mal']
  };
  var ESTADO_PAGO = { 'por-confirmar': ['Por confirmar', 'info'], 'confirmado': ['Confirmado', 'ok'], 'rechazado': ['Rechazado', 'mal'] };
  var HERRAMIENTAS = [
    ['alumnos-cobros', 'Alumnos, cobros y comprobantes'], ['clases', 'Clases, horarios y cupos'], ['asistencia', 'Asistencia'],
    ['disponibilidad', 'Disponibilidad y asignación de tutores'], ['plantillas', 'Plantillas de WhatsApp y Gmail'], ['dashboard', 'Dashboard con comparativos'],
    ['seguimiento', 'Seguimiento de suspendidos y promociones'], ['ausencias', 'Avisos por ausencias'], ['excel', 'Descargas en Excel'], ['landing', 'Landing del dojo']
  ];
  var NOMBRE_HERRAMIENTA = {};
  HERRAMIENTAS.forEach(function (h) { NOMBRE_HERRAMIENTA[h[0]] = h[1]; });
  /** Quién crea a quién (R22): solo oculta opciones; el servidor decide. */
  var CREA = { general: ['general', 'admin-dojos', 'admin', 'tutor', 'alumno'], 'admin-dojos': ['admin', 'tutor', 'alumno'], admin: ['tutor', 'alumno'] };

  // ---------------------------------------------------------------- Formato
  function fecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1] : String(iso || '');
  }
  function fechaCorta(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[3]) + ' ' + MESES[Number(m[2]) - 1].slice(0, 3) + ' ' + m[1] : (iso ? String(iso) : '—');
  }
  function periodo(a, b) { return fechaCorta(a) + ' a ' + fechaCorta(b); }
  function dinero(v) { return ui.moneda(Number(v)); }
  function hace(dias) { return dias <= 0 ? 'hoy' : (dias === 1 ? 'hace 1 día' : 'hace ' + dias + ' días'); }
  function etiqueta(texto, tipo) { return el('span', { class: 'etiqueta e-' + tipo, texto: texto }); }
  function etiquetaCuenta(estado) { var e = ESTADO_CUENTA[estado] || [String(estado || ''), 'info']; return etiqueta(e[0], e[1]); }
  function etiquetaPago(estado) { var e = ESTADO_PAGO[estado] || [String(estado || ''), 'info']; return etiqueta(e[0], e[1]); }
  function planTexto(p) { return p ? p.nombre + (p.esCortesia ? ' (cortesía, sin cobro)' : ' · ' + dinero(p.precio) + ' al mes') : 'Sin plan'; }

  function fallo(e) {
    if (e && e.manejado) return;
    ui.aviso((e && e.message) || 'No se pudo completar. Intenta de nuevo.', 'error');
  }

  /** Controlador de un botón de acción: deshabilita TODAS las acciones de la vista mientras corre, así un doble clic envía una sola petición. */
  function protegido(raiz, fn) {
    var enCurso = false;
    return function () {
      if (enCurso) return;
      enCurso = true;
      var botones = Array.prototype.slice.call(raiz.querySelectorAll('button.accion'));
      botones.forEach(function (b) { b.disabled = true; });
      Promise.resolve().then(fn).catch(fallo).then(function () {
        enCurso = false;
        botones.forEach(function (b) { b.disabled = false; });
      });
    };
  }
  function boton(texto, clase, aria, alClick) {
    return el('button', { type: 'button', class: 'accion' + (clase ? ' ' + clase : ''), 'aria-label': aria || null, texto: texto, al: { click: alClick } });
  }
  function acciones() { return el('div', { class: 'acciones-fila' }, Array.prototype.slice.call(arguments)); }
  function mensajeCancelado() { var e = new Error('cancelado'); e.manejado = true; return e; }

  // ---------------------------------------------------------------- Archivos
  function tipoPorBytes(b) {
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b.length > 3 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    return '';
  }
  function aBase64(bytes) {
    var partes = [];
    for (var i = 0; i < bytes.length; i += 0x8000) partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    return btoa(partes.join(''));
  }
  function deBase64(texto) {
    var bin = atob(texto);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** Valida en el cliente (tamaño, tipo por contenido) y devuelve { nombre, mime, base64 }. El servidor tiene la última palabra. */
  async function leerArchivo(archivo) {
    if (!archivo) throw new Error('Adjunta el comprobante.');
    if (archivo.type && !Object.prototype.hasOwnProperty.call(TIPOS, archivo.type)) throw new Error('El comprobante debe ser JPG, PNG o PDF.');
    if (archivo.size === 0) throw new Error('El archivo está vacío.');
    if (archivo.size > MAX_BYTES) throw new Error('El comprobante pesa más de 5 MB.');
    var bytes = new Uint8Array(await archivo.arrayBuffer());
    var mime = tipoPorBytes(bytes);
    if (!mime) throw new Error('El comprobante debe ser JPG, PNG o PDF.');
    return { nombre: String(archivo.name || '').slice(0, 120), mime: mime, base64: aBase64(bytes) };
  }
  function nombreSeguro(n) { return String(n || 'archivo').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80); }
  /** Descarga bytes en base64 como archivo. La URL blob: se revoca enseguida. */
  function descargar(nombre, mime, base64) {
    if (!Object.prototype.hasOwnProperty.call(TIPOS, mime)) throw new Error('El archivo recibido no es válido.');
    var url = URL.createObjectURL(new Blob([deBase64(base64)], { type: mime }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreSeguro(nombre);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---------------------------------------------------------------- Diálogos
  function abrir(d) {
    d.addEventListener('close', function () { if (d.parentNode) d.parentNode.removeChild(d); });
    document.body.appendChild(d);
    d.showModal();
  }
  /**
   * Pide un motivo obligatorio. op: { titulo, texto, aceptar, peligro, casilla: { etiqueta, ayuda, valor } }.
   * Promesa con { motivo, casilla } o null si cancela.
   */
  function pedirMotivo(op) {
    return new Promise(function (resolver) {
      var d = el('dialog', { 'aria-label': op.titulo, class: 'dialogo-motivo' });
      var terminado = false;
      var cerrar = function (v) { if (terminado) return; terminado = true; d.close(); resolver(v); };
      var campos = [{ nombre: 'motivo', etiqueta: op.etiqueta || 'Motivo', tipo: 'textarea', filas: 3, requerido: true, minlength: 3, maxlength: 300 }];
      if (op.casilla) campos.push({ nombre: 'casilla', etiqueta: op.casilla.etiqueta, tipo: 'checkbox', valor: !!op.casilla.valor, ayuda: op.casilla.ayuda });
      var form = ui.formulario(campos, function (v) {
        if (v.motivo.length < 3) throw new Error('Escribe el motivo (al menos 3 letras).');
        cerrar({ motivo: v.motivo, casilla: !!v.casilla });
      }, { textoBoton: op.aceptar || 'Aceptar' });
      if (op.peligro) form.querySelector('button[type=submit]').className = 'peligro';
      form.appendChild(el('button', { type: 'button', texto: 'Cancelar', al: { click: function () { cerrar(null); } } }));
      d.appendChild(el('h2', { texto: op.titulo }));
      d.appendChild(el('p', { texto: op.texto }));
      d.appendChild(form);
      d.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(null); });
      abrir(d);
      form.querySelector('textarea').focus();
    });
  }

  /**
   * Muestra un comprobante que entrega el servidor (verComprobante). Imagen en <img>, PDF en <iframe>, ambos por una URL blob:
   * que se revoca al cerrar. El tipo sale del servidor (deducido de los bytes) y solo se aceptan JPG, PNG y PDF.
   */
  async function verComprobante(archivoId, ctx) {
    var r = await api('verComprobante', { archivoId: archivoId });
    if (ctx && !ctx.vigente()) return;
    if (!r || !Object.prototype.hasOwnProperty.call(TIPOS, r.mime)) throw new Error('No se pudo mostrar el comprobante.');
    var url = URL.createObjectURL(new Blob([deBase64(r.base64)], { type: r.mime }));
    var d = el('dialog', { 'aria-label': 'Comprobante', class: 'visor' });
    var visor;
    if (r.mime === 'application/pdf') {
      visor = el('iframe', { class: 'visor-pdf', title: 'Comprobante de depósito (PDF)' });
    } else {
      visor = el('img', { class: 'visor-img', alt: 'Comprobante de depósito (' + TIPOS[r.mime] + ')' });
    }
    visor.src = url;   // blob: creado aquí; ui.el solo admite http(s), por eso no pasa por ahí
    var cerrar = el('button', { type: 'button', class: 'primario', texto: 'Cerrar', al: { click: function () { d.close(); } } });
    var bajar = el('button', { type: 'button', texto: 'Descargar archivo', al: { click: function () { descargar('comprobante.' + TIPOS[r.mime].toLowerCase(), r.mime, r.base64); } } });
    d.appendChild(el('h2', { texto: 'Comprobante de depósito' }));
    d.appendChild(el('div', { class: 'visor-cuadro' }, visor));
    d.appendChild(el('div', { class: 'acciones' }, bajar, cerrar));
    d.addEventListener('close', function () { URL.revokeObjectURL(url); });
    abrir(d);
    cerrar.focus();
  }

  // ---------------------------------------------------------------- Piezas de pantalla
  /** El aviso del spec 6.1, tal como lo entrega el servidor: no se reescribe ni se resume. */
  function avisoLiteral(texto) {
    return el('aside', { class: 'aviso-literal', 'aria-label': 'Aviso sobre el comprobante' }, el('p', { texto: texto }));
  }
  function encabezado(c, titulo, intro) {
    c.appendChild(el('h1', { texto: titulo }));
    if (intro) c.appendChild(el('p', { class: 'intro', texto: intro }));
  }
  function seccion(c, titulo, contenido) {
    c.appendChild(el('h2', { texto: titulo }));
    if (contenido) c.appendChild(contenido);
  }
  function dato(titulo, valor) { return el('div', { class: 'dato' }, el('b', { texto: titulo }), el('span', { texto: valor })); }

  var TOPE_FILAS = 60;
  function topar(filas, c, nombre) {
    if (filas.length <= TOPE_FILAS) return filas;
    c.push(el('p', { class: 'ayuda', texto: 'Se muestran los ' + TOPE_FILAS + ' ' + nombre + ' más recientes.' }));
    return filas.slice(0, TOPE_FILAS);
  }

  /** Cobros emitidos de una o varias cuentas (datos de listarCobrosPlataforma). */
  function tablaCobros(dojos, conDojo) {
    var filas = [];
    dojos.forEach(function (d) { (d.cobros || []).forEach(function (cb) { filas.push(Object.assign({ dojo: d.nombre }, cb)); }); });
    filas.sort(function (a, b) { return a.fechaPago < b.fechaPago ? 1 : (a.fechaPago > b.fechaPago ? -1 : 0); });
    var notas = [];
    filas = topar(filas, notas, 'cobros');
    var cols = [];
    if (conDojo) cols.push({ clave: 'dojo', titulo: 'Dojo' });
    cols.push(
      { clave: 'periodoInicio', titulo: 'Periodo usado', formato: function (v, f) { return periodo(f.periodoInicio, f.periodoFin); } },
      { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: dinero },
      { clave: 'pagado', titulo: 'Pagado', alinear: 'der', formato: dinero },
      { clave: 'pendiente', titulo: 'Pendiente', alinear: 'der', formato: dinero },
      { clave: 'fechaPago', titulo: 'Pagar a más tardar', formato: fechaCorta },
      { clave: 'cubierto', titulo: 'Estado', formato: function (v, f) { return f.cubierto ? etiqueta('Cubierto', 'ok') : (f.vencido ? etiqueta('Vencido', 'mal') : etiqueta('Por pagar', 'info')); } }
    );
    return el('div', null, ui.tabla(cols, filas, { titulo: 'Cobros emitidos', vacio: 'Aún no hay cobros emitidos. El primero se emite al cerrar el primer mes de uso.' }), notas);
  }

  /** Comprobantes de pago de una o varias cuentas, del más reciente al más antiguo. op: { conDojo, conRevisor, ctx }. */
  function tablaPagos(dojos, op) {
    var filas = [];
    dojos.forEach(function (d) { (d.pagos || []).forEach(function (pg) { filas.push(Object.assign({ dojo: d.nombre }, pg)); }); });
    filas.sort(function (a, b) { return a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : 0); });
    var notas = [];
    filas = topar(filas, notas, 'comprobantes');
    var cols = [{ clave: 'fecha', titulo: 'Subido', formato: fechaCorta }];
    if (op.conDojo) cols.push({ clave: 'dojo', titulo: 'Dojo' });
    cols.push(
      { clave: 'montoDeclarado', titulo: 'Declarado', alinear: 'der', formato: dinero },
      {
        clave: 'estado', titulo: 'Estado', formato: function (v, f) {
          return el('div', null, etiquetaPago(f.estado),
            f.estado === 'rechazado' && f.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + f.motivo }) : null,
            f.estado === 'por-confirmar' && f.activa ? el('p', { class: 'ayuda', texto: 'Mantiene activa la cuenta mientras se revisa.' }) : null);
        }
      }
    );
    if (op.conRevisor) cols.push({ clave: 'revisadoPor', titulo: 'Revisó', formato: function (v) { return v || '—'; } });
    cols.push(
      { clave: 'recibo', titulo: 'Recibo', formato: function (v) { return v ? v.numero + (v.estado === 'anulado' ? ' (anulado)' : '') : '—'; } },
      {
        clave: 'archivoId', titulo: 'Comprobante', formato: function (v, f) {
          return v ? boton('Ver', '', 'Ver comprobante del ' + fechaCorta(f.fecha) + ' de ' + f.dojo, protegido(op.raiz, function () { return verComprobante(v, op.ctx); })) : '—';
        }
      }
    );
    return el('div', null, ui.tabla(cols, filas, { titulo: 'Comprobantes enviados', vacio: 'Aún no hay comprobantes enviados.' }), notas);
  }

  // ---------------------------------------------------------------- Cuentas
  ui.vista('cuentas', async function (c, ctx) {
    var nivel = ctx.sesion.nivel;
    var niveles = CREA[nivel] || [];
    var dojos = [];
    var orgs = [];
    if (nivel === 'general' || nivel === 'admin-dojos') {
      var d = await api('listarDojos', {});
      if (!ctx.vigente()) return;
      dojos = d.dojos.filter(function (x) { return x.estado === 'activo'; });
      orgs = d.organizaciones.filter(function (o) { return o.estado === 'activo'; });
    }
    encabezado(c, 'Cuentas', 'Crea cuentas para tu equipo y tus alumnos. La persona entra con una clave temporal que debe cambiar en su primer ingreso.');

    var panel = el('div', { class: 'resultado-cuenta', role: 'region', 'aria-label': 'Cuenta creada', 'aria-live': 'polite' });
    function limpiarClave() {
      window.removeEventListener('hashchange', limpiarClave);
      ui.limpiar(panel);
    }
    var campos = [
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'email', requerido: true, maxlength: 254, autocomplete: 'off' },
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 120, autocomplete: 'off' },
      { nombre: 'telefono', etiqueta: 'Teléfono (opcional)', tipo: 'tel', maxlength: 30, autocomplete: 'off' },
      { nombre: 'nivel', etiqueta: 'Nivel', tipo: 'select', opciones: niveles.map(function (n) { return { valor: n, etiqueta: acceso.NIVELES[n] || n }; }) }
    ];
    if (nivel !== 'admin') {
      campos.push({ nombre: 'dojoId', etiqueta: 'Dojo', tipo: 'select', opciones: dojos.map(function (x) { return { valor: x.dojoId, etiqueta: x.nombre }; }) });
    }
    if (nivel === 'general') {
      campos.push({ nombre: 'organizacionId', etiqueta: 'Organización', tipo: 'select', opciones: orgs.map(function (o) { return { valor: o.organizacionId, etiqueta: o.nombre }; }) });
    }
    var form = ui.formulario(campos, async function (v) {
      var payload = { correo: v.correo, nombre: v.nombre, telefono: v.telefono, nivel: v.nivel };
      if (v.nivel === 'admin-dojos') payload.organizacionId = v.organizacionId;
      else if (nivel !== 'admin' && v.nivel !== 'general') payload.dojoId = v.dojoId;
      var r = await api('crearCuenta', payload);
      // La cuenta ya existe: la clave no puede perderse aunque la persona haya salido de esta pantalla (un reintento daría una clave que no sirve, R21).
      if (!ctx.vigente()) { mostrarClaveModal(r, v); return; }
      mostrarClave(r, v);
      form.reset();
      alCambiarNivel();
    }, { textoBoton: 'Crear cuenta' });

    function campo(nombre) { return form.querySelector('[name=' + nombre + ']'); }
    function alCambiarNivel() {
      var n = campo('nivel').value;
      var dojo = campo('dojoId');
      var org = campo('organizacionId');
      if (dojo) { dojo.closest('.campo').hidden = !(n === 'admin' || n === 'tutor' || n === 'alumno'); dojo.required = !dojo.closest('.campo').hidden; }
      if (org) { org.closest('.campo').hidden = n !== 'admin-dojos'; org.required = !org.closest('.campo').hidden; }
    }
    campo('nivel').addEventListener('change', alCambiarNivel);
    alCambiarNivel();

    /** Nodos con la clave, la advertencia, el mensaje del servidor y los botones. `alEntregar` borra la clave de la pantalla. */
    function armarClave(r, v, alEntregar) {
      var clave = el('code', { class: 'clave-temporal', texto: r.claveTemporal });
      var copiar = el('button', {
        type: 'button', class: 'primario', texto: 'Copiar clave', al: {
          click: function () {
            var texto = clave.textContent;
            var listo = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(texto) : Promise.reject(new Error('sin portapapeles'));
            listo.then(function () { ui.aviso('Clave copiada.', 'ok'); }, function () {
              var rango = document.createRange();
              rango.selectNodeContents(clave);
              var sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(rango);
              ui.aviso('No se pudo copiar solo. La clave quedó seleccionada: cópiala con Ctrl+C.', 'error');
            });
          }
        }
      });
      return [
        el('h2', { texto: 'Cuenta lista' }),
        el('p', { texto: 'Cuenta para ' + v.nombre + ' (' + v.correo + ').' }),
        el('p', { class: 'ayuda', texto: 'Clave temporal:' }),
        clave,
        el('p', { texto: r.mensaje }),
        el('p', { class: 'advertencia', role: 'alert', texto: 'Esta clave no se vuelve a mostrar. Cópiala y entrégala ahora; al salir de esta pantalla se borra.' }),
        el('div', { class: 'acciones-fila' }, copiar, el('button', { type: 'button', texto: 'Ya la entregué', al: { click: alEntregar } }))
      ];
    }
    function mostrarClave(r, v) {
      ui.limpiar(panel);
      armarClave(r, v, limpiarClave).forEach(function (n) { panel.appendChild(n); });
      window.addEventListener('hashchange', limpiarClave);
      panel.querySelector('.clave-temporal').scrollIntoView({ block: 'nearest' });
    }
    /** Cuando la persona ya salió de la vista: un diálogo que solo se cierra con "Ya la entregué" (Escape no lo cierra). */
    function mostrarClaveModal(r, v) {
      var d = el('dialog', { 'aria-label': 'Cuenta creada', class: 'dialogo-clave' });
      armarClave(r, v, function () { d.close(); }).forEach(function (n) { d.appendChild(n); });
      d.addEventListener('cancel', function (e) { e.preventDefault(); });
      d.addEventListener('close', function () { ui.limpiar(d); });
      abrir(d);
    }

    if (nivel === 'admin' && ctx.sesion.dojo) c.appendChild(el('p', { class: 'ayuda', texto: 'Las cuentas se crean en ' + ctx.sesion.dojo.nombre + '.' }));
    if (nivel !== 'admin' && !dojos.length) c.appendChild(el('p', { class: 'vacio', texto: 'Primero crea un dojo para poder crear cuentas de personal y alumnos.' }));
    c.appendChild(el('div', { class: 'tarjeta ancha tarjeta-form' }, form));
    c.appendChild(panel);

    // ---- Personal con acceso: ver y quitar el acceso (fix 1, I7). Solo oculta; el servidor decide quién puede.
    var zonaPersonal = el('div', { 'aria-live': 'polite' });
    var NIVEL_PLURAL = { 'admin-dojos': 'administrador de dojos', admin: 'administrador', tutor: 'tutor' };
    async function pintarPersonal() {
      var r = await api('listarMembresias', {});
      if (!ctx.vigente()) return;
      ui.limpiar(zonaPersonal);
      var cols = [
        {
          clave: 'nombre', titulo: 'Persona', formato: function (v, m) {
            return el('div', null, el('b', { texto: m.nombre || '(sin nombre)' }), el('p', { class: 'ayuda', texto: m.correo }));
          }
        },
        { clave: 'nivel', titulo: 'Nivel', formato: function (v) { return acceso.NIVELES[v] || v; } },
        { clave: 'dojoNombre', titulo: 'Dojo', formato: function (v, m) { return m.nivel === 'admin-dojos' ? (m.organizacionNombre || 'Organización') : v; } },
        { clave: 'estado', titulo: 'Acceso', formato: function (v) { return v === 'activo' ? etiqueta('Activo', 'ok') : etiqueta('Quitado', 'info'); } },
        {
          clave: 'membresiaId', titulo: 'Acciones', formato: function (v, m) {
            if (m.puedeDesactivar) return acciones(boton('Quitar acceso', 'peligro', 'Quitar el acceso de ' + m.nombre, protegido(c, function () { return quitarAcceso(m); })));
            return m.esYo ? el('span', { class: 'ayuda', texto: 'Eres tú' }) : '';
          }
        }
      ];
      zonaPersonal.appendChild(ui.tabla(cols, r.membresias, { titulo: 'Personal con acceso', vacio: 'Todavía no hay personal con cuenta.' }));
    }
    async function quitarAcceso(m) {
      var donde = m.nivel === 'admin-dojos' ? 'las organizaciones que administra' : m.dojoNombre;
      var resp = await pedirMotivo({
        titulo: 'Quitar el acceso de ' + m.nombre,
        texto: 'Esta persona dejará de poder entrar a ' + donde + ' al instante, aunque tenga la sesión abierta. No se borra nada: sus registros quedan. ' +
          'Si trabaja en otros dojos, sigue entrando a ellos. Para devolverle el acceso, crea la cuenta otra vez con el mismo correo, nivel y dojo: conserva su contraseña de siempre.',
        etiqueta: 'Motivo', aceptar: 'Quitar acceso', peligro: true
      });
      if (!resp) return;
      var out = await api('desactivarMembresia', { membresiaId: m.membresiaId, motivo: resp.motivo });
      if (!ctx.vigente()) return;
      ui.aviso('Listo: ' + m.nombre + ' ya no puede entrar' + (m.nivel === 'admin-dojos' ? '' : ' a ' + m.dojoNombre) + '.', 'ok');
      if (out.clasesAsignadas && out.clasesAsignadas.length) {
        ui.aviso(m.nombre + ' todavía tiene ' + out.clasesAsignadas.length + (out.clasesAsignadas.length === 1 ? ' clase asignada' : ' clases asignadas') + '. Reasígnalas en Clases para que no queden sin tutor.', 'info');
      }
      await pintarPersonal();
    }
    if (nivel === 'general' || nivel === 'admin-dojos' || nivel === 'admin') {
      seccion(c, 'Personal con acceso', zonaPersonal);
      await pintarPersonal();
      if (!ctx.vigente()) return;
    }
  });

  // ---------------------------------------------------------------- Mi cuenta (personal: general, admin-dojos, admin, tutor)
  ui.vista('mi-cuenta', async function (c, ctx) {
    var u = auth.estado.usuario || {};
    encabezado(c, 'Mi cuenta', 'Aquí puedes corregir tu nombre y tu teléfono. El correo no se cambia aquí: pídeselo a quien administra tu cuenta.');
    var form = ui.formulario([
      { nombre: 'nombre', etiqueta: 'Tu nombre', requerido: true, valor: u.nombre || '', maxlength: 120, autocomplete: 'name' },
      { nombre: 'telefono', etiqueta: 'Tu teléfono', tipo: 'tel', valor: u.telefono || '', maxlength: 30, autocomplete: 'tel', ayuda: 'Con 8 a 15 dígitos. Puedes dejarlo vacío.' }
    ], function (v) {
      return api('corregirDatos', { nombre: v.nombre, telefono: v.telefono });
    }, {
      textoBoton: 'Guardar cambios',
      alExito: function (r) {
        if (!ctx.vigente()) return;
        auth.estado.usuario = Object.assign({}, auth.estado.usuario, { nombre: r.nombre, telefono: r.telefono });
        ui.aviso(r.cambiado ? 'Listo, corregimos tus datos.' : 'No había nada que cambiar.', 'ok');
        if (r.cambiado && window.app) window.app.pintarCascaron();
      }
    });
    c.appendChild(el('div', { class: 'tarjeta ancha tarjeta-form' }, el('div', { class: 'datos' }, dato('Correo', u.correo || '')), form));
  });

  // ---------------------------------------------------------------- Recibos
  ui.vista('recibos', async function (c, ctx) {
    var nivel = ctx.sesion.nivel;
    encabezado(c, 'Recibos', 'Aquí siempre puedes ver y descargar tus recibos. Un recibo anulado sigue visible con su motivo.');
    var cuerpo = el('div');
    c.appendChild(cuerpo);

    function puedeAnular(r) {
      return r.estado !== 'anulado' && ((nivel === 'general' && r.tipo === 'plataforma') || (nivel === 'admin' && r.tipo === 'dojo'));
    }
    async function pintar() {
      var lista = await api('listarRecibos', {});
      if (!ctx.vigente()) return;
      ui.limpiar(cuerpo);
      var recibos = lista.recibos;
      var columnas = [
        {
          clave: 'numero', titulo: 'Recibo', formato: function (v, r) {
            var anulado = r.estado === 'anulado';
            return el('div', null,
              el('b', { class: anulado ? 'tachado' : '', texto: r.numero }),
              nivel === 'alumno' ? null : el('p', { class: 'ayuda', texto: r.tipo === 'plataforma' ? 'De la plataforma' : 'Del dojo' }),
              anulado ? el('p', { class: 'anulado' }, etiqueta('ANULADO', 'mal'), el('span', { texto: ' Motivo: ' + r.motivoAnulacion })) : null);
          }
        },
        { clave: 'fecha', titulo: 'Fecha', formato: fechaCorta },
        {
          clave: 'pagador', titulo: 'Detalle', formato: function (v, r) {
            return el('div', null, el('span', { texto: r.pagador }), el('p', { class: 'ayuda', texto: r.concepto + (r.periodo ? ' · ' + r.periodo : '') }));
          }
        },
        { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: dinero },
        {
          clave: 'reciboId', titulo: 'Acciones', formato: function (v, r) {
            var b = [boton('Descargar PDF', '', 'Descargar el recibo ' + r.numero, protegido(c, function () { return descargarRecibo(r); }))];
            if (puedeAnular(r)) b.push(boton('Anular', 'peligro', 'Anular el recibo ' + r.numero, protegido(c, function () { return anular(r); })));
            return acciones.apply(null, b);
          }
        }
      ];
      var vacio = lista.pagadosPorOtro
        ? 'No ves recibos aquí porque los pagos de tu ficha los hizo otra persona (por ejemplo, tu encargado). Los recibos le llegan a quien paga: pídeselos a esa persona o al dojo.'
        : 'Aún no hay recibos. Aparecen cuando se confirma un pago.';
      cuerpo.appendChild(ui.tabla(columnas, recibos, { titulo: 'Recibos', vacio: vacio }));
    }
    async function descargarRecibo(r) {
      var d = await api('descargarRecibo', { reciboId: r.reciboId });
      descargar(d.nombre, d.mime, d.base64);
      ui.aviso('Recibo ' + d.numero + ' descargado.', 'ok');
    }
    async function anular(r) {
      var resp = await pedirMotivo({
        titulo: 'Anular el recibo ' + r.numero,
        texto: 'El recibo no se borra: sigue visible, marcado como anulado y con tu motivo.',
        etiqueta: 'Motivo de la anulación', aceptar: 'Anular recibo', peligro: true,
        casilla: { etiqueta: 'Emitir otro recibo del mismo pago', valor: true, ayuda: 'Si lo desmarcas, el pago se rechaza y su monto vuelve a contar como pendiente.' }
      });
      if (!resp) return;
      if (!resp.casilla) {
        var seguro = await ui.confirmar('Sin otro recibo, el pago de ' + r.pagador + ' pasa a rechazado y su monto vuelve a contar como pendiente. ¿Anular de todos modos?', { aceptar: 'Anular sin reemitir', peligro: true });
        if (!seguro) return;
      }
      var out = await api('anularRecibo', { reciboId: r.reciboId, motivo: resp.motivo, reemitir: resp.casilla });
      ui.aviso(out.reciboNuevo ? 'Recibo anulado. Se emitió el recibo ' + out.reciboNuevo.numero + '.' : 'Recibo anulado. El pago quedó rechazado.', 'ok');
      if (nivel !== 'general') auth.refrescar();
      if (ctx.vigente()) await pintar();
    }
    await pintar();
  });

  // ---------------------------------------------------------------- Aviso de privacidad (edición)
  var MARCADORES = '{{DOJO_NOMBRE}}, {{CONTACTO_PIXANTECH}}, {{RESPONSABLE}}, {{CONTACTO_CORREO}}, {{CONTACTO_TELEFONO}}, {{DIRECCION}}, {{NORMAS_DOJO}}';

  ui.vista('aviso-editar', async function (c, ctx) {
    var nivel = ctx.sesion.nivel;
    async function pintar() {
      var av = await api('verAviso', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      encabezado(c, 'Aviso de privacidad', 'Versión ' + av.version + ', publicada el ' + fecha(av.fecha) + '.');
      if (nivel === 'general') pintarGeneral(av); else pintarDojo(av);
    }

    function pintarGeneral(av) {
      var formTexto = ui.formulario([
        {
          nombre: 'texto', etiqueta: 'Texto del aviso (base de todos los dojos)', tipo: 'textarea', filas: 16, requerido: true, valor: av.textoBase, minlength: 200, maxlength: 45000,
          ayuda: 'Marcadores que se rellenan solos con los datos de cada dojo: ' + MARCADORES + '.'
        }
      ], async function (v) {
        var ok = await ui.confirmar('Vas a publicar la versión ' + (av.version + 1) + ' del aviso. Todas las personas con cuenta de alumno o encargado tendrán que aceptarla de nuevo antes de seguir usando la aplicación. ¿Publicar?', { titulo: 'Publicar nueva versión', aceptar: 'Publicar versión ' + (av.version + 1) });
        if (!ok) throw mensajeCancelado();
        var r = await api('editarAviso', { texto: v.texto });
        ui.aviso('Se publicó la versión ' + r.version + '. Todos deberán aceptarla de nuevo.', 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Publicar nueva versión' });
      seccion(c, 'Nueva versión', el('div', { class: 'tarjeta ancha tarjeta-form' }, formTexto));

      var formContacto = ui.formulario([
        { nombre: 'contacto', etiqueta: 'Contacto de Pixantech', valor: av.contactoPixantech || '', maxlength: 200, ayuda: 'Se muestra donde el aviso lleva {{CONTACTO_PIXANTECH}}. Cambiarlo no crea una versión nueva.' }
      ], async function (v) {
        await api('editarAviso', { contactoPixantech: v.contacto });
        ui.aviso('Contacto de Pixantech guardado.', 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Guardar contacto' });
      seccion(c, 'Contacto de Pixantech', el('div', { class: 'tarjeta ancha tarjeta-form' }, formContacto));
    }

    function pintarDojo(av) {
      var campos = av.campos || {};
      var form = ui.formulario([
        { nombre: 'responsable', etiqueta: 'Responsable del tratamiento de datos', valor: campos.responsable, maxlength: 120 },
        { nombre: 'contactoCorreo', etiqueta: 'Correo de contacto', tipo: 'email', valor: campos.contactoCorreo, maxlength: 254 },
        { nombre: 'contactoTelefono', etiqueta: 'Teléfono de contacto', tipo: 'tel', valor: campos.contactoTelefono, maxlength: 30 },
        { nombre: 'direccion', etiqueta: 'Dirección', valor: campos.direccion, maxlength: 200 },
        { nombre: 'normas', etiqueta: 'Normas del dojo', tipo: 'textarea', filas: 5, valor: campos.normas, maxlength: 2000 }
      ], async function (v) {
        await api('editarDatosAvisoDojo', {
          responsable: v.responsable, contactoCorreo: v.contactoCorreo, contactoTelefono: v.contactoTelefono, direccion: v.direccion, normas: v.normas
        });
        ui.aviso('Datos del aviso guardados.', 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Guardar datos' });
      seccion(c, 'Datos de tu dojo en el aviso', el('div', { class: 'tarjeta ancha tarjeta-form' },
        el('p', { class: 'ayuda', texto: 'Estos datos se insertan en el aviso que aceptan tus alumnos. El texto base lo publica Pixantech.' }), form));
      seccion(c, 'Así lo ven tus alumnos', el('div', { class: 'texto-aviso', tabindex: 0, role: 'region', 'aria-label': 'Texto del aviso', texto: av.texto }));
    }
    await pintar();
  });

  window.plat = {
    el: el, fecha: fecha, fechaCorta: fechaCorta, periodo: periodo, dinero: dinero, hace: hace, planTexto: planTexto,
    etiqueta: etiqueta, etiquetaCuenta: etiquetaCuenta, etiquetaPago: etiquetaPago,
    fallo: fallo, protegido: protegido, boton: boton, acciones: acciones, mensajeCancelado: mensajeCancelado,
    leerArchivo: leerArchivo, descargar: descargar, pedirMotivo: pedirMotivo, verComprobante: verComprobante,
    avisoLiteral: avisoLiteral, encabezado: encabezado, seccion: seccion, dato: dato, tablaCobros: tablaCobros, tablaPagos: tablaPagos,
    HERRAMIENTAS: HERRAMIENTAS, NOMBRE_HERRAMIENTA: NOMBRE_HERRAMIENTA
  };
})();
