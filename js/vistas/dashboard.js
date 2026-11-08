/* Dashboards (Task 17, spec 8): una sola vista `dashboard` que se reparte por nivel.
 *  - general y admin-dojos: casillas por dojo y por disciplina, listas de mes y comparativo; general además ve el panel de la plataforma.
 *  - admin: lo mismo para su dojo, más la ocupación de clases.
 *  - tutor: sus clases, cupos y asistencia. alumno: sus cobros, próximos pagos, saldo y recibos.
 * Reglas: las cifras vienen del servidor (el cliente solo suma centavos enteros y nunca promedia porcentajes); sin historial se dice
 * "aún no hay datos para comparar" y nunca se muestra un cero ni un 0 % falso; todo texto de la base entra por ui.el (textContent).
 * Las respuestas viejas se ignoran con un contador de peticiones y ctx.vigente() (contrato de ui.js). Los filtros se recuerdan en
 * el hash de la URL (#/dashboard?m=2026-03&c=anio&d=...&s=...), sin datos personales y sin almacenamiento del navegador. */
(function () {
  'use strict';
  var el = ui.el;

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MAX_DOJOS_DETALLE = 25;     // igual que el servidor (RESUMENES_.BLOQUE)
  var ESPERA_CASILLAS = 350;      // ms sin tocar casillas antes de pedir
  var IND = [
    { k: 'esperado', t: 'Esperado', cls: 'e', ayuda: 'Suma de los cobros del mes' },
    { k: 'cobrado', t: 'Cobrado y confirmado', cls: 'o', ayuda: 'Pagos confirmados' },
    { k: 'porConfirmar', t: 'Por confirmar', cls: 'i', ayuda: 'Comprobantes subidos sin revisar' },
    { k: 'pendienteSinVencer', t: 'Pendiente, sin vencer', cls: 'p', ayuda: 'Saldo cuya fecha de pago no ha llegado' },
    { k: 'atrasado', t: 'Atrasado', cls: 'r', ayuda: 'Saldo con la fecha de pago vencida' }
  ];
  var COMPARATIVOS = [
    ['anterior', 'Mes anterior'], ['anio', 'Mismo mes del año pasado'], ['anio2', 'Mismo mes de hace 2 años'], ['ninguno', 'Sin comparar']
  ];
  var ESTADO_PAGO = { confirmado: 'Confirmado', 'por-confirmar': 'Por confirmar' };
  var ESTADO_CUENTA = {
    'al-dia': 'Al día', vencido: 'Vencido', 'solo-lectura': 'En solo lectura', 'por-confirmar': 'Comprobante por confirmar', rechazado: 'Comprobante rechazado'
  };

  // ------------------------------------------------------------------ Ayudas de formato
  var RE_PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;
  function nombreMes(p) { var m = RE_PERIODO.exec(String(p || '')); return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : String(p || ''); }
  function etiquetaCorta(p) { var m = RE_PERIODO.exec(String(p || '')); return m ? CORTOS[Number(m[2]) - 1] + ' ' + m[1].slice(2) : String(p || ''); }
  function sumaMeses(p, n) {
    var m = RE_PERIODO.exec(p);
    var i = Number(m[1]) * 12 + Number(m[2]) - 1 + n;
    return Math.floor(i / 12) + '-' + ('0' + (i % 12 + 1)).slice(-2);
  }
  function dineroC(c) { return ui.moneda(c / 100); }
  function clave(n) { return String(n === undefined || n === null ? '' : n).trim().toLowerCase(); }
  function fechaCorta(f) { return window.plat ? plat.fechaCorta(f) : String(f || ''); }
  function pct(v) { return v === null || v === undefined ? '—' : (Math.round(v * 10) / 10) + ' %'; }
  function cantidad(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  /** Saldo a favor sin aplicar: lo pagado de más que aún no cubre ningún cobro. No está en las cuatro cifras (ver la nota del servidor). */
  function lineaSaldoFavor(f) {
    if (!f) return el('span');
    return el('div', { class: 'saldo-favor' },
      el('p', { class: 'resumen-pct' }, 'Saldo a favor sin aplicar: ', el('b', { texto: ui.moneda(f.monto) }), ' (aparte de las cinco cifras de arriba).'),
      el('p', { class: 'ayuda', texto: f.nota }));
  }

  /** Texto de la comparación de una tarjeta. Sin historial: "aún no hay datos para comparar". Referencia en cero: sin porcentaje. */
  function textoComparacion(data, k) {
    if (!data.comparar && !data.compararElegido) return '';
    if (!data.referencia) return 'aún no hay datos para comparar';
    var a = data.actual.centavos[k];
    var b = data.referencia.centavos[k];
    var mes = nombreMes(data.referenciaPeriodo);
    if (b === 0) return 'En ' + mes + ': ' + dineroC(0) + ' (sin porcentaje)';
    var cambio = Math.round((a - b) * 1000 / b) / 10;     // de sumas de centavos, nunca promedio de porcentajes
    if (cambio === 0) return '= Igual que en ' + mes;
    return (cambio > 0 ? '▲ +' : '▼ ') + cambio.toFixed(1) + ' % vs ' + mes;
  }

  // ------------------------------------------------------------------ Filtros en el hash
  function leerHash() {
    var h = String(location.hash || '');
    var i = h.indexOf('?');
    var out = {};
    if (i === -1) return out;
    new URLSearchParams(h.slice(i + 1)).forEach(function (v, k) { out[k] = v; });
    return out;
  }
  function escribirHash(p) {
    var q = new URLSearchParams();
    Object.keys(p).forEach(function (k) { if (p[k] !== null && p[k] !== undefined) q.set(k, p[k]); });
    var s = q.toString();
    var url = '#/dashboard' + (s ? '?' + s : '');
    if (location.hash !== url) history.replaceState(null, '', url);   // replaceState no dispara hashchange: la vista no se reinicia
  }
  function listaDeHash(v) {
    if (v === undefined) return null;
    return v === '' ? [] : v.split(',').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
  }
  function listaAHash(arr) { return arr.map(encodeURIComponent).join(','); }

  // ------------------------------------------------------------------ Piezas de pantalla
  function campoLista(id, etiqueta, opciones, valor, alCambiar) {
    var sel = el('select', { id: id }, opciones.map(function (o) { return el('option', { value: o[0], texto: o[1] }); }));
    sel.value = valor;
    sel.addEventListener('change', function () { alCambiar(sel.value); });
    return el('div', { class: 'campo' }, el('label', { for: id, texto: etiqueta }), sel);
  }

  /** Grupo de casillas. items: [{ clave, etiqueta, nota }]. seleccion: claves marcadas. alCambiar(seleccion). */
  function grupoCasillas(titulo, items, seleccion, alCambiar, idBase) {
    var cajas = [];
    var lista = el('div', { class: 'checks', role: 'group', 'aria-label': titulo });
    items.forEach(function (it, i) {
      var cb = el('input', { type: 'checkbox', id: idBase + '-' + i, value: it.clave });
      cb.checked = seleccion.indexOf(it.clave) !== -1;
      cb.addEventListener('change', function () { alCambiar(leer()); });
      cajas.push(cb);
      lista.appendChild(el('label', { for: idBase + '-' + i }, cb, el('span', { class: it.nota ? 'inactivo' : '', texto: it.etiqueta + (it.nota ? ' (' + it.nota + ')' : '') })));
    });
    function leer() { return cajas.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }
    function todo(v) { cajas.forEach(function (c) { c.checked = v; }); alCambiar(leer()); }
    var atajos = el('div', { class: 'atajos' },
      el('button', { type: 'button', texto: 'Todos', 'aria-label': 'Marcar todos: ' + titulo, al: { click: function () { todo(true); } } }),
      el('button', { type: 'button', texto: 'Ninguno', 'aria-label': 'Quitar todos: ' + titulo, al: { click: function () { todo(false); } } }));
    return el('fieldset', null, el('legend', { texto: titulo }), items.length ? atajos : null,
      items.length ? lista : el('p', { class: 'ayuda', texto: 'No hay opciones todavía.' }));
  }

  function tarjeta(i, valor, comparacion, alAbrir) {
    return el('button', { type: 'button', class: 'k k-' + i.cls, 'aria-expanded': 'false', 'aria-controls': 'detalle-ind', 'data-ind': i.k, title: i.ayuda, al: { click: alAbrir } },
      el('span', { class: 'k-t', texto: i.t }), el('span', { class: 'k-v', texto: valor }),
      comparacion ? el('span', { class: 'k-c', texto: comparacion }) : null, el('span', { class: 'k-ver', texto: 'Ver detalle' }));
  }

  function mostrarError(c, e) {
    ui.limpiar(c);
    c.appendChild(el('p', { class: 'error', role: 'alert', texto: (e && e.message) || 'No se pudo cargar. Intenta de nuevo.' }));
  }

  // ------------------------------------------------------------------ general, admin-dojos, admin
  async function vistaPagos(c, ctx) {
    var nivel = ctx.sesion.nivel;
    var multi = nivel !== 'admin';
    var herramientas = ctx.sesion.herramientas || [];
    var h0 = leerHash();
    var st = { periodo: RE_PERIODO.test(h0.m || '') ? h0.m : undefined, comparar: 'anterior', dojos: null, nombres: null, seq: 0, seqDet: 0, seqPlat: 0, temporizador: null, data: null, filtros: null };
    if (COMPARATIVOS.some(function (x) { return x[0] === h0.c; })) st.comparar = h0.c;
    var maestro = null;      // { dojos: [{ id, nombre, nota, excel }], disc: [{ dojoId, id, nombre, clave }], nombres: [{ clave, etiqueta }], sinPlan: [nombre] }
    var inicio = null;       // respuesta que llena el maestro
    var nombrePorId = {};    // todos los dojos del alcance, también los que no se pueden elegir

    c.appendChild(el('h1', { texto: nivel === 'admin' ? 'Pagos de mi dojo' : (nivel === 'general' ? 'Dashboard' : 'Pagos de mis dojos') }));
    var cajaPlat = nivel === 'general' ? el('div', { class: 'seccion-plataforma' }) : null;
    if (cajaPlat) c.appendChild(cajaPlat);
    if (nivel === 'general') c.appendChild(el('h2', { texto: 'Pagos de los dojos' }));
    var cajaFiltros = el('form', { class: 'filtros', 'aria-label': 'Filtros', al: { submit: function (ev) { ev.preventDefault(); } } });
    var estadoCarga = el('p', { class: 'estado-carga', role: 'status' });
    var res = el('div', { class: 'resultados' });
    c.appendChild(cajaFiltros);
    c.appendChild(estadoCarga);
    c.appendChild(res);

    // ---- Qué se pide
    function claveDisc(n) { return clave(n); }
    function idsDisciplinas(est) {
      if (!maestro || est.nombres === null) return null;
      if (est.nombres.length === maestro.nombres.length) return null;
      return maestro.disc.filter(function (d) {
        return est.nombres.indexOf(d.clave) !== -1 && (!multi || est.dojos === null || est.dojos.indexOf(d.dojoId) !== -1);
      }).map(function (d) { return d.id; });
    }
    function cuerpo(est) {
      var p = {};
      if (est.periodo) p.periodo = est.periodo;
      if (multi && est.dojos !== null) p.dojoIds = est.dojos;
      var d = idsDisciplinas(est);
      if (d !== null) p.disciplinaIds = d;
      return p;
    }
    function estActual() { return { periodo: st.periodo, comparar: st.comparar, dojos: st.dojos, nombres: st.nombres }; }
    async function pedir(est) {
      var p = cuerpo(est);
      if (est.comparar === 'anterior' || est.comparar === 'anio') p.comparar = est.comparar;
      var data = await api('dashboard', p);
      data.compararElegido = est.comparar !== 'ninguno';
      if (est.comparar === 'anio2') {
        // Dos años atrás: el comparativo "año pasado" de la cifra de hace un año.
        var p2 = cuerpo(Object.assign({}, est, { periodo: sumaMeses(data.periodo, -12) }));
        p2.comparar = 'anio';
        var d2 = await api('dashboard', p2);
        data.referencia = d2.referencia;
        data.referenciaPeriodo = d2.referenciaPeriodo;
      }
      return { data: data, filtros: cuerpo(Object.assign({}, est, { periodo: data.periodo })) };
    }

    function pintarEstado(t) { estadoCarga.textContent = t; }

    // ---- Cargar (con espera y sin respuestas viejas)
    function programar(espera) {
      clearTimeout(st.temporizador);
      pintarEstado('Actualizando…');
      st.temporizador = setTimeout(cargar, espera);
    }

    function recordar() {
      var p = { m: st.periodo || null, c: st.comparar === 'anterior' ? null : st.comparar };
      if (maestro) {
        if (multi && st.dojos !== null && st.dojos.length !== maestro.dojos.length) p.d = listaAHash(st.dojos);
        if (st.nombres !== null && st.nombres.length !== maestro.nombres.length) p.s = listaAHash(st.nombres);
      }
      escribirHash(p);
    }

    async function cargar() {
      var mia = ++st.seq;
      if (!ctx.vigente()) return;
      recordar();
      cerrarDetalle();
      var sinDojos = multi && maestro.dojos.length > 0 && st.dojos !== null && !st.dojos.length;
      var sinDisc = maestro.nombres.length > 0 && st.nombres !== null && !st.nombres.length;
      if (sinDojos || sinDisc) {
        pintarVacio(sinDojos ? 'Elige al menos un dojo para ver cifras.' : 'Elige al menos una disciplina para ver cifras.');
        pintarEstado('');
        return;
      }
      res.setAttribute('aria-busy', 'true');
      var r;
      try { r = await pedir(estActual()); } catch (e) {
        if (mia !== st.seq || !ctx.vigente() || (e && e.manejado)) return;
        res.removeAttribute('aria-busy');
        pintarEstado('');
        mostrarError(res, e);
        return;
      }
      if (mia !== st.seq || !ctx.vigente()) return;
      st.data = r.data;
      st.filtros = r.filtros;
      pinta(r.data);
    }

    // ---- Pintar resultados
    function pintarVacio(mensaje) {
      st.data = null;
      ui.limpiar(res);
      res.removeAttribute('aria-busy');
      res.appendChild(el('p', { class: 'advertencia', role: 'status', texto: mensaje }));
      res.appendChild(el('div', { class: 'kp' }, IND.map(function (i) {
        return el('div', { class: 'k k-' + i.cls }, el('span', { class: 'k-t', texto: i.t }), el('span', { class: 'k-v', texto: dineroC(0) }));
      })));
    }

    function pinta(data) {
      ui.limpiar(res);
      res.removeAttribute('aria-busy');
      pintarEstado('');
      var r = data.resumenes || {};
      if (r.actualizado === false) {
        res.appendChild(el('div', { class: 'banda-aviso', role: 'status' },
          el('p', { texto: 'Algunas cifras se están actualizando. ' + (r.calculadoEn ? 'Última vez que se calcularon: ' + String(r.calculadoEn).replace('T', ' ').slice(0, 16) + '.' : 'Aún no se calculan.') }),
          el('button', { type: 'button', texto: 'Recargar', al: { click: function () { programar(0); } } })));
      }
      if (!data.actual.tieneDatos) {
        res.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'No hay cobros en ' + nombreMes(data.periodo) + ' con estos filtros.' }));
      }
      res.appendChild(el('div', { class: 'kp' }, IND.map(function (i) {
        return tarjeta(i, ui.moneda(data.actual[i.k]), textoComparacion(data, i.k), function () { abrirDetalle(i); });
      })));
      var linea = el('p', { class: 'resumen-pct' });
      if (data.actual.pctCobrado === null) linea.textContent = 'Este mes aún no hay nada esperado, así que no hay porcentaje cobrado.';
      else { linea.appendChild(document.createTextNode('Cobrado: ')); linea.appendChild(el('b', { texto: pct(data.actual.pctCobrado) })); linea.appendChild(document.createTextNode(' de lo esperado (suma de lo cobrado entre suma de lo esperado).')); }
      res.appendChild(linea);
      res.appendChild(lineaSaldoFavor(data.saldoFavorSinAplicar));
      res.appendChild(cajaDetalle);
      ui.limpiar(cajaDetalle);

      if (puedeExcel()) {
        mensajeExcel = el('p', { class: 'msg-excel', role: 'status' });
        var bx = el('button', { type: 'button', class: 'primario', texto: 'Descargar Excel' });
        bx.addEventListener('click', function () { descargarExcel(bx); });
        res.appendChild(el('div', { class: 'barra-acciones' }, bx, el('span', { class: 'ayuda', texto: 'Cobros de ' + nombreMes(data.periodo) + ' con estos filtros.' })));
        res.appendChild(mensajeExcel);
      }

      // Gráfico de seis meses
      var chart = graficos.columnas({
        titulo: 'Esperado y cobrado, últimos 6 meses', descripcion: 'Un mes sin datos aparece como hueco, no como cero.',
        series: [{ nombre: 'Esperado', clase: 'g-serie-a' }, { nombre: 'Cobrado y confirmado', clase: 'g-serie-b' }],
        periodos: data.serie6Meses.map(function (p) {
          return { etiqueta: etiquetaCorta(p.periodo), nombre: nombreMes(p.periodo), valores: p.tieneDatos ? [p.esperado, p.cobrado] : [null, null] };
        }),
        seleccionado: data.serie6Meses.length - 1
      });
      res.appendChild(el('section', { class: 'caja-panel', 'aria-label': 'Esperado y cobrado, últimos 6 meses' }, el('h3', { texto: 'Esperado y cobrado, últimos 6 meses' }), chart));

      if (multi) {
        res.appendChild(el('section', { class: 'caja-panel' }, el('h3', { texto: 'Por dojo' }), ui.tabla([
          { clave: 'nombre', titulo: 'Dojo', formato: function (v, f) { return el('span', null, f.nombre, f.estado && f.estado !== 'activo' ? ' (' + f.estado + ')' : ''); } },
          { clave: 'esperado', titulo: 'Esperado', alinear: 'der', formato: ui.moneda },
          { clave: 'cobrado', titulo: 'Cobrado', alinear: 'der', formato: ui.moneda },
          { clave: 'porConfirmar', titulo: 'Por confirmar', alinear: 'der', formato: ui.moneda },
          { clave: 'pendienteSinVencer', titulo: 'Pendiente, sin vencer', alinear: 'der', formato: ui.moneda },
          { clave: 'atrasado', titulo: 'Atrasado', alinear: 'der', formato: ui.moneda },
          { clave: 'saldoFavorSinAplicar', titulo: 'Saldo a favor', alinear: 'der', formato: ui.moneda },
          { clave: 'pctCobrado', titulo: '% cobrado', alinear: 'der', formato: pct }
        ], data.porDojo, { titulo: 'Por dojo', vacio: 'No hay dojos con estos filtros.' })));
      } else {
        pintarOcupacion(data);
      }
    }

    function pintarOcupacion(data) {
      var caja = el('section', { class: 'caja-panel' }, el('h3', { texto: 'Ocupación de clases' }));
      var tot = data.ocupacionTotal;
      if (!data.ocupacion.length) {
        caja.appendChild(el('p', { class: 'vacio', texto: 'Aún no hay clases con estos filtros.' }));
      } else {
        caja.appendChild(el('p', { class: 'resumen-pct' }, 'Total: ', el('b', { texto: tot.inscritos + ' inscritos de ' + tot.cupo + ' cupos' }), ' (' + pct(tot.pct) + ', suma de inscritos entre suma de cupos).'));
        caja.appendChild(graficos.barras({
          titulo: 'Ocupación por disciplina', clase: 'g-serie-c',
          filas: data.ocupacion.map(function (g) { return { etiqueta: g.disciplina, valor: g.inscritos, tope: g.cupo || 1, texto: g.inscritos + ' de ' + g.cupo + ' · ' + pct(g.pct) }; })
        }));
        var clases = [];
        data.ocupacion.forEach(function (g) { g.clases.forEach(function (k) { clases.push(Object.assign({ disciplina: g.disciplina }, k)); }); });
        caja.appendChild(el('details', { class: 'g-tabla' }, el('summary', { texto: 'Ver las clases una por una' }), ui.tabla([
          { clave: 'disciplina', titulo: 'Disciplina' }, { clave: 'dia', titulo: 'Día' },
          { clave: 'horaInicio', titulo: 'Horario', formato: function (v, f) { return f.horaInicio + ' a ' + f.horaFin; } },
          { clave: 'inscritos', titulo: 'Inscritos', alinear: 'der', formato: function (v, f) { return f.inscritos + ' de ' + f.cupo; } },
          { clave: 'pct', titulo: 'Ocupación', alinear: 'der', formato: pct }
        ], clases, { titulo: 'Clases' })));
      }
      res.appendChild(caja);
    }

    // ---- Detalle de un indicador
    var cajaDetalle = el('div', { id: 'detalle-ind', 'aria-live': 'polite' });
    function marcarTarjetas(k) {
      Array.prototype.forEach.call(res.querySelectorAll('button.k'), function (b) { b.setAttribute('aria-expanded', String(b.getAttribute('data-ind') === k)); });
    }
    function cerrarDetalle() {
      st.seqDet++;
      ui.limpiar(cajaDetalle);
      marcarTarjetas('');
    }
    function nombreDisciplina(dojoId, id) {
      if (id === 'sin-disciplina') return 'Sin disciplina';
      var d = maestro && maestro.disc.filter(function (x) { return x.dojoId === dojoId && x.id === id; })[0];
      return d ? d.nombre : '';
    }
    function nombresDeDojos(ids) { return ids.map(function (id) { return nombrePorId[id] || 'un dojo'; }); }

    async function abrirDetalle(ind) {
      var data = st.data;
      if (!data) return;
      var mia = ++st.seqDet;
      marcarTarjetas(ind.k);
      ui.limpiar(cajaDetalle);
      if (multi && st.dojos !== null && st.dojos.length > MAX_DOJOS_DETALLE) {
        cajaDetalle.appendChild(el('div', { class: 'detalle-ind', role: 'alert' }, el('h3', { texto: 'Detalle: ' + ind.t }),
          el('p', { texto: 'Para ver el detalle elige hasta ' + MAX_DOJOS_DETALLE + ' dojos. Ahora tienes ' + st.dojos.length + ' marcados: quita algunos en el filtro de dojos y vuelve a abrir el detalle.' })));
        return;
      }
      var base = Object.assign({}, st.filtros, { indicador: ind.k });
      cajaDetalle.appendChild(el('p', { class: 'estado-carga', role: 'status', texto: 'Cargando el detalle…' }));
      var lineas = [];
      var ultimo = null;
      async function traer(desde) {
        var p = Object.assign({}, base);
        if (desde) p.desde = desde;
        var r;
        try { r = await api('detalleIndicador', p); } catch (e) {
          if (mia !== st.seqDet || !ctx.vigente() || (e && e.manejado)) return false;
          ui.limpiar(cajaDetalle);
          cajaDetalle.appendChild(el('div', { class: 'detalle-ind', role: 'alert' }, el('h3', { texto: 'Detalle: ' + ind.t }),
            el('p', { texto: e && e.code === 'VALIDATION' && /dojos/.test(e.message || '') ? 'Son demasiados dojos para el detalle. Elige hasta ' + MAX_DOJOS_DETALLE + ' en el filtro de dojos y vuelve a intentarlo.' : ((e && e.message) || 'No se pudo cargar el detalle.') })));
          return false;
        }
        if (mia !== st.seqDet || !ctx.vigente() || st.data !== data) return false;
        lineas = lineas.concat(r.lineas);
        ultimo = r;
        return true;
      }
      if (!(await traer(0))) return;
      function dibujar() {
        var r = ultimo;
        ui.limpiar(cajaDetalle);
        var tarjetaCent = data.actual.centavos[ind.k];
        var caja = el('section', { class: 'detalle-ind', 'aria-label': 'Detalle de ' + ind.t });
        caja.appendChild(el('h3', { texto: 'Detalle: ' + ind.t + ' · ' + nombreMes(data.periodo) }));
        caja.appendChild(el('p', { class: 'resumen-pct' }, 'Total del detalle: ', el('b', { texto: ui.moneda(r.total) }), ' en ' + cantidad(r.cantidad, 'cobro', 'cobros') + '.'));
        var igual = r.totalCentavos === tarjetaCent;
        var falta = r.noDisponibles.length > 0;
        caja.appendChild(el('p', { class: 'coincide' + (igual && !falta ? '' : ' mal'), role: igual && !falta ? null : 'alert',
          texto: igual && !falta ? 'El total coincide con la tarjeta (' + dineroC(tarjetaCent) + '), al centavo.'
            : (falta ? 'El total del detalle no incluye los dojos que no se pudieron calcular. ' : '') + (igual ? '' : 'La tarjeta dice ' + dineroC(tarjetaCent) + ' y el detalle ' + dineroC(r.totalCentavos) + ': pulsa Recargar o vuelve a abrir el detalle.') }));
        if (falta) {
          caja.appendChild(el('div', { class: 'advertencia', role: 'alert' }, el('p', { texto: 'No se pudo calcular el detalle de ' + cantidad(r.noDisponibles.length, 'dojo', 'dojos') + ' por ahora:' }),
            el('ul', { class: 'mini-lista' }, nombresDeDojos(r.noDisponibles).map(function (n) { return el('li', { texto: n }); })), el('p', { texto: 'Intenta de nuevo en unos minutos.' })));
        }
        if (r.soporte) caja.appendChild(el('p', { class: 'ayuda', texto: 'Estás viendo nombres de alumnos como soporte. Este acceso queda registrado.' }));
        if (r.saldoFavorSinAplicar) {
          caja.appendChild(el('p', { class: 'ayuda' }, 'Saldo a favor sin aplicar (aparte de este detalle): ', el('b', { texto: ui.moneda(r.saldoFavorSinAplicar.monto) }), '. ', r.saldoFavorSinAplicar.nota));
        }
        var cols = [];
        if (multi) cols.push({ clave: 'dojoNombre', titulo: 'Dojo' });
        if (r.conNombres) { cols.push({ clave: 'alumno', titulo: 'Alumno' }); cols.push({ clave: 'titular', titulo: 'Titular' }); cols.push({ clave: 'concepto', titulo: 'Concepto' }); }
        cols.push({ clave: 'disciplinaId', titulo: 'Disciplina', formato: function (v, f) { return nombreDisciplina(f.dojoId, v); } });
        cols.push({ clave: 'fechaPago', titulo: 'Fecha de pago', formato: fechaCorta });
        cols.push({ clave: 'monto', titulo: 'Monto', alinear: 'der', formato: ui.moneda });
        cols.push({ clave: 'pagos', titulo: 'Pagos', formato: function (v, f) {
          var items = (v || []).map(function (p) { return el('li', { texto: (p.recibo ? p.recibo + ' · ' : '') + (ESTADO_PAGO[p.estado] || p.estado) + ' · ' + ui.moneda(p.monto) }); });
          if (f.credito > 0) items.push(el('li', { texto: 'Saldo a favor · ' + dineroC(f.credito) }));
          return items.length ? el('ul', { class: 'pagos-celda' }, items) : '—';
        } });
        caja.appendChild(ui.tabla(cols, lineas, { titulo: 'Detalle de ' + ind.t, vacio: 'No hay cobros en este indicador con estos filtros.' }));
        var pie = el('div', { class: 'pie-detalle' });
        if (r.siguiente !== null) {
          var mas = el('button', { type: 'button', texto: 'Ver más (' + lineas.length + ' de ' + r.cantidad + ')' });
          mas.addEventListener('click', async function () { mas.disabled = true; if (await traer(r.siguiente)) dibujar(); else mas.disabled = false; });
          pie.appendChild(mas);
        }
        pie.appendChild(el('button', { type: 'button', texto: 'Cerrar el detalle', al: { click: cerrarDetalle } }));
        caja.appendChild(pie);
        cajaDetalle.appendChild(caja);
      }
      dibujar();
      cajaDetalle.scrollIntoView({ block: 'nearest' });
    }

    // ---- Excel
    var mensajeExcel = null;
    function puedeExcel() {
      if (nivel === 'general') return true;
      if (nivel === 'admin') return herramientas.indexOf('excel') !== -1;
      return !!maestro && maestro.dojos.some(function (d) { return d.excel && (st.dojos === null || st.dojos.indexOf(d.id) !== -1); });
    }
    function idsDisciplinasDe(dojoId) {
      if (!maestro || st.nombres === null || st.nombres.length === maestro.nombres.length) return null;
      return maestro.disc.filter(function (d) { return d.dojoId === dojoId && st.nombres.indexOf(d.clave) !== -1; }).map(function (d) { return d.id; });
    }
    function avisoExcel(texto, tipo) {
      if (mensajeExcel) { mensajeExcel.textContent = texto; mensajeExcel.className = 'msg-excel ' + (tipo === 'error' ? 'error' : ''); mensajeExcel.setAttribute('role', tipo === 'error' ? 'alert' : 'status'); }
    }

    function armarLibro(resultados, periodo, hoy, omitidos) {
      var conNombres = resultados.some(function (r) { return r.conNombres; });
      var tot = { esperado: 0, cobrado: 0, porConfirmar: 0, pendienteSinVencer: 0, atrasado: 0 };
      var filasRes = resultados.map(function (r) {
        var t = r.totalesCentavos;
        IND.forEach(function (i) { tot[i.k] += t[i.k]; });
        return [r.dojoNombre, t.esperado / 100, t.cobrado / 100, t.porConfirmar / 100, t.pendienteSinVencer / 100, t.atrasado / 100, t.esperado > 0 ? Math.round(t.cobrado * 10000 / t.esperado) / 100 : null];
      });
      if (resultados.length > 1) filasRes.push(['Total', tot.esperado / 100, tot.cobrado / 100, tot.porConfirmar / 100, tot.pendienteSinVencer / 100, tot.atrasado / 100, tot.esperado > 0 ? Math.round(tot.cobrado * 10000 / tot.esperado) / 100 : null]);
      var encabezado = ['Pagos de alumnos · ' + nombreMes(periodo), 'Generado con datos al ' + hoy + '. Montos en quetzales (Q).', 'El % cobrado es la suma de lo cobrado entre la suma de lo esperado.'];
      var hojas = [{
        nombre: 'Resumen', titulo: encabezado,
        columnas: [{ l: 'Dojo' }, { l: 'Esperado', t: 'dinero' }, { l: 'Cobrado y confirmado', t: 'dinero' }, { l: 'Por confirmar', t: 'dinero' }, { l: 'Pendiente, sin vencer', t: 'dinero' }, { l: 'Atrasado', t: 'dinero' }, { l: '% cobrado', t: 'pct' }],
        filas: filasRes
      }];
      var cols = [{ l: 'Dojo' }];
      if (conNombres) cols.push({ l: 'Alumno' }, { l: 'Titular' }, { l: 'Concepto' });
      cols.push({ l: 'Disciplina' }, { l: 'Fecha de pago', t: 'fecha' }, { l: 'Esperado', t: 'dinero' }, { l: 'Cobrado y confirmado', t: 'dinero' }, { l: 'Por confirmar', t: 'dinero' },
        { l: 'Pendiente, sin vencer', t: 'dinero' }, { l: 'Atrasado', t: 'dinero' }, { l: 'Estado del alumno' }, { l: 'Pagos' });
      var filas = [];
      resultados.forEach(function (r) {
        r.lineas.forEach(function (l) {
          var d = l.desglose;
          var disc = l.disciplinaId === 'sin-disciplina' ? 'Sin disciplina' : (r.disciplinas[l.disciplinaId] || '');
          var pagos = (l.pagos || []).map(function (p) { return (p.recibo ? p.recibo + ' ' : '') + (ESTADO_PAGO[p.estado] || p.estado) + ' ' + p.monto.toFixed(2); }).join('; ');
          if (l.credito > 0) pagos += (pagos ? '; ' : '') + 'Saldo a favor ' + (l.credito / 100).toFixed(2);
          var fila = [r.dojoNombre];
          if (conNombres) fila.push(l.alumno || '', l.titular || '', l.concepto || '');
          fila.push(disc, l.fechaPago, d.esperado / 100, d.cobrado / 100, d.porConfirmar / 100, d.pendienteSinVencer / 100, d.atrasado / 100, l.estadoAlumno || '', pagos);
          filas.push(fila);
        });
      });
      hojas.push({ nombre: 'Cobros', titulo: encabezado.slice(0, 2), columnas: cols, filas: filas });
      if (omitidos.length) {
        hojas.push({ nombre: 'No incluidos', titulo: ['Dojos que no se incluyeron en este archivo'], columnas: [{ l: 'Dojo' }, { l: 'Motivo' }], filas: omitidos.map(function (o) { return [o.nombre, o.motivo]; }) });
      }
      return hojas;
    }

    async function descargarExcel(boton) {
      var data = st.data;
      if (!data || boton.disabled) return;
      var periodo = data.periodo;
      var objetivos = multi ? (st.dojos === null ? maestro.dojos.map(function (d) { return d.id; }) : st.dojos.slice()) : data.filtros.dojoIds.slice();
      if (!objetivos.length) { avisoExcel('Elige al menos un dojo para descargar.', 'error'); return; }
      if (objetivos.length > MAX_DOJOS_DETALLE) { avisoExcel('Para descargar elige hasta ' + MAX_DOJOS_DETALLE + ' dojos. Ahora tienes ' + objetivos.length + ' marcados.', 'error'); return; }
      boton.disabled = true;
      avisoExcel('Preparando el archivo…', 'info');
      var resultados = [];
      var omitidos = [];
      var fallo = null;
      for (var n = 0; n < objetivos.length && !fallo; n++) {
        var id = objetivos[n];
        var meta = maestro && maestro.dojos.filter(function (d) { return d.id === id; })[0];
        var nombre = meta ? meta.nombre : (data.porDojo[0] ? data.porDojo[0].nombre : 'Mi dojo');
        if (multi && nivel !== 'general' && meta && !meta.excel) { omitidos.push({ nombre: nombre, motivo: 'Su plan no incluye las descargas en Excel.' }); continue; }
        var juntas = null;
        try {
          var desde = 0;
          do {
            var p = { periodo: periodo };
            if (multi) p.dojoId = id;
            var ds = idsDisciplinasDe(id);
            if (ds !== null) p.disciplinaIds = ds;
            if (desde) p.desde = desde;
            var r = await api('datosDescarga', p);
            if (juntas === null) juntas = r; else juntas.lineas = juntas.lineas.concat(r.lineas);
            desde = r.siguiente;
          } while (desde !== null);
        } catch (e) {
          if (e && e.manejado) return;
          if (e && (e.code === 'PLAN_REQUIRED' || e.code === 'DOWNLOADS_LOCKED')) { omitidos.push({ nombre: nombre, motivo: e.message }); continue; }
          fallo = e;
          break;
        }
        resultados.push(juntas);
      }
      if (!ctx.vigente()) return;
      boton.disabled = false;
      if (fallo) { avisoExcel((fallo && fallo.message) || 'No se pudo preparar el archivo. Intenta de nuevo.', 'error'); return; }
      if (!resultados.length) {
        // Nada que descargar: se dice la razón del servidor tal cual.
        avisoExcel(omitidos.length === 1 ? omitidos[0].motivo : omitidos.map(function (o) { return o.nombre + ': ' + o.motivo; }).join(' '), 'error');
        return;
      }
      var hojas = armarLibro(resultados, periodo, data.hoy, omitidos);
      var cobros = resultados.reduce(function (s, r) { return s + r.lineas.length; }, 0);
      try { excel.descargarXlsx('pagos-' + periodo + '.xlsx', hojas); } catch (e) { avisoExcel('No se pudo armar el archivo de Excel.', 'error'); return; }
      avisoExcel('Excel descargado: ' + cantidad(cobros, 'cobro', 'cobros') + ' de ' + cantidad(resultados.length, 'dojo', 'dojos') + '.' +
        (omitidos.length ? ' No se incluyeron: ' + omitidos.map(function (o) { return o.nombre + ' (' + o.motivo + ')'; }).join(' ') : ''), omitidos.length ? 'error' : 'info');
    }

    // ---- Panel de la plataforma (general)
    async function pintarPlataforma() {
      var mia = ++st.seqPlat;
      var d;
      // Sin periodo: los ciclos de cobro a los dojos empiezan el día de su alta, no el día 1, así que filtrar por mes calendario daría ceros engañosos.
      try { d = await api('dashboardPlataforma', {}); } catch (e) {
        if (mia !== st.seqPlat || !ctx.vigente() || (e && e.manejado)) return;
        ui.limpiar(cajaPlat);
        mostrarError(cajaPlat, e);
        return;
      }
      if (mia !== st.seqPlat || !ctx.vigente()) return;
      ui.limpiar(cajaPlat);
      cajaPlat.appendChild(el('h2', { texto: 'Plataforma · cobros a los dojos' }));
      cajaPlat.appendChild(el('p', { class: 'ayuda', texto: 'Suma de todo lo que la plataforma cobra a sus dojos, sin importar el mes que elijas abajo.' }));
      var pl = d.plataforma;
      var cifras = [
        { k: 'esperado', t: 'Esperado de los dojos', cls: 'e' }, { k: 'cobrado', t: 'Cobrado y confirmado', cls: 'o' },
        { k: 'pendienteSinVencer', t: 'Pendiente, sin vencer', cls: 'p' }, { k: 'atrasado', t: 'Atrasado', cls: 'r' }
      ];
      cajaPlat.appendChild(el('div', { class: 'kp cifras-plataforma' }, cifras.map(function (i) {
        return el('div', { class: 'k k-' + i.cls }, el('span', { class: 'k-t', texto: i.t }), el('span', { class: 'k-v', texto: ui.moneda(pl[i.k]) }));
      })));
      cajaPlat.appendChild(el('p', { class: 'resumen-pct' }, 'Cobrado: ', el('b', { texto: pct(pl.pctCobrado) }), ' de lo esperado.'));
      cajaPlat.appendChild(lineaSaldoFavor(pl.saldoFavorSinAplicar));
      var panel = el('div', { class: 'caja-panel' }, el('h3', { texto: 'Dojos activos: ' + d.dojos.activos + ' de ' + d.dojos.total }));
      panel.appendChild(el('h3', { texto: 'Por plan' }));
      panel.appendChild(graficos.barras({ titulo: 'Dojos activos por plan', clase: 'g-serie-a', filas: d.dojos.porPlan.map(function (x) { return { etiqueta: x.nombre, valor: x.cantidad, tope: d.dojos.activos || 1, texto: String(x.cantidad) }; }) }));
      panel.appendChild(el('h3', { texto: 'Por estado de cuenta' }));
      panel.appendChild(graficos.barras({
        titulo: 'Dojos activos por estado de cuenta', clase: 'g-serie-c',
        filas: Object.keys(d.dojos.porEstado).map(function (k) { return { etiqueta: ESTADO_CUENTA[k] || k, valor: d.dojos.porEstado[k], tope: d.dojos.activos || 1, texto: String(d.dojos.porEstado[k]) }; })
      }));
      cajaPlat.appendChild(panel);
      var cp = d.comprobantesPorRevisar;
      var rev = el('div', { class: 'caja-panel' }, el('h3', { texto: 'Comprobantes por revisar' }));
      if (!cp.cantidad) rev.appendChild(el('p', { class: 'vacio', texto: 'No hay comprobantes esperando revisión.' }));
      else {
        rev.appendChild(el('p', null, el('b', { texto: cantidad(cp.cantidad, 'comprobante', 'comprobantes') }), ' por ' + ui.moneda(cp.monto) + ', el más antiguo del ' + fechaCorta(cp.masAntigua) + '. ',
          el('a', { href: '#/cobros-plataforma', texto: 'Revisarlos ahora' })));
        rev.appendChild(ui.tabla([
          { clave: 'dojoNombre', titulo: 'Dojo' }, { clave: 'monto', titulo: 'Monto declarado', alinear: 'der', formato: ui.moneda }, { clave: 'fecha', titulo: 'Subido', formato: fechaCorta }
        ], cp.lista, { titulo: 'Comprobantes por revisar' }));
      }
      cajaPlat.appendChild(rev);
      var uh = d.usoHojas;
      var hojas = el('div', { class: 'caja-panel' }, el('h3', { texto: 'Uso de hojas' }));
      if (!uh || !uh.medidos) {
        hojas.appendChild(el('p', { class: 'vacio' }, 'Aún no se ha medido el uso de los archivos. ', el('a', { href: '#/uso', texto: 'Medirlo ahora' })));
      } else {
        var nivelUso = { ok: 'Bien', atencion: 'Atención', urgente: 'Urgente' }[uh.aviso] || 'Bien';
        hojas.appendChild(el('p', null, el('b', { texto: nivelUso + ': ' }), uh.peor.nombre + ' es el más lleno, con el ' + uh.peor.porcentaje + ' % del límite de ' + uh.limiteCeldas.toLocaleString('en-US') + ' celdas. ',
          el('a', { href: '#/uso', texto: 'Ver el uso de cada archivo' })));
        hojas.appendChild(el('p', { class: 'ayuda', texto: uh.medidos + ' de ' + uh.archivos + ' archivos medidos' + (uh.desactualizados ? ' (' + uh.desactualizados + ' con una medida de un día anterior)' : '') + '.' }));
      }
      cajaPlat.appendChild(hojas);
    }

    // ---- Arranque: una primera lectura sin filtros arma las listas de casillas
    var pedidos = [pedir({ periodo: st.periodo, comparar: st.comparar, dojos: null, nombres: null })];
    if (multi) pedidos.push(api('listarDojos', {}));
    var salida;
    try { salida = await Promise.all(pedidos); } catch (e) {
      if (!ctx.vigente() || (e && e.manejado)) return;
      mostrarError(res, e);
      return;
    }
    if (!ctx.vigente()) return;
    inicio = salida[0].data;
    st.periodo = inicio.periodo;
    var lista = salida[1] ? salida[1].dojos : [];
    var dojosMaestro = [];
    var sinPlan = [];
    if (multi) {
      lista.forEach(function (d) {
        var tiene = d.plan && d.plan.herramientas;
        var conDash = nivel === 'general' || (tiene && tiene.indexOf('dashboard') !== -1);
        var conExcel = nivel === 'general' || (tiene && tiene.indexOf('excel') !== -1);
        nombrePorId[d.dojoId] = d.nombre;
        if (!conDash) { sinPlan.push(d.nombre); return; }
        dojosMaestro.push({ id: d.dojoId, nombre: d.nombre, nota: d.estado !== 'activo' ? 'inactivo' : '', excel: conExcel });
      });
      dojosMaestro.sort(function (a, b) { return a.nombre < b.nombre ? -1 : (a.nombre > b.nombre ? 1 : 0); });
    }
    var discMaestro = inicio.disciplinas.map(function (d) { return { dojoId: d.dojoId, id: d.id, nombre: d.nombre, clave: claveDisc(d.nombre) }; });
    var vistos = {};
    var nombresMaestro = [];
    discMaestro.forEach(function (d) { if (!vistos[d.clave]) { vistos[d.clave] = true; nombresMaestro.push({ clave: d.clave, etiqueta: d.nombre }); } });
    maestro = { dojos: dojosMaestro, disc: discMaestro, nombres: nombresMaestro, sinPlan: sinPlan };

    // Selección inicial: todo, salvo lo que diga el hash (solo ids y nombres que existan).
    var dHash = listaDeHash(h0.d);
    var sHash = listaDeHash(h0.s);
    if (multi) {
      var idsOk = dojosMaestro.map(function (d) { return d.id; });
      st.dojos = dHash === null ? idsOk : dHash.filter(function (x) { return idsOk.indexOf(x) !== -1; });
    }
    var clavesOk = nombresMaestro.map(function (n) { return n.clave; });
    st.nombres = sHash === null ? clavesOk : sHash.filter(function (x) { return clavesOk.indexOf(x) !== -1; });

    // Filtros
    var hoy = inicio.hoy;
    var opcionesMes = [];
    for (var k = 0; k < 36; k++) { var pm = sumaMeses(hoy.slice(0, 7), -k); opcionesMes.push([pm, nombreMes(pm)]); }
    if (!opcionesMes.some(function (o) { return o[0] === st.periodo; })) opcionesMes.push([st.periodo, nombreMes(st.periodo)]);
    cajaFiltros.appendChild(campoLista('f-mes', 'Mes', opcionesMes, st.periodo, function (v) { st.periodo = v; programar(0); }));
    cajaFiltros.appendChild(campoLista('f-cmp', 'Comparar con', COMPARATIVOS, st.comparar, function (v) { st.comparar = v; programar(0); }));
    if (multi) {
      cajaFiltros.appendChild(grupoCasillas('Dojos', dojosMaestro.map(function (d) { return { clave: d.id, etiqueta: d.nombre, nota: d.nota }; }), st.dojos,
        function (sel) { st.dojos = sel; programar(ESPERA_CASILLAS); }, 'f-dojo'));
    }
    cajaFiltros.appendChild(grupoCasillas('Disciplinas', nombresMaestro.map(function (n) { return { clave: n.clave, etiqueta: n.etiqueta }; }), st.nombres,
      function (sel) { st.nombres = sel; programar(ESPERA_CASILLAS); }, 'f-disc'));
    if (sinPlan.length) {
      c.insertBefore(el('p', { class: 'ayuda', texto: 'Sin dashboard en su plan, por eso no se pueden elegir: ' + sinPlan.join(', ') + '.' }), estadoCarga);
    }
    if (cajaPlat) pintarPlataforma();

    var igualAlTodo = (!multi || st.dojos.length === dojosMaestro.length) && st.nombres.length === nombresMaestro.length;
    if (igualAlTodo) {
      st.data = inicio;
      st.filtros = salida[0].filtros;
      recordar();
      pinta(inicio);
    } else {
      await cargar();
    }
  }

  // ------------------------------------------------------------------ tutor
  async function vistaTutor(c, ctx) {
    var h0 = leerHash();
    var periodo = RE_PERIODO.test(h0.m || '') ? h0.m : undefined;
    var seq = 0;
    c.appendChild(el('h1', { texto: 'Mis clases' }));
    var filtros = el('form', { class: 'filtros', 'aria-label': 'Filtros', al: { submit: function (ev) { ev.preventDefault(); } } });
    var res = el('div', { class: 'resultados' });
    var armado = false;

    async function cargar() {
      var mia = ++seq;
      res.setAttribute('aria-busy', 'true');
      var d;
      try { d = await api('dashboardTutor', periodo ? { periodo: periodo } : {}); } catch (e) {
        if (mia !== seq || !ctx.vigente() || (e && e.manejado)) return;
        mostrarError(res, e);
        return;
      }
      if (mia !== seq || !ctx.vigente()) return;
      periodo = d.periodo;
      if (!armado) {
        armado = true;
        var opciones = [];
        for (var k = 0; k < 12; k++) { var pm = sumaMeses(d.hoy.slice(0, 7), -k); opciones.push([pm, nombreMes(pm)]); }
        if (!opciones.some(function (o) { return o[0] === periodo; })) opciones.push([periodo, nombreMes(periodo)]);
        filtros.appendChild(campoLista('f-mes', 'Mes', opciones, periodo, function (v) { periodo = v; escribirHash({ m: v }); cargar(); }));
        c.insertBefore(filtros, res);
      }
      ui.limpiar(res);
      res.removeAttribute('aria-busy');
      var o = d.ocupacionTotal;
      var a = d.asistenciaTotal;
      res.appendChild(el('div', { class: 'kp' },
        el('div', { class: 'k k-e' }, el('span', { class: 'k-t', texto: 'Cupos ocupados' }), el('span', { class: 'k-v', texto: o.inscritos + ' de ' + o.cupo }), el('span', { class: 'k-c', texto: o.cupo ? 'Ocupación ' + pct(o.pct) : 'Aún no tienes cupos asignados' })),
        el('div', { class: 'k k-o' }, el('span', { class: 'k-t', texto: 'Asistencia de ' + nombreMes(d.periodo) }), el('span', { class: 'k-v', texto: a.presentes + ' de ' + (a.presentes + a.ausentes) }),
          el('span', { class: 'k-c', texto: a.presentes + a.ausentes ? 'Asistencia ' + pct(a.pct) : 'Aún no hay asistencia registrada este mes' }))));
      if (!d.clases.length) {
        res.appendChild(el('p', { class: 'vacio', texto: 'Aún no tienes clases asignadas.' }));
        return;
      }
      res.appendChild(el('section', { class: 'caja-panel' }, el('h3', { texto: 'Ocupación por clase' }), graficos.barras({
        titulo: 'Ocupación por clase', clase: 'g-serie-c',
        filas: d.clases.map(function (k) { return { etiqueta: k.disciplina + ' · ' + k.dia + ' ' + k.horaInicio, valor: k.inscritos, tope: k.cupo || 1, texto: k.inscritos + ' de ' + k.cupo }; })
      })));
      res.appendChild(el('section', { class: 'caja-panel' }, el('h3', { texto: 'Clases, cupos y asistencia' }), ui.tabla([
        { clave: 'disciplina', titulo: 'Clase' }, { clave: 'dia', titulo: 'Día' },
        { clave: 'horaInicio', titulo: 'Horario', formato: function (v, f) { return f.horaInicio + ' a ' + f.horaFin; } },
        { clave: 'inscritos', titulo: 'Cupos', alinear: 'der', formato: function (v, f) { return f.inscritos + ' de ' + f.cupo + ' (' + pct(f.ocupacionPct) + ')'; } },
        { clave: 'asistencia', titulo: 'Asistencia', alinear: 'der', formato: function (v) { return v.sesiones ? v.presentes + ' presentes, ' + v.ausentes + ' ausentes en ' + cantidad(v.sesiones, 'sesión', 'sesiones') + ' (' + pct(v.pct) + ')' : 'Sin registro'; } }
      ], d.clases, { titulo: 'Clases, cupos y asistencia' })));
    }
    c.appendChild(res);
    await cargar();
  }

  // ------------------------------------------------------------------ alumno
  function tablaRecibos(recibos, ctx) {
    return ui.tabla([
      { clave: 'numero', titulo: 'Recibo' }, { clave: 'fecha', titulo: 'Fecha', formato: fechaCorta },
      { clave: 'concepto', titulo: 'Concepto', formato: function (v, f) { return v || f.periodo || ''; } },
      { clave: 'monto', titulo: 'Monto', alinear: 'der', formato: function (v) { return ui.moneda(Number(v)); } },
      { clave: 'reciboId', titulo: '', formato: function (v, f) {
        var b = el('button', { type: 'button', texto: 'Descargar', 'aria-label': 'Descargar el recibo ' + f.numero });
        b.addEventListener('click', async function () {
          b.disabled = true;
          try {
            var r = await api('descargarRecibo', { reciboId: v });
            if (ctx.vigente()) plat.descargar(r.nombre, r.mime, r.base64);
          } catch (e) { if (!(e && e.manejado) && ctx.vigente()) ui.aviso((e && e.message) || 'No se pudo descargar el recibo.', 'error'); }
          b.disabled = false;
        });
        return b;
      } }
    ], recibos, { titulo: 'Recibos', vacio: 'Aún no tienes recibos.' });
  }

  async function vistaAlumno(c, ctx) {
    var d = await api('dashboardAlumno', {});
    if (!ctx.vigente()) return;
    c.appendChild(el('h1', { texto: 'Mis pagos' }));
    if (d.soloRecibos) {
      c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: 'Hay una versión nueva del aviso de privacidad. Mientras no la aceptes, solo puedes ver y descargar tus recibos.' }));
      c.appendChild(el('section', { class: 'caja-panel' }, el('h2', { texto: 'Mis recibos' }), tablaRecibos(d.recibos, ctx)));
      return;
    }
    if (d.enPausa) {
      c.appendChild(el('p', { class: 'advertencia', role: 'status', texto: d.todasEnPausa ? 'Tu credencial está pausada por un pago atrasado. Aquí ves tu saldo y tus recibos; sube tu comprobante para ponerte al día.' : 'Una de las fichas está pausada por un pago atrasado.' }));
    }
    var conMontos = d.fichas.some(function (f) { return f.saldo; });
    if (!conMontos) {
      c.appendChild(el('p', { class: 'vacio', texto: 'Los pagos de tus fichas los lleva su titular, así que aquí no se muestran montos.' }));
    } else {
      var s = d.saldo;
      c.appendChild(el('div', { class: 'kp' },
        el('div', { class: 'k k-e' }, el('span', { class: 'k-t', texto: 'Saldo por pagar' }), el('span', { class: 'k-v', texto: ui.moneda(s.total) })),
        el('div', { class: 'k k-r' }, el('span', { class: 'k-t', texto: 'Vencido' }), el('span', { class: 'k-v', texto: ui.moneda(s.vencido) })),
        el('div', { class: 'k k-i' }, el('span', { class: 'k-t', texto: 'Por confirmar' }), el('span', { class: 'k-v', texto: ui.moneda(s.porConfirmar) }), el('span', { class: 'k-c', texto: 'Comprobantes que el dojo aún no revisa' })),
        el('div', { class: 'k k-o' }, el('span', { class: 'k-t', texto: 'Saldo a favor' }), el('span', { class: 'k-v', texto: ui.moneda(s.saldoFavor) }))));
      c.appendChild(el('p', null, el('a', { class: 'boton primario', href: '#/comprobantes', texto: 'Subir comprobante' }), ' ', el('a', { class: 'boton', href: '#/cobros', texto: 'Ver mis cobros' })));
    }
    c.appendChild(el('section', { class: 'caja-panel' }, el('h2', { texto: 'Próximos pagos' }), ui.tabla([
      { clave: 'alumnoNombre', titulo: 'Alumno' }, { clave: 'concepto', titulo: 'Concepto' },
      { clave: 'fechaPago', titulo: 'Fecha de pago', formato: function (v, f) { return el('span', null, fechaCorta(v), f.vencido ? ' · vencido hace ' + cantidad(f.diasAtraso, 'día', 'días') : ''); } },
      { clave: 'pendiente', titulo: 'Falta', alinear: 'der', formato: ui.moneda }
    ], d.proximosPagos, { titulo: 'Próximos pagos', vacio: 'No tienes pagos pendientes.' })));
    c.appendChild(el('section', { class: 'caja-panel' }, el('h2', { texto: 'Mis recibos' }), tablaRecibos(d.recibos, ctx)));
  }

  // ------------------------------------------------------------------ Registro
  ui.vista('dashboard', function (c, ctx) {
    var nivel = ctx.sesion.nivel;
    if (nivel === 'alumno') return vistaAlumno(c, ctx);
    if (nivel === 'tutor') return vistaTutor(c, ctx);
    return vistaPagos(c, ctx);
  });
})();
