import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// Se trabaja desde el movil, asi que el flujo va por pasos en vez de un
// formulario largo: en una pantalla estrecha no se puede ver todo a la vez.
const PASOS = ['Cliente', 'Artículos', 'Listado'];

const eur = (n) => (n === null || n === undefined ? '—'
  : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const num = (n) => String(Number(n)).replace('.', ',');

// El orden de los importes y cuales se omiten los decide el servidor
// (precios.service.js) y viajan en `presentacion` con cada articulo, para que
// el PDF, esta pantalla y el detalle de administracion coincidan.
//
// En kilos manda el €/kg y va primero; en unidades manda el €/ud. Y no se
// repite un importe que seria el mismo (1 u/caja, 1 kg/u).
const importes = (art, prefijo) =>
  (art.presentacion || []).map((x) => ({
    v: art[prefijo + x.campo],
    suf: x.sufijo,
    principal: x.principal,
  }));

const OfertasFormPage = ({ onCambiarFormulario, permitidas = [] }) => {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useAuth();

  const [ctx, setCtx] = useState(null);
  const [planta, setPlanta] = useState(null);
  const [error, setError] = useState('');
  const [paso, setPaso] = useState(0);

  // --- Cliente ---
  const [modoCliente, setModoCliente] = useState('buscar');   // buscar | nuevo
  const [rutas, setRutas] = useState([]);
  // Un solo cuadro de texto para nombre, poblacion y codigo: el comercial no
  // tiene por que decidir antes por que campo busca.
  const [busq, setBusq] = useState({ vendedor: '', dia: '', texto: '' });
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: '', poblacion: '' });

  // --- Articulos ---
  const [filtros, setFiltros] = useState({ familias: [], proveedores: [] });
  // Un solo cuadro de texto para codigo y descripcion, como en los clientes.
  const [fArt, setFArt] = useState({ familia: '', proveedor: '', texto: '' });
  const [articulos, setArticulos] = useState([]);
  const [totalArt, setTotalArt] = useState(0);
  const [paginaArt, setPaginaArt] = useState(1);
  const [cargandoArt, setCargandoArt] = useState(false);
  const [carrito, setCarrito] = useState([]);   // [{articulo, dto_pct}]

  // --- Guardado ---
  const [guardando, setGuardando] = useState(false);
  const [oferta, setOferta] = useState(null);
  const [email, setEmail] = useState('');
  const [aviso, setAviso] = useState('');

  // ---------------------------------------------------------------- contexto
  useEffect(() => {
    api.get('/offers/contexto')
      .then(({ data }) => {
        setCtx(data);
        if (!data.requiere_seleccion) setPlanta(data.plantas[0]);
      })
      .catch((e) => setError(e.response?.data?.error || 'No se pudo cargar la utilidad'));
  }, []);

  // Al elegir planta se cargan sus rutas y sus filtros de catalogo.
  useEffect(() => {
    if (!planta) return;
    const s = planta.seccion_id;
    api.get(`/offers/rutas?seccion=${s}`)
      .then(({ data }) => {
        setRutas(data);
        // Si el usuario ES uno de esos vendedores, se preselecciona su ruta: lo
        // primero que quiere ver un comercial son SUS clientes, y ademas evita
        // el error de "indica al menos un criterio" en la primera pantalla.
        if (planta.vendedor_id && data.some((r) => r.vendedor_id === planta.vendedor_id)) {
          setBusq((b) => ({ ...b, vendedor: planta.vendedor_id }));
        }
      })
      .catch(() => setRutas([]));
    api.get(`/offers/filtros?seccion=${s}`).then(({ data }) => setFiltros(data)).catch(() => {});
  }, [planta]);

  // ---------------------------------------------------------------- clientes
  const buscarClientes = useCallback(async () => {
    if (!planta) return;
    const p = new URLSearchParams({ seccion: planta.seccion_id, por_pagina: '50' });
    if (busq.vendedor) p.set('vendedor', busq.vendedor);
    if (busq.dia) p.set('dia', busq.dia);
    if (busq.texto.trim()) p.set('texto', busq.texto.trim());

    setBuscando(true); setError('');
    try {
      const { data } = await api.get('/offers/clientes?' + p.toString());
      setResultados(data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo buscar');
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  }, [planta, busq]);

  // Busca sola, sin boton: al entrar ya salen los clientes de la propia ruta, y
  // al escribir se va filtrando. Los 300 ms de espera evitan una consulta por
  // cada tecla, y las dos letras minimas evitan traer media cartera por una "a".
  useEffect(() => {
    if (!planta || modoCliente !== 'buscar') return undefined;
    const texto = busq.texto.trim();
    if (!busq.vendedor && !busq.dia && texto.length < 2) {
      setResultados(null);
      return undefined;
    }
    const t = setTimeout(buscarClientes, texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [planta, modoCliente, busq, buscarClientes]);

  // ---------------------------------------------------------------- catalogo
  const cargarArticulos = useCallback(async (pag = 1) => {
    if (!planta) return;
    const p = new URLSearchParams({ seccion: planta.seccion_id, pagina: String(pag), por_pagina: '25' });
    for (const [k, v] of Object.entries(fArt)) if (v) p.set(k, v);
    setCargandoArt(true);
    try {
      const { data } = await api.get('/offers/articulos?' + p.toString());
      setArticulos(data.articulos);
      setTotalArt(data.total);
      setPaginaArt(data.pagina);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el catálogo');
    } finally {
      setCargandoArt(false);
    }
  }, [planta, fArt]);

  // Igual que con los clientes: sin boton. Al llegar al paso se carga el
  // catalogo entero y al teclear se va filtrando. Aqui no hay minimo de letras
  // porque hojear el catalogo completo es un caso valido.
  useEffect(() => {
    if (paso !== 1) return undefined;
    const t = setTimeout(() => cargarArticulos(1), fArt.texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [paso, cargarArticulos, fArt.texto]);

  const enCarrito = useMemo(
    () => new Set(carrito.map((l) => l.articulo.articulo_id)), [carrito]);

  const anadir = (a) => setCarrito((c) => [...c, { articulo: a, dto_pct: a.dto_pct }]);
  const quitar = (id) => setCarrito((c) => c.filter((l) => l.articulo.articulo_id !== id));
  const cambiarDto = (id, v) => setCarrito((c) => c.map((l) =>
    l.articulo.articulo_id === id ? { ...l, dto_pct: v } : l));

  // El precio final se recalcula aqui igual que en el servidor: redondeando cada
  // paso antes del siguiente, para que lo que ve el comercial coincida con el PDF.
  const cent = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const calcular = (l) => {
    const dto = Number(String(l.dto_pct).replace(',', '.')) || 0;
    const unidad = cent(l.articulo.precio_unidad * (1 - dto / 100));
    return {
      dto,
      unidad,
      caja: l.articulo.unidades_caja ? cent(unidad * l.articulo.unidades_caja) : null,
      kilo: l.articulo.es_kilo ? cent(l.articulo.precio_kilo * (1 - dto / 100)) : null,
    };
  };

  // ---------------------------------------------------------------- guardar
  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const cuerpo = {
        seccion: planta.seccion_id,
        lineas: carrito.map((l) => ({
          articulo_id: l.articulo.articulo_id,
          dto_pct: Number(String(l.dto_pct).replace(',', '.')) || 0,
        })),
      };
      if (modoCliente === 'nuevo') cuerpo.cliente_nuevo = nuevo;
      else cuerpo.cliente = { cliente_id: cliente.cliente_id, local_id: cliente.local_id };

      const { data } = await api.post('/offers', cuerpo);
      setOferta(data);
      setPaso(2);
    } catch (e) {
      const d = e.response?.data;
      setError(d?.articulos ? d.error + ': ' + d.articulos.join(', ') : (d?.error || 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const descargarPdf = async () => {
    const { data } = await api.get(`/offers/${oferta.id}/pdf`, { responseType: 'blob' });
    return new File([data], `listado-precios-${oferta.id}.pdf`, { type: 'application/pdf' });
  };

  const verPdf = async () => {
    const f = await descargarPdf();
    window.open(URL.createObjectURL(f), '_blank');
  };

  // navigator.share con el fichero: en el movil abre el menu nativo y adjunta el
  // PDF de verdad (WhatsApp incluido). En escritorio no existe, y entonces se
  // abre el PDF para guardarlo o imprimirlo a mano.
  const compartir = async () => {
    try {
      const f = await descargarPdf();
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: 'Listado de precios' });
      } else {
        window.open(URL.createObjectURL(f), '_blank');
        setAviso('Este navegador no permite compartir ficheros. Se ha abierto el PDF para que lo guardes o lo imprimas.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setAviso('No se pudo compartir el listado.');
    }
  };

  const enviarEmail = async () => {
    setAviso('');
    try {
      await api.post(`/offers/${oferta.id}/enviar`, { email });
      setAviso('Listado enviado a ' + email);
      setEmail('');
    } catch (e) {
      setAviso(e.response?.data?.error || 'No se pudo enviar el correo');
    }
  };

  // ---------------------------------------------------------------- estilos
  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  const btn = 'px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors';
  const btnPri = `${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300`;
  const btnSec = `${btn} bg-white border border-gray-300 text-gray-700 hover:bg-gray-50`;

  const cabecera = (
    <div className="bg-white shadow-sm border-b sticky top-0 z-20">
      <div className="max-w-4xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <img src={planta?.logo || '/logo_GNP.jpg'} alt="" className="h-7 sm:h-8 object-contain" />
          <div className="flex items-center gap-3 text-xs sm:text-sm">
            <span className="text-gray-500 hidden sm:inline">{usuario?.full_name || usuario?.username}</span>
            {usuario?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="text-blue-600 hover:text-blue-800">Admin</button>
            )}
            <button onClick={() => { cerrarSesion(); navigate('/login'); }} className="text-red-600 hover:text-red-800">Salir</button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
          <h1 className="text-sm sm:text-lg font-bold text-indigo-700">Listado de precios</h1>
          <div className="space-x-3">
            {permitidas.includes('altas') && (
              <button onClick={() => onCambiarFormulario('altas')} className="text-xs sm:text-sm text-blue-600 underline">Alta de Cliente</button>
            )}
            {permitidas.includes('plv') && (
              <button onClick={() => onCambiarFormulario('plv')} className="text-xs sm:text-sm text-emerald-600 underline">Petición PLV</button>
            )}
          </div>
        </div>
        {planta && (
          <div className="flex items-center gap-2 mt-2 pb-1 text-xs">
            {PASOS.map((p, i) => (
              <button key={p} disabled={i > paso}
                onClick={() => i < paso && setPaso(i)}
                className={`px-2.5 py-1 rounded-full font-medium ${
                  i === paso ? 'bg-indigo-600 text-white'
                    : i < paso ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                {i + 1}. {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------- render
  if (error && !ctx) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-md text-center">
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <button onClick={() => onCambiarFormulario('selector')} className={btnSec}>Volver</button>
        </div>
      </div>
    );
  }
  if (!ctx) return <div className="min-h-screen bg-gray-50 p-8 text-center text-gray-500">Cargando…</div>;

  // Paso previo: con que planta se trabaja (gestores y jefes de venta).
  if (!planta) {
    return (
      <div className="min-h-screen bg-gray-50">
        {cabecera}
        <div className="max-w-md mx-auto px-4 py-10">
          <h2 className="text-lg font-bold text-gray-800 mb-1">¿Con qué planta trabajas?</h2>
          <p className="text-sm text-gray-500 mb-6">
            {ctx.vinculado
              ? 'Eres vendedor en más de una, así que el catálogo y los clientes cambian según la que elijas.'
              : 'Tu usuario no está vinculado a un vendedor del ERP, así que puedes elegir cualquiera.'}
          </p>
          <div className="space-y-3">
            {ctx.plantas.map((p) => (
              <button key={p.seccion_id} onClick={() => setPlanta(p)}
                className="w-full bg-white rounded-xl shadow border-2 border-transparent hover:border-indigo-500 p-4 flex items-center gap-4 text-left">
                {p.logo && <img src={p.logo} alt="" className="h-8 object-contain" />}
                <div>
                  <div className="font-semibold text-gray-800">{p.planta_nombre}</div>
                  {p.vendedor_nombre && <div className="text-xs text-gray-500">{p.vendedor_nombre}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {cabecera}
      <div className="max-w-4xl mx-auto px-4 py-5">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* ---------------------------------------------------- 1. CLIENTE */}
        {paso === 0 && (
          <>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setModoCliente('buscar')}
                className={`${btn} flex-1 ${modoCliente === 'buscar' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
                Buscar cliente
              </button>
              <button onClick={() => setModoCliente('nuevo')}
                className={`${btn} flex-1 ${modoCliente === 'nuevo' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
                Cliente nuevo
              </button>
            </div>

            {modoCliente === 'nuevo' ? (
              <div className="bg-white rounded-xl shadow p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente *</label>
                  <input className={input} value={nuevo.nombre} maxLength={200}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Población</label>
                  <input className={input} value={nuevo.poblacion} maxLength={120}
                    onChange={(e) => setNuevo({ ...nuevo, poblacion: e.target.value })} />
                </div>
                <p className="text-xs text-gray-500">
                  Solo se usa para el documento. No se da de alta en el ERP.
                </p>
                <button disabled={!nuevo.nombre.trim()} onClick={() => setPaso(1)} className={`${btnPri} w-full`}>
                  Continuar a artículos
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select className={input} value={busq.vendedor}
                    onChange={(e) => setBusq({ ...busq, vendedor: e.target.value })}>
                    <option value="">Todas las rutas</option>
                    {rutas.map((r) => (
                      <option key={r.vendedor_id} value={r.vendedor_id}>
                        {r.etiqueta} ({r.clientes})
                      </option>
                    ))}
                  </select>
                  <select className={input} value={busq.dia}
                    onChange={(e) => setBusq({ ...busq, dia: e.target.value })}>
                    <option value="">Cualquier día</option>
                    {ctx.dias_visita.map((d) => (
                      <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="relative mt-3">
                  <input className={input} value={busq.texto} autoComplete="off"
                    placeholder="Nombre, población o código"
                    onChange={(e) => setBusq({ ...busq, texto: e.target.value })} />
                  {busq.texto && (
                    <button onClick={() => setBusq({ ...busq, texto: '' })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 text-gray-400 hover:text-gray-600 text-lg leading-none"
                      aria-label="Borrar búsqueda">×</button>
                  )}
                </div>

                {resultados && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">
                      {buscando ? 'Buscando…' : (
                        <>
                          {resultados.total} cliente{resultados.total === 1 ? '' : 's'}
                          {resultados.total > resultados.clientes.length && ` · mostrando ${resultados.clientes.length}`}
                        </>
                      )}
                    </p>
                    <div className="divide-y">
                      {resultados.clientes.map((c) => (
                        <button key={c.cliente_id + '|' + c.local_id}
                          onClick={() => { setCliente(c); setPaso(1); }}
                          className="w-full text-left py-3 hover:bg-gray-50 px-1">
                          <div className="font-medium text-gray-800 text-sm">{c.nombre}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {c.cliente_id} · {c.poblacion || 'sin población'}
                          </div>
                          <div className="text-xs text-indigo-600 mt-0.5">
                            {c.ruta}{c.dias_visita.length ? ' · ' + c.dias_visita.join(', ') : ''}
                          </div>
                        </button>
                      ))}
                      {!resultados.clientes.length && !buscando && (
                        <p className="py-6 text-center text-sm text-gray-500">Ningún cliente con esos criterios.</p>
                      )}
                    </div>
                  </div>
                )}

                {!resultados && !buscando && (
                  <p className="mt-4 py-6 text-center text-sm text-gray-500">
                    Elige una ruta o escribe al menos dos letras.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* -------------------------------------------------- 2. ARTICULOS */}
        {paso === 1 && (
          <>
            <div className="bg-white rounded-xl shadow p-3 mb-4 text-sm">
              <span className="text-gray-500">Cliente: </span>
              <span className="font-semibold text-gray-800">
                {modoCliente === 'nuevo' ? nuevo.nombre : cliente?.nombre}
              </span>
              {modoCliente === 'nuevo'
                ? (nuevo.poblacion && <span className="text-gray-500"> · {nuevo.poblacion}</span>)
                : <span className="text-gray-500"> · {cliente?.cliente_id}</span>}
              <button onClick={() => setPaso(0)} className="text-xs text-indigo-600 underline ml-2">cambiar</button>
            </div>

            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select className={input} value={fArt.familia}
                  onChange={(e) => setFArt({ ...fArt, familia: e.target.value })}>
                  <option value="">Todas las familias</option>
                  {filtros.familias.map((f) => (
                    <option key={f.id} value={f.id}>{f.nombre} ({f.articulos})</option>
                  ))}
                </select>
                <select className={input} value={fArt.proveedor}
                  onChange={(e) => setFArt({ ...fArt, proveedor: e.target.value })}>
                  <option value="">Todos los proveedores</option>
                  {filtros.proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.articulos})</option>
                  ))}
                </select>
              </div>

              <div className="relative mt-3">
                <input className={input} value={fArt.texto} autoComplete="off"
                  placeholder="Descripción o código"
                  onChange={(e) => setFArt({ ...fArt, texto: e.target.value })} />
                {fArt.texto && (
                  <button onClick={() => setFArt({ ...fArt, texto: '' })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 text-gray-400 hover:text-gray-600 text-lg leading-none"
                    aria-label="Borrar búsqueda">×</button>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              {cargandoArt ? 'Buscando…' : `${totalArt} artículo${totalArt === 1 ? '' : 's'}`}
            </p>
            <div className="space-y-2">
              {articulos.map((a) => {
                const dentro = enCarrito.has(a.articulo_id);
                return (
                  <div key={a.articulo_id}
                    className={`bg-white rounded-xl shadow p-3 flex items-start gap-3 ${dentro ? 'ring-2 ring-indigo-300' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{a.descripcion}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {a.articulo_id} · {a.familia}
                        {a.bajo_pedido && <span className="ml-1 text-amber-600">· bajo pedido</span>}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {a.unidades_caja ? `${num(a.unidades_caja)}u/cj` : ''}
                        {a.es_kilo && <span className="text-indigo-600"> · {num(a.peso_neto)} kg/u</span>}
                      </div>
                      <div className="text-sm mt-1">
                        {importes(a, 'precio_').map((x, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-xs text-gray-400"> · </span>}
                            <span className={x.principal ? 'font-semibold text-gray-900' : 'text-xs text-gray-500'}>
                              {eur(x.v)}{x.suf}
                            </span>
                          </span>
                        ))}
                        {a.dto_pct > 0 && <span className="text-xs text-indigo-600 font-medium"> · -{num(a.dto_pct)}%</span>}
                      </div>
                    </div>
                    <button onClick={() => (dentro ? quitar(a.articulo_id) : anadir(a))}
                      className={`shrink-0 w-9 h-9 rounded-full font-bold text-lg leading-none ${
                        dentro ? 'bg-red-100 text-red-600' : 'bg-indigo-600 text-white'}`}
                      aria-label={dentro ? 'Quitar' : 'Añadir'}>
                      {dentro ? '−' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>

            {totalArt > 25 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <button disabled={paginaArt <= 1} onClick={() => cargarArticulos(paginaArt - 1)} className={btnSec}>Anterior</button>
                <span className="text-gray-500">Página {paginaArt} de {Math.ceil(totalArt / 25)}</span>
                <button disabled={paginaArt >= Math.ceil(totalArt / 25)} onClick={() => cargarArticulos(paginaArt + 1)} className={btnSec}>Siguiente</button>
              </div>
            )}
          </>
        )}

        {/* ---------------------------------------------------- 3. LISTADO */}
        {paso === 2 && !oferta && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm">
              <span className="text-gray-500">Cliente: </span>
              <span className="font-semibold">{modoCliente === 'nuevo' ? nuevo.nombre : cliente?.nombre}</span>
            </div>
            <div className="divide-y">
              {carrito.map((l) => {
                const c = calcular(l);
                return (
                  <div key={l.articulo.articulo_id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">{l.articulo.descripcion}</div>
                        <div className="text-xs text-gray-400">{l.articulo.articulo_id}</div>
                      </div>
                      <button onClick={() => quitar(l.articulo.articulo_id)}
                        className="text-xs text-red-600 shrink-0">quitar</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div>
                        <div className="text-gray-400">Formato</div>
                        <div>{l.articulo.unidades_caja ? `${num(l.articulo.unidades_caja)}u/cj` : '—'}</div>
                        {l.articulo.es_kilo && <div className="text-indigo-600">{num(l.articulo.peso_neto)} kg/u</div>}
                      </div>
                      <div>
                        <div className="text-gray-400">Precio</div>
                        {importes(l.articulo, 'precio_').map((x, i) => (
                          <div key={i} className={x.principal ? 'font-medium' : 'text-gray-500'}>
                            {eur(x.v)}{x.suf}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-gray-400">Precio final</div>
                        {(l.articulo.presentacion || []).map((x, i) => (
                          <div key={i} className={x.principal ? 'font-semibold' : 'text-gray-500'}>
                            {eur(c[x.campo])}{x.sufijo}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">% Dto.</span>
                      {ctx.puede_editar_dto ? (
                        <input type="number" min="0" max="100" step="0.5" value={l.dto_pct}
                          onChange={(e) => cambiarDto(l.articulo.articulo_id, e.target.value)}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      ) : (
                        <span className="text-sm font-medium">{num(l.dto_pct)} %</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t">
              <button onClick={guardar} disabled={guardando || !carrito.length} className={`${btnPri} w-full`}>
                {guardando ? 'Generando…' : 'Generar listado'}
              </button>
              {!ctx.puede_editar_dto && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  No tienes permiso para cambiar descuentos. Se aplican los del sistema.
                </p>
              )}
            </div>
          </div>
        )}

        {/* --------------------------------------------------- 3b. HECHO */}
        {oferta && (
          <div className="bg-white rounded-xl shadow p-5 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-800">Listado nº {oferta.id} generado</h2>
            <p className="text-sm text-gray-500 mt-1">
              {oferta.cliente_nombre} · {oferta.lineas.length} artículo{oferta.lineas.length === 1 ? '' : 's'}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={verPdf} className={btnSec}>Ver PDF</button>
              <button onClick={compartir} className={btnPri}>Compartir</button>
            </div>

            <div className="mt-4 pt-4 border-t">
              <label className="block text-xs text-gray-500 mb-1 text-left">Enviar por correo</label>
              <div className="flex gap-2">
                <input type="email" className={input} placeholder="cliente@ejemplo.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                <button onClick={enviarEmail} disabled={!email} className={btnPri}>Enviar</button>
              </div>
            </div>

            {aviso && <p className="text-xs text-gray-600 mt-3">{aviso}</p>}

            <button onClick={() => {
              setOferta(null); setCarrito([]); setCliente(null);
              setNuevo({ nombre: '', poblacion: '' }); setResultados(null); setPaso(0); setAviso('');
            }} className={`${btnSec} w-full mt-4`}>
              Hacer otro listado
            </button>
          </div>
        )}
      </div>

      {/* Barra fija con el carrito: en un movil hay que poder seguir sin subir. */}
      {paso === 1 && carrito.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              {carrito.length} artículo{carrito.length === 1 ? '' : 's'} seleccionado{carrito.length === 1 ? '' : 's'}
            </span>
            <button onClick={() => setPaso(2)} className={btnPri}>Ver listado</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfertasFormPage;
