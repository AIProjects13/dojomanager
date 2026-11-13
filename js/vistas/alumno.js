/* alumno.js: pantallas del alumno y del encargado (Task 16): cobros con fechas, saldo y alertas, subir comprobante, clases,
 * asistencia y permisos. Un encargado cambia entre sus menores y ve un solo total. Quien entra con cuenta propia sin ser titular
 * (`soloAsistencia`) no ve montos. Una persona pausada solo ve cobros, recibos y la subida de comprobantes (el menú lo oculta y el
 * servidor lo exige). Todo texto de personas entra por ui.el. Se carga después de admin.js (ayudas en `plat.d`). */
(function () {
  'use strict';
  var el = ui.el;
  var P = plat;
  var D = plat.d;
  var Q = P.dinero;

  function dias(n) { return n + (n === 1 ? ' día' : ' días'); }
  function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function suma(lista, f) { return Math.round(lista.reduce(function (s, x) { return s + f(x); }, 0) * 100) / 100; }
  function sinAsistencia(c) {
    c.appendChild(el('p', { class: 'vacio', texto: 'No hay cobros a tu nombre. Si aún no estás inscrito, pide al administrador del dojo que te inscriba. Si ya lo estás, los cobros los ve y los paga la persona que figura como titular de tu ficha.' }));
  }

  /** Estado de un cobro tal como lo ve quien paga: texto corto y color. */
  function estadoCobro(cb) {
    if (cb.pendiente <= 0) return P.etiqueta('Pagado', 'ok');
    if (cb.sinCubrir <= 0) return P.etiqueta('En revisión', 'info');
    if (cb.vencido) return P.etiqueta('Vencido hace ' + dias(cb.diasAtraso), 'mal');
    return P.etiqueta('Vence el ' + P.fechaCorta(cb.fechaPago), 'alerta');
  }

  function tablaCobros(alumno) {
    return ui.tabla([
      { clave: 'concepto', titulo: 'Cobro', formato: function (v, cb) { return el('div', null, el('b', { texto: v }), el('p', { class: 'ayuda', texto: 'Periodo ' + cb.periodo })); } },
      { clave: 'neto', titulo: 'A pagar', alinear: 'der', formato: function (v, cb) { return el('div', null, Q(v), cb.descuento > 0 ? el('p', { class: 'ayuda', texto: 'Con descuento de ' + Q(cb.descuento) }) : null); } },
      { clave: 'cobrado', titulo: 'Pagado', alinear: 'der', formato: function (v, cb) { return Q(cb.cobrado + cb.credito); } },
      { clave: 'pendiente', titulo: 'Falta', alinear: 'der', formato: Q },
      { clave: 'fechaPago', titulo: 'Fecha de pago', formato: P.fechaCorta },
      {
        clave: 'sinCubrir', titulo: 'Estado', formato: function (v, cb) {
          return el('div', null, estadoCobro(cb), cb.porConfirmar > 0 ? el('p', { class: 'ayuda', texto: 'Subiste ' + Q(cb.porConfirmar) + ': el administrador lo está revisando.' }) : null);
        }
      }
    ], alumno.cobros, { titulo: 'Cobros de ' + alumno.nombre, vacio: 'Aún no hay cobros para ' + alumno.nombre + '. Aparecen cuando empieza el mes de su plan.' });
  }

  // ------------------------------------------------------------------ Mis cobros
  async function cobros(c, ctx) {
    var acc = D.acciones_(c);
    var seleccion = 'todos';
    var r = await api('misCobros', {});
    if (!ctx.vigente()) return;
    P.encabezado(c, 'Mis cobros', 'Lo que debes, cuándo vence y cómo van tus pagos.');
    if (r.soloAsistencia) {
      sinAsistencia(c);
      r.alumnos.forEach(function (a) {
        if (a.estado === 'pausado') c.appendChild(D.panel('mal', el('h2', { texto: 'Tu credencial está pausada' }), el('p', { texto: 'Hay un pago atrasado en tu ficha. Habla con quien paga tus cobros o con el dojo para ponerse al día; cuando se confirme, se quita la pausa.' })));
      });
      return;
    }
    var cuerpo = el('div');
    c.appendChild(cuerpo);

    function pintar() {
      ui.limpiar(cuerpo);
      var vista = seleccion === 'todos' ? r.alumnos : r.alumnos.filter(function (a) { return a.alumnoId === seleccion; });
      // Conmutador entre menores
      if (r.alumnos.length > 1) {
        var bs = [P.boton('Todos', '', 'Ver los cobros de todos', function () { seleccion = 'todos'; pintar(); })];
        r.alumnos.forEach(function (a) { bs.push(P.boton(a.nombre, '', 'Ver solo los cobros de ' + a.nombre, function () { seleccion = a.alumnoId; pintar(); })); });
        bs.forEach(function (b, i) { b.setAttribute('aria-pressed', String((i === 0 && seleccion === 'todos') || (i > 0 && r.alumnos[i - 1].alumnoId === seleccion))); b.classList.remove('accion'); });
        cuerpo.appendChild(el('div', { class: 'conmutador', role: 'group', 'aria-label': 'A quién ver' }, bs));
      }
      // Un solo total para todo lo que se debe
      var total = suma(vista, function (a) { return a.saldo.total; });
      var vencido = suma(vista, function (a) { return a.saldo.vencido; });
      var enRevision = suma(vista, function (a) { return a.saldo.porConfirmar; });
      cuerpo.appendChild(el('div', { class: 'total-grande', role: 'group', 'aria-label': 'Total que debes' },
        el('span', { texto: seleccion === 'todos' && r.alumnos.length > 1 ? 'Debes en total, por todos' : 'Debes en total' }),
        el('span', { class: 'grande', texto: Q(total) }),
        el('span', { class: 'ayuda', texto: 'De eso, vencido: ' + Q(vencido) + (enRevision > 0 ? ' · En revisión: ' + Q(enRevision) : '') })));
      if (r.saldoFavor > 0) {
        cuerpo.appendChild(el('div', { class: 'panel ok', role: 'status' }, el('b', { texto: 'Saldo a favor: ' + Q(r.saldoFavor) }),
          el('p', { class: 'ayuda', texto: 'Es dinero que pagaste de más. Se aplica solo a tus próximos cobros.' })));
      }

      // Alertas
      var alertas = [];
      vista.forEach(function (a) {
        var vencidos = a.cobros.filter(function (cb) { return cb.vencido && cb.sinCubrir > 0; });
        if (vencidos.length) alertas.push((vencidos.length === 1 ? 'Hay un cobro vencido de ' : 'Hay ' + vencidos.length + ' cobros vencidos de ') + a.nombre + ' por ' + Q(suma(vencidos, function (x) { return x.sinCubrir; })) + '.');
        a.cobros.forEach(function (cb) {
          var faltan = diasEntre(r.hoy, cb.fechaPago);
          if (!cb.vencido && cb.sinCubrir > 0 && faltan >= 0 && faltan <= 3) alertas.push(cb.concepto + ' de ' + a.nombre + ' vence ' + (faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : 'en ' + dias(faltan)) + ' (' + Q(cb.sinCubrir) + ').');
        });
        if (a.saldo.porConfirmar > 0) alertas.push('El comprobante por ' + Q(a.saldo.porConfirmar) + ' de ' + a.nombre + ' está en revisión.');
      });
      if (alertas.length) {
        cuerpo.appendChild(D.panel('destacado', el('h2', { texto: 'Alertas' }), el('ul', { class: 'lista-simple' }, alertas.map(function (t) { return el('li', { texto: t }); }))));
      }

      // Pausa: qué pasó y cómo se resuelve
      r.alumnos.filter(function (a) { return a.estado === 'pausado' && (seleccion === 'todos' || a.alumnoId === seleccion); }).forEach(function (a) {
        cuerpo.appendChild(D.panel('mal', el('h2', { texto: 'La credencial de ' + a.nombre + ' está pausada' }),
          el('p', { texto: 'Hay un pago atrasado desde hace ' + dias(a.diasAtraso) + ', y por eso no se puede marcar su asistencia ni ver sus clases. Mientras tanto sigues viendo tus cobros, tu saldo y tus recibos, y puedes manejar tus permisos.' }),
          el('p', { texto: 'Para volver: sube el comprobante de lo que está vencido (' + Q(a.saldo.vencido) + '). Cuando el administrador lo confirme, se quita la pausa. Si lo rechaza, verás el motivo aquí.' }),
          el('a', { class: 'boton primario', href: '#/comprobantes', texto: 'Subir comprobante' })));
      });

      // Una tabla por alumno
      vista.forEach(function (a) {
        cuerpo.appendChild(el('h2', null, a.nombre, ' ', D.etiquetaEstado(a.estado)));
        cuerpo.appendChild(el('div', { class: 'datos' }, P.dato('Debe', Q(a.saldo.total)), P.dato('Vencido', Q(a.saldo.vencido)), P.dato('En revisión', Q(a.saldo.porConfirmar))));
        cuerpo.appendChild(tablaCobros(a));
      });
      if (!r.alumnos.length) cuerpo.appendChild(D.vacio('Todavía no tienes alumnos a tu cargo. Habla con el dojo.'));

      cuerpo.appendChild(el('p', null, el('a', { class: 'boton primario', href: '#/comprobantes', texto: 'Subir comprobante de pago' })));

      // Pagos y comprobantes
      cuerpo.appendChild(el('h2', { texto: 'Mis pagos y comprobantes' }));
      cuerpo.appendChild(ui.tabla([
        { clave: 'fecha', titulo: 'Subido', formato: P.fechaCorta },
        { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: Q },
        { clave: 'metodo', titulo: 'Forma', formato: function (v) { return v === 'efectivo' ? 'Efectivo' : 'Depósito'; } },
        {
          clave: 'estado', titulo: 'Estado', formato: function (v, p) {
            if (v === 'por-confirmar') return el('div', null, P.etiqueta('En revisión', 'info'), el('p', { class: 'ayuda', texto: 'Esperando que el administrador lo confirme.' }));
            if (v === 'rechazado') return el('div', null, P.etiqueta('Rechazado', 'mal'), el('p', { class: 'motivo', texto: 'Motivo: ' + (p.motivo || 'sin motivo') }), el('p', { class: 'ayuda', texto: 'Puedes subir otro comprobante.' }));
            return el('div', null, P.etiqueta('Confirmado', 'ok'), p.recibo ? el('p', { class: 'ayuda', texto: 'Recibo ' + p.recibo.numero }) : null);
          }
        },
        {
          clave: 'pagoId', titulo: 'Documentos', formato: function (v, p) {
            var b = [];
            if (p.recibo) b.push(acc('Descargar recibo', '', 'Descargar el recibo ' + p.recibo.numero, async function () {
              var d = await api('descargarRecibo', { reciboId: p.recibo.reciboId });
              P.descargar(d.nombre, d.mime, d.base64);
              ui.aviso('Recibo ' + d.numero + ' descargado.', 'ok');
            }));
            if (p.archivoId) b.push(acc('Ver mi comprobante', '', 'Ver mi comprobante del ' + P.fechaCorta(p.fecha), function () { return P.verComprobante(p.archivoId, ctx); }));
            return b.length ? P.acciones.apply(null, b) : '—';
          }
        }
      ], r.pagos, { titulo: 'Mis pagos', vacio: 'Aún no has subido ningún pago. Cuando lo hagas, aquí verás si está en revisión, confirmado o rechazado.' }));
    }
    pintar();
  }

  // ------------------------------------------------------------------ Subir comprobante
  async function comprobantes(c, ctx) {
    var resultado = null;
    async function pintar() {
      var r = await api('misCobros', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      P.encabezado(c, 'Subir comprobante', 'Sube la foto o el PDF de tu depósito. El administrador lo revisa y, al confirmarlo, recibes tu recibo.');
      if (r.soloAsistencia) { sinAsistencia(c); return; }
      if (resultado) {
        var x = resultado;
        c.appendChild(D.panel('ok', el('h2', { texto: 'Comprobante enviado: en revisión' }),
          el('p', { texto: 'Declaraste ' + Q(x.monto) + '.' + (x.repetido ? ' Este comprobante ya se había enviado antes; no se duplicó.' : '') }),
          x.lineas.length ? el('ul', { class: 'lista-simple' }, x.lineas.map(function (l) { return el('li', { texto: l.alumnoNombre + ' · ' + l.concepto + ' · ' + Q(l.monto) }); })) : null,
          x.exceso > 0 ? el('p', { texto: 'Sobran ' + Q(x.exceso) + ': quedarán como saldo a favor cuando se confirme.' }) : null,
          el('p', { class: 'ayuda', texto: 'No necesitas hacer nada más. Si se rechaza, verás el motivo en "Mis cobros".' })));
      }
      var enRevision = r.pagos.filter(function (p) { return p.estado === 'por-confirmar'; });
      if (enRevision.length) {
        c.appendChild(D.panel('destacado', el('h2', { texto: 'En revisión' }),
          el('ul', { class: 'lista-simple' }, enRevision.map(function (p) { return el('li', { texto: Q(p.monto) + ' subido el ' + P.fechaCorta(p.fecha) + ': esperando confirmación.' }); }))));
      }
      var pendientes = [];
      r.alumnos.forEach(function (a) { a.cobros.forEach(function (cb) { if (cb.sinCubrir > 0) pendientes.push({ a: a, cb: cb }); }); });
      var totalSin = suma(pendientes, function (x) { return x.cb.sinCubrir; });
      if (r.alumnos.some(function (a) { return a.estado === 'pausado'; })) {
        c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'Tu credencial está pausada por un pago atrasado. Para quitar la pausa, el comprobante debe cubrir todo lo vencido; cuando el administrador lo confirme, se levanta.' }));
      }
      if (!pendientes.length) c.appendChild(el('p', { class: 'ayuda', texto: 'Ahora no debes nada sin comprobante. Si subes un pago, quedará como saldo a favor para tus próximos cobros.' }));

      var campos = [
        { nombre: 'monto', etiqueta: 'Monto que depositaste (Q)', tipo: 'number', requerido: true, min: '0.01', step: '0.01', valor: totalSin > 0 ? totalSin : '', ayuda: pendientes.length ? 'Por todo lo pendiente son ' + Q(totalSin) + '. Declara lo que de verdad depositaste.' : null },
        {
          nombre: 'modo', etiqueta: 'A qué cobros se aplica', tipo: 'select', valor: 'auto',
          opciones: [{ valor: 'auto', etiqueta: 'Automático: a lo más antiguo primero' }, { valor: 'elegir', etiqueta: 'Elegir cobros' }]
        }
      ];
      pendientes.forEach(function (x, i) {
        campos.push({ nombre: 'c' + i, etiqueta: x.a.nombre + ' · ' + x.cb.concepto + ' · faltan ' + Q(x.cb.sinCubrir), tipo: 'checkbox' });
      });
      campos.push({ nombre: 'archivo', etiqueta: 'Comprobante (JPG, PNG o PDF, hasta 5 MB)', tipo: 'file', requerido: true, accept: '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf' });
      var form = ui.formulario(campos, async function (v, op) {
        var archivo = await P.leerArchivo(v.archivo);
        var payload = { monto: String(v.monto), archivo: archivo, claveIdempotencia: op.claveIdempotencia };
        if (v.modo === 'elegir') {
          var ids = pendientes.filter(function (x, i) { return v['c' + i]; }).map(function (x) { return x.cb.cobroId; });
          if (!ids.length) throw new Error('Marca al menos un cobro, o elige "Automático".');
          payload.cobroIds = ids;
        }
        resultado = await api('subirPago', payload);
        auth.refrescar();
        if (ctx.vigente()) await pintar();
      }, { textoBoton: 'Subir comprobante' });
      var modo = form.querySelector('[name=modo]');
      var monto = form.querySelector('[name=monto]');
      var editado = false;
      function checks() { return pendientes.map(function (x, i) { return form.querySelector('[name=c' + i + ']'); }); }
      function alternar() {
        var elegir = modo.value === 'elegir';
        checks().forEach(function (ch) { ch.closest('.campo').hidden = !elegir; });
        if (!elegir && !editado) monto.value = totalSin > 0 ? String(totalSin) : '';
        recalcular();
      }
      function recalcular() {
        if (modo.value !== 'elegir' || editado) return;
        var s = suma(pendientes.filter(function (x, i) { return checks()[i].checked; }), function (x) { return x.cb.sinCubrir; });
        monto.value = s > 0 ? String(s) : '';
      }
      monto.addEventListener('input', function () { editado = true; });
      modo.addEventListener('change', alternar);
      checks().forEach(function (ch) { ch.addEventListener('change', recalcular); });
      if (!pendientes.length) modo.closest('.campo').hidden = true;
      alternar();
      c.appendChild(el('div', { class: 'tarjeta ancha tarjeta-form' }, form));
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Clases y asistencia
  async function clases(c, ctx) {
    var r = await api('listarClases', {});
    if (!ctx.vigente()) return;
    P.encabezado(c, 'Mis clases', 'Los horarios en los que estás inscrito.');
    c.appendChild(ui.tabla([
      { clave: 'disciplina', titulo: 'Clase', formato: function (v, cl) { return el('b', { texto: D.claseTxt(cl) }); } },
      { clave: 'tutorNombre', titulo: 'Tutor', formato: function (v) { return v || 'Por asignar'; } },
      { clave: 'alumnos', titulo: 'Quién asiste', formato: function (v) { return v.map(function (a) { return a.nombre; }).join(', '); } }
    ], r.clases, { titulo: 'Mis clases', vacio: 'Aún no estás inscrito en ninguna clase. Pregunta en tu dojo cuál te conviene.' }));
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function mesTxt(p) { return MESES[Number(p.slice(5)) - 1] + ' de ' + p.slice(0, 4); }
  function sumarMes(p, n) {
    var i = Number(p.slice(0, 4)) * 12 + Number(p.slice(5)) - 1 + n;
    var y = Math.floor(i / 12);
    return y + '-' + ('0' + (i - y * 12 + 1)).slice(-2);
  }

  async function asistencia(c, ctx) {
    P.encabezado(c, 'Mi asistencia', 'Cuántas clases te tocaron y a cuántas fuiste.');
    var lista = await api('listarAlumnos', {});
    if (!ctx.vigente()) return;
    var propios = lista.alumnos.filter(function (a) { return a.estado !== 'baja' && a.estado !== 'pausado'; });
    lista.alumnos.filter(function (a) { return a.estado === 'pausado'; }).forEach(function (a) {
      c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'La credencial de ' + a.nombre + ' está pausada por un pago atrasado, así que su asistencia no se muestra. Mira "Mis cobros" para ponerla al día.' }));
    });
    if (!propios.length) { c.appendChild(D.vacio('Todavía no hay alumnos con asistencia que mostrar.')); return; }
    var periodo = D.hoyGT().slice(0, 7);
    var actual = propios[0].alumnoId;
    var cuerpo = el('div');
    var sel = el('select', { 'aria-label': 'Alumno' }, D.opciones(propios.map(function (a) { return [a.alumnoId, a.nombre]; })));
    if (propios.length > 1) c.appendChild(D.campoManual('Alumno', sel));
    c.appendChild(cuerpo);
    var claseNombres = {};
    var cl = await api('listarClases', {}).catch(function () { return { clases: [] }; });
    cl.clases.forEach(function (x) { claseNombres[x.claseId] = x.disciplina || 'Clase'; });

    async function pintar() {
      var rr = await Promise.all([api('verAsistencia', { alumnoId: actual, periodo: periodo }), api('fichaAlumno', { alumnoId: actual, periodo: periodo })]);
      if (!ctx.vigente()) return;
      ui.limpiar(cuerpo);
      cuerpo.appendChild(el('div', { class: 'barra' },
        P.boton('← Mes anterior', '', null, function () { periodo = sumarMes(periodo, -1); pintar().catch(P.fallo); }),
        el('b', { texto: mesTxt(periodo) }),
        P.boton('Mes siguiente →', '', null, function () { periodo = sumarMes(periodo, 1); pintar().catch(P.fallo); })));
      cuerpo.appendChild(el('div', { class: 'datos' },
        P.dato('Días que te tocaron', String(rr[1].diasEsperados)), P.dato('Días que fuiste', String(rr[1].diasAsistidos)),
        P.dato('Marcado presente', String(rr[0].presentes)), P.dato('Marcado ausente', String(rr[0].ausentes))));
      cuerpo.appendChild(ui.tabla([
        { clave: 'fecha', titulo: 'Fecha', formato: P.fecha },
        { clave: 'claseId', titulo: 'Clase', formato: function (v) { return claseNombres[v] || 'Clase'; } },
        { clave: 'presente', titulo: 'Asistencia', formato: function (v) { return v ? P.etiqueta('Presente', 'ok') : P.etiqueta('Ausente', 'mal'); } }
      ], rr[0].registros, { titulo: 'Asistencia de ' + mesTxt(periodo), vacio: 'No hay asistencia anotada en ' + mesTxt(periodo) + '.' }));
    }
    sel.addEventListener('change', function () { actual = sel.value; pintar().catch(P.fallo); });
    await pintar();
  }

  // ------------------------------------------------------------------ Permisos y aviso de privacidad
  async function permisos(c, ctx) {
    var acc = D.acciones_(c);
    async function pintar() {
      var r = await api('verAviso', {});
      if (!ctx.vigente()) return;
      ui.limpiar(c);
      P.encabezado(c, 'Mis permisos', 'Tú decides si el dojo puede ofrecerte promociones o usar tu imagen. Puedes retirar un permiso, o volver a darlo, cuando quieras, con un toque.');
      c.appendChild(el('p', null, el('a', { href: '#/aviso', texto: 'Leer el aviso de privacidad (versión ' + r.version + ')' }), ' · lo puedes consultar cuando quieras.'));
      var perm = r.permisos || [];
      if (!perm.length) {
        c.appendChild(D.vacio('No tienes permisos que administrar aquí. Los de un menor los decide su encargado, y los de un adulto, él mismo desde su cuenta.'));
        return;
      }
      var NOMBRES = { promociones: ['Promociones', 'Que el dojo te ofrezca promociones por mensaje.'], imagen: ['Fotos y videos', 'Que el dojo use la imagen del alumno en su landing o redes.'] };
      perm.forEach(function (p) {
        c.appendChild(el('h2', { texto: p.nombre }));
        ['promociones', 'imagen'].forEach(function (clave) {
          var dado = p[clave];
          c.appendChild(D.panel(dado ? 'ok' : null,
            el('h3', { texto: NOMBRES[clave][0] }),
            el('p', { texto: NOMBRES[clave][1] }),
            el('p', null, P.etiqueta(dado ? 'Permitido' : 'Sin permiso', dado ? 'ok' : 'info')),
            dado ? acc('Retirar este permiso', 'peligro', 'Retirar el permiso de ' + NOMBRES[clave][0].toLowerCase() + ' de ' + p.nombre, async function () {
              var ok = await ui.confirmar('¿Retirar el permiso de ' + NOMBRES[clave][0].toLowerCase() + ' de ' + p.nombre + '? Se aplica de inmediato. Si después quieres darlo otra vez, lo haces desde esta misma pantalla.', { titulo: 'Retirar permiso', aceptar: 'Retirar permiso', peligro: true });
              if (!ok) return;
              await api('retirarPermiso', { alumnoId: p.alumnoId, permiso: clave });
              ui.aviso('Permiso retirado.', 'ok');
              if (ctx.vigente()) await pintar();
            }) : acc('Dar este permiso', '', 'Dar el permiso de ' + NOMBRES[clave][0].toLowerCase() + ' de ' + p.nombre, async function () {
              var ok2 = await ui.confirmar('¿Dar el permiso de ' + NOMBRES[clave][0].toLowerCase() + ' de ' + p.nombre + '? ' + NOMBRES[clave][1] + ' Es opcional y lo puedes retirar cuando quieras desde esta misma pantalla.', { titulo: 'Dar permiso', aceptar: 'Dar permiso' });
              if (!ok2) return;
              await api('darPermiso', { alumnoId: p.alumnoId, tipo: clave });
              ui.aviso('Permiso dado. Puedes retirarlo cuando quieras.', 'ok');
              if (ctx.vigente()) await pintar();
            })));
        });
      });
    }
    await pintar();
  }

  // ------------------------------------------------------------------ Mis datos: consultar, corregir y exportar
  /** Baja un objeto como archivo JSON. La URL blob: se revoca enseguida. */
  function descargarJson(nombre, objeto) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function conteo(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  async function datos(c, ctx) {
    var acc = D.acciones_(c);
    var u = auth.estado.usuario || {};
    P.encabezado(c, 'Mis datos', 'Aquí puedes corregir tu nombre y tu teléfono y descargar una copia de los datos que el dojo guarda de ti y de los menores a tu cargo.');

    // Corregir lo propio
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
    c.appendChild(D.panel(null, el('h2', { texto: 'Tu cuenta' }),
      el('div', { class: 'datos' }, P.dato('Correo', u.correo || '')),
      el('p', { class: 'ayuda', texto: 'El correo no se cambia aquí. Los demás datos (el nombre de una ficha, la fecha de nacimiento, el plan) los corrige el administrador de tu dojo: pídeselo.' }),
      form));

    // Exportar
    var zona = el('div', { 'aria-live': 'polite' });
    c.appendChild(D.panel(null, el('h2', { texto: 'Descargar una copia' }),
      el('p', { texto: 'Se descarga un archivo con tu cuenta, tus fichas y las de los menores a tu cargo, su asistencia, cobros, pagos, recibos, aceptaciones del aviso y permisos. No trae datos de otras personas ni el contenido de los comprobantes.' }),
      acc('Descargar mis datos', 'primario', 'Descargar una copia de mis datos', async function () {
        var d = await api('exportarMisDatos', {});
        if (!ctx.vigente()) return;
        descargarJson('mis-datos-' + String(d.generado).slice(0, 10) + '.json', d);
        ui.limpiar(zona);
        zona.appendChild(el('p', { role: 'status', texto: 'Descargamos tu archivo: ' + [
          conteo(d.fichas.length, 'ficha', 'fichas'), conteo(d.asistencia.length, 'registro de asistencia', 'registros de asistencia'), conteo(d.cobros.length, 'cobro', 'cobros'),
          conteo(d.pagos.length, 'pago', 'pagos'), conteo(d.recibos.length, 'recibo', 'recibos'), conteo(d.aceptaciones.length, 'aceptación del aviso', 'aceptaciones del aviso')
        ].join(', ') + '.' }));
        zona.appendChild(ui.tabla([
          { clave: 'nombre', titulo: 'Ficha' }, { clave: 'estado', titulo: 'Estado' },
          { clave: 'esTitular', titulo: 'Paga', formato: function (v) { return v ? 'Tú' : 'Otra persona'; } }
        ], d.fichas, { titulo: 'Fichas incluidas en tu archivo' }));
      }),
      zona));

    c.appendChild(D.panel(null, el('h2', { texto: 'Lo demás' }),
      el('ul', { class: 'mini-lista' },
        // Con un aviso nuevo sin aceptar, Mis cobros no está disponible: no se ofrece el enlace.
        auth.estado.avisoViejo ? el('li', { texto: 'Los comprobantes que subiste se ven uno por uno en Mis cobros, cuando aceptes el aviso nuevo.' })
          : el('li', null, 'Los comprobantes que subiste se ven uno por uno en ', el('a', { href: '#/cobros', texto: 'Mis cobros' }), '.'),
        el('li', null, 'Para dar o retirar tus permisos de promociones y de fotos o videos: ', el('a', { href: '#/permisos', texto: 'Mis permisos' }), '.'),
        el('li', null, 'Para pedir que se eliminen tus datos, escríbele a tu dojo: el dojo evalúa la solicitud, y lo que debe conservarse por ley o por ser un registro de pago puede seguir guardado. Lo explica el ', el('a', { href: '#/aviso', texto: 'aviso de privacidad' }), '.'))));
  }

  D.vista('datos', 'alumno', datos);
  D.vista('cobros', 'alumno', cobros);
  D.vista('comprobantes', 'alumno', comprobantes);
  D.vista('clases', 'alumno', clases);
  D.vista('asistencia', 'alumno', asistencia);
  D.vista('permisos', 'alumno', permisos);
})();
