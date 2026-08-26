// Calculo de precios de una linea de oferta.
//
// Vive aparte porque lo usan tres sitios y tienen que coincidir exactamente: el
// catalogo (para pintar la linea), el guardado de la oferta y el PDF. Si el PDF
// calculase por su cuenta, un dia el papel diria un precio y la pantalla otro.
//
// El frontend recalcula al vuelo cuando el comercial cambia el descuento, pero
// el numero que vale es el que sale de aqui: al guardar se almacenan
// `precio_unidad` y `dto_pct`, y todo lo demas se deriva. Asi la oferta impresa
// hace tres meses se puede reproducir clavada.

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
 * Precios de una linea.
 *
 * Cuando la unidad es K, `precio_vta` del ERP es el precio POR KILO, y cada
 * unidad pesa `peso_neto`: un jamon de 7,5 kg a 26,95 el kilo son 202,13 la
 * pieza. Cuando es U, `precio_vta` ya es el precio de la unidad.
 *
 * CADA PASO SE REDONDEA ANTES DE ALIMENTAR AL SIGUIENTE, y es deliberado:
 *
 *   precio_unidad        = redondeo(tarifa x peso)
 *   precio_final_unidad  = redondeo(precio_unidad x (1 - dto))
 *   precio_final_caja    = redondeo(precio_final_unidad x unidades)
 *
 * Encadenarlo asi da hasta un centimo de diferencia frente a calcularlo todo
 * con precision plena, y aun asi es lo correcto aqui: el documento se entrega
 * en mano y el cliente lo comprueba con la calculadora del movil. Si pone
 * "2,87 €" y "5%" y luego "2,72 €", el cliente hace 2,87 x 0,95 = 2,73 y cree
 * que la aplicacion se equivoca. Que las cuentas del papel salgan vale mas que
 * el ultimo centimo de precision interna.
 *
 * @param {object} l  { unidad, precio_vta, peso_neto, unidades_caja, dto_pct }
 */
const calcularLinea = (l) => {
  const kilo = esKilo(l.unidad);
  const precioVta = Number(l.precio_vta) || 0;
  const peso = Number(l.peso_neto) || 0;
  const unidadesCaja = Number(l.unidades_caja) || 0;
  const dto = Number(l.dto_pct) || 0;

  // Un articulo de kilos sin peso daria 0: se deja el precio por kilo como
  // precio de unidad y se marca, para que la pantalla pueda avisar en vez de
  // ensenar un cero silencioso. Hoy no pasa en ningun articulo vendible.
  const sinPeso = kilo && peso <= 0;
  // El precio de una unidad, ya redondeado: es lo que se ensena y de lo que
  // cuelga todo lo demas.
  const precioUnidad = centimos((kilo && !sinPeso) ? precioVta * peso : precioVta);

  const finalUnidad = centimos(precioUnidad * (1 - dto / 100));
  const finalCaja = unidadesCaja > 0 ? centimos(finalUnidad * unidadesCaja) : null;

  return {
    es_kilo: kilo,
    // Lo que hay en el ERP, SIN redondear: por kilo si es K, por unidad si es U.
    // No se pasa por centimos() a proposito. El bacon esta a 8,1568 el kilo; si
    // se mostrase 8,16 junto a un precio de unidad de 26,10, la multiplicacion
    // por 3,2 kg no cuadraria en el papel. Que redondee quien lo pinte.
    precio_tarifa: precioVta,
    // El precio de una unidad antes del descuento (ya multiplicado por el peso).
    precio_unidad: precioUnidad,
    precio_final_unidad: finalUnidad,
    precio_final_caja: finalCaja,
    dto_pct: dto,
    peso_neto: kilo ? peso : null,
    aviso: sinPeso ? 'Artículo en kilos sin peso definido' : null,
  };
};

module.exports = { calcularLinea, esKilo, centimos };
