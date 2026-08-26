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

/** Un cliente de alta. Se usa en todas las consultas de clientes. */
const CLIENTE_DE_ALTA = 'c.activo AND c.estado = false';

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

/**
 * Los datos del cliente que se ensenan. cli_env manda y, si viene vacio, se
 * cae a clientes. No es un caso raro: en cli_env el domicilio esta vacio en
 * 34.514 de 36.327 filas y la poblacion en 34.520, asi que el camino normal es
 * precisamente el de respaldo. El `nombre` de cli_env, en cambio, nunca falta.
 */
const CAMPOS_CLIENTE = `
  c.cliente_id,
  e.local_id,
  coalesce(nullif(trim(e.nombre), ''), c.nombre)          AS nombre,
  coalesce(nullif(trim(e.poblacion), ''), c.poblacion)    AS poblacion,
  coalesce(nullif(trim(e.domicilio), ''), c.domicilio)    AS domicilio,
  cr.ruta_venta_id                                         AS ruta_id,
  cr.period_semana                                         AS dias_visita,
  v.vendedor_id,
  v.nombre                                                 AS vendedor_nombre,
  'Ruta de ' || v.nombre                                   AS ruta
`;

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

/** Comprueba que la planta pedida es una de las del usuario. */
const plantaPermitida = async (usuarioId, seccionId) => {
  const plantas = await plantasDelUsuario(usuarioId);
  return plantas.find((p) => p.seccion_id === seccionId) || null;
};

module.exports = {
  plantasDelUsuario,
  plantaPermitida,
  CADENA_CLIENTE,
  CAMPOS_CLIENTE,
  CLIENTE_DE_ALTA,
};
