import { useState, useEffect } from 'react';
import api from '../../services/api';

const AuditPage = () => {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ user_id: '', action: '', entity: '', from: '', to: '' });
  const [expandido, setExpandido] = useState(null);

  const cargar = async (pag = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pag);
      params.append('limit', 30);
      if (filtros.user_id) params.append('user_id', filtros.user_id);
      if (filtros.action) params.append('action', filtros.action);
      if (filtros.entity) params.append('entity', filtros.entity);
      if (filtros.from) params.append('from', filtros.from);
      if (filtros.to) params.append('to', filtros.to);

      const { data } = await api.get(`/audit?${params.toString()}`);
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

  const aplicarFiltros = (e) => {
    e.preventDefault();
    cargar(1);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Auditoría</h2>

      {/* Filtros */}
      <form onSubmit={aplicarFiltros} className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <input type="text" placeholder="ID Usuario" value={filtros.user_id}
          onChange={(e) => setFiltros({ ...filtros, user_id: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="text" placeholder="Acción" value={filtros.action}
          onChange={(e) => setFiltros({ ...filtros, action: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="text" placeholder="Entidad" value={filtros.entity}
          onChange={(e) => setFiltros({ ...filtros, entity: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filtros.from}
          onChange={(e) => setFiltros({ ...filtros, from: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filtros.to}
          onChange={(e) => setFiltros({ ...filtros, to: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Entidad</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No hay registros</td></tr>
            ) : registros.map((r) => (
              <>
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{new Date(r.created_at).toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3 text-sm">{r.user_name || r.username || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">{r.action}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">{r.entity}</td>
                  <td className="px-4 py-3 text-sm">{r.entity_id || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {(r.old_value || r.new_value) && (
                      <button onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs">
                        {expandido === r.id ? 'Ocultar' : 'Ver'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandido === r.id && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={6} className="px-4 py-3 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        {r.old_value && (
                          <div>
                            <p className="font-semibold text-gray-600 mb-1">Valor anterior:</p>
                            <pre className="bg-white p-2 rounded border overflow-auto max-h-40">
                              {JSON.stringify(r.old_value, null, 2)}
                            </pre>
                          </div>
                        )}
                        {r.new_value && (
                          <div>
                            <p className="font-semibold text-gray-600 mb-1">Valor nuevo:</p>
                            <pre className="bg-white p-2 rounded border overflow-auto max-h-40">
                              {JSON.stringify(r.new_value, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-700">Página {pagina} de {totalPaginas} ({total} registros)</span>
          <div className="flex gap-2">
            <button onClick={() => cargar(pagina - 1)} disabled={pagina <= 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">Anterior</button>
            <button onClick={() => cargar(pagina + 1)} disabled={pagina >= totalPaginas}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditPage;
