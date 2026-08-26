// Utilidad "Generador de Ofertas".
const pool = require('../config/db');
const servicio = require('../services/offers.service');
const { calcularLinea } = require('../services/precios.service');
const { generarPdfOferta } = require('../services/ofertaPdf.service');
const { enviarEmailOferta } = require('../services/email.service');

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
 *
 * Y si el usuario no tiene ficha de vendedor en el ERP, se le ofrecen las cuatro
 * plantas para que elija: trabaja igual, y la oferta se guardara sin vendedor.
 * `vinculado` dice cual de los dos casos es.
 */
const contexto = async (req, res) => {
  try {
    const { vinculado, plantas } = await servicio.plantasDisponibles(req.usuario.id);

    if (!plantas.length) {
      // Ni ficha de vendedor ni plantas: la app no tiene ninguna planta activa
      // que exista tambien como seccion en la replica. Eso es configuracion, no
      // un fallo del programa, y el mensaje tiene que decir donde mirar.
      return res.status(409).json({
        error: 'No hay ninguna planta configurada que exista en el ERP. ' +
               'Avisa a administración.',
        code: 'SIN_PLANTAS',
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
      // false = no tiene ficha de vendedor y esta eligiendo entre todas las
      // plantas. La oferta se guardara sin vendedor del ERP.
      vinculado,
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
    const { vendedor, ruta, dia, texto, poblacion, nombre, codigo, pagina, por_pagina } = req.query;

    if (dia && !servicio.DIAS_VISITA[dia]) {
      return res.status(400).json({ error: 'Día de visita no válido' });
    }
    // Sin ningun criterio serian 3.410 filas en Zubillaga: se pide al menos uno
    // para no traerse la cartera entera a un movil.
    if (!vendedor && !ruta && !dia && !texto && !poblacion && !nombre && !codigo) {
      return res.status(400).json({
        error: 'Indica al menos un criterio: ruta, día o texto de búsqueda',
        code: 'SIN_CRITERIO',
      });
    }

    res.json(await servicio.buscarClientes({
      seccion: req.planta.seccion_id,
      vendedor, ruta, dia, texto, poblacion, nombre, codigo,
      pagina, porPagina: por_pagina,
    }));
  } catch (err) {
    console.error('Error al buscar clientes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/offers/filtros?seccion=Z
 * Familias y proveedores del catalogo, para los desplegables del buscador.
 */
const filtros = async (req, res) => {
  try {
    res.json(await servicio.filtrosDelCatalogo(req.planta.seccion_id));
  } catch (err) {
    console.error('Error al listar filtros del catálogo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/offers/articulos?seccion=Z&familia=&proveedor=&codigo=&descripcion=
 *
 * El catalogo de la planta. A diferencia de los clientes, aqui SI se puede
 * pedir sin ningun filtro: son unos 1.000 articulos y el comercial espera
 * hojearlos como en una tienda.
 */
const articulos = async (req, res) => {
  try {
    const { familia, proveedor, texto, codigo, descripcion, pagina, por_pagina } = req.query;
    res.json(await servicio.buscarArticulos({
      seccion: req.planta.seccion_id,
      familia, proveedor, texto, codigo, descripcion,
      pagina, porPagina: por_pagina,
    }));
  } catch (err) {
    console.error('Error al buscar artículos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/** Puede este usuario cambiar el descuento? */
const puedeEditarDto = async (usuario) => {
  if (usuario.role === 'admin') return true;
  const { rows } = await pool.query('SELECT utilities FROM users WHERE id = $1', [usuario.id]);
  return (rows[0]?.utilities || []).includes('ofertas_dto');
};

/**
 * POST /api/offers
 *
 * Guarda la oferta. Los precios se LEEN DEL ERP a partir del codigo de
 * articulo; la peticion solo manda el codigo y el descuento. Aceptar el precio
 * del cliente permitiria guardar una oferta con el importe que a uno le
 * apeteciera.
 *
 * Cuerpo:
 *   { seccion, cliente: {cliente_id, local_id} | cliente_nuevo: {nombre, poblacion},
 *     lineas: [{articulo_id, dto_pct}] }
 */
const crear = async (req, res) => {
  const { cliente, cliente_nuevo, lineas } = req.body || {};

  if (!Array.isArray(lineas) || !lineas.length) {
    return res.status(400).json({ error: 'La oferta no tiene ningún artículo' });
  }
  if (lineas.length > 200) {
    return res.status(400).json({ error: 'Demasiados artículos en una oferta (máximo 200)' });
  }
  if (!cliente && !cliente_nuevo) {
    return res.status(400).json({ error: 'Falta el cliente' });
  }
  if (cliente_nuevo && !String(cliente_nuevo.nombre || '').trim()) {
    return res.status(400).json({ error: 'Un cliente nuevo necesita al menos el nombre' });
  }

  const cli = await pool.connect();
  try {
    // --- El cliente ---
    let datosCliente;
    if (cliente_nuevo) {
      datosCliente = {
        cliente_id: null,
        local_id: null,
        nombre: String(cliente_nuevo.nombre).trim().slice(0, 200),
        poblacion: String(cliente_nuevo.poblacion || '').trim().slice(0, 120) || null,
        es_nuevo: true,
        vendedor_id: req.planta.vendedor_id,
        vendedor_nombre: req.planta.vendedor_nombre,
      };
    } else {
      const c0 = await servicio.clienteConcreto(
        req.planta.seccion_id, cliente.cliente_id, cliente.local_id);
      if (!c0) {
        return res.status(400).json({
          error: 'Ese cliente no está disponible en esta planta',
          code: 'CLIENTE_NO_VALIDO',
        });
      }
      datosCliente = {
        cliente_id: c0.cliente_id,
        local_id: c0.local_id,
        nombre: c0.nombre,
        poblacion: c0.poblacion,
        es_nuevo: false,
        // El vendedor con el que emite QUIEN LO HACE, no el de la ruta del
        // cliente. Si el usuario no tiene ficha en el ERP se queda a null y el
        // documento sale sin nombre, solo con el correo: poner ahi el nombre del
        // vendedor de la ruta diria que el listado lo hizo alguien que no lo hizo.
        vendedor_id: req.planta.vendedor_id,
        vendedor_nombre: req.planta.vendedor_nombre,
      };
    }

    // --- Los articulos ---
    const ids = [...new Set(lineas.map((l) => String(l.articulo_id)))];
    const enCatalogo = await servicio.articulosParaOferta(req.planta.seccion_id, ids);
    const porId = new Map(enCatalogo.map((a) => [a.articulo_id, a]));

    const faltan = ids.filter((id) => !porId.has(id));
    if (faltan.length) {
      // Se falla en bloque y con la lista: un articulo que ya no esta a la venta
      // no se puede ofrecer, y el comercial tiene que saber cual.
      return res.status(400).json({
        error: 'Hay artículos que ya no están disponibles en esta planta',
        code: 'ARTICULOS_NO_DISPONIBLES',
        articulos: faltan,
      });
    }

    // --- Los descuentos ---
    const puede = await puedeEditarDto(req.usuario);
    const preparadas = [];
    for (const l of lineas) {
      const a = porId.get(String(l.articulo_id));
      const porDefecto = Number(a.por_dto) || 0;
      const pedido = l.dto_pct === undefined || l.dto_pct === null ? porDefecto : Number(l.dto_pct);

      if (!Number.isFinite(pedido) || pedido < 0 || pedido > 100) {
        return res.status(400).json({ error: 'Descuento no válido en ' + a.articulo_id });
      }
      const editado = Math.abs(pedido - porDefecto) > 0.001;
      if (editado && !puede) {
        return res.status(403).json({
          error: 'No tienes permiso para cambiar el descuento',
          code: 'SIN_PERMISO_DTO',
          articulo: a.articulo_id,
        });
      }
      preparadas.push({ a, dto: pedido, editado });
    }

    // --- Guardar ---
    await cli.query('BEGIN');
    const oferta = await cli.query(
      // El correo se lee de la tabla `users` y no del JWT: el token puede llevar
      // hasta una hora emitido y el correo haber cambiado desde entonces.
      `INSERT INTO offers (user_id, seccion_id, vendedor_id, vendedor_nombre, emisor_email,
                           cliente_id, local_id, cliente_nombre, cliente_poblacion, es_nuevo)
       VALUES ($1,$2,$3,$4,(SELECT email FROM users WHERE id = $1),$5,$6,$7,$8,$9)
       RETURNING id, created_at`,
      [req.usuario.id, req.planta.seccion_id, datosCliente.vendedor_id,
        datosCliente.vendedor_nombre, datosCliente.cliente_id, datosCliente.local_id,
        datosCliente.nombre, datosCliente.poblacion, datosCliente.es_nuevo]
    );
    const offerId = oferta.rows[0].id;

    let orden = 0;
    for (const p of preparadas) {
      const calc = calcularLinea({
        unidad: p.a.unidad, precio_vta: p.a.precio_vta, peso_neto: p.a.peso_neto,
        unidades_caja: p.a.unidades_caja, dto_pct: p.dto,
      });
      await cli.query(
        `INSERT INTO offer_items (offer_id, articulo_id, descripcion, unidad, peso_neto,
                                  unidades_caja, precio_tarifa, precio_unidad, dto_pct,
                                  dto_editado, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        // precio_tarifa es el precio_vta del ERP tal cual (por kilo si la unidad
        // es K); precio_unidad es el derivado. Se guardan los dos: el primero
        // para poder reproducir las seis cifras del documento, el segundo porque
        // es lo que se consulta al listar ofertas.
        [offerId, p.a.articulo_id, p.a.descripcion, p.a.unidad, p.a.peso_neto,
          p.a.unidades_caja, p.a.precio_vta, calc.precio_unidad, p.dto, p.editado, orden++]
      );
    }
    await cli.query('COMMIT');

    res.status(201).json(await montarOferta(offerId, req.usuario));
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error('Error al guardar la oferta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    cli.release();
  }
};

/**
 * Reconstruye una oferta guardada con sus lineas y sus importes.
 *
 * Los importes se derivan de lo GUARDADO (precio_unidad y dto_pct congelados),
 * no de la replica: una oferta de hace tres meses tiene que verse con los
 * precios de entonces.
 */
const montarOferta = async (id, usuario) => {
  const { rows } = await pool.query(
    `SELECT o.*, p.name AS planta_nombre, p.logo_path,
            u.full_name AS usuario_nombre, u.email AS usuario_email
       FROM offers o
       LEFT JOIN plants p ON p.code = o.seccion_id
       LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = $1`, [id]);
  const o = rows[0];
  if (!o) return null;

  // Un comercial solo ve las suyas; el admin, todas.
  if (usuario && usuario.role !== 'admin' && o.user_id !== usuario.id) return 'ajena';

  const items = await pool.query(
    'SELECT * FROM offer_items WHERE offer_id = $1 ORDER BY orden, id', [id]);

  return {
    id: o.id,
    created_at: o.created_at,
    seccion_id: o.seccion_id,
    planta_nombre: o.planta_nombre,
    logo_path: o.logo_path,
    vendedor_id: o.vendedor_id,
    // Solo hay nombre si el usuario tenia ficha de vendedor cuando emitio el
    // listado. Si no la tenia, la cabecera del documento lleva unicamente el
    // correo, sin nombre.
    vendedor_nombre: o.vendedor_nombre,
    // El correo de quien lo emitio. El coalesce es para las ofertas guardadas
    // antes de que existiera la columna.
    emisor_email: o.emisor_email || o.usuario_email,
    usuario_nombre: o.usuario_nombre,
    cliente_id: o.cliente_id,
    local_id: o.local_id,
    cliente_nombre: o.cliente_nombre,
    cliente_poblacion: o.cliente_poblacion,
    es_nuevo: o.es_nuevo,
    precios_de: await servicio.frescuraDePrecios(),
    lineas: items.rows.map((l) => ({
      articulo_id: l.articulo_id,
      descripcion: l.descripcion,
      unidad: l.unidad,
      unidades_caja: l.unidades_caja,
      dto_editado: l.dto_editado,
      // Se reproduce desde la TARIFA guardada, no desde el precio de unidad:
      // asi el precio por kilo sale exacto en vez de tener que dividir, y las
      // seis cifras salen identicas a las del dia que se emitio.
      ...calcularLinea({
        unidad: l.unidad,
        precio_vta: l.precio_tarifa !== null ? l.precio_tarifa : l.precio_unidad,
        peso_neto: l.peso_neto,
        unidades_caja: l.unidades_caja,
        dto_pct: l.dto_pct,
      }),
    })),
  };
};

/** GET /api/offers/:id */
const obtener = async (req, res) => {
  try {
    const o = await montarOferta(Number(req.params.id), req.usuario);
    if (!o) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (o === 'ajena') return res.status(403).json({ error: 'Esa oferta no es tuya' });
    res.json(o);
  } catch (err) {
    console.error('Error al obtener la oferta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/** GET /api/offers/:id/pdf */
const pdf = async (req, res) => {
  try {
    const o = await montarOferta(Number(req.params.id), req.usuario);
    if (!o) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (o === 'ajena') return res.status(403).json({ error: 'Esa oferta no es tuya' });

    const buffer = await generarPdfOferta(o);
    // inline y no attachment: en el movil se quiere previsualizar y compartir
    // con el menu nativo, no descargar a la carpeta de descargas.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      'inline; filename="oferta-' + o.id + '.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error('Error al generar el PDF de la oferta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/offers/:id/enviar   { email }
 * Manda la oferta por correo con el PDF adjunto.
 */
const enviar = async (req, res) => {
  try {
    const o = await montarOferta(Number(req.params.id), req.usuario);
    if (!o) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (o === 'ajena') return res.status(403).json({ error: 'Esa oferta no es tuya' });

    const email = String(req.body?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Dirección de correo no válida' });
    }

    const buffer = await generarPdfOferta(o);
    await enviarEmailOferta(email, o, buffer);
    res.json({ enviado: true, email });
  } catch (err) {
    console.error('Error al enviar la oferta:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
};

/**
 * GET /api/offers  — listado para administracion.
 *
 * Solo admin. Un comercial no necesita un listado global: ve la que acaba de
 * hacer y punto. Paginado con OFFSET, como el resto de la app.
 */
const listar = async (req, res) => {
  try {
    const { seccion, vendedor, cliente, desde, hasta, usuario } = req.query;
    const porPagina = Math.min(Math.max(Number(req.query.por_pagina) || 25, 1), 100);
    const pagina = Math.max(Number(req.query.pagina) || 1, 1);

    const cond = ['true'];
    const params = [];
    const nuevo = (v) => { params.push(v); return '$' + params.length; };

    if (seccion) cond.push('o.seccion_id = ' + nuevo(seccion));
    if (vendedor) cond.push('o.vendedor_id = ' + nuevo(vendedor));
    if (usuario) cond.push('o.user_id = ' + nuevo(Number(usuario)));
    if (cliente) {
      // Por nombre o por codigo con el mismo campo: el admin no tiene por que
      // saber si lo que le han dado es un codigo o un nombre.
      const p = nuevo('%' + cliente + '%');
      cond.push('(o.cliente_nombre ILIKE ' + p + ' OR o.cliente_id ILIKE ' + p + ')');
    }
    if (desde) cond.push('o.created_at >= ' + nuevo(desde));
    // Al filtro "hasta" se le suma un dia: quien escribe una fecha espera que
    // ese dia entre, no que se corte a las 00:00.
    if (hasta) cond.push("o.created_at < (" + nuevo(hasta) + ")::date + INTERVAL '1 day'");

    const where = 'WHERE ' + cond.join(' AND ');

    const total = await pool.query('SELECT count(*)::int AS n FROM offers o ' + where, params);
    params.push(porPagina, (pagina - 1) * porPagina);

    const { rows } = await pool.query(
      `SELECT o.id, o.created_at, o.seccion_id, o.vendedor_nombre,
              o.cliente_id, o.cliente_nombre, o.cliente_poblacion, o.es_nuevo,
              p.name AS planta_nombre,
              u.full_name AS usuario_nombre, u.username,
              count(i.id)::int AS articulos,
              count(*) FILTER (WHERE i.dto_editado)::int AS dtos_editados
         FROM offers o
         LEFT JOIN plants p ON p.code = o.seccion_id
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN offer_items i ON i.offer_id = o.id
         ${where}
        GROUP BY o.id, p.name, u.full_name, u.username
        ORDER BY o.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total: total.rows[0].n, pagina, por_pagina: porPagina, ofertas: rows });
  } catch (err) {
    console.error('Error al listar ofertas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  contexto, exigirPlanta, rutas, clientes, filtros, articulos,
  crear, obtener, pdf, enviar, listar,
};
