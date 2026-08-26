// Consultas de la utilidad de ofertas contra la replica del ERP.
//
// Todo lo que sale de aqui LEE de `erp` y nunca escribe: ese esquema lo
// sobrescribe el agente del sincronizador (ver Sincronizador GNP/CONTRATO-SYNC.md).
//
// Los filtros del ERP vienen dados en su convencion de booleano de Access
// (-1 / 0), y el agente ya los normalizo a true / false. La traduccion, que es
// donde es facil equivocarse:
//
//   vendedores    baja = 0 AND activoreal = -1   ->  baja = false AND activoreal = true
//   clientes      estado = 0  ("de alta")        ->  estado = false     <-- ojo, invertido
//   articulos_sec status = 0 AND vta_tpv = -1     ->  status = 0 AND vta_tpv = true
//                                                    (status es entero: -1, 0, 3)
const pool = require('../config/db');
const { calcularLinea } = require('./precios.service');

/**
 * Dias de visita de la ruta, en `cltes_rutas_vta.period_semana`.
 *
 * Un cliente puede tener varios, y entonces llegan separados por comas:
 * "1,4" es lunes y jueves, "1,2,3,4,5" toda la semana laboral. Por eso las
 * consultas parten la cadena en vez de comparar el valor entero.
 */
const DIAS_VISITA = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
  8: 'Especiales 1',
  9: 'Especiales 2',
};

/** "1,4" -> ['Lunes', 'Jueves']. Un valor desconocido se devuelve tal cual. */
const etiquetasDias = (periodSemana) => {
  if (!periodSemana) return [];
  return String(periodSemana)
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '' && d !== '0')
    .map((d) => DIAS_VISITA[d] || d);
};

/**
 * La cadena cliente -> local -> ruta -> vendedor.
 *
 * `seccion_id` se une "raro" a proposito y no es opcional: ni cli_env ni
 * cltes_rutas_vta la llevan, asi que viaja de clientes.secpref_id directamente
 * a rutas_venta.seccion_id, por encima de las dos tablas del medio. Sin ella,
 * 15.839 de 36.069 locales casan con mas de una ruta (hay identificadores de
 * ruta que existen en las cuatro secciones) y el vendedor veria el mismo
 * cliente repetido.
 *
 * Y la columna de la ruta cambia de nombre al cruzar: `ruta_venta_id` en
 * cltes_rutas_vta, `ruta_ventas_id` en rutas_venta.
 *
 * Los JOIN a ruta y vendedor son INNER y no LEFT porque para que un
 * cliente-local sea seleccionable tiene que tener un vendedor de alta y activo
 * real. Eso deja fuera 741 locales en Zubillaga y 680 en Ayestaran.
 *
 * No duplica filas: origen_id = '0' fija una sola fila de cltes_rutas_vta por
 * local, y los dos JOIN siguientes van contra claves primarias completas. Un
 * cliente con varios locales si sale varias veces, que es lo correcto porque
 * cada local se ofrece por separado.
 */
const CADENA_CLIENTE = `
  FROM erp.clientes c
  JOIN erp.cli_env e
    ON e.empresa_id = c.empresa_id AND e.cliente_id = c.cliente_id AND e.activo
  JOIN erp.cltes_rutas_vta cr
    ON cr.empresa_id = e.empresa_id AND cr.cliente_id = e.cliente_id
   AND cr.local_id = e.local_id AND cr.origen_id = '0' AND cr.activo
  JOIN erp.rutas_venta r
    ON r.empresa_id = cr.empresa_id AND r.ruta_ventas_id = cr.ruta_venta_id
   AND r.seccion_id = c.secpref_id AND r.activo
  JOIN erp.vendedores v
    ON v.empresa_id = r.empresa_id AND v.seccion_id = r.seccion_id
   AND v.vendedor_id = r.vendedor_id AND v.activo
   AND v.baja = false AND v.activoreal = true
`;

/** Cliente de alta. En el ERP es `estado = 0`, aqui false. */
const SOLO_DE_ALTA = "c.activo AND c.estado = false AND c.secpref_id = $1";

/**
 * cli_env manda y, si viene vacio, se cae a clientes. No es un caso raro: en
 * cli_env el domicilio esta vacio en 34.514 de 36.327 filas y la poblacion en
 * 34.520, asi que el camino de respaldo es el normal. El `nombre` de cli_env,
 * en cambio, nunca falta.
 */
const NOMBRE = "coalesce(nullif(trim(e.nombre), ''), c.nombre)";
const POBLACION = "coalesce(nullif(trim(e.poblacion), ''), c.poblacion)";
const DOMICILIO = "coalesce(nullif(trim(e.domicilio), ''), c.domicilio)";

/**
 * Que vendedor y que planta es el usuario que entra.
 *
 * Se resuelve emparejando el correo de la app con el del vendedor en el ERP.
 * Devuelve una fila por planta: un vendedor normal tiene una, pero un gestor o
 * jefe de ventas ve varias y entonces la interfaz tiene que preguntar con cual
 * quiere trabajar. Comprobado: 40 de 44 usuarios emparejan, y al menos uno
 * (Benjami Puente) es vendedor en dos secciones a la vez.
 */
const plantasDelUsuario = async (usuarioId) => {
  const { rows } = await pool.query(
    `SELECT v.seccion_id,
            v.vendedor_id,
            v.nombre       AS vendedor_nombre,
            p.id           AS planta_id,
            p.name         AS planta_nombre,
            p.logo_path
       FROM users u
       JOIN erp.vendedores v
         ON lower(trim(v.email)) = lower(trim(u.email))
        AND v.activo AND v.baja = false AND v.activoreal = true
       LEFT JOIN plants p ON p.code = v.seccion_id AND p.active
      WHERE u.id = $1 AND u.active
      ORDER BY p.name NULLS LAST, v.seccion_id`,
    [usuarioId]
  );
  return rows;
};

/**
 * Todas las plantas con las que se puede trabajar, para el usuario que no tiene
 * ficha de vendedor en el ERP.
 *
 * Se cruzan las plantas de la app con las secciones que existen de verdad en la
 * replica: una planta de la app sin seccion en el ERP daria un catalogo vacio y
 * una cartera vacia, y es mejor no ofrecerla que ofrecer una via muerta. Hoy eso
 * descarta las tres plantas de prueba (PL001, PL002, PL003).
 */
const plantasTodas = async () => {
  const { rows } = await pool.query(
    `SELECT s.seccion_id,
            NULL::text AS vendedor_id,
            NULL::text AS vendedor_nombre,
            p.id       AS planta_id,
            p.name     AS planta_nombre,
            p.logo_path
       FROM erp.secciones s
       JOIN plants p ON p.code = s.seccion_id AND p.active
      WHERE s.activo
      ORDER BY p.name`
  );
  return rows;
};

/**
 * Con que plantas puede trabajar este usuario.
 *
 * Lo normal es que tenga ficha de vendedor y se resuelva por correo. Si no la
 * tiene -- un jefe, un administrativo, alguien recien dado de alta -- en vez de
 * cerrarle la utilidad se le ofrecen las cuatro plantas y elige. Entonces
 * trabaja igual, solo que la oferta se guarda sin vendedor del ERP.
 *
 * Es la UNICA fuente de la lista: la autorizacion de plantaPermitida sale de
 * aqui tambien, para que nunca se ofrezca una planta que luego se rechace.
 */
const plantasDisponibles = async (usuarioId) => {
  const propias = await plantasDelUsuario(usuarioId);
  if (propias.length) return { vinculado: true, plantas: propias };
  return { vinculado: false, plantas: await plantasTodas() };
};

/** Comprueba que la planta pedida es una de las que se le ofrecieron. */
const plantaPermitida = async (usuarioId, seccionId) => {
  const { plantas } = await plantasDisponibles(usuarioId);
  return plantas.find((p) => p.seccion_id === seccionId) || null;
};

/**
 * Las rutas de una planta, para el desplegable de busqueda, AGRUPADAS POR
 * VENDEDOR.
 *
 * Se etiquetan con "Ruta de " + el nombre del vendedor y no con la descripcion
 * de rutas_venta, que es como se organizaban antes y ya no dice nada al
 * comercial. Pero un vendedor tiene varias rutas -- en Zubillaga hay 43 rutas
 * para 14 vendedores, y Galder Agüero solo tiene 6 -- asi que listarlas una a
 * una repetiria su nombre seis veces sin forma de distinguirlas. Se agrupan por
 * vendedor: 14 entradas caben en un movil, 43 no.
 *
 * Cada entrada lleva sus ruta_id por si la interfaz quiere bajar a ese nivel.
 * Solo salen los que tienen algun cliente seleccionable: una entrada vacia en
 * el desplegable es una via muerta.
 */
const rutasDeLaPlanta = async (seccionId) => {
  const { rows } = await pool.query(
    `SELECT v.vendedor_id,
            v.nombre                                            AS vendedor_nombre,
            'Ruta de ' || v.nombre                              AS etiqueta,
            array_agg(DISTINCT cr.ruta_venta_id ORDER BY cr.ruta_venta_id) AS rutas,
            count(DISTINCT c.cliente_id || '|' || e.local_id)::int AS clientes
       ${CADENA_CLIENTE}
      WHERE ${SOLO_DE_ALTA}
      GROUP BY 1, 2
      ORDER BY v.nombre`,
    [seccionId]
  );
  return rows;
};

/**
 * Busqueda de clientes de una planta. Los cuatro criterios se combinan: el
 * comercial puede acotar por ruta y dia, y ademas escribir parte del nombre.
 *
 * @param {object} f  { seccion, ruta, dia, poblacion, nombre, codigo, pagina, porPagina }
 */
const buscarClientes = async (f) => {
  const cond = [SOLO_DE_ALTA];
  const params = [f.seccion];
  const nuevo = (valor) => { params.push(valor); return '$' + params.length; };

  // Por vendedor (lo normal, porque es lo que ve el comercial en el
  // desplegable) o por una ruta concreta, si alguna pantalla lo necesita.
  if (f.vendedor) cond.push(`v.vendedor_id = ${nuevo(f.vendedor)}`);
  if (f.ruta) cond.push(`cr.ruta_venta_id = ${nuevo(f.ruta)}`);

  // period_semana puede traer varios dias separados por comas ("1,4"), asi que
  // se compara contra los elementos y no contra la cadena entera.
  if (f.dia) {
    cond.push(`${nuevo(String(f.dia))} = ANY (string_to_array(replace(cr.period_semana, ' ', ''), ','))`);
  }

  if (f.poblacion) cond.push(`${POBLACION} ILIKE ${nuevo('%' + f.poblacion + '%')}`);
  if (f.nombre) cond.push(`${NOMBRE} ILIKE ${nuevo('%' + f.nombre + '%')}`);
  // El codigo se busca por principio de cadena: el comercial teclea los
  // primeros digitos, no un fragmento del medio.
  if (f.codigo) cond.push(`c.cliente_id ILIKE ${nuevo(f.codigo + '%')}`);

  const where = 'WHERE ' + cond.join('\n        AND ');

  const total = await pool.query(
    `SELECT count(*)::int AS n ${CADENA_CLIENTE} ${where}`, params
  );

  const porPagina = Math.min(Math.max(Number(f.porPagina) || 25, 1), 100);
  const pagina = Math.max(Number(f.pagina) || 1, 1);
  params.push(porPagina, (pagina - 1) * porPagina);

  const { rows } = await pool.query(
    `SELECT c.cliente_id,
            e.local_id,
            ${NOMBRE}    AS nombre,
            ${POBLACION} AS poblacion,
            ${DOMICILIO} AS domicilio,
            c.nif,
            cr.ruta_venta_id       AS ruta_id,
            cr.period_semana       AS dias_codigo,
            v.vendedor_id,
            v.nombre               AS vendedor_nombre
       ${CADENA_CLIENTE}
       ${where}
      ORDER BY nombre, e.local_id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: total.rows[0].n,
    pagina,
    por_pagina: porPagina,
    clientes: rows.map((r) => ({
      ...r,
      ruta: 'Ruta de ' + r.vendedor_nombre,
      dias_visita: etiquetasDias(r.dias_codigo),
    })),
  };
};

// ---------------------------------------------------------------------------
// Catalogo de articulos
// ---------------------------------------------------------------------------

/**
 * Un articulo esta a la venta en una planta si su fila de articulos_sec pasa el
 * filtro del ERP: `status = 0 AND vta_tpv = -1`, que aqui es `status = 0 AND
 * vta_tpv = true` porque status es entero (-1, 0, 3) y vta_tpv booleano.
 *
 * Se exige ademas que tenga precio. De los 1.184 que pasan el filtro en
 * Zubillaga, 208 tienen precio_vta a cero: son envases, palets, jaulas y vasos
 * ("PALET LPR", "ENVASE PEPSI KAS TANQUETA"). Ofrecerlos pondria un 0,00 € en
 * un documento que se entrega en mano, y eso es peor que no poder ofrecerlos.
 * Quitar esta condicion es la unica linea que hay que tocar si se decide lo
 * contrario.
 */
const ARTICULO_VENDIBLE = `
  s.activo AND s.status = 0 AND s.vta_tpv = true
  AND s.precio_vta IS NOT NULL AND s.precio_vta > 0
  AND coalesce(a.quitar_catalogo, false) = false
`;

const CATALOGO = `
  FROM erp.articulos_sec s
  JOIN erp.articulos a
    ON a.empresa_id = s.empresa_id AND a.articulo_id = s.articulo_id AND a.activo
  LEFT JOIN erp.familias f
    ON f.empresa_id = a.empresa_id AND f.familia_id = a.familia_id AND f.activo
  LEFT JOIN erp.proveedores pr
    ON pr.empresa_id = a.empresa_id AND pr.proveedor_id = a.proveedor_id AND pr.activo
`;

/**
 * Familias y proveedores del catalogo de una planta, para los desplegables.
 *
 * Los dos en la misma peticion a proposito: esto se abre en un movil y son dos
 * viajes que no hacen falta. Solo salen los que tienen algun articulo vendible
 * --en Zubillaga 35 familias y 100 proveedores-- porque una entrada que no
 * filtra nada solo estorba.
 */
const filtrosDelCatalogo = async (seccionId) => {
  const [familias, proveedores] = await Promise.all([
    pool.query(
      `SELECT a.familia_id AS id,
              coalesce(nullif(trim(f.descripcion), ''), a.familia_id) AS nombre,
              count(*)::int AS articulos
         ${CATALOGO}
        WHERE ${ARTICULO_VENDIBLE} AND s.seccion_id = $1 AND a.familia_id IS NOT NULL
        GROUP BY 1, 2 ORDER BY 2`,
      [seccionId]
    ),
    pool.query(
      `SELECT a.proveedor_id AS id,
              coalesce(nullif(trim(pr.xnombre), ''), a.proveedor_id) AS nombre,
              count(*)::int AS articulos
         ${CATALOGO}
        WHERE ${ARTICULO_VENDIBLE} AND s.seccion_id = $1 AND a.proveedor_id IS NOT NULL
        GROUP BY 1, 2 ORDER BY 2`,
      [seccionId]
    ),
  ]);
  return { familias: familias.rows, proveedores: proveedores.rows };
};

/**
 * Busqueda de articulos del catalogo de una planta.
 *
 * Los cuatro filtros del enunciado --familia, codigo, descripcion y proveedor--
 * se combinan. Aqui SI se permite buscar sin ningun criterio, al contrario que
 * con los clientes: son unos 1.000 articulos por planta y el comercial espera
 * poder hojear el catalogo entero como en una tienda, paginando.
 *
 * Cada fila viene con los precios ya calculados para el descuento por defecto
 * del ERP. El frontend los recalcula al vuelo si el comercial cambia el
 * descuento, con la misma formula de precios.service.js.
 */
const buscarArticulos = async (f) => {
  const cond = [ARTICULO_VENDIBLE, 's.seccion_id = $1'];
  const params = [f.seccion];
  const nuevo = (valor) => { params.push(valor); return '$' + params.length; };

  if (f.familia) cond.push(`a.familia_id = ${nuevo(f.familia)}`);
  if (f.proveedor) cond.push(`a.proveedor_id = ${nuevo(f.proveedor)}`);
  // El codigo por principio de cadena: el comercial teclea los primeros digitos.
  if (f.codigo) cond.push(`a.articulo_id ILIKE ${nuevo(f.codigo + '%')}`);
  // La descripcion por fragmento, que es como se busca en una tienda.
  if (f.descripcion) cond.push(`a.descripcion ILIKE ${nuevo('%' + f.descripcion + '%')}`);

  const where = 'WHERE ' + cond.join('\n        AND ');

  const total = await pool.query(`SELECT count(*)::int AS n ${CATALOGO} ${where}`, params);

  const porPagina = Math.min(Math.max(Number(f.porPagina) || 25, 1), 100);
  const pagina = Math.max(Number(f.pagina) || 1, 1);
  params.push(porPagina, (pagina - 1) * porPagina);

  const { rows } = await pool.query(
    `SELECT a.articulo_id,
            a.descripcion,
            a.unidad_prin_id                                        AS unidad,
            a.peso_neto,
            a.unidades_agrup                                        AS unidades_caja,
            a.familia_id,
            coalesce(nullif(trim(f.descripcion), ''), a.familia_id) AS familia,
            a.proveedor_id,
            coalesce(nullif(trim(pr.xnombre), ''), a.proveedor_id)  AS proveedor,
            a.marca_id,
            s.precio_vta,
            coalesce(s.por_dto, 0)                                  AS por_dto,
            s.bajopedido                                            AS bajo_pedido,
            s.aliquidar                                             AS a_liquidar
       ${CATALOGO}
       ${where}
      ORDER BY a.descripcion
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    total: total.rows[0].n,
    pagina,
    por_pagina: porPagina,
    articulos: rows.map((r) => ({
      articulo_id: r.articulo_id,
      descripcion: r.descripcion,
      unidad: r.unidad,
      unidades_caja: r.unidades_caja,
      familia_id: r.familia_id,
      familia: r.familia,
      proveedor_id: r.proveedor_id,
      proveedor: r.proveedor,
      marca_id: r.marca_id,
      // a.foto_url existe (812 de 1.184 articulos en Z lo traen) pero no se
      // expone: el dato no esta bien informado todavia. Cuando lo este, es
      // anadirlo aqui y al SELECT.
      bajo_pedido: r.bajo_pedido === true,
      a_liquidar: r.a_liquidar === true,
      ...calcularLinea({
        unidad: r.unidad,
        precio_vta: r.precio_vta,
        peso_neto: r.peso_neto,
        unidades_caja: r.unidades_caja,
        dto_pct: r.por_dto,
      }),
    })),
  };
};


/**
 * Un cliente-local concreto de una planta.
 *
 * Se usa al guardar, y NO es un lujo: sin comprobarlo, una peticion manipulada
 * podria colgar cualquier cliente_id a la oferta, incluido uno de otra
 * delegacion. Pasa por la misma CADENA_CLIENTE que la busqueda, asi que si el
 * cliente no es seleccionable (de baja, sin ruta, sin vendedor activo) tampoco
 * se puede guardar una oferta contra el.
 */
const clienteConcreto = async (seccionId, clienteId, localId) => {
  const { rows } = await pool.query(
    `SELECT c.cliente_id,
            e.local_id,
            ${NOMBRE}    AS nombre,
            ${POBLACION} AS poblacion,
            v.vendedor_id,
            v.nombre     AS vendedor_nombre
       ${CADENA_CLIENTE}
      WHERE ${SOLO_DE_ALTA} AND c.cliente_id = $2 AND e.local_id = $3
      LIMIT 1`,
    [seccionId, clienteId, localId]
  );
  return rows[0] || null;
};

/**
 * Los articulos que se van a guardar, leidos del catalogo por su codigo.
 *
 * Se leen del ERP y no se aceptan del cliente: la peticion solo manda el codigo
 * y el descuento. Si aceptasemos el precio, cualquiera podria guardar una oferta
 * con el importe que quisiera.
 */
const articulosParaOferta = async (seccionId, ids) => {
  const { rows } = await pool.query(
    `SELECT a.articulo_id, a.descripcion, a.unidad_prin_id AS unidad,
            a.peso_neto, a.unidades_agrup AS unidades_caja,
            s.precio_vta, coalesce(s.por_dto, 0) AS por_dto
       ${CATALOGO}
      WHERE ${ARTICULO_VENDIBLE} AND s.seccion_id = $1 AND a.articulo_id = ANY($2)`,
    [seccionId, ids]
  );
  return rows;
};

/**
 * De cuando son los precios que se estan ofreciendo.
 *
 * Del dataset de articulos_sec en concreto, no del ultimo sync de cualquier
 * cosa: en el pie de una oferta tiene que ir la fecha de LOS PRECIOS.
 */
const frescuraDePrecios = async () => {
  const { rows } = await pool.query(
    "SELECT ultima_ejecucion FROM erp.datasets WHERE dataset = 'erp.articulos_sec'"
  );
  return rows[0]?.ultima_ejecucion || null;
};

module.exports = {
  DIAS_VISITA,
  etiquetasDias,
  plantasDelUsuario,
  plantasTodas,
  plantasDisponibles,
  plantaPermitida,
  rutasDeLaPlanta,
  buscarClientes,
  filtrosDelCatalogo,
  buscarArticulos,
  clienteConcreto,
  articulosParaOferta,
  frescuraDePrecios,
};
