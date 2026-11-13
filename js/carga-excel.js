/* carga-excel.js: alta de tutores o alumnos en grupo desde un Excel (.xlsx).
 * Se lee en el navegador y cada fila pasa por las mismas rutas que el alta de uno en uno (crearTutor, crearCuenta, crearAlumno),
 * así el servidor valida igual. Al terminar se descarga, una sola vez, un Excel con cada correo y su clave temporal.
 * Los administradores de un dojo NO se cargan por Excel: se crean uno por uno. */
(function () {
  'use strict';
  var el = ui.el;

  // ---------------------------------------------------------------- Lectura de .xlsx
  async function unzip(buffer) {
    var v = new DataView(buffer), fin = -1;
    for (var i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
    var n = v.getUint16(fin + 10, true), p = v.getUint32(fin + 16, true), dec = new TextDecoder(), out = {};
    for (var k = 0; k < n; k++) {
      var metodo = v.getUint16(p + 10, true), comp = v.getUint32(p + 20, true);
      var lnom = v.getUint16(p + 28, true), lext = v.getUint16(p + 30, true), lcom = v.getUint16(p + 32, true);
      var local = v.getUint32(p + 42, true);
      var nombre = dec.decode(new Uint8Array(buffer, p + 46, lnom));
      var ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      out[nombre] = { metodo: metodo, datos: new Uint8Array(buffer, ini, comp) };
      p += 46 + lnom + lext + lcom;
    }
    return async function (nombre) {
      var f = out[nombre];
      if (!f) return null;
      if (f.metodo === 0) return dec.decode(f.datos);
      if (f.metodo !== 8) throw new Error('El Excel usa una compresión que no se puede leer.');
      var s = new Blob([f.datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(s).arrayBuffer());
    };
  }
  function refCol(ref) { var n = 0; String(ref).replace(/\d+/g, '').split('').forEach(function (ch) { n = n * 26 + ch.charCodeAt(0) - 64; }); return n - 1; }
  function fechaDeSerie(n) {
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(n)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  /** Primera hoja del .xlsx como filas de texto. Un número con aspecto de fecha (serie de Excel) se convierte a AAAA-MM-DD. */
  async function leerXlsx(archivo) {
    var texto = await unzip(await archivo.arrayBuffer());
    var dom = function (s) { return new DOMParser().parseFromString(s, 'application/xml'); };
    var compartidos = [];
    var ss = await texto('xl/sharedStrings.xml');
    if (ss) Array.prototype.forEach.call(dom(ss).getElementsByTagName('si'), function (si) {
      compartidos.push(Array.prototype.map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join(''));
    });
    var hoja = await texto('xl/worksheets/sheet1.xml');
    if (!hoja) throw new Error('No se encontró la primera hoja del Excel.');
    var filas = [];
    Array.prototype.forEach.call(dom(hoja).getElementsByTagName('row'), function (row) {
      var fila = [];
      Array.prototype.forEach.call(row.getElementsByTagName('c'), function (c) {
        var tipo = c.getAttribute('t'), vNodo = c.getElementsByTagName('v')[0], v = vNodo ? vNodo.textContent : undefined, val;
        if (tipo === 's') val = compartidos[Number(v)] || '';
        else if (tipo === 'inlineStr') val = Array.prototype.map.call(c.getElementsByTagName('t'), function (t) { return t.textContent; }).join('');
        else val = v === undefined ? '' : v;
        fila[refCol(c.getAttribute('r'))] = String(val).trim();
      });
      filas[Number(row.getAttribute('r')) - 1] = Array.from(fila, function (x) { return x === undefined ? '' : x; });
    });
    return Array.from(filas, function (f) { return f || []; });
  }

  // ---------------------------------------------------------------- Plantillas
  var PLANTILLAS = {
    tutor: {
      archivo: 'plantilla-tutores',
      columnas: ['Correo', 'Nombre', 'Teléfono'],
      ejemplo: ['tutor@correo.com', 'Nombre Apellido', '+502 5555 5555'],
      notas: ['Una fila por tutor. Correo y Nombre son obligatorios.', 'Si el correo ya tiene cuenta, solo se le agrega el acceso como tutor de este dojo.']
    },
    alumno: {
      archivo: 'plantilla-alumnos',
      columnas: ['Nombre del alumno', 'Fecha de nacimiento (AAAA-MM-DD)', 'Plan', 'Correo de la cuenta', 'Nombre de la cuenta', 'Teléfono', 'Fecha de nacimiento del encargado (solo menores)'],
      ejemplo: ['Ana Pérez', '2012-05-20', 'Escribe el nombre exacto del plan', 'mama@correo.com', 'María Pérez', '+502 5555 5555', '1985-03-10'],
      notas: [
        'Una fila por alumno. Nombre, fecha de nacimiento y correo de la cuenta son obligatorios.',
        'Adulto: la cuenta es la suya (su correo y su nombre).',
        'Menor de edad: la cuenta es la del encargado mayor de edad (su correo y su nombre) y llena la fecha de nacimiento del encargado.',
        'Varios menores con el mismo encargado: repite el mismo correo; se crea una sola cuenta.',
        'Plan: escribe el nombre tal como aparece en "Planes del dojo", o déjalo vacío.',
        'Escribe las fechas como texto AAAA-MM-DD (por ejemplo 2012-05-20).'
      ]
    }
  };
  function descargarPlantilla(tipo) {
    var p = PLANTILLAS[tipo];
    excel.descargarXlsx(p.archivo, [
      { nombre: tipo === 'tutor' ? 'Tutores' : 'Alumnos', columnas: p.columnas.map(function (l) { return { l: l, t: 'texto' }; }), filas: [p.ejemplo] },
      { nombre: 'Instrucciones', columnas: [{ l: 'Cómo llenarla', t: 'texto', ancho: 90 }], filas: p.notas.map(function (n) { return [n]; }) }
    ]);
  }

  // ---------------------------------------------------------------- Carga
  async function procesar(k, tipo, filas, alAvance) {
    var datos = filas.slice(1).filter(function (f) { return f.some(function (x) { return x !== ''; }); });
    var ejemplo = PLANTILLAS[tipo].ejemplo;
    datos = datos.filter(function (f) { return f[0] !== ejemplo[0]; });   // la fila de ejemplo no se carga
    var resultado = [], cuentas = {}, planes = [];
    if (tipo === 'alumno') {
      var r = await k.llamar('listarPlanesDojo', {});
      planes = r.planes || [];
    }
    for (var i = 0; i < datos.length; i++) {
      if (!k.vigente()) break;
      alAvance(i + 1, datos.length);
      var f = datos[i];
      try {
        if (tipo === 'tutor') {
          var t = await k.llamar('crearTutor', { correo: f[0], nombre: f[1], telefono: f[2] || '' });
          resultado.push([f[0], f[1], t.claveTemporal || '', 'Tutor creado. ' + (t.mensaje || '')]);
        } else {
          var correo = String(f[3] || '').toLowerCase();
          if (!f[0] || !f[1] || !correo) throw new Error('Faltan nombre, fecha de nacimiento o correo de la cuenta.');
          // Todo lo que se puede revisar antes, se revisa antes: así una fila mala no deja una cuenta creada a medias.
          if (!/^\d{4}-\d{2}-\d{2}$/.test(f[1])) throw new Error('La fecha de nacimiento debe ir como AAAA-MM-DD.');
          var plan = f[2] ? planes.filter(function (p) { return String(p.nombre).toLowerCase() === String(f[2]).toLowerCase(); })[0] : null;
          if (f[2] && !plan) throw new Error('No existe el plan "' + f[2] + '" en este dojo.');
          var menor = edad(f[1]) < 18;
          if (menor && !/^\d{4}-\d{2}-\d{2}$/.test(f[6] || '')) throw new Error('Es menor de edad: falta la fecha de nacimiento del encargado (AAAA-MM-DD).');
          var cta = cuentas[correo];
          if (!cta) {
            var c = await k.llamar('crearCuenta', { nivel: 'alumno', correo: correo, nombre: f[4] || f[0], telefono: f[5] || '' });
            cta = cuentas[correo] = { usuarioId: c.usuarioId, clave: c.claveTemporal || '', mensaje: c.mensaje || '' };
          }
          var payload = { nombre: f[0], fechaNacimiento: f[1], titularUsuarioId: cta.usuarioId };
          if (plan) payload.planDojoId = plan.planDojoId;
          if (!menor) payload.usuarioId = cta.usuarioId;
          if (menor && f[6]) payload.encargadoFechaNacimiento = f[6];
          await k.llamar('crearAlumno', payload);
          resultado.push([correo, f[4] || f[0], cta.entregada ? '(misma clave de arriba)' : cta.clave, 'Alumno ' + f[0] + ' creado. ' + (cta.entregada ? '' : cta.mensaje)]);
          cta.entregada = true;
        }
      } catch (e) {
        resultado.push([tipo === 'tutor' ? f[0] : f[3], tipo === 'tutor' ? f[1] : f[0], '', 'NO SE CREÓ: ' + (e.message || 'error')]);
      }
    }
    return resultado;
  }
  function edad(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return 0;
    var hoy = new Date(), a = hoy.getFullYear() - Number(m[1]);
    if (hoy.getMonth() + 1 < Number(m[2]) || (hoy.getMonth() + 1 === Number(m[2]) && hoy.getDate() < Number(m[3]))) a--;
    return a;
  }

  /** Bloque para una pantalla: plantilla, archivo, avance y Excel de resultado. tipo: 'tutor' | 'alumno'. */
  function bloque(k, tipo, alTerminar) {
    var nombre = tipo === 'tutor' ? 'tutores' : 'alumnos';
    var archivo = el('input', { type: 'file', accept: '.xlsx', 'aria-label': 'Excel con ' + nombre });
    var avance = el('p', { class: 'ayuda', role: 'status' });
    var cargar = el('button', { type: 'button', class: 'primario', texto: 'Cargar ' + nombre });
    cargar.addEventListener('click', async function () {
      if (!archivo.files || !archivo.files[0]) { ui.aviso('Elige primero el archivo de Excel.', 'error'); return; }
      cargar.disabled = true;
      try {
        var filas = await leerXlsx(archivo.files[0]);
        if (filas.length < 2) throw new Error('El Excel no tiene filas para cargar.');
        var res = await procesar(k, tipo, filas, function (i, n) { avance.textContent = 'Creando ' + i + ' de ' + n + '…'; });
        var malas = res.filter(function (r) { return /^NO SE CREÓ/.test(r[3]); }).length;
        avance.textContent = 'Listo: ' + (res.length - malas) + ' creados' + (malas ? ', ' + malas + ' con error (revísalos en el Excel de resultado)' : '') + '.';
        excel.descargarXlsx('resultado-' + nombre + '-claves', [{ nombre: 'Resultado', columnas: ['Correo', 'Nombre', 'Clave temporal', 'Resultado'].map(function (l) { return { l: l, t: 'texto' }; }), filas: res }]);
        ui.aviso('Se descargó el Excel con las claves temporales. Guárdalo bien: no se vuelve a mostrar.', 'ok');
        if (alTerminar) alTerminar();
      } catch (e) {
        avance.textContent = '';
        ui.aviso(e.message || 'No se pudo leer el Excel.', 'error');
      } finally { cargar.disabled = false; }
    });
    return el('div', { class: 'tarjeta ancha carga-excel' },
      el('p', { class: 'ayuda', texto: 'Para dar de alta muchos ' + nombre + ' de una vez: descarga la plantilla, llénala y súbela. Al terminar se descarga un Excel con cada correo y su clave temporal, una sola vez.' }),
      el('p', null, el('button', { type: 'button', class: 'enlace', texto: 'Descargar plantilla de ' + nombre, al: { click: function () { descargarPlantilla(tipo); } } })),
      archivo, el('p', null, cargar), avance);
  }

  window.cargaExcel = { bloque: bloque, leerXlsx: leerXlsx };
})();
