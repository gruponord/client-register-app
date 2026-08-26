// Utilidad "Generador de Ofertas".
const pool = require('../config/db');
const servicio = require('../services/offers.service');

/**
 * GET /api/offers/contexto
 *
 * Lo primero que pide la pantalla al entrar: con que plantas puede trabajar
 * este vendedor y si puede tocar el descuento.
 *
 * Si devuelve una sola planta, se entra directo. Si devuelve varias -- el caso
 * de los gestores y jefes de venta -- la interfaz pregunta con cual antes de
 * ensenar nada, porque el catalogo y la cartera de clientes son distintos en
 * cada una.
 */
const contexto = async (req, res) => {
  try {
    const plantas = await servicio.plantasDelUsuario(req.usuario.id);

    if (!plantas.length) {
      // No es un fallo del programa: es que el correo de este usuario no
      // coincide con ningun vendedor de alta en el ERP. Lo arregla un admin
      // cuadrando el correo, y el mensaje tiene que decirlo.
      return res.status(409).json({
        error: 'Tu usuario no está vinculado a ningún vendedor activo del ERP. ' +
               'Avisa a administración para que revise tu dirección de correo.',
        code: 'SIN_VENDEDOR',
      });
    }

    // El rol admin puede editar el descuento sin necesidad de la utilidad,
    // igual que hace requiereUtilidad.
    const { rows } = await pool.query('SELECT utilities FROM users WHERE id = $1', [req.usuario.id]);
    const utilidades = rows[0]?.utilities || [];
    const puedeEditarDto = req.usuario.role === 'admin' || utilidades.includes('ofertas_dto');

    res.json({
      plantas: plantas.map((p) => ({
        seccion_id: p.seccion_id,
        vendedor_id: p.vendedor_id,
        vendedor_nombre: p.vendedor_nombre,
        planta_nombre: p.planta_nombre || p.seccion_id,
        logo: p.logo_path ? `/logos/${p.logo_path}` : null,
      })),
      // Con una sola planta la interfaz se salta el selector.
      requiere_seleccion: plantas.length > 1,
      puede_editar_dto: puedeEditarDto,
    });
  } catch (err) {
    console.error('Error al obtener el contexto de ofertas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { contexto };
