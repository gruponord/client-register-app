// Calculo de precios de una linea del listado.
//
// Vive aparte porque lo usan tres sitios y tienen que coincidir exactamente: el
// catalogo (para pintar la linea), el guardado de la oferta y el PDF. Si el PDF
// calculase por su cuenta, un dia el papel diria un precio y la pantalla otro.
//
// El frontend recalcula al vuelo cuando el comercial cambia el descuento, pero
// el numero que vale es el que sale de aqui: al guardar se almacenan
// `precio_unidad` y `dto_pct`, y todo lo demas se deriva. Asi el listado impreso
// hace tres meses se puede reproducir clavado.

/**
 * Redondeo a centimos.
 *
 * El epsilon evita el clasico 1.005 -> 1.00 de la coma flotante binaria. Con
 * importes de este tamano no hace falta aritmetica decimal exacta, pero si hace
 * falta que 8,155 no se convierta en 8,15 unas veces y en 8,16 otras.
 */
const centimos = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Un articulo se factura en kilos si su unidad principal lleva una K.
 *
 * Se compara sin distinguir mayusculas y por contenido, no por igualdad, porque
 * el maestro trae 'K' (284 articulos), 'k' en minuscula (3) y 'UK' (3). Ninguno
 * de esos 6 raros esta hoy en un catalogo vendible, pero si alguno entra, es
 * mejor que se trate como kilos y avise que se cuele como unidad y el precio se
 * lea mal por un factor de tres o de siete.
 */
const esKilo = (unidad) => /K/i.test(String(unidad || ''));

/**
 * Precios de una linea, en las tres presentaciones que salen en el documento:
 * por kilo (solo si se factura asi), por unidad y por caja.
 *
 * Cuando la unidad es K, `precio_vta` del ERP es el precio POR KILO y cada
 * unidad pesa `peso_neto`: un jamon de 5,5 kg a 26,95 el kilo son 148,23 la
 * pieza. Cuando es U, `precio_vta` ya es el precio de la unidad.
 *
 * CADA IMPORTE SE DERIVA DEL ANTERIOR YA REDONDEADO:
 *
 *   precio_kilo         = redondeo(tarifa)                    (solo si es K)
 *   precio_unidad       = redondeo(precio_kilo x peso)   o    redondeo(tarifa)
 *   precio_caja         = redondeo(precio_unidad x unidades)
 *   final_unidad        = redondeo(precio_unidad x (1 - dto))
 *   final_caja          = redondeo(final_unidad x unidades)
 *   final_kilo          = redondeo(precio_kilo x (1 - dto))
 *
 * Se pierde hasta un centimo frente a calcularlo todo con precision plena, y aun
 * asi es lo correcto: el documento se entrega en mano y el cliente lo comprueba
 * con la calculadora del movil. Si pone "2,87 €" y "5 %" y luego "2,72 €", el
 * cliente hace 2,87 x 0,95 = 2,73 y cree que la aplicacion se equivoca.
 *
 * Con tres presentaciones y dos centimos de resolucion no se puede hacer que
 * TODAS las relaciones cuadren a la vez. Se garantizan las que el cliente va a
 * comprobar de verdad: unidad = kilo x peso, caja = unidad x unidades, y final =
 * precio x (1 - dto) en las tres filas. La que puede bailar un centimo es
 * final_unidad frente a final_kilo x peso, que nadie multiplica.
 *
 * @param {object} l  { unidad, precio_vta, peso_neto, unidades_caja, dto_pct }
 */
const calcularLinea = (l) => {
  const kilo = esKilo(l.unidad);
  const precioVta = Number(l.precio_vta) || 0;
  const peso = Number(l.peso_neto) || 0;
  const unidadesCaja = Number(l.unidades_caja) || 0;
  const dto = Number(l.dto_pct) || 0;
  const factor = 1 - dto / 100;

  // Un articulo de kilos sin peso daria 0: se deja el precio por kilo como
  // precio de unidad y se marca, para que la pantalla pueda avisar en vez de
  // ensenar un cero silencioso. Hoy no pasa en ningun articulo vendible.
  const sinPeso = kilo && peso <= 0;
  const conPeso = kilo && !sinPeso;

  // El precio por kilo es la base cuando se factura asi, y va redondeado porque
  // ahora SALE IMPRESO: si se mostrase 8,1568 como 8,16 pero la unidad se
  // calculase con el valor exacto, el cliente que multiplica por 3,2 kg no
  // obtendria el precio de unidad que pone al lado.
  const precioKilo = kilo ? centimos(precioVta) : null;
  const precioUnidad = conPeso ? centimos(precioKilo * peso) : centimos(precioVta);
  const precioCaja = unidadesCaja > 0 ? centimos(precioUnidad * unidadesCaja) : null;

  const finalUnidad = centimos(precioUnidad * factor);
  const finalCaja = unidadesCaja > 0 ? centimos(finalUnidad * unidadesCaja) : null;
  const finalKilo = kilo ? centimos(precioKilo * factor) : null;

  // Que lineas de precio merece la pena ensenar.
  //
  // Con tres presentaciones, algunas repiten el mismo numero y solo hacen ruido:
  //
  //   unidades_caja = 1  ->  el precio de caja ES el de unidad
  //   peso_neto = 1 kg   ->  el precio de unidad ES el de kilo
  //   las dos cosas      ->  los tres son el mismo, y solo se ensena el de kilo
  //
  // Las banderas van en la respuesta y no en cada pantalla para que el PDF, la
  // pantalla del comercial y el detalle de administracion decidan lo mismo. Si
  // cada uno lo resolviese por su cuenta, el papel y la pantalla acabarian
  // ensenando distinto numero de lineas.
  const mostrarCaja = unidadesCaja > 1;
  const mostrarUnidad = !kilo || peso !== 1;

  // El ORDEN en que se pintan los importes, y cual es el principal.
  //
  // Cuando el articulo se factura en kilos, el precio de referencia es el del
  // kilo: es el que negocia el comercial y el que el cliente compara con otro
  // proveedor. Va primero y en grande, y despues el de unidad y el de caja.
  // Cuando se vende por unidades, el de unidad es el principal.
  //
  // Se devuelve como lista y no como banderas sueltas porque lo consumen tres
  // sitios -- el PDF, la pantalla del comercial y el detalle de administracion --
  // y el orden tiene que ser el mismo en los tres. Cada entrada dice de que
  // campo sale el importe: precio_<campo> para la tarifa y
  // precio_final_<campo> para el final.
  const presentacion = [];
  if (kilo) presentacion.push({ campo: 'kilo', sufijo: '/kg', principal: true });
  if (mostrarUnidad) presentacion.push({ campo: 'unidad', sufijo: '/ud', principal: !kilo });
  if (mostrarCaja) presentacion.push({ campo: 'caja', sufijo: '/cj', principal: false });

  return {
    presentacion,
    es_kilo: kilo,
    peso_neto: kilo ? peso : null,
    unidades_caja: unidadesCaja || null,
    dto_pct: dto,

    mostrar_unidad: mostrarUnidad,
    mostrar_caja: mostrarCaja,
    mostrar_kilo: kilo,

    precio_kilo: precioKilo,
    precio_unidad: precioUnidad,
    precio_caja: precioCaja,

    precio_final_kilo: finalKilo,
    precio_final_unidad: finalUnidad,
    precio_final_caja: finalCaja,

    aviso: sinPeso ? 'Artículo en kilos sin peso definido' : null,
  };
};

module.exports = { calcularLinea, esKilo, centimos };
