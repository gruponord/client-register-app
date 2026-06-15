import { useState, useEffect } from 'react';
import api from '../../services/api';

const PlvSubmissionsPage = () => {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ company_id: '', from: '', to: '' });
  const [empresas, setEmpresas] = useState([]);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    const cargarMaestros = async () => {
      try {
        const { data } = await api.get('/plv-companies');
        setEmpresas(data);
      } catch (err) {
        console.error('Error:', err);
      }
    };
    cargarMaestros();
  }, []);

  const cargar = async (pag = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pag);
      params.append('limit', 20);
      if (filtros.company_id) params.append('company_id', filtros.company_id);
      if (filtros.from) params.append('from', filtros.from);
      if (filtros.to) params.append('to', filtros.to);

      const { data } = await api.get(`/plv?${params.toString()}`);
      setRegistros(data.data);
      setTotal(data.total);
      setPagina(data.page);
      setTotalPaginas(data.totalPages);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const verDetalle = async (id) => {
    try {
      const { data } = await api.get(`/plv/${id}`);
      setDetalle(data);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const formatFecha = (d) => d ? new Date(d).toLocaleDateString('es-ES') : '-';

  // Agrupar líneas por grupo para el detalle
  const agruparLineas = (lines = []) => {
    const map = {};
    for (const l of lines) {
      const g = l.group_name || 'Sin grupo';
      if (!map[g]) map[g] = [];
      map[g].push(l);
    }
    return map;
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Peticiones PLV</h2>

      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Empresa</label>
          <select value={filtros.company_id} onChange={(e) => setFiltros({ ...filtros, company_id: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <input type="date" value={filtros.from} onChange={(e) => setFiltros({ ...filtros, from: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <input type="date" value={filtros.to} onChange={(e) => setFiltros({ ...filtros, to: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={() => cargar(1)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          Aplicar
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comercial</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Sin peticiones</td></tr>
            ) : registros.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{r.id}</td>
                <td className="px-4 py-3 text-sm">{new Date(r.created_at).toLocaleString('es-ES')}</td>
                <td className="px-4 py-3 text-sm">{r.company_name}</td>
                <td className="px-4 py-3 text-sm">{r.client_name}</td>
                <td className="px-4 py-3 text-sm">{r.user_name}</td>
                <td className="px-4 py-3 text-sm">
                  <button onClick={() => verDetalle(r.id)} className="text-blue-600 hover:text-blue-800 text-sm">
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{total} resultados — página {pagina} de {totalPaginas}</span>
          <div className="space-x-2">
            <button disabled={pagina <= 1} onClick={() => cargar(pagina - 1)}
              className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
            <button disabled={pagina >= totalPaginas} onClick={() => cargar(pagina + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Petición PLV #{detalle.id}</h3>
              <button onClick={() => setDetalle(null)} className="text-gray-500 hover:text-gray-800 text-lg">✕</button>
            </div>

            <table className="w-full text-sm mb-4">
              <tbody>
                <tr><td className="font-semibold py-1 pr-3 w-40">Empresa</td><td>{detalle.company_name}</td></tr>
                <tr><td className="font-semibold py-1 pr-3">Fecha solicitud</td><td>{formatFecha(detalle.request_date)}</td></tr>
                <tr><td className="font-semibold py-1 pr-3">Creado</td><td>{new Date(detalle.created_at).toLocaleString('es-ES')}</td></tr>
                <tr><td className="font-semibold py-1 pr-3">Código cliente</td><td>{detalle.client_code}</td></tr>
                <tr><td className="font-semibold py-1 pr-3">Nombre cliente</td><td>{detalle.client_name}</td></tr>
                <tr><td className="font-semibold py-1 pr-3">Comercial</td><td>{detalle.user_name}</td></tr>
                {detalle.notes && (
                  <tr><td className="font-semibold py-1 pr-3 align-top">Notas</td><td className="whitespace-pre-wrap">{detalle.notes}</td></tr>
                )}
              </tbody>
            </table>

            {Object.entries(agruparLineas(detalle.lines)).map(([grupo, lineas]) => (
              <div key={grupo} className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-2">{grupo}</h4>
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left border">Marca</th>
                      <th className="px-2 py-1 text-left border">Cód</th>
                      <th className="px-2 py-1 text-left border">Descripción</th>
                      <th className="px-2 py-1 text-center border">Unidades</th>
                      <th className="px-2 py-1 text-left border">Entrega</th>
                      <th className="px-2 py-1 text-left border">Retirada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id}>
                        <td className="px-2 py-1 border">{l.brand_name || '-'}</td>
                        <td className="px-2 py-1 border font-mono">{l.article_code}</td>
                        <td className="px-2 py-1 border">{l.article_description}</td>
                        <td className="px-2 py-1 border text-center">{l.units}</td>
                        <td className="px-2 py-1 border">{formatFecha(l.delivery_date)}</td>
                        <td className="px-2 py-1 border">{formatFecha(l.return_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlvSubmissionsPage;
