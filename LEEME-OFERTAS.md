# Probar la utilidad "Listado de Precios" en local

Guía para levantar la utilidad en una máquina de desarrollo y verla funcionando.

## 1. Base de datos

```bash
cd backend
npm run migrate        # crea el esquema erp y las tablas offers / offer_items
```

La réplica del ERP la rellena el **Sincronizador GNP**, que en local no corre, así
que hay que meter datos a mano. Dos opciones:

### a) Muestra de datos reales (recomendada)

Da descripciones largas de verdad, precios con cuatro decimales y nombres con
tildes, que es lo único que sirve para juzgar si una pantalla se ve bien.

El fichero se genera **en el servidor** y no está en el repositorio (pesa 9 MB y
los clientes son datos personales). Para regenerarlo, en `/var/www/client-register-app/backend`:

```js
// exporta-muestra.js — saca 150 clientes por planta y el catálogo completo
// (ver el historial de esta utilidad para el script completo)
```

Y luego, en local:

```bash
node src/db/importarMuestraErp.js ruta/al/muestra-erp.json
```

El importador se niega a ejecutarse si la base ha recibido lotes del
sincronizador en los últimos 30 días: escribir en `erp` desde fuera del receptor
es justo lo que prohíbe el contrato.

> ⚠️ La muestra lleva nombres, NIF, domicilios y correos de clientes reales.
> Trata la base de desarrollo como lo que es: una copia de datos personales en un
> portátil. Bórrala cuando no la necesites.

### b) Datos inventados

Sin datos personales y sin depender del servidor. Menos realista, pero suficiente
para probar la mecánica:

```bash
npm run seed:ofertas
```

Crea 5 clientes, 2 vendedores, 12 artículos (uno de kilos, uno sin precio y uno
fuera de catálogo, para ver que esos dos no aparecen) y el usuario
`prueba.ofertas` / `Ofertas2026!`.

## 2. Usuario

Para entrar hace falta un usuario cuyo **correo coincida con el de un vendedor**
del ERP: así se resuelve la planta. Con la muestra real, los vendedores son de
verdad:

```sql
SELECT seccion_id, vendedor_id, nombre, email
  FROM erp.vendedores
 WHERE activo AND baja = false AND activoreal = true
 ORDER BY seccion_id, nombre;
```

Después, en la pantalla de admin (`/admin/usuarios`) hay que marcarle:

| Utilidad | Para qué |
|---|---|
| `Generador de Ofertas` | entrar en la utilidad |
| `Ofertas: editar descuento` | poder cambiar el % de descuento |

Sin la segunda, el descuento se ve pero no se edita.

Un usuario cuyo correo **no** cuadre con ningún vendedor no se queda fuera: le
salen las cuatro plantas para que elija, y el listado se guarda sin vendedor.

## 3. Arrancar

```bash
cd backend  && npm run dev     # puerto 3002
cd frontend && npm run dev     # puerto 5173
```

Y abrir **http://localhost:5173**. Ojo: Vite escucha en IPv6, así que
`localhost` funciona y `127.0.0.1` no.

## 4. El flujo

1. **Cliente** — dos desplegables (ruta y día de visita) y un cuadro de texto
   que busca a la vez en nombre, población y código. Busca sola mientras
   escribes, sin botón: al entrar ya salen los clientes de tu propia ruta. O
   *Cliente nuevo*, que son dos campos de texto y no da de alta nada en el ERP.
2. **Artículos** — dos desplegables (familia y proveedor) y un cuadro de texto
   que busca en descripción y código, igual que en los clientes y también sin
   botón. El catálogo de la planta son entre 620 y 940 artículos y se puede
   hojear entero. Botón `+` para añadir, y una barra fija abajo con el recuento.
3. **Listado** — las líneas con formato, precio, descuento y precio final. El
   descuento es editable si se tiene el permiso.
4. **Generar** — guarda y ofrece *Ver PDF*, *Compartir* y enviar por correo.

`Compartir` usa `navigator.share()` con el fichero, así que en un móvil abre el
menú nativo y adjunta el PDF de verdad (WhatsApp incluido). En un escritorio no
existe esa API y entonces abre el PDF para guardarlo.

## 5. Desde admin

`/admin/listados-precios` lista lo generado, con filtro por planta, cliente y
fechas. El detalle enseña las líneas **con los precios que se entregaron**, no
los del catálogo de hoy: al guardar se congelan.

## Ojo con las pruebas del receptor

Las suites de sincronización hacen `TRUNCATE` de las tablas de `erp` para poder
contar filas, así que **se llevan la muestra por delante**. Si después de
ejecutarlas el catálogo sale vacío, no está roto: hay que volver a importar.

## Cosas que conviene saber

- **Los precios se leen del ERP al guardar**, nunca de la petición. El navegador
  solo manda el código del artículo y el descuento.
- **Un artículo en kilos** lleva el precio por kilo del ERP; el precio de unidad
  es `precio_kilo × peso_neto`. Cada importe se redondea antes de calcular el
  siguiente, para que las cuentas del papel salgan con una calculadora.
- **No aparecen en el catálogo** los artículos sin precio (envases, palets) ni
  los marcados con `quitar_catalogo`.
- **Un cliente solo es seleccionable** si está de alta y tiene ruta con un
  vendedor de alta y activo real.
