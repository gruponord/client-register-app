import { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';

const PlvArticlesPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState({ abierto: false, editando: null });
  const [form, setForm] = useState({
    company_id: '', group_id: '', brand_id: '', code: '', description: '',
  });
  const [error, setError] = useState('');

  const cargarMaestros = async () => {
    try {
      const [e, g, m] = await Promise.all([
        api.get('/plv-companies'),
        api.get('/masters/plv_groups'),
        api.get('/masters/plv_brands'),
      ]);
      setEmpresas(e.data);
      setGrupos(g.data);
      setMarcas(m.data);
      if (e.data.length > 0 && !filtroEmpresa) setFiltroEmpresa(String(e.data[0].id));
    } catch (err) {
      console.error('Error cargando maestros PLV:', err);
    }
  };

  const cargarArticulos = async (companyId) => {
    if (!companyId) { setArticulos([]); return; }
    setCargando(true);
    try {
      const { data } = await api.get(`/plv-articles?company_id=${companyId}`);
      setArticulos(data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarMaestros(); }, []);
  useEffect(() => { cargarArticulos(filtroEmpresa); }, [filtroEmpresa]);

  const abrirCrear = () => {
    setForm({
      company_id: filtroEmpresa || '',
      group_id: '',
      brand_id: '',
      code: '',
      description: '',
    });
    setModal({ abierto: true, editando: null });
    setError('');
  };

  const abrirEditar = (a) => {
    setForm({
      company_id: String(a.company_id),
      group_id: String(a.group_id),
      brand_id: a.brand_id ? String(a.brand_id) : '',
      code: a.code,
      description: a.description,
    });
    setModal({ abierto: true, editando: a });
    setError('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        company_id: parseInt(form.company_id),
        group_id: parseInt(form.group_id),
        brand_id: form.brand_id ? parseInt(form.brand_id) : null,
        code: form.code,
        description: form.description,
      };
      if (modal.editando) {
        await api.put(`/plv-articles/${modal.editando.id}`, payload);
      } else {
        await api.post('/plv-articles', payload);
      }
      setModal({ abierto: false, editando: null });
      cargarArticulos(filtroEmpresa);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Error al guardar');
    }
  };

  const toggleActivo = async (a) => {
    try {
      await api.put(`/plv-articles/${a.id}`, { active: !a.active });
      cargarArticulos(filtroEmpresa);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  // Agrupar por grupo para visualizar mejor
  const articulosAgrupados = useMemo(() => {
    const map = {};
    for (const a of articulos) {
      const key = a.group_name || 'Sin grupo';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [articulos]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800">Artículos PLV</h2>
        <div className="flex items-center gap-3">
          <select
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Selecciona empresa —</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
            ))}
          </select>
          <button onClick={abrirCrear} disabled={!filtroEmpresa}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            Nuevo Artículo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        {cargando ? (
          <p className="px-4 py-8 text-center text-gray-500">Cargando...</p>
        ) : !filtroEmpresa ? (
          <p className="px-4 py-8 text-center text-gray-500">Selecciona una empresa para ver sus artículos.</p>
        ) : Object.keys(articulosAgrupados).length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-500">Esta empresa aún no tiene artículos.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {Object.entries(articulosAgrupados).map(([grupo, items]) => (
              <div key={grupo}>
                <h3 className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{grupo}</h3>
                <table className="min-w-full">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="px-4 py-2 text-left">Marca</th>
                      <th className="px-4 py-2 text-left">Código</th>
                      <th className="px-4 py-2 text-left">Descripción</th>
                      <th className="px-4 py-2 text-left">Estado</th>
                      <th className="px-4 py-2 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">{a.brand_name || <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-2 text-sm font-mono">{a.code}</td>
                        <td className="px-4 py-2 text-sm">{a.description}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {a.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm space-x-2">
                          <button onClick={() => abrirEditar(a)} className="text-blue-600 hover:text-blue-800 text-sm">Editar</button>
                          <button onClick={() => toggleActivo(a)} className={`text-sm ${a.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                            {a.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.abierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold mb-4">{modal.editando ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                <select required value={form.company_id} onChange={(ev) => setForm({ ...form, company_id: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">—</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grupo *</label>
                <select required value={form.group_id} onChange={(ev) => setForm({ ...form, group_id: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">—</option>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca (opcional)</label>
                <select value={form.brand_id} onChange={(ev) => setForm({ ...form, brand_id: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— Sin marca —</option>
                  {marcas.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código artículo *</label>
                <input type="text" required maxLength={20} value={form.code}
                  onChange={(ev) => setForm({ ...form, code: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                <input type="text" required maxLength={200} value={form.description}
                  onChange={(ev) => setForm({ ...form, description: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal({ abierto: false, editando: null })}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  {modal.editando ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlvArticlesPage;
