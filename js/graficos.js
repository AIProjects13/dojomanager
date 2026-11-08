/* graficos.js: gráficos SVG propios, armados con métodos del DOM (nunca innerHTML), sin librerías.
 * Cada gráfico trae su alternativa en texto o en tabla, y no depende del color para decir qué es cada serie:
 * hay leyenda, lectura al pasar o enfocar, y una tabla desplegable.
 *
 * Reglas del proyecto (fondo negro): texto de ejes/leyenda >= 4.5:1 y marcas >= 3:1 contra la superficie #17171a.
 * Los colores viven en styles.css (clases g-*), porque la CSP no admite estilos en línea.
 *  - columnas(op): columnas agrupadas por periodo. Un periodo sin datos (valores null) queda como HUECO, no como cero.
 *  - barras(op): barras horizontales con su valor escrito al lado (conteos y porcentajes). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var el = ui.el;

  function s(tag, attrs, texto) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    if (texto !== undefined) n.textContent = String(texto);
    return n;
  }

  /** Marca "bien": columna con las esquinas de arriba redondeadas (4 px) y la base recta, anclada a la línea base. */
  function trazoColumna(x, yBase, w, h) {
    var r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + yBase + 'V' + (yBase - h + r) + 'Q' + x + ',' + (yBase - h) + ' ' + (x + r) + ',' + (yBase - h) +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + (yBase - h) + ' ' + (x + w) + ',' + (yBase - h + r) + 'V' + yBase + 'Z';
  }

  /** Tope "redondo" del eje y: 1, 2, 2.5, 5 o 10 por una potencia de 10. */
  function topeEje(max) {
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var opciones = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < opciones.length; i++) if (opciones[i] * p >= max) return opciones[i] * p;
    return 10 * p;
  }
  /** Etiqueta del eje: completa bajo 10,000; compacta (K, M) cuando el eje llega ahí. */
  function etiquetaEje(v, tope) {
    if (tope >= 1000000) return 'Q' + (v / 1000000) + 'M';
    if (tope >= 10000) return 'Q' + (v / 1000) + 'K';
    return 'Q' + v;
  }

  /**
   * op: { titulo, descripcion, series: [{ nombre, clase }], periodos: [{ etiqueta, nombre, valores: [n|null por serie] }],
   *       seleccionado (índice), formato(v) }
   * Devuelve un div con leyenda, el SVG, la lectura y la tabla. Se redibuja si cambia el ancho (ResizeObserver).
   */
  function columnas(op) {
    var formato = op.formato || ui.moneda;
    var caja = el('div', { class: 'grafico' });
    var leyenda = el('ul', { class: 'g-leyenda', 'aria-label': 'Leyenda' }, op.series.map(function (se) {
      return el('li', null, el('span', { class: 'g-llave ' + se.clase, 'aria-hidden': 'true' }), el('span', { texto: se.nombre }));
    }));
    var lectura = el('p', { class: 'g-lectura', role: 'status' });
    var lienzo = el('div', { class: 'g-lienzo' });
    var textoSel = function (p) {
      if (!p || p.valores.every(function (v) { return v === null; })) return (p ? p.nombre : '') + ': aún no hay datos en este mes.';
      return p.nombre + ': ' + op.series.map(function (se, i) { return se.nombre + ' ' + formato(p.valores[i]); }).join(' · ');
    };
    var porDefecto = op.periodos[op.seleccionado];
    lectura.textContent = textoSel(porDefecto);

    var anchoPrevio = 0;
    function dibujar(ancho) {
      var W = Math.max(260, Math.floor(ancho));
      var H = 230;
      var ML = 54, MR = 8, MT = 12, MB = 30;
      var iw = W - ML - MR;
      var ih = H - MT - MB;
      var max = 0;
      op.periodos.forEach(function (p) { p.valores.forEach(function (v) { if (v !== null && v > max) max = v; }); });
      var tope = topeEje(max);
      var yDe = function (v) { return MT + ih - (v / tope) * ih; };
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'g-svg', role: 'group', 'aria-label': op.titulo + '. ' + (op.descripcion || '') });
      // Rejilla y eje y: hairline, sólida, recesiva. 4 intervalos.
      for (var i = 0; i <= 4; i++) {
        var v = tope * i / 4;
        var y = Math.round(yDe(v)) + 0.5;
        svg.appendChild(s('line', { x1: ML, x2: W - MR, y1: y, y2: y, class: i === 0 ? 'g-base' : 'g-rejilla' }));
        svg.appendChild(s('text', { x: ML - 6, y: y + 4, 'text-anchor': 'end', class: 'g-eje' }, etiquetaEje(v, tope)));
      }
      var banda = iw / op.periodos.length;
      var n = op.series.length;
      var grosor = Math.max(6, Math.min(24, Math.floor((banda - 10) / n) - 2));
      op.periodos.forEach(function (p, k) {
        var x0 = ML + k * banda;
        var ancho = n * grosor + (n - 1) * 2;
        var xi = x0 + (banda - ancho) / 2;
        var g = s('g', { class: 'g-grupo' + (k === op.seleccionado ? ' g-sel' : ''), tabindex: 0, role: 'img', 'aria-label': textoSel(p) });
        g.appendChild(s('rect', { x: x0, y: MT, width: banda, height: ih + MB - 6, class: 'g-zona' }));
        var vacio = p.valores.every(function (x) { return x === null; });
        if (vacio) {
          g.appendChild(s('text', { x: x0 + banda / 2, y: yDe(0) - 18, 'text-anchor': 'middle', class: 'g-vacio' }, 'sin'));
          g.appendChild(s('text', { x: x0 + banda / 2, y: yDe(0) - 6, 'text-anchor': 'middle', class: 'g-vacio' }, 'datos'));
        } else {
          p.valores.forEach(function (val, j) {
            if (val === null) return;
            var h = Math.max(2, (val / tope) * ih);   // un cero real se ve como una raya de 2 px, distinto de un hueco
            g.appendChild(s('path', { d: trazoColumna(xi + j * (grosor + 2), yDe(0), grosor, h), class: 'g-marca ' + op.series[j].clase }));
          });
        }
        g.appendChild(s('text', { x: x0 + banda / 2, y: H - 10, 'text-anchor': 'middle', class: 'g-mes' + (k === op.seleccionado ? ' g-mes-sel' : '') }, p.etiqueta));
        var mostrar = function () { lectura.textContent = textoSel(p); };
        var volver = function () { lectura.textContent = textoSel(porDefecto); };
        g.addEventListener('pointerenter', mostrar);
        g.addEventListener('focus', mostrar);
        g.addEventListener('pointerleave', volver);
        g.addEventListener('blur', volver);
        svg.appendChild(g);
      });
      ui.limpiar(lienzo).appendChild(svg);
    }

    var cols = [{ clave: 'nombre', titulo: 'Mes' }].concat(op.series.map(function (se, i) {
      return { clave: 'v' + i, titulo: se.nombre, alinear: 'der', formato: function (v) { return v === null || v === undefined ? 'Sin datos' : formato(v); } };
    }));
    var filasTabla = op.periodos.map(function (p) {
      var f = { nombre: p.nombre };
      p.valores.forEach(function (v, i) { f['v' + i] = v; });
      return f;
    });
    var tabla = el('details', { class: 'g-tabla' }, el('summary', { texto: 'Ver como tabla' }), ui.tabla(cols, filasTabla, { titulo: op.titulo }));

    caja.appendChild(leyenda);
    caja.appendChild(lienzo);
    caja.appendChild(lectura);
    caja.appendChild(tabla);
    dibujar(340);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function (entradas) {
        var w = Math.floor(entradas[0].contentRect.width);
        // Se redibuja en el siguiente cuadro: hacerlo dentro del aviso cambia el tamaño otra vez y el navegador protesta ("loop").
        if (w > 0 && Math.abs(w - anchoPrevio) >= 2) { anchoPrevio = w; requestAnimationFrame(function () { dibujar(w); }); }
      }).observe(lienzo);
    }
    return caja;
  }

  /**
   * Barras horizontales: op = { titulo, filas: [{ etiqueta, valor, tope, texto }], clase }. El valor va escrito (texto), así que
   * la barra solo refuerza. `tope` es el máximo de la fila (cupo, 100 %...); sin tope se usa el mayor valor.
   */
  function barras(op) {
    var mayor = 0;
    op.filas.forEach(function (f) { mayor = Math.max(mayor, f.tope || f.valor || 0); });
    var lista = el('ul', { class: 'g-barras', 'aria-label': op.titulo });
    op.filas.forEach(function (f) {
      var tope = f.tope || mayor || 1;
      var pct = Math.max(0, Math.min(100, (f.valor / tope) * 100));
      var svg = s('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', class: 'g-barra-svg', 'aria-hidden': 'true', focusable: 'false' });
      svg.appendChild(s('rect', { x: 0, y: 0, width: 100, height: 10, class: 'g-pista' }));
      if (pct > 0) svg.appendChild(s('rect', { x: 0, y: 0, width: Math.max(1.5, pct), height: 10, class: 'g-marca ' + (op.clase || 'g-serie-a') }));
      lista.appendChild(el('li', null, el('span', { class: 'g-etq', texto: f.etiqueta }), svg, el('span', { class: 'g-val', texto: f.texto })));
    });
    return lista;
  }

  window.graficos = { columnas: columnas, barras: barras, topeEje: topeEje, etiquetaEje: etiquetaEje };
})();
