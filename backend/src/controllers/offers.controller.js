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
      dias_visita: Object.entries(servicio.DIAS_VISITA).map(([codigo, nombre]) => ({ codigo, nombre })),
    });
  } catch (err) {
    console.error('Error al obtener el contexto de ofertas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Middleware: resuelve y valida la planta con la que se esta trabajando.
 *
 * La planta NO se acepta a ciegas del cliente: se comprueba contra las del
 * usuario. Si no, cualquier comercial podria pedir la cartera de otra
 * delegacion cambiando un parametro de la URL.
 */
const exigirPlanta = async (req, res, next) => {
  const seccion = req.query.seccion || req.body?.seccion;
  if (!seccion) {
    return res.status(400).json({ error: 'Falta la planta (seccion)' });
  }
  try {
    const planta = await servicio.plantaPermitida(req.usuario.id, seccion);
    if (!planta) {
      return res.status(403).json({ error: 'No trabajas con esa planta' });
    }
    req.planta = planta;
    next();
  } catch (err) {
    console.error('Error al validar la planta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/offers/rutas?seccion=Z
 * Las rutas de la planta, etiquetadas con el nombre del vendedor.
 */
const rutas = async (req, res) => {
  try {
    res.json(await servicio.rutasDeLaPlanta(req.planta.seccion_id));
  } catch (err) {
    console.error('Error al listar rutas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/offers/clientes?seccion=Z&ruta=&dia=&poblacion=&nombre=&codigo=
 *
 * Los cuatro criterios del flujo. Se combinan entre si, y todos van ya
 * acotados a la planta y a los clientes de alta con vendedor activo.
 */
const clientes = async (req, res) => {
  try {
    const { vendedor, ruta, dia, poblacion, nombre, codigo, pagina, por_pagina } = req.query;

    if (dia && !servicio.DIAS_VISITA[dia]) {
      return res.status(400).json({ error: 'Día de visita no válido' });
    }
    // Sin ningun criterio serian 3.410 filas en Zubillaga: se pide al menos uno
    // para no traerse la cartera entera a un movil.
    if (!vendedor && !ruta && !dia && !poblacion && !nombre && !codigo) {
      return res.status(400).json({
        error: 'Indica al menos un criterio: vendedor, ruta, día, población, nombre o código',
        code: 'SIN_CRITERIO',
      });
    }

    res.json(await servicio.buscarClientes({
      seccion: req.planta.seccion_id,
      vendedor, ruta, dia, poblacion, nombre, codigo,
      pagina, porPagina: por_pagina,
    }));
  } catch (err) {
    console.error('Error al buscar clientes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { contexto, exigirPlanta, rutas, clientes };
