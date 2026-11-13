/* Pantallas del administrador de dojos (Task 15): "Mis dojos" y "Cobros" (estado de cada dojo y subida de comprobantes).
 * También registra las vistas `dojos` y `cobros-plataforma` y reparte por nivel (general vive en general.js).
 * El `admin` de un dojo ve aquí solo el estado de la cuenta de su dojo (spec 4): sin subir ni confirmar nada. */
(function () {
  'use strict';
  var el = ui.el;
  var P = plat;

  // ------------------------------------------------------------------ Panel de cada dojo
  // Tarjetas con los dojos; al elegir uno se ven su administración y tutores, y accesos a sus pantallas con ese dojo ya elegido.
  var ACCESOS_DOJO = [
    ['alumnos', 'Alumnos', 'Fichas, encargados y estado de cada alumno'],
    ['tutores', 'Tutores', 'Personal que da clases y su disponibilidad'],
    ['clases', 'Clases y cupos', 'Horarios, cupos e inscripciones'],
    ['planes', 'Planes del dojo', 'Días por semana y precio para alumnos'],
    ['pagos', 'Pagos de alumnos', 'Comprobantes por confirmar, efectivo y recibos'],
    ['suspendidos', 'Suspendidos', 'Alumnos atrasados y avisos por WhatsApp'],
    ['plantillas', 'Avisos y plantillas', 'Mensajes de cobro y de cambio de clase'],
    ['config-dojo', 'Ajustes del dojo', 'Modo de cobro y días de gracia'],
    ['cuentas', 'Crear administrador o tutor', 'Cuentas nuevas para este dojo']
  ];
  function panelDojos(c, ctx, lista) {
    var activos = lista.filter(function (x) { return x.estado === 'activo'; });
    if (!activos.length) return;
    var detalle = el('div', { class: 'panel-dojo' });
    var tarjetas = el('div', { class: 'tarjetas-dojo' }, activos.map(function (dj) {
      return el('button', { type: 'button', class: 'tarjeta-dojo', al: { click: function () { abrir(dj); } } },
        el('b', { texto: dj.nombre }), el('span', { texto: P.planTexto(dj.plan) }), P.etiquetaCuenta(dj.cuenta.estado));
    }));
    P.seccion(c, 'Administrar un dojo', el('div', null, el('p', { class: 'ayuda', texto: 'Elige un dojo para ver quién lo administra y entrar a sus alumnos, tutores, clases y cobros.' }), tarjetas, detalle));
    async function abrir(dj) {
      Array.prototype.forEach.call(tarjetas.children, function (b) { b.classList.toggle('activa', b.textContent.indexOf(dj.nombre) === 0); });
      ui.limpiar(detalle);
      detalle.appendChild(el('h3', { texto: dj.nombre }));
      var personal = el('div', { class: 'personal-dojo' }, el('p', { class: 'cargando', texto: 'Cargando personal…' }));
      detalle.appendChild(personal);
      detalle.appendChild(el('div', { class: 'accesos-dojo' }, ACCESOS_DOJO.map(function (a) {
        return el('a', { href: '#/' + a[0], class: 'acceso-dojo', al: { click: function () { if (window.elegirDojoTrabajo) window.elegirDojoTrabajo(dj.dojoId); } } },
          el('b', { texto: a[1] }), el('span', { texto: a[2] }));
      })));
      try {
        var r = await api('listarMembresias', {});
        if (!ctx.vigente()) return;
        var del = r.membresias.filter(function (m) { return m.dojoId === dj.dojoId && m.estado === 'activo'; });
        var nombres = function (nivel) { return del.filter(function (m) { return m.nivel === nivel; }).map(function (m) { return m.nombre || m.correo; }).join(', '); };
        ui.limpiar(personal);
        personal.appendChild(el('p', null, el('b', { texto: 'Administración: ' }), nombres('admin') || 'sin asignar (créala en "Crear administrador o tutor")'));
        personal.appendChild(el('p', null, el('b', { texto: 'Tutores: ' }), nombres('tutor') || 'aún no hay'));
      } catch (e) {
        if (!ctx.vigente()) return;
        ui.limpiar(personal);
        personal.appendChild(el('p', { class: 'ayuda', texto: 'No se pudo cargar el personal: ' + (e.message || 'intenta de nuevo') }));
      }
    }
  }

  // ------------------------------------------------------------------ Mis dojos
  async function dojos(c, ctx) {
    async function pintar() {
      var d = await api('listarDojos', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      P.encabezado(c, 'Mis dojos', 'Tus dojos, su plan y el estado de su cuenta con la plataforma. El plan solo lo cambia la administración general.');
      var etiquetaPlan = function (p) { return p.nombre + ' · ' + P.dinero(p.precio) + ' al mes'; };

      P.seccion(c, 'Dojos', ui.tabla([
        {
          clave: 'nombre', titulo: 'Dojo', formato: function (v, f) {
            return el('div', null, el('b', { texto: f.nombre }), el('p', { class: 'ayuda', texto: 'Alta ' + P.fechaCorta(f.fechaAlta) }));
          }
        },
        { clave: 'plan', titulo: 'Plan', formato: function (v, f) { return P.planTexto(f.plan); } },
        {
          clave: 'cuenta', titulo: 'Cuenta', formato: function (v, f) {
            return el('div', null, P.etiquetaCuenta(f.cuenta.estado), f.cuenta.estado === 'rechazado' && f.cuenta.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + f.cuenta.motivo }) : null);
          }
        },
        { clave: 'cuenta', titulo: 'Debe vencido', alinear: 'der', formato: function (v) { return P.dinero(v.deudaVencida); } }
      ], d.dojos, { titulo: 'Mis dojos', vacio: 'Aún no tienes dojos. Crea el primero abajo.' }));
      panelDojos(c, ctx, d.dojos);

      var org = d.organizaciones[0];
      var formDojo = ui.formulario([
        { nombre: 'nombre', etiqueta: 'Nombre del dojo', requerido: true, minlength: 2, maxlength: 80, autocomplete: 'off' },
        { nombre: 'slug', etiqueta: 'Identificador (opcional)', maxlength: 40, autocomplete: 'off', ayuda: 'Minúsculas, números y guiones. Si lo dejas vacío se arma con el nombre.' },
        {
          nombre: 'planId', etiqueta: 'Plan', tipo: 'select', valor: 'basico', opciones: d.planes.map(function (p) { return { valor: p.planId, etiqueta: etiquetaPlan(p) }; }),
          ayuda: 'Elige viendo el precio. Básico por defecto. Cada mes se cobra el precio del plan de cada dojo.'
        }
      ], async function (v) {
        // Cada dojo genera su propio cargo mensual con la plataforma: se avisa antes de crearlo.
        var plan = d.planes.filter(function (p) { return p.planId === v.planId; })[0];
        var cargo = plan && !plan.esCortesia ? P.dinero(plan.precio) + ' al mes (plan ' + plan.nombre + ')' : '';
        if (cargo && !(await ui.confirmar('Este dojo suma ' + cargo + ' a tu cuenta con la plataforma. El primer cobro llega al cerrar su primer mes. ¿Crear el dojo?', { titulo: 'Cargo por el dojo nuevo', aceptar: 'Crear dojo' }))) return;
        var r = await api('crearDojo', { nombre: v.nombre, slug: v.slug, planId: v.planId });
        ui.aviso('Dojo ' + r.nombre + ' creado.' + (cargo ? ' Se suma ' + cargo + ' a tu cuenta; lo ves en "Cobros a dojos".' : ''), 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Crear dojo' });
      P.seccion(c, 'Crear un dojo', el('div', { class: 'tarjeta ancha tarjeta-form' },
        org ? el('p', { class: 'ayuda', texto: 'Se crea en tu organización: ' + org.nombre + '.' }) : null, formDojo));

      P.seccion(c, 'Planes disponibles', ui.tabla([
        { clave: 'nombre', titulo: 'Plan' },
        { clave: 'precio', titulo: 'Precio al mes', alinear: 'der', formato: P.dinero },
        { clave: 'herramientas', titulo: 'Herramientas', formato: function (v) { return v.map(function (h) { return P.NOMBRE_HERRAMIENTA[h] || h; }).join(', '); } }
      ], d.planes, { titulo: 'Planes disponibles' }));
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Cobros: admin-dojos
  async function cobros(c, ctx) {
    var resultado = null;   // lo que respondió la última subida, para mostrarlo tras repintar

    async function pintar() {
      var lista = await api('listarCobrosPlataforma', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      P.encabezado(c, 'Cobros', 'Lo que cada dojo debe a la plataforma. Aquí subes el comprobante de tu depósito.');
      var activos = lista.dojos.filter(function (d) { return d.estado === 'activo'; });
      var porId = {};
      activos.forEach(function (d) { porId[d.dojoId] = d; });

      if (!lista.aviso) {
        c.appendChild(el('p', { class: 'error', role: 'alert', texto: 'No se pudo cargar el aviso sobre los comprobantes, así que no se puede subir ninguno por ahora. Recarga la página.' }));
      } else {
        c.appendChild(el('h2', { texto: 'Antes de subir tu comprobante' }));
        c.appendChild(P.avisoLiteral(lista.aviso));
      }

      if (resultado) {
        var r = resultado;
        c.appendChild(el('div', { class: 'resultado-subida', role: 'status' },
          el('h2', { texto: 'Comprobante enviado' }),
          el('p', { texto: r.dojo + ': ' + P.dinero(r.montoDeclarado) + (r.repetido ? '. Este comprobante ya se había enviado antes; no se duplicó.' : '.') }),
          el('p', { texto: r.activa ? 'Tu cuenta queda activa mientras se revisa el comprobante. Las descargas se habilitan cuando se confirme el pago.'
            : (r.cuenta.deudaVencida > 0 ? 'El monto no cubre todo lo vencido (' + P.dinero(r.cuenta.deudaVencida) + '), así que por sí solo no activa la cuenta. Sube el pago completo.' : 'Recibimos tu comprobante. Queda por confirmar.') }),
          el('p', null, 'Estado de la cuenta: ', P.etiquetaCuenta(r.cuenta.estado)),
          r.aviso ? P.avisoLiteral(r.aviso) : null));
      }

      // El formulario va justo debajo del aviso (se llena más abajo): quien sube ve el aviso y el botón en la misma vista.
      var bloqueSubida = el('div');
      c.appendChild(bloqueSubida);

      // Estado de cada dojo
      P.seccion(c, 'Estado de cada dojo', ui.tabla([
        {
          clave: 'nombre', titulo: 'Dojo', formato: function (v, f) {
            return el('div', null, el('b', { texto: f.nombre }), el('p', { class: 'ayuda', texto: P.planTexto(f.plan) }));
          }
        },
        {
          clave: 'cuenta', titulo: 'Estado', formato: function (v, f) {
            return el('div', null, P.etiquetaCuenta(v.estado), v.estado === 'rechazado' && v.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + v.motivo }) : null,
              v.diasAtraso > 0 ? el('p', { class: 'ayuda', texto: v.diasAtraso + (v.diasAtraso === 1 ? ' día' : ' días') + ' de atraso' }) : null);
          }
        },
        { clave: 'cuenta', titulo: 'Vencido', alinear: 'der', formato: function (v) { return P.dinero(v.deudaVencida); } },
        { clave: 'cuenta', titulo: 'Saldo total', alinear: 'der', formato: function (v) { return P.dinero(v.saldoPendiente); } },
        { clave: 'cuenta', titulo: 'Próximo vencimiento', formato: function (v) { return P.fechaCorta(v.proximoVencimiento); } },
        {
          clave: 'dojoId', titulo: 'Comprobante', formato: function (v, f) {
            return P.boton('Subir', '', 'Subir un comprobante para ' + f.nombre, function () { elegir(f.dojoId); });
          }
        }
      ], activos, { titulo: 'Estado de cada dojo', vacio: 'Aún no tienes dojos activos.' }));

      // Subir comprobante
      var sel = null;
      var monto = null;
      var sugerido = '';
      var resumen = el('p', { class: 'ayuda', 'aria-live': 'polite' });
      function sugerencia(d) { return d && d.cuenta.deudaVencida > 0 ? String(d.cuenta.deudaVencida) : ''; }
      function elegir(dojoId) {
        if (!sel) return;
        sel.value = dojoId;
        alElegir();
        sel.scrollIntoView({ block: 'center' });
        sel.focus();
      }
      function alElegir() {
        var d = porId[sel.value];
        if (!d) { resumen.textContent = ''; return; }
        var nuevo = sugerencia(d);
        if (monto.value === '' || monto.value === sugerido) monto.value = nuevo;
        sugerido = nuevo;
        resumen.textContent = d.nombre + ' debe ' + P.dinero(d.cuenta.deudaVencida) + ' vencidos y tiene un saldo pendiente de ' + P.dinero(d.cuenta.saldoPendiente) + '. Para activar la cuenta, el monto debe cubrir todo lo vencido.';
      }
      if (activos.length && lista.aviso) {
        var primero = activos.filter(function (d) { return d.cuenta.deudaVencida > 0; })[0] || activos.filter(function (d) { return d.cuenta.saldoPendiente > 0; })[0] || activos[0];
        var form = ui.formulario([
          { nombre: 'dojoId', etiqueta: 'Dojo', tipo: 'select', valor: primero.dojoId, opciones: activos.map(function (d) { return { valor: d.dojoId, etiqueta: d.nombre }; }) },
          { nombre: 'monto', etiqueta: 'Monto depositado (Q)', tipo: 'number', requerido: true, min: '0.01', step: '0.01', ayuda: 'Declara lo que depositaste. La administración lo verifica contra el comprobante.' },
          { nombre: 'archivo', etiqueta: 'Comprobante (JPG, PNG o PDF, hasta 5 MB)', tipo: 'file', requerido: true, accept: '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf' }
        ], async function (v, op) {
          var archivo = await P.leerArchivo(v.archivo);
          var r = await api('subirPagoPlataforma', { dojoId: v.dojoId, montoDeclarado: String(v.monto), claveIdempotencia: op.claveIdempotencia, archivo: archivo });
          var d = porId[v.dojoId];
          resultado = Object.assign({ dojo: d ? d.nombre : '' }, r);
          // Sin aviso emergente: el resultado se muestra en la propia pantalla y nada tapa el aviso del spec 6.1.
          auth.refrescar();
          if (ctx.vigente()) await pintar();
        }, { textoBoton: 'Subir comprobante' });
        sel = form.querySelector('[name=dojoId]');
        monto = form.querySelector('[name=monto]');
        sel.addEventListener('change', alElegir);
        alElegir();
        P.seccion(bloqueSubida, 'Subir comprobante', el('div', { class: 'tarjeta ancha tarjeta-form' }, resumen, form));
      }

      P.seccion(c, 'Cobros emitidos', P.tablaCobros(activos, activos.length > 1));
      P.seccion(c, 'Historial de comprobantes', P.tablaPagos(activos, { conDojo: activos.length > 1, ctx: ctx, raiz: c }));
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Cobros: admin (solo ver el estado de su dojo)
  async function cobrosAdmin(c, ctx) {
    var lista = await api('listarCobrosPlataforma', {});
    if (!ctx.vigente()) return;
    P.encabezado(c, 'Cobros a dojos', 'El estado de la cuenta de tu dojo con la plataforma.');
    var d = lista.dojos[0];
    if (!d) { c.appendChild(el('p', { class: 'vacio', texto: 'No encontramos la cuenta de tu dojo.' })); return; }
    var cu = d.cuenta;
    c.appendChild(el('div', { class: 'datos' },
      P.dato('Dojo', d.nombre),
      P.dato('Plan', P.planTexto(d.plan)),
      el('div', { class: 'dato' }, el('b', { texto: 'Estado' }), P.etiquetaCuenta(cu.estado)),
      P.dato('Debe vencido', P.dinero(cu.deudaVencida)),
      P.dato('Saldo pendiente', P.dinero(cu.saldoPendiente)),
      P.dato('Próximo vencimiento', P.fechaCorta(cu.proximoVencimiento)),
      P.dato('Días de atraso', String(cu.diasAtraso)),
      P.dato('Descargas', cu.descargas ? 'Habilitadas' : 'Se habilitan cuando se confirme el pago')));
    if (cu.estado === 'rechazado' && cu.motivo) c.appendChild(el('p', { class: 'motivo', role: 'status', texto: 'Motivo del rechazo: ' + cu.motivo }));
    if (cu.soloLectura) c.appendChild(el('p', { class: 'advertencia', texto: 'Tu dojo está en solo lectura hasta que se confirme un pago válido.' }));
    c.appendChild(el('h2', { texto: 'Cómo se activa la cuenta' }));
    if (lista.aviso) c.appendChild(P.avisoLiteral(lista.aviso));
    c.appendChild(el('p', { class: 'ayuda', texto: 'Los comprobantes de pago los sube quien administra tus dojos. Aquí solo ves el estado.' }));
  }

  function sinAcceso(c) { c.appendChild(el('p', { class: 'error', role: 'alert', texto: 'No tienes acceso a esta pantalla.' })); }

  plat.adminDojos = { dojos: dojos, cobros: cobros, cobrosAdmin: cobrosAdmin };

  ui.vista('dojos', function (c, ctx) {
    var n = ctx.sesion.nivel;
    if (n === 'general') return plat.general.dojos(c, ctx);
    if (n === 'admin-dojos') return dojos(c, ctx);
    return sinAcceso(c);
  });
  ui.vista('cobros-plataforma', function (c, ctx) {
    var n = ctx.sesion.nivel;
    if (n === 'general') return plat.general.cobros(c, ctx);
    if (n === 'admin-dojos') return cobros(c, ctx);
    if (n === 'admin') return cobrosAdmin(c, ctx);
    return sinAcceso(c);
  });
})();
