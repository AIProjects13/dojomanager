/* api.js: api(accion, payload) -> Promise<data>. Lanza ApiError { code, message }.
 * Cuerpo: { action, idToken, membresiaId, payload } como text/plain (sin preflight CORS), igual que backend/Code.gs. */
(function () {
  'use strict';

  function ApiError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // Mensajes de respaldo (tú, sin códigos). El texto del servidor, cuando viene, es más específico y se conserva.
  var MENSAJES = {
    UNAUTHENTICATED: 'Tu sesión expiró. Inicia sesión de nuevo.',
    FORBIDDEN: 'No tienes permiso para esta acción.',
    NOT_FOUND: 'No encontramos lo que buscas.',
    VALIDATION: 'Revisa los datos e intenta de nuevo.',
    READ_ONLY: 'La cuenta de este dojo está en solo lectura. Comunícate con la administración de tu dojo.',
    PLAN_REQUIRED: 'Tu plan no incluye esta herramienta. Cambia de plan para usarla.',
    PASSWORD_CHANGE_REQUIRED: 'Debes cambiar tu contraseña temporal antes de continuar.',
    NOTICE_REQUIRED: 'Antes de continuar, lee y acepta el aviso de privacidad.',
    PAUSED: 'Tu credencial está pausada por un pago atrasado. Puedes ver tus cobros, tus recibos, subir tu comprobante y manejar tus permisos.',
    FULL: 'Ya no hay cupo.',
    TOO_LARGE: 'El archivo o la solicitud es demasiado grande.',
    RATE_LIMIT: 'Hiciste muchas solicitudes seguidas. Espera un minuto e intenta de nuevo.',
    DOWNLOADS_LOCKED: 'Las descargas se habilitan cuando se confirme tu pago.',
    BAD_ACTION: 'Esa acción no está disponible.',
    INTERNAL: 'Ocurrió un error. Intenta de nuevo en unos segundos.',
    NETWORK: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
    BAD_RESPONSE: 'No pudimos confirmar si la operación se completó. Revisa la información antes de intentarlo de nuevo.',
    CONFIG: 'La aplicación aún no está disponible. Avisa a la administración de tu dojo.'
  };

  var puertas = {};   // código -> función a la que se avisa (pantalla de clave, aviso, pausa...)

  function configuracion() {
    var c = window.DOJO_CONFIG || {};
    if (!c.API_URL) throw ApiError('CONFIG', MENSAJES.CONFIG);
    return c;
  }

  async function api(accion, payload, interno) {
    interno = interno || {};
    var cfg = configuracion();
    var generacion = auth.generacion;
    var descartar = function () {
      var d = ApiError('UNAUTHENTICATED', MENSAJES.UNAUTHENTICATED);
      d.manejado = true;
      return d;
    };
    var token;
    try {
      token = await auth.token(!!interno.forzar);
    } catch (e) {
      if (e.manejado || interno.forzar) throw e;
      return api(accion, payload, { forzar: true });   // el SDK no pudo dar token: un intento de renovarlo
    }
    var res;
    var json;
    if (window.espera) espera.inicio();   // animación con consejos si el servidor tarda
    try {
      try {
        res = await fetch(cfg.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: accion, idToken: token, membresiaId: auth.estado.membresiaId || undefined, payload: payload || {} }),
          credentials: 'omit', referrerPolicy: 'no-referrer'
        });
      } catch (e) {
        if (generacion !== auth.generacion) throw descartar();
        throw ApiError('NETWORK', MENSAJES.NETWORK);
      }
      // Si mientras tanto se cerró la sesión o se cambió de membresía, esta respuesta es de otra persona o de otro contexto: se descarta.
      try { json = JSON.parse(await res.text()); } catch (e) { throw ApiError('BAD_RESPONSE', MENSAJES.BAD_RESPONSE); }
    } finally {
      if (window.espera) espera.fin();
    }
    if (generacion !== auth.generacion) throw descartar();
    if (!json || typeof json !== 'object' || (json.ok && !('data' in json))) throw ApiError('BAD_RESPONSE', MENSAJES.BAD_RESPONSE);
    if (json.ok) return json.data;

    var code = (json.error && json.error.code) || 'INTERNAL';
    if (code === 'UNAUTHENTICATED') {
      // Un intento con token nuevo; si vuelve a fallar, de regreso al ingreso.
      if (!interno.forzar) return api(accion, payload, { forzar: true });
      auth.sesionVencida();
      var v = ApiError(code, MENSAJES.UNAUTHENTICATED);
      v.manejado = true;
      throw v;
    }
    var err = ApiError(code, (json.error && json.error.message) || MENSAJES[code] || MENSAJES.INTERNAL);
    if (json.error && json.error.detalle !== undefined) err.detalle = json.error.detalle;
    if (puertas[code]) {
      var r = puertas[code](err, accion);
      if (r === 'manejado') err.manejado = true;
    }
    throw err;
  }

  api.puerta = function (code, fn) { puertas[code] = fn; };
  api.MENSAJES = MENSAJES;
  api.ApiError = ApiError;
  window.api = api;
})();
