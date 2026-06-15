// Catalogo de utilidades disponibles en la app.
// Al añadir una nueva utilidad: meter aqui su codigo + etiqueta, aplicar el
// middleware requiereUtilidad('codigo') en sus rutas y pintar el checkbox
// en el frontend (frontend/src/config/utilities.js).
const UTILIDADES = [
  { code: 'altas', label: 'Alta de Clientes' },
  { code: 'prospecting', label: 'Prospección de Cerveza' },
  { code: 'plv', label: 'Petición PLV' },
];

const CODIGOS_VALIDOS = UTILIDADES.map((u) => u.code);

module.exports = { UTILIDADES, CODIGOS_VALIDOS };
