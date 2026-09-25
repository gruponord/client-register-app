# Pruebas

Once suites que cubren el receptor del ERP, la utilidad de listados de precios y
la vigilancia de la réplica. No hay framework: cada suite es un programa de Node
que siembra lo suyo, comprueba y limpia.

## Cómo se lanzan

```bash
cd backend
npm run pruebas
```

Eso es todo. El lanzador (`pasa-suites.js`) se encarga de lo que antes había que
recordar de memoria y costaba varios tropiezos:

- **arranca el servidor de pruebas en el 3999**, y lo para al terminar;
- le pone `SYNC_API_KEY=clave-de-prueba-e2e`, que es la que esperan las suites de
  sincronización — con la del `.env` te devuelven `Clave de API invalida`;
- deja el puerto **libre** para `prueba-cluster`, que arranca sus propias
  instancias y chocaría con un servidor ya puesto.

Una suite suelta, con el servidor ya levantado a mano:

```bash
PORT=3999 SYNC_API_KEY=clave-de-prueba-e2e node src/index.js &
node pruebas/prueba-ofertas6.js
```

## Cómo se lee el resultado

Manda el **código de salida**, no lo que se imprime. Una suite que revienta antes
de la primera comprobación no escribe ni una línea `FALLO`, así que contar esas
líneas da cero y parece verde: es exactamente como una suite rota estuvo un rato
dándose por buena. El lanzador se fía del código de salida y las líneas solo
sirven para dar detalle.

| Lo que dice | Qué pasó |
|---|---|
| `ok` | salió con 0 |
| `N fallo(s)` | comprobaciones que no cuadran |
| `revento sin llegar a comprobar nada` | murió antes de empezar |

## Qué cubre cada una

| Suite | Qué comprueba |
|---|---|
| `prueba-receptor` | el receptor de sincronización: lotes, gzip, idempotencia, bajas, checksum |
| `prueba-nuevos` | los seis datasets añadidos después de los dos primeros |
| `prueba-art-cli` | `erp.articulos` y `erp.clientes`, que son los grandes |
| `prueba-cluster` | la carrera entre las dos instancias de PM2: un choque devuelve 409 |
| `prueba-ofertas1` | identidad del vendedor, plantas y logotipos |
| `prueba-ofertas2` | búsqueda de clientes: rutas, días de visita, texto libre |
| `prueba-ofertas3` | catálogo y precios: el redondeo encadenado, que es el corazón |
| `prueba-ofertas4` | guardado, congelación de precios y permisos |
| `prueba-ofertas5` | el impreso bilingüe: ni una etiqueta castellana en un PDF catalán |
| `prueba-ofertas6` | el descuento máximo: empieza en 0, sube al tope, pasarse necesita permiso |
| `prueba-vigilancia` | el aviso por correo cuando la réplica deja de recibir datos |

## Dos dependencias que conviene conocer

**Las cuatro suites de sincronización necesitan el proyecto del agente.**
Requieren su `hash.js` y sus trabajos a propósito: comprueban que el checksum de
las dos puntas coincide usando **el código real del agente**, no una
reimplementación nuestra. Una prueba que reimplementa lo que quiere verificar no
verifica nada.

Se busca en `../../../../Sincronizador GNP`. Si está en otro sitio:

```bash
SINCRONIZADOR_DIR="D:/ruta/Sincronizador GNP" npm run pruebas
```

Si no aparece, esas cuatro dicen `OMITIDA` y siguen; no revientan.

**Las suites de sincronización hacen TRUNCATE del esquema `erp`.** Si tenías una
muestra de datos reales importada para trastear en local, se la llevan por
delante. Vuelve a importarla después (ver `LEEME-OFERTAS.md`).

## Lo que no está aquí, y por qué

La **muestra de datos reales** (`muestra-erp.json`, unos 9 MB) no está en el
repositorio y no debe estarlo: lleva nombre, NIF, domicilio y correo de clientes
de verdad. Las suites no la necesitan — cada una siembra sus propios datos y los
borra al acabar. Solo sirve para mirar la aplicación con datos verosímiles, y se
genera desde producción cuando hace falta.

`salida/` guarda los PDF que genera `prueba-ofertas5` para poder mirarlos a ojo.
Está ignorado en git.

## Al escribir una suite nueva

- **Que limpie lo que siembra**, y por su propio código de sección: varias suites
  comparten base de datos y se pisan. Las de ofertas usan secciones de prueba
  (`T`, `U`, `V`, `W`) precisamente para no chocar entre ellas ni con la muestra.
- **Que no dé por hecho una base vacía ni una base llena.** Comprobar que *están*
  las dos plantas de prueba, no que *son las únicas*: con la muestra importada
  salen seis, y una suite que exigía exactamente dos falló por eso.
- **Que termine con el código de salida correcto**, que es lo único que mira el
  lanzador.
