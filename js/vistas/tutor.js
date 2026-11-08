/* tutor.js: pantallas del tutor (Task 16): su disponibilidad, sus clases con cupo y la asistencia.
 * La asistencia también la usa el administrador del dojo (misma pantalla; solo cambia que él ve el estado de cada ficha).
 * Un tutor no ve cobros en ninguna parte: la lista de una clase trae solo nombres. Contrato de ui.js: contenedor nuevo por
 * navegación y ctx.vigente() tras cada await. Se carga después de admin.js, que deja las ayudas compartidas en `plat.d`. */
(function () {
  'use strict';
  var el = ui.el;
  var P = plat;
  var D = plat.d;

  // ------------------------------------------------------------------ Disponibilidad
  async function disponibilidad(zona, k) {
    var acc = D.acciones_(zona);
    var r = await Promise.all([k.llamar('verDisponibilidad', {}), k.llamar('listarClases', {})]);
    if (!k.vigente()) return;
    var mia = r[0].tutores[0];
    var bloques = (mia ? mia.bloques : []).map(function (b) { return { dia: D.diaCanon(b.dia), horaInicio: b.horaInicio, horaFin: b.horaFin }; });
    var clasesPor = {};
    r[1].clases.forEach(function (c) { clasesPor[c.claseId] = c; });
    var cambios = false;
    var aviso = el('div', { 'aria-live': 'polite' });
    var guardar;

    function marcar() { cambios = true; estado.textContent = 'Tienes cambios sin guardar.'; estado.className = 'motivo'; }
    var estado = el('p', { class: 'ayuda', role: 'status', texto: 'Aquí ves la disponibilidad que ya guardaste.' });
    var grilla = el('div', { class: 'rejilla-dias' });

    function pintarDias() {
      ui.limpiar(grilla);
      D.DIAS.forEach(function (dia) {
        var delDia = bloques.filter(function (b) { return b.dia === dia; }).sort(function (a, b) { return a.horaInicio < b.horaInicio ? -1 : 1; });
        var ini = el('input', { type: 'time', value: '17:00' });
        var fin = el('input', { type: 'time', value: '20:00' });
        var error = el('p', { class: 'error-form', role: 'alert' });
        var lista = delDia.length
          ? el('ul', { class: 'chips' }, delDia.map(function (b) {
            return el('li', { class: 'chip' }, b.horaInicio + ' a ' + b.horaFin, ' ', el('button', {
              type: 'button', class: 'enlace', texto: 'Quitar', 'aria-label': 'Quitar el bloque de ' + D.DIA_TXT[dia] + ' de ' + b.horaInicio + ' a ' + b.horaFin,
              al: { click: function () { bloques.splice(bloques.indexOf(b), 1); marcar(); pintarDias(); } }
            }));
          }))
          : el('p', { class: 'ayuda', texto: 'No puedes este día.' });
        grilla.appendChild(el('div', { class: 'dia-bloque' },
          el('h3', { texto: D.DIA_TXT[dia] }), lista,
          el('div', { class: 'fila-horas' }, D.campoManual('Desde', ini), D.campoManual('Hasta', fin),
            el('button', {
              type: 'button', texto: 'Agregar', 'aria-label': 'Agregar un bloque el ' + D.DIA_TXT[dia], al: {
                click: function () {
                  error.textContent = '';
                  if (!ini.value || !fin.value || fin.value <= ini.value) { error.textContent = 'La hora de fin debe ser después de la de inicio.'; return; }
                  bloques.push({ dia: dia, horaInicio: ini.value, horaFin: fin.value });
                  marcar();
                  pintarDias();
                }
              }
            })),
          error));
      });
    }
    pintarDias();

    guardar = acc('Guardar mi disponibilidad', 'primario', null, async function () {
      var out = await k.llamar('guardarDisponibilidad', { bloques: bloques.map(function (b) { return { dia: b.dia, horaInicio: b.horaInicio, horaFin: b.horaFin }; }) });
      if (!k.vigente()) return;
      bloques = out.bloques.map(function (b) { return { dia: D.diaCanon(b.dia), horaInicio: b.horaInicio, horaFin: b.horaFin }; });
      cambios = false;
      estado.textContent = 'Guardado.';
      estado.className = 'ayuda';
      ui.aviso('Disponibilidad guardada.', 'ok');
      pintarDias();
      ui.limpiar(aviso);
      if (out.clasesFueraDeDisponibilidad.length) {
        aviso.appendChild(el('div', { class: 'advertencia', role: 'alert' },
          el('p', { texto: 'Estas clases tuyas quedaron fuera de tu disponibilidad nueva. Siguen asignadas a ti: avisa al administrador para que decida.' }),
          el('ul', { class: 'lista-simple' }, out.clasesFueraDeDisponibilidad.map(function (id) { return el('li', { texto: clasesPor[id] ? D.claseTxt(clasesPor[id]) : 'Una clase tuya' }); }))));
      }
    });
    zona.appendChild(el('p', { class: 'intro', texto: 'Marca los días y las horas en que puedes dar clase. Al guardar, reemplazas lo anterior; las clases que ya tienes asignadas no se quitan.' }));
    zona.appendChild(grilla);
    zona.appendChild(estado);
    zona.appendChild(guardar);
    zona.appendChild(aviso);
  }

  // ------------------------------------------------------------------ Mis clases
  async function misClases(zona, k) {
    var acc = D.acciones_(zona);
    var r = await k.llamar('listarClases', {});
    if (!k.vigente()) return;
    var region = el('div');
    zona.appendChild(ui.tabla([
      { clave: 'claseId', titulo: 'Clase', formato: function (v, c) { return el('b', { texto: D.claseTxt(c) }); } },
      { clave: 'cupo', titulo: 'Cupo', formato: function (v, c) { return D.ocupacion(c); } },
      {
        clave: 'claseId', titulo: 'Acciones', formato: function (v, c) {
          var b = [acc('Ver inscritos', '', 'Ver los inscritos de ' + D.claseTxt(c), async function () {
            var x = await k.llamar('listarInscritos', { claseId: v });
            if (!k.vigente()) return;
            ui.limpiar(region);
            region.appendChild(D.panel('destacado', el('h3', { texto: 'Inscritos en ' + D.claseTxt(c) }),
              x.alumnos.length ? el('ul', { class: 'lista-simple' }, x.alumnos.map(function (a) { return el('li', { texto: a.nombre }); })) : D.vacio('Aún no hay nadie inscrito en esta clase.')));
            region.scrollIntoView({ block: 'nearest' });
          })];
          if (k.tiene('asistencia')) b.push(acc('Pasar asistencia', 'primario', 'Pasar asistencia de ' + D.claseTxt(c), function () { D.asistenciaPara = v; location.hash = '#/asistencia'; }));
          return P.acciones.apply(null, b);
        }
      }
    ], r.clases, { titulo: 'Mis clases', vacio: 'Todavía no tienes clases asignadas. Pídele al administrador que te asigne una, o marca tu disponibilidad.' }));
    zona.appendChild(region);
  }

  // ------------------------------------------------------------------ Asistencia: toda la clase de una vez, un toque por alumno
  var MARCA_TXT = { presente: 'Presente', ausente: 'Ausente', sin: 'Sin marcar' };

  async function asistencia(zona, k) {
    var acc = D.acciones_(zona);
    var r = await k.llamar('listarClases', {});
    if (!k.vigente()) return;
    var clases = r.clases;
    if (!clases.length) {
      zona.appendChild(D.vacio(k.nivel === 'tutor' ? 'Todavía no tienes clases asignadas, así que no hay asistencia que pasar. Pídele al administrador que te asigne una.' : 'Aún no hay clases. Créalas en "Clases".'));
      return;
    }
    var selClase = el('select', { 'aria-label': 'Clase' }, D.opciones(clases.map(function (c) { return [c.claseId, D.claseTxt(c)]; })));
    var inicial = D.asistenciaPara;
    D.asistenciaPara = null;
    if (inicial && clases.some(function (c) { return c.claseId === inicial; })) selClase.value = inicial;
    var fecha = el('input', { type: 'date', max: D.hoyGT(), value: D.hoyGT() });
    var lista = el('div');
    zona.appendChild(el('div', { class: 'barra' }, D.campoManual('Clase', selClase), D.campoManual('Fecha', fecha)));
    zona.appendChild(lista);
    var items = [];
    var cargaN = 0;

    async function cargar() {
      var mia = ++cargaN;
      ui.limpiar(lista);
      if (!fecha.value) { lista.appendChild(D.vacio('Elige la fecha de la clase.')); return; }
      var rr = await Promise.all([k.llamar('listarInscritos', { claseId: selClase.value }), k.llamar('verAsistencia', { claseId: selClase.value, periodo: fecha.value.slice(0, 7) })]);
      if (!k.vigente() || mia !== cargaN) return;
      var previas = {};
      rr[1].registros.forEach(function (x) { if (x.fecha === fecha.value) previas[x.alumnoId] = x.presente; });
      items = rr[0].alumnos.map(function (a) {
        return { alumnoId: a.alumnoId, nombre: a.nombre, estado: a.estado, marca: Object.prototype.hasOwnProperty.call(previas, a.alumnoId) ? (previas[a.alumnoId] ? 'presente' : 'ausente') : 'sin', fuera: false, conflicto: false };
      });
      pintar(rr[0].cupo);
    }

    var conflicto = el('div', { 'aria-live': 'assertive' });
    var resumen = el('p', { class: 'grande', role: 'status' });
    var ul = el('ul', { class: 'lista-asistencia' });

    function contar() {
      var n = { presente: 0, ausente: 0, sin: 0 };
      items.forEach(function (i) { if (!i.fuera) n[i.marca]++; });
      resumen.textContent = 'Presentes: ' + n.presente + ' · Ausentes: ' + n.ausente + ' · Sin marcar: ' + n.sin;
    }
    function filas() {
      ui.limpiar(ul);
      items.forEach(function (i) {
        if (i.fuera) {
          ul.appendChild(el('li', { class: 'fuera' }, el('p', { texto: i.nombre + ': fuera de esta lista. No se le puede marcar asistencia en esta fecha; conserva su cupo.' })));
          return;
        }
        var b = el('button', { type: 'button', 'data-marca': i.marca, 'aria-label': i.nombre + ': ' + MARCA_TXT[i.marca].toLowerCase() + '. Toca para cambiar.' },
          el('span', { texto: i.nombre }), el('span', { class: 'estado-marca', texto: i.conflicto ? 'No se puede marcar' : MARCA_TXT[i.marca] }));
        b.addEventListener('click', function () {
          i.marca = i.marca === 'presente' ? 'ausente' : 'presente';
          i.conflicto = false;
          b.setAttribute('data-marca', i.marca);
          b.setAttribute('aria-label', i.nombre + ': ' + MARCA_TXT[i.marca].toLowerCase() + '. Toca para cambiar.');
          b.lastChild.textContent = MARCA_TXT[i.marca];
          contar();
        });
        ul.appendChild(el('li', null, b));
      });
    }
    function pintar(cupo) {
      ui.limpiar(lista);
      ui.limpiar(conflicto);
      if (!items.length) {
        lista.appendChild(D.vacio('Esta clase aún no tiene alumnos inscritos (cupo ' + cupo + '). El administrador los inscribe desde su ficha.'));
        return;
      }
      lista.appendChild(el('p', { class: 'ayuda', texto: 'Toca a cada alumno: la primera vez lo marca presente y cada toque siguiente alterna entre presente y ausente. Quien dejes sin marcar no se guarda.' }));
      lista.appendChild(conflicto);
      filas();
      lista.appendChild(ul);
      contar();
      lista.appendChild(resumen);
      lista.appendChild(P.acciones(
        acc('Marcar a todos presentes', '', null, function () { items.forEach(function (i) { if (!i.fuera) { i.marca = 'presente'; i.conflicto = false; } }); filas(); contar(); }),
        acc('Guardar asistencia', 'primario', null, guardar)));
    }

    async function guardar() {
      ui.limpiar(conflicto);
      var registros = items.filter(function (i) { return !i.fuera && i.marca !== 'sin'; }).map(function (i) { return { alumnoId: i.alumnoId, presente: i.marca === 'presente' }; });
      if (!registros.length) { ui.aviso('Marca al menos a un alumno antes de guardar.', 'error'); return; }
      try {
        var out = await k.llamar('registrarAsistencia', { claseId: selClase.value, fecha: fecha.value, registros: registros });
        if (!k.vigente()) return;
        var pres = registros.filter(function (x) { return x.presente; }).length;
        ui.aviso('Asistencia guardada: ' + pres + (pres === 1 ? ' presente' : ' presentes') + ' y ' + (registros.length - pres) + (registros.length - pres === 1 ? ' ausente.' : ' ausentes.') + (out.sinCambio === registros.length ? ' No había nada nuevo que cambiar.' : ''), 'ok');
        await cargar();
      } catch (e) {
        // El servidor no marca a alguien pausado por atraso y dice su nombre: se muestra tal cual y se ofrece quitarlo y guardar el resto.
        if (!k.vigente()) return;
        var ids = e && e.code === 'VALIDATION' && e.detalle && Array.isArray(e.detalle.alumnoIds) ? e.detalle.alumnoIds : [];
        var nombres = items.filter(function (i) { return !i.fuera && ids.indexOf(i.alumnoId) !== -1; });
        if (!nombres.length) throw e;
        nombres.forEach(function (i) { i.conflicto = true; });
        filas();
        var lista_ = nombres.map(function (i) { return i.nombre; }).join(', ');
        conflicto.appendChild(el('div', { class: 'panel mal', role: 'alert' },
          el('p', { texto: e.message }),
          acc('Quitar a ' + lista_ + ' y guardar el resto', 'primario', null, function () {
            nombres.forEach(function (i) { i.fuera = true; i.conflicto = false; });
            filas();
            contar();
            ui.limpiar(conflicto);
            return guardar();
          })));
        conflicto.scrollIntoView({ block: 'nearest' });
      }
    }

    selClase.addEventListener('change', function () { cargar().catch(P.fallo); });
    fecha.addEventListener('change', function () { cargar().catch(P.fallo); });
    await cargar();
  }

  D.vista('disponibilidad', 'tutor', function (c, ctx) { return D.alcance(c, ctx, { titulo: 'Mi disponibilidad', intro: null }, disponibilidad); });
  D.vista('clases', 'tutor', function (c, ctx) { return D.alcance(c, ctx, { titulo: 'Mis clases', intro: 'Tus clases, con su cupo y cuántos alumnos hay.' }, misClases); });
  D.vista('asistencia', ['tutor', 'admin'], function (c, ctx) {
    return D.alcance(c, ctx, { titulo: 'Asistencia', intro: 'Elige la clase y la fecha, y marca quién vino. Se guarda toda la lista de una vez.' }, asistencia);
  });
})();
