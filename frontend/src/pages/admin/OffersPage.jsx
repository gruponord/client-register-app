import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const eur = (n) => (n === null || n === undefined ? '—'
  : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const num = (n) => String(Number(n)).replace('.', ',');
const fecha = (d) => new Date(d).toLocaleString('es-ES',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const OffersPage = () => {
  const [f, setF] = useState({ seccion: '', cliente: '', desde: '', hasta: '' });
  const [datos, setDatos] = useState({ ofertas: [], total: 0, pagina: 1, por_pagina: 25 });
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [plantas, setPlantas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/plants').then(({ data }) => setPlantas(data.filter((p) => p.active))).catch(() => {});
  }, []);

  const cargar = useCallback(async (pagina = 1) => {
    setCargando(true); setError('');
    try {
      const p = new URLSearchParams({ pagina: String(pagina), por_pagina: '25' });
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      const { data } = await api.get('/offers?' + p.toString());
      setDatos(data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el listado');
    } finally {
      setCargando(false);
    }
  }, [f]);

  useEffect(() => { cargar(1); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const verDetalle = async (id) => {
    try {
      const { data } = await api.get(`/offers/${id}`);
      setDetalle(data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo abrir la oferta');
    }
  };

  const abrirPdf = async (id) => {
    const { data } = await api.get(`/offers/${id}/pdf`, { responseType: 'blob' });
    window.open(URL.createObjectURL(data), '_blank');
  };

  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500';
  const paginas = Math.max(1, Math.ceil(datos.total / datos.por_pagina));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Listados de precios</h1>
      <p className="text-sm text-gray-500 mb-6">
        Listados generados por los comerciales. Los importes son los que se entregaron al cliente,
        no los del catálogo de hoy.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select className={input} value={f.seccion} onChange={(e) => setF({ ...f, seccion: e.target.value })}>
            <option value="">Todas las plantas</option>
            {plantas.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <input className={input} placeholder="Cliente: nombre o código"
            value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} />
          <input className={input} type="date" value={f.desde}
            onChange={(e) => setF({ ...f, desde: e.target.value })} />
          <input className={input} type="date" value={f.hasta}
            onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          <button onClick={() => cargar(1)}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700">
            {cargando ? 'Buscando…' : 'Filtrar'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-right">Artículos</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {datos.ofertas.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{o.id}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(o.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{o.cliente_nombre}</div>
                    <div className="text-xs text-gray-500">
                      {o.cliente_id || <span className="text-amber-600">cliente nuevo</span>}
                      {o.cliente_poblacion ? ' · ' + o.cliente_poblacion : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.planta_nombre || o.seccion_id}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {o.vendedor_nombre || <span className="text-gray-400">—</span>}
                    <div className="text-xs text-gray-400">{o.usuario_nombre || o.username}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {o.articulos}
                    {o.dtos_editados > 0 && (
                      <div className="text-xs text-amber-600" title="Descuentos cambiados a mano">
                        {o.dtos_editados} dto.
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => verDetalle(o.id)} className="text-blue-600 hover:underline mr-3">Ver</button>
                    <button onClick={() => abrirPdf(o.id)} className="text-blue-600 hover:underline">PDF</button>
                  </td>
                </tr>
              ))}
              {!datos.ofertas.length && !cargando && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No hay listados con esos filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
          <span className="text-gray-500">{datos.total} listados</span>
          <div className="flex items-center gap-3">
            <button disabled={datos.pagina <= 1} onClick={() => cargar(datos.pagina - 1)}
              className="px-3 py-1.5 border rounded disabled:opacity-40">Anterior</button>
            <span className="text-gray-500">{datos.pagina} / {paginas}</span>
            <button disabled={datos.pagina >= paginas} onClick={() => cargar(datos.pagina + 1)}
              className="px-3 py-1.5 border rounded disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </div>

      {/* Detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto"
          onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Listado nº {detalle.id}</h2>
                <p className="text-sm text-gray-500">
                  {detalle.cliente_nombre}
                  {detalle.cliente_id ? ' · ' + detalle.cliente_id : ' · cliente nuevo'}
                  {detalle.cliente_poblacion ? ' · ' + detalle.cliente_poblacion : ''}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {fecha(detalle.created_at)} · {detalle.planta_nombre || detalle.seccion_id}
                  {detalle.vendedor_nombre ? ' · ' + detalle.vendedor_nombre : ''}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Producto</th>
                    <th className="px-4 py-2">Formato</th>
                    <th className="px-4 py-2 text-right">Precio</th>
                    <th className="px-4 py-2 text-right">Dto.</th>
                    <th className="px-4 py-2 text-right">Precio final</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detalle.lineas.map((l) => (
                    <tr key={l.articulo_id}>
                      <td className="px-4 py-2">
                        <div className="text-gray-800">{l.descripcion}</div>
                        <div className="text-xs text-gray-400">{l.articulo_id}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {l.unidades_caja ? `${num(l.unidades_caja)}u/cj` : '—'}
                        {l.es_kilo && <div className="text-xs text-indigo-600">{num(l.peso_neto)} kg/u</div>}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {eur(l.precio_unidad)}
                        {l.precio_caja !== null && <div className="text-xs text-gray-500">{eur(l.precio_caja)}/cj</div>}
                        {l.es_kilo && <div className="text-xs text-gray-500">{eur(l.precio_kilo)}/kg</div>}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {l.dto_pct > 0 ? num(l.dto_pct) + ' %' : '—'}
                        {l.dto_editado && <div className="text-xs text-amber-600">a mano</div>}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap font-semibold">
                        {eur(l.precio_final_unidad)}
                        {l.precio_final_caja !== null && <div className="text-xs text-gray-500 font-normal">{eur(l.precio_final_caja)}/cj</div>}
                        {l.es_kilo && <div className="text-xs text-gray-500 font-normal">{eur(l.precio_final_kilo)}/kg</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {detalle.precios_de && 'Precios del ' + new Date(detalle.precios_de).toLocaleDateString('es-ES')}
              </span>
              <button onClick={() => abrirPdf(detalle.id)}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700">
                Abrir PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OffersPage;
