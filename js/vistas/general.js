/* Pantallas del administrador general (Task 15): "Dojos y planes" y "Cobros a dojos".
 * Las vistas `dojos` y `cobros-plataforma` las registra admin-dojos.js, que reparte por nivel; aquí viven las del nivel general.
 * Mismas reglas de ui.js: contenedor nuevo por navegación y ctx.vigente() tras cada await. */
(function () {
  'use strict';
  var el = ui.el;
  var P = plat;

  // ------------------------------------------------------------------ Dojos y planes
  async function dojos(c, ctx) {
    async function pintar() {
      var d = await api('listarDojos', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      P.encabezado(c, 'Dojos y planes', 'Crea dojos, asigna planes (incluido el de cortesía) y fija precios y herramientas.');
      var planes = d.planes;
      var porPlan = {};
      planes.forEach(function (p) { porPlan[p.planId] = p; });
      var etiquetaPlan = function (p) { return p.nombre + ' · ' + (p.esCortesia ? 'sin cobro' : P.dinero(p.precio) + ' al mes'); };

      // Dojos nuevos
      if (d.dojosNuevos.length) {
        var aviso = el('div', { class: 'aviso-nuevos', role: 'status' },
          el('h2', { texto: d.dojosNuevos.length === 1 ? 'Hay un dojo nuevo' : 'Hay ' + d.dojosNuevos.length + ' dojos nuevos' }),
          el('ul', null, d.dojosNuevos.map(function (n) { return el('li', { texto: n.nombre + ' · creado el ' + P.fechaCorta(n.fecha) + (n.planId ? ' · plan ' + (porPlan[n.planId] ? porPlan[n.planId].nombre : n.planId) : '') }); })),
          P.boton('Marcar como vistos', 'primario', null, P.protegido(c, async function () {
            await api('marcarDojosVistos', {});
            if (ctx.vigente()) await pintar();
          })));
        c.appendChild(aviso);
      }

      // Lista de dojos
      var filas = d.dojos;
      var tabla = ui.tabla([
        {
          clave: 'nombre', titulo: 'Dojo', formato: function (v, f) {
            return el('div', null, el('b', { texto: f.nombre }), f.nuevo ? [' ', P.etiqueta('Nuevo', 'info')] : null,
              el('p', { class: 'ayuda', texto: (f.organizacionNombre || 'Sin organización') + ' · alta ' + P.fechaCorta(f.fechaAlta) }));
          }
        },
        { clave: 'plan', titulo: 'Plan actual', formato: function (v, f) { return P.planTexto(f.plan); } },
        {
          clave: 'cuenta', titulo: 'Cuenta', formato: function (v, f) {
            return el('div', null, P.etiquetaCuenta(f.cuenta.estado), f.cuenta.deudaVencida > 0 ? el('p', { class: 'ayuda', texto: 'Vencido: ' + P.dinero(f.cuenta.deudaVencida) }) : null);
          }
        },
        {
          clave: 'dojoId', titulo: 'Asignar plan', formato: function (v, f) {
            var sel = el('select', { 'aria-label': 'Plan para ' + f.nombre }, planes.map(function (p) { return el('option', { value: p.planId, texto: etiquetaPlan(p) }); }));
            sel.value = f.plan ? f.plan.planId : '';
            var b = P.boton('Asignar', '', 'Asignar el plan elegido a ' + f.nombre, P.protegido(c, async function () {
              var plan = porPlan[sel.value];
              if (!plan || (f.plan && plan.planId === f.plan.planId)) { ui.aviso('Ese ya es el plan de ' + f.nombre + '.'); return; }
              var ok = await ui.confirmar('Asignar el plan ' + plan.nombre + (plan.esCortesia ? ' (cortesía: no se cobra)' : ' (' + P.dinero(plan.precio) + ' al mes)') + ' a ' + f.nombre + '. Aplica desde hoy; los cobros ya emitidos no cambian.', { titulo: 'Asignar plan', aceptar: 'Asignar plan' });
              if (!ok) return;
              await api('asignarPlan', { dojoId: f.dojoId, planId: plan.planId });
              ui.aviso('Plan ' + plan.nombre + ' asignado a ' + f.nombre + '.', 'ok');
              if (ctx.vigente()) await pintar();
            }));
            return el('div', { class: 'asignar-plan' }, sel, b);
          }
        }
      ], filas, { titulo: 'Dojos', vacio: 'Aún no hay dojos. Crea el primero abajo.' });
      P.seccion(c, 'Dojos', tabla);

      // Crear dojo
      var orgs = d.organizaciones.filter(function (o) { return o.estado === 'activo'; });
      var formDojo = ui.formulario([
        { nombre: 'nombre', etiqueta: 'Nombre del dojo', requerido: true, minlength: 2, maxlength: 80, autocomplete: 'off' },
        { nombre: 'slug', etiqueta: 'Identificador (opcional)', maxlength: 40, autocomplete: 'off', ayuda: 'Minúsculas, números y guiones. Si lo dejas vacío se arma con el nombre.' },
        { nombre: 'organizacionId', etiqueta: 'Organización', tipo: 'select', opciones: [{ valor: '', etiqueta: 'Sin organización' }].concat(orgs.map(function (o) { return { valor: o.organizacionId, etiqueta: o.nombre }; })) },
        { nombre: 'planId', etiqueta: 'Plan', tipo: 'select', valor: 'basico', opciones: planes.map(function (p) { return { valor: p.planId, etiqueta: etiquetaPlan(p) }; }), ayuda: 'Básico por defecto. Puedes cambiarlo después.' }
      ], async function (v) {
        var r = await api('crearDojo', { nombre: v.nombre, slug: v.slug, organizacionId: v.organizacionId, planId: v.planId });
        ui.aviso('Dojo ' + r.nombre + ' creado.', 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Crear dojo' });
      P.seccion(c, 'Crear un dojo', el('div', { class: 'tarjeta ancha tarjeta-form' }, formDojo));

      // Organizaciones
      P.seccion(c, 'Organizaciones', ui.tabla([
        { clave: 'nombre', titulo: 'Organización' },
        { clave: 'dojos', titulo: 'Dojos', alinear: 'der' },
        { clave: 'estado', titulo: 'Estado' }
      ], d.organizaciones, { titulo: 'Organizaciones', vacio: 'Aún no hay organizaciones.' }));
      var formOrg = ui.formulario([
        { nombre: 'nombre', etiqueta: 'Nombre de la organización', requerido: true, minlength: 2, maxlength: 120, autocomplete: 'off' }
      ], async function (v) {
        var r = await api('crearOrganizacion', { nombre: v.nombre });
        ui.aviso('Organización ' + r.nombre + ' creada.', 'ok');
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Crear organización' });
      c.appendChild(el('div', { class: 'tarjeta ancha tarjeta-form' }, formOrg));

      // Planes
      c.appendChild(el('h2', { texto: 'Planes, precios y herramientas' }));
      c.appendChild(el('p', { class: 'ayuda', texto: 'Un precio nuevo aplica desde hoy a los dojos que usan el plan; los cobros ya emitidos no cambian. Bajar herramientas no borra datos: solo las bloquea.' }));
      c.appendChild(el('div', { class: 'rejilla-planes' }, planes.map(function (p) { return tarjetaPlan(p); })));

      function tarjetaPlan(p) {
        var campos = [
          { nombre: 'nombre', etiqueta: 'Nombre', valor: p.nombre, requerido: true, minlength: 2, maxlength: 60 },
          { nombre: 'precio', etiqueta: 'Precio al mes (Q)', tipo: 'number', valor: p.precio, requerido: true, min: 0, step: '0.01', ayuda: p.esCortesia ? 'La cortesía siempre cuesta Q0.' : null }
        ];
        P.HERRAMIENTAS.forEach(function (h) { campos.push({ nombre: 'h_' + h[0], etiqueta: h[1], tipo: 'checkbox', valor: p.herramientas.indexOf(h[0]) !== -1 }); });
        var f = ui.formulario(campos, async function (v) {
          var r = await api('editarPlan', {
            planId: p.planId, nombre: v.nombre, precio: String(v.precio),
            herramientas: P.HERRAMIENTAS.map(function (h) { return h[0]; }).filter(function (h) { return v['h_' + h]; })
          });
          ui.aviso('Plan ' + r.plan.nombre + ' guardado. ' + (r.dojosAfectados === 1 ? 'Lo usa 1 dojo.' : 'Lo usan ' + r.dojosAfectados + ' dojos.'), 'ok');
          if (ctx.vigente()) await pintar();
        }, { textoBoton: 'Guardar plan' });
        if (p.esCortesia) f.querySelector('[name=precio]').disabled = true;
        return el('section', { class: 'tarjeta tarjeta-plan', 'aria-label': 'Plan ' + p.nombre }, el('h3', { texto: p.nombre }), f);
      }
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Cobros a dojos (panel)
  async function cobros(c, ctx) {
    async function pintar() {
      var res = await Promise.all([api('panelCobros', {}), api('listarCobrosPlataforma', {})]);
      if (!ctx.vigente()) return;
      var panel = res[0];
      var lista = res[1];
      ui.limpiar(c);
      P.encabezado(c, 'Cobros a dojos', 'Qué debe cada dojo, sus fechas, los comprobantes por revisar y el historial.');
      var cuentaDe = {};
      panel.dojos.forEach(function (d) { cuentaDe[d.dojoId] = d; });

      c.appendChild(el('h2', { texto: 'Lo que ve el dojo antes de subir un comprobante' }));
      c.appendChild(P.avisoLiteral(panel.aviso));

      c.appendChild(el('div', { class: 'datos' },
        P.dato('Deuda vencida de todos los dojos', P.dinero(panel.totales.deudaVencida)),
        P.dato('Comprobantes por revisar', String(panel.totales.porRevisar))));

      // Por revisar, del más antiguo al más nuevo (el servidor ya los ordena así)
      var rev = panel.porRevisar;
      P.seccion(c, 'Comprobantes por revisar', ui.tabla([
        {
          clave: 'dojoNombre', titulo: 'Dojo y fecha', formato: function (v, f) {
            return el('div', null, el('b', { texto: f.dojoNombre }), el('p', { class: 'ayuda', texto: 'Subido el ' + P.fechaCorta(f.fecha) + ' (' + P.hace(f.diasEspera) + ')' }));
          }
        },
        {
          clave: 'montoDeclarado', titulo: 'Declaró y debe', formato: function (v, f) {
            var cu = (cuentaDe[f.dojoId] || { cuenta: {} }).cuenta;
            var cubre = cu.deudaVencida > 0 ? (f.montoDeclarado >= cu.deudaVencida ? P.etiqueta('Cubre lo vencido', 'ok') : P.etiqueta('No cubre lo vencido', 'mal')) : P.etiqueta('Sin deuda vencida', 'info');
            return el('div', null, el('b', { texto: 'Declaró ' + P.dinero(f.montoDeclarado) }), el('p', { class: 'ayuda', texto: 'Debe vencido ' + P.dinero(cu.deudaVencida) + ' · saldo total ' + P.dinero(cu.saldoPendiente) }), cubre);
          }
        },
        {
          clave: 'pagoId', titulo: 'Acciones', formato: function (v, f) {
            return P.acciones(
              P.boton('Ver comprobante', '', 'Ver el comprobante de ' + f.dojoNombre, P.protegido(c, function () { return P.verComprobante(f.archivoId, ctx); })),
              P.boton('Confirmar', 'primario', 'Confirmar el pago de ' + f.dojoNombre, P.protegido(c, function () { return confirmar(f); })),
              P.boton('Rechazar', 'peligro', 'Rechazar el pago de ' + f.dojoNombre, P.protegido(c, function () { return rechazar(f); })));
          }
        }
      ], rev, { titulo: 'Comprobantes por revisar', vacio: 'No hay comprobantes por revisar.' }));

      // Estado de cada dojo
      P.seccion(c, 'Qué debe cada dojo', ui.tabla([
        {
          clave: 'nombre', titulo: 'Dojo', formato: function (v, f) {
            return el('div', null, el('b', { texto: f.nombre }), el('p', { class: 'ayuda', texto: P.planTexto(f.plan) }));
          }
        },
        {
          clave: 'cuenta', titulo: 'Estado', formato: function (v, f) {
            return el('div', null, P.etiquetaCuenta(f.cuenta.estado), f.cuenta.estado === 'rechazado' && f.cuenta.motivo ? el('p', { class: 'motivo', texto: 'Motivo: ' + f.cuenta.motivo }) : null,
              f.cuenta.diasAtraso > 0 ? el('p', { class: 'ayuda', texto: f.cuenta.diasAtraso + (f.cuenta.diasAtraso === 1 ? ' día' : ' días') + ' de atraso' }) : null);
          }
        },
        { clave: 'cuenta', titulo: 'Vencido', alinear: 'der', formato: function (v) { return P.dinero(v.deudaVencida); } },
        { clave: 'cuenta', titulo: 'Saldo total', alinear: 'der', formato: function (v) { return P.dinero(v.saldoPendiente); } },
        { clave: 'cuenta', titulo: 'Próximo vencimiento', formato: function (v) { return P.fechaCorta(v.proximoVencimiento); } },
        { clave: 'porRevisar', titulo: 'Por revisar', alinear: 'der' }
      ], panel.dojos, { titulo: 'Qué debe cada dojo', vacio: 'Aún no hay dojos.' }));

      P.seccion(c, 'Cobros emitidos', P.tablaCobros(lista.dojos, true));
      P.seccion(c, 'Historial de comprobantes', P.tablaPagos(lista.dojos, { conDojo: true, conRevisor: true, ctx: ctx, raiz: c }));
    }

    async function confirmar(f) {
      var ok = await ui.confirmar('Confirmar el pago de ' + P.dinero(f.montoDeclarado) + ' declarado por ' + f.dojoNombre + '. Se emite el recibo y los cobros quedan cubiertos. ¿Ya revisaste el comprobante?',
        { titulo: 'Confirmar pago', aceptar: 'Confirmar pago' });
      if (!ok) return;
      var r = await api('confirmarPagoPlataforma', { pagoId: f.pagoId });
      ui.aviso('Pago de ' + f.dojoNombre + ' confirmado. Recibo ' + r.recibo.numero + '.', 'ok');
      if (ctx.vigente()) await pintar();
    }
    async function rechazar(f) {
      var resp = await P.pedirMotivo({
        titulo: 'Rechazar el comprobante de ' + f.dojoNombre,
        texto: 'El dojo verá este motivo en su pantalla. La cuenta vuelve al estado que le toca por sus fechas.',
        etiqueta: 'Motivo del rechazo', aceptar: 'Rechazar comprobante', peligro: true
      });
      if (!resp) return;
      await api('rechazarPagoPlataforma', { pagoId: f.pagoId, motivo: resp.motivo });
      ui.aviso('Comprobante de ' + f.dojoNombre + ' rechazado.', 'ok');
      if (ctx.vigente()) await pintar();
    }
    await pintar();
  }

  plat.general = { dojos: dojos, cobros: cobros };

  // ------------------------------------------------------------------ Uso de hojas (Task 18, spec 3 y 8)
  var AVISO_USO = { ok: ['Bien', 'ok'], atencion: ['Atención', 'alerta'], urgente: ['Urgente', 'mal'] };
  function miles(n) { return Number(n).toLocaleString('en-US'); }
  function etiquetaUso(a) {
    if (!a.medido) return P.etiqueta('Sin medir', 'info');
    var e = AVISO_USO[a.aviso] || AVISO_USO.ok;
    return P.etiqueta(e[0], e[1]);
  }
  function fechaHora(t) { return t ? P.fechaCorta(String(t).slice(0, 10)) + ' ' + String(t).slice(11, 16) : '—'; }

  async function uso(c, ctx) {
    var r = await api('panelUso', {});
    if (!ctx.vigente()) return;
    P.encabezado(c, 'Uso de hojas', 'Google Sheets permite hasta ' + miles(r.limiteCeldas) + ' celdas por archivo y cuenta también las vacías. Aquí ves cuánto usa cada archivo para actuar antes de llegar al límite.');
    var peor = r.resumen.peor;
    if (r.resumen.aviso !== 'ok' && peor) {
      c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: (r.resumen.aviso === 'urgente' ? 'Urgente: ' : 'Atención: ') + peor.nombre + ' usa el ' + peor.porcentaje + ' % de su límite de celdas. Conviene actuar antes de llegar al tope.' }));
    }
    if (r.pendientes > 0 || r.errores > 0) {
      c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: (r.pendientes > 0 ? 'Faltan ' + r.pendientes + ' archivos por medir hoy; se miden hasta 10 por visita y los demás en la madrugada. ' : '') + (r.errores > 0 ? 'No se pudieron abrir ' + r.errores + ' archivo(s); se reintenta en la siguiente visita.' : '') }));
      c.appendChild(P.boton('Medir los que faltan', 'primario', null, P.protegido(c, async function () {
        if (!ctx.vigente()) return;
        ui.limpiar(c);
        await uso(c, ctx);
      })));
    }
    var medidos = r.archivos.filter(function (a) { return a.medido; });
    if (medidos.length) {
      P.seccion(c, 'Uso por archivo', graficos.barras({
        titulo: 'Porcentaje del límite de celdas que usa cada archivo', clase: 'g-serie-a',
        filas: medidos.map(function (a) { return { etiqueta: a.nombre, valor: a.porcentaje, tope: 100, texto: a.porcentaje + ' %' }; })
      }));
    }
    P.seccion(c, 'Detalle', ui.tabla([
      { clave: 'nombre', titulo: 'Archivo', formato: function (v, a) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: a.tipo === 'central' ? 'Cuentas, planes y cobros a dojos' : 'Datos del dojo' })); } },
      { clave: 'aviso', titulo: 'Estado', formato: function (v, a) { return etiquetaUso(a); } },
      { clave: 'celdas', titulo: 'Celdas', alinear: 'der', formato: function (v, a) { return a.medido ? miles(v) + ' (' + a.porcentaje + ' %)' : '—'; } },
      { clave: 'filas', titulo: 'Filas con datos', alinear: 'der', formato: function (v, a) { return a.medido ? miles(v) : '—'; } },
      { clave: 'hojas', titulo: 'Pestañas', alinear: 'der', formato: function (v, a) { return a.medido ? String(v) : '—'; } },
      { clave: 'mayorHoja', titulo: 'Pestaña más grande', formato: function (v, a) { return a.medido ? v : '—'; } },
      { clave: 'calculadoEn', titulo: 'Medido', formato: function (v) { return fechaHora(v); } },
      { clave: 'ultimoRespaldo', titulo: 'Último respaldo', formato: function (v) { return v ? P.fechaCorta(v) : 'Sin respaldo'; } }
    ], r.archivos, { titulo: 'Uso de celdas por archivo', vacio: 'Aún no hay archivos.' }));
    c.appendChild(el('p', { class: 'ayuda', texto: 'Se avisa desde el ' + r.atencionPct + ' % (atención) y desde el ' + r.urgentePct + ' % (urgente). Las celdas son filas por columnas de cada pestaña, incluidas las vacías.' }));
  }

  // ------------------------------------------------------------------ Seguridad (Task 18, spec 10)
  function hallazgosDe(a) {
    var l = [];
    (a.tablas || []).forEach(function (t) {
      l.push(t.cantidad + (t.cantidad === 1 ? ' fila alterada' : ' filas alteradas') + ' en ' + t.tabla + ' (fila ' + t.filas.join(', ') + (t.cantidad > t.filas.length ? ' y más' : '') + ')');
    });
    if (a.cadenaRota) l.push('La cadena de la bitácora no cuadra (fila cambiada, movida o borrada).');
    if (a.marcaRota) l.push('Tiene la marca BITACORA_ROTA: solo el dueño la quita a mano.');
    if (a.sinRevisar) l.push('No se pudo revisar este archivo.');
    if (a.compartidoSinRevisar) l.push('No se pudo revisar con quién está compartido.');
    (a.compartido || []).forEach(function (x) {
      l.push('Compartido (' + x.donde + '): acceso ' + x.acceso + (x.personas ? ', con ' + x.personas + (x.personas === 1 ? ' persona' : ' personas') : '') + '.');
    });
    if (a.compartidosEnCarpeta) l.push('En total ' + a.compartidosEnCarpeta + ' comprobantes compartidos en su carpeta.');
    return l;
  }

  async function seguridad(c, ctx) {
    var zona = el('div');
    var progreso = el('p', { class: 'ayuda', role: 'status' });
    function pintar(r) {
      ui.limpiar(zona);
      if (!r.existe) { zona.appendChild(el('p', { class: 'vacio', texto: 'Todavía no se ha hecho ninguna revisión. Pulsa "Revisar ahora".' })); return; }
      var h = r.hallazgos;
      var estado = !r.completo ? P.etiqueta('Revisión incompleta', 'alerta') : (r.limpio ? P.etiqueta('Sin hallazgos', 'ok') : P.etiqueta('Hay hallazgos', 'mal'));
      zona.appendChild(el('section', { class: 'panel ' + (r.completo && r.limpio ? 'ok' : (r.completo ? 'mal' : '')) },
        el('h2', { texto: 'Último informe' }), el('p', null, estado),
        el('div', { class: 'datos' },
          P.dato('Archivos revisados', r.revisados + ' de ' + r.total), P.dato('Filas alteradas', String(h.filasAlteradas)), P.dato('Cadenas de bitácora rotas', String(h.cadenasRotas)),
          P.dato('Elementos compartidos', String(h.compartidos)), P.dato('Secretos que faltan', String(h.secretosFaltan)), P.dato('Sin poder revisar', String(h.sinRevisar))),
        el('p', { class: 'ayuda', texto: 'Empezó el ' + fechaHora(r.inicio) + (r.fin ? ' y terminó el ' + fechaHora(r.fin) + '.' : ' y no ha terminado: pulsa "Revisar ahora" para volver a empezar.') })));
      if (r.completo && !r.limpio) {
        zona.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'Hay algo que revisar. Sigue el procedimiento de incidentes (documento procedimiento-incidentes): no borres ni arregles filas a mano antes de anotar lo que viste.' }));
      }
      P.seccion(zona, 'Secretos del servidor', ui.tabla([
        { clave: 'nombre', titulo: 'Secreto' },
        { clave: 'presente', titulo: 'Estado', formato: function (v) { return v ? P.etiqueta('Puesto', 'ok') : P.etiqueta('Falta', 'mal'); } }
      ], r.secretos, { titulo: 'Secretos del servidor' }));
      zona.appendChild(el('p', { class: 'ayuda', texto: 'Solo se comprueba que existan; su valor nunca se muestra.' }));
      var plataforma = (r.plataforma || []).map(function (x) { return { donde: x.donde, detalle: 'acceso ' + x.acceso + (x.personas ? ', con ' + x.personas + ' persona(s)' : '') }; });
      P.seccion(zona, 'Carpetas de la plataforma en Drive', ui.tabla([
        { clave: 'donde', titulo: 'Carpeta o archivo' }, { clave: 'detalle', titulo: 'Compartido' }
      ], plataforma, { titulo: 'Carpetas de la plataforma compartidas', vacio: r.errorPlataforma ? 'No se pudieron revisar.' : 'Ninguna está compartida.' }));
      var filas = r.archivos.map(function (a) { return { nombre: a.nombre, tipo: a.tipo, lista: hallazgosDe(a) }; });
      P.seccion(zona, 'Archivos con hallazgos', ui.tabla([
        { clave: 'nombre', titulo: 'Archivo', formato: function (v, f) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: f.tipo === 'central' ? 'Archivo central' : 'Archivo de dojo' })); } },
        { clave: 'lista', titulo: 'Qué se encontró', formato: function (v) { return el('ul', { class: 'mini-lista' }, v.map(function (t) { return el('li', { texto: t }); })); } }
      ], filas, { titulo: 'Archivos con hallazgos', vacio: r.completo ? 'Ningún archivo tiene hallazgos.' : 'Aún no se termina de revisar.' }));
      if (r.truncado) zona.appendChild(el('p', { class: 'ayuda', texto: 'Hay más archivos con hallazgos de los que caben en este informe; los conteos de arriba sí los incluyen.' }));
    }

    P.encabezado(c, 'Seguridad', 'Comprueba que ninguna fila firmada ni la bitácora se hayan cambiado a mano, que los secretos estén puestos y que nada en Drive esté compartido. El informe no lleva datos de personas.');
    var boton = P.boton('Revisar ahora', 'primario', 'Revisar la seguridad ahora', P.protegido(c, async function () {
      var r = await api('verificarSeguridad', { reiniciar: true });
      var vueltas = 0;
      while (ctx.vigente() && !r.completo && vueltas++ < 200) {
        progreso.textContent = 'Revisando… ' + r.revisados + ' de ' + r.total + ' archivos.';
        r = await api('verificarSeguridad', {});
      }
      if (!ctx.vigente()) return;
      progreso.textContent = '';
      pintar(r);
      ui.aviso(r.limpio ? 'Revisión terminada: sin hallazgos.' : 'Revisión terminada: hay hallazgos que revisar.', r.limpio ? 'ok' : 'info');
    }));
    c.appendChild(P.acciones(boton));
    c.appendChild(progreso);
    c.appendChild(zona);
    pintar(await api('verificarSeguridad', { soloLeer: true }));
  }

  ui.vista('uso', uso);
  ui.vista('seguridad', seguridad);
})();
