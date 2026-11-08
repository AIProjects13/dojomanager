/* enlaces.js: enlaces para abrir WhatsApp o Gmail con el mensaje ya escrito (spec 7 y 10).
 * La app no envía nada: una persona revisa y envía. Sin dependencias; sirve en Node y en el navegador.
 *  - enlaceWhatsApp(tel, texto)         -> https://wa.me/<digitos>?text=...
 *  - enlaceGmailWeb(correo, asunto, t)  -> redacción de Gmail en el navegador
 *  - enlaceCorreo(correo, asunto, t)    -> mailto: (usa %20, nunca +)
 * Todo valor se codifica con encodeURIComponent: emojis, &, % y # sobreviven. Ninguna función recorta el texto:
 * un mensaje largo puede pasar el límite práctico de las URL (LIMITE_URL); `enlaceLargo(url)` lo señala para que la
 * pantalla avise en lugar de abrir un enlace que el teléfono podría cortar sin decirlo.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Enlaces = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Largo de URL (caracteres) por encima del cual WhatsApp, Gmail y los clientes de correo móviles fallan con frecuencia. */
  var LIMITE_URL = 2000;

  /** Un sustituto suelto (emoji partido) no es texto válido: se cambia por U+FFFD, que pesa lo mismo que el servidor calcula. */
  function sustitutosSueltos(s) {
    return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, function (m) { return m.length === 2 ? m : '�'; });
  }

  function cod(v) { return encodeURIComponent(sustitutosSueltos(v === undefined || v === null ? '' : String(v))); }
  function codCorreo(v) { return cod(String(v === undefined || v === null ? '' : v).trim()).replace(/%40/g, '@'); }

  function enlaceWhatsApp(tel, texto) {
    var digitos = String(tel === undefined || tel === null ? '' : tel).replace(/\D/g, '');
    return 'https://wa.me/' + digitos + '?text=' + cod(texto);
  }

  function enlaceGmailWeb(correo, asunto, texto) {
    return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + codCorreo(correo) + '&su=' + cod(asunto) + '&body=' + cod(texto);
  }

  function enlaceCorreo(correo, asunto, texto) {
    var cuerpo = String(texto === undefined || texto === null ? '' : texto).replace(/\r?\n/g, '\r\n');
    return 'mailto:' + codCorreo(correo) + '?subject=' + cod(asunto) + '&body=' + cod(cuerpo);
  }

  function largoEnlace(url) { return String(url).length; }
  function enlaceLargo(url) { return largoEnlace(url) > LIMITE_URL; }

  return {
    LIMITE_URL: LIMITE_URL,
    enlaceWhatsApp: enlaceWhatsApp,
    enlaceGmailWeb: enlaceGmailWeb,
    enlaceCorreo: enlaceCorreo,
    largoEnlace: largoEnlace,
    enlaceLargo: enlaceLargo
  };
});
