/* excel.js: escribe archivos .xlsx en el navegador, sin librerías (patrón de ../Granjas/web/excel.js, solo la parte de escribir).
 * Un .xlsx es un ZIP con archivos XML; aquí se guarda sin comprimir (método "store").
 *
 * SEGURIDAD (inyección de fórmulas): los textos NUNCA se escriben como fórmula. Toda celda de texto es de tipo `inlineStr`
 * (t="inlineStr"), que Excel muestra como texto aunque empiece con =, +, - o @. Además, si empieza con uno de esos signos (o con
 * tabulador o retorno) lleva el estilo `quotePrefix`, para que al editar la celda Excel tampoco la convierta en fórmula.
 * Solo los números reales de JavaScript (finitos) se escriben como número.
 *
 * La parte pura (construirXlsx) corre también en Node: tests/t-excel.js la usa. La descarga (descargarXlsx) solo existe con DOM.
 *
 *   hoja = { nombre, titulo?: [líneas], columnas: [{ l: 'Encabezado', t: 'texto'|'dinero'|'entero'|'pct'|'fecha', ancho? }], filas: [[valor por columna]] }
 *   excel.construirXlsx([hoja]) -> Uint8Array con el ZIP
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.excel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // ------------------------------------------------------------------ ZIP
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** archivos: [{ nombre, texto }] -> Uint8Array de un ZIP (método "store", nombres UTF-8). */
  function zip(archivos) {
    var enc = new TextEncoder();
    var partes = [];
    var central = [];
    var offset = 0;
    archivos.forEach(function (a) {
      var nom = enc.encode(a.nombre);
      var datos = enc.encode(a.texto);
      var crc = crc32(datos);
      var loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nom.length, true);
      partes.push(new Uint8Array(loc.buffer), nom, datos);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nom.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nom);
      offset += 30 + nom.length + datos.length;
    });
    var tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    var todo = partes.concat(central, [new Uint8Array(fin.buffer)]);
    var total = todo.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    todo.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  // ------------------------------------------------------------------ XML
  function xml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  }

  function colLetra(i) {
    var s = '';
    i++;
    while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /** 'AAAA-MM-DD' -> número de serie de Excel, o null. */
  function serieExcel(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v === undefined || v === null ? '' : v));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;   // 2026-02-30 no existe
    return (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  }

  /** ¿Excel podría tomar este texto por una fórmula al editarlo? */
  function pareceFormula(v) { return /^[=+\-@\t\r]/.test(String(v)); }

  // Estilos (cellXfs): 0 texto · 1 encabezado · 2 título · 3 nota · 4 fecha · 5 entero · 6 dinero · 7 texto con quotePrefix · 8 porcentaje
  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n' +
    '<numFmts count="4"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0"/>' +
    '<numFmt numFmtId="166" formatCode="&quot;Q&quot;#,##0.00"/><numFmt numFmtId="167" formatCode="0.00&quot;%&quot;"/></numFmts>\n' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF0B2545"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5B6B80"/><name val="Calibri"/></font></fonts>\n' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0B2545"/><bgColor indexed="64"/></patternFill></fill></fills>\n' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFE3E8F0"/></left><right style="thin"><color rgb="FFE3E8F0"/></right><top style="thin"><color rgb="FFE3E8F0"/></top><bottom style="thin"><color rgb="FFE3E8F0"/></bottom><diagonal/></border></borders>\n' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\n' +
    '<cellXfs count="9">\n' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>\n' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>\n' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>\n' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>\n' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>\n' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>\n' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>\n' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" quotePrefix="1"/>\n' +
    '</cellXfs>\n' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>\n</styleSheet>';

  function textoInline(ref, v, estilo) {
    return '<c r="' + ref + '" s="' + estilo + '" t="inlineStr"><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
  }

  /** Una celda. Texto siempre inlineStr; número solo si es un número finito de JavaScript. */
  function celda(ref, v, tipo) {
    if (v === null || v === undefined || v === '') return '';
    if ((tipo === 'dinero' || tipo === 'entero' || tipo === 'pct') && typeof v === 'number' && isFinite(v)) {
      return '<c r="' + ref + '" s="' + (tipo === 'dinero' ? 6 : (tipo === 'pct' ? 8 : 5)) + '"><v>' + v + '</v></c>';
    }
    if (tipo === 'fecha') {
      var s = serieExcel(v);
      if (s !== null) return '<c r="' + ref + '" s="4"><v>' + s + '</v></c>';
    }
    var texto = String(v);
    return textoInline(ref, texto, pareceFormula(texto) ? 7 : 0);
  }

  function nombreDeHoja(h, i) { return String(h.nombre || 'Hoja ' + (i + 1)).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31); }

  function hojaXml(h) {
    var titulo = h.titulo || [];
    var filaEnc = titulo.length ? titulo.length + 2 : 1;   // una fila en blanco entre el título y los encabezados
    var filas = [];
    titulo.forEach(function (l, i) {
      filas.push('<row r="' + (i + 1) + '">' + textoInline('A' + (i + 1), l, i ? 3 : 2) + '</row>');
    });
    filas.push('<row r="' + filaEnc + '" ht="32" customHeight="1">' + h.columnas.map(function (c, j) { return textoInline(colLetra(j) + filaEnc, c.l, 1); }).join('') + '</row>');
    h.filas.forEach(function (f, i) {
      var r = filaEnc + 1 + i;
      filas.push('<row r="' + r + '">' + h.columnas.map(function (c, j) { return celda(colLetra(j) + r, f[j], c.t); }).join('') + '</row>');
    });
    var ultima = filaEnc + h.filas.length;
    var anchos = h.columnas.map(function (c, j) {
      if (c.ancho) return c.ancho;
      var largo = String(c.l).length * 0.9;
      h.filas.slice(0, 300).forEach(function (f) { largo = Math.max(largo, String(f[j] === undefined || f[j] === null ? '' : f[j]).length); });
      return Math.min(40, Math.max(c.t === 'fecha' ? 12 : 9, largo + 2));
    });
    var cols = '<cols>' + anchos.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>'; }).join('') + '</cols>';
    var vista = '<sheetViews><sheetView workbookViewId="0"' + (h.activa ? ' tabSelected="1"' : '') + '><pane ySplit="' + filaEnc + '" topLeftCell="A' + (filaEnc + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    var filtro = '<autoFilter ref="A' + filaEnc + ':' + colLetra(h.columnas.length - 1) + Math.max(ultima, filaEnc) + '"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
      vista + '<sheetFormatPr defaultRowHeight="15"/>' + cols + '<sheetData>' + filas.join('') + '</sheetData>' + filtro +
      '\n<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>';
  }

  /** hojas: [hoja] -> Uint8Array (el .xlsx). */
  function construirXlsx(hojas) {
    if (!Array.isArray(hojas) || !hojas.length) throw new Error('Falta al menos una hoja.');
    var nombres = hojas.map(nombreDeHoja);
    var definidos = hojas.map(function (h, i) {
      var enc = (h.titulo || []).length ? h.titulo.length + 2 : 1;
      var ult = Math.max(enc + h.filas.length, enc);
      return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xml(nombres[i].replace(/'/g, "''")) + '\'!$A$' + enc + ':$' + colLetra(h.columnas.length - 1) + '$' + ult + '</definedName>';
    }).join('');
    var cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    var archivos = [
      { nombre: '[Content_Types].xml', texto: cab +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map(function (h, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { nombre: '_rels/.rels', texto: cab +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: 'xl/workbook.xml', texto: cab +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews>' +
        '<sheets>' + hojas.map(function (h, i) { return '<sheet name="' + xml(nombres[i]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><definedNames>' + definidos + '</definedNames></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', texto: cab +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map(function (h, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nombre: 'xl/styles.xml', texto: ESTILOS }
    ].concat(hojas.map(function (h, i) { return { nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', texto: hojaXml(Object.assign({}, h, { activa: i === 0 })) }; }));
    return zip(archivos);
  }

  function nombreSeguro(n) { return String(n || 'archivo').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80); }

  /** Descarga el .xlsx en el navegador. La URL blob: se revoca enseguida. */
  function descargarXlsx(nombre, hojas) {
    var bytes = construirXlsx(hojas);
    var url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreSeguro(nombre).replace(/(\.xlsx)?$/, '.xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return bytes.length;
  }

  return { construirXlsx: construirXlsx, descargarXlsx: descargarXlsx, pareceFormula: pareceFormula, serieExcel: serieExcel, crc32: crc32, MIME: MIME };
});
