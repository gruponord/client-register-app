import { useState, useEffect } from 'react';
import api from '../../services/api';

const UsersPage = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [utilidades, setUtilidades] = useState([]);
  const [empresasPlv, setEmpresasPlv] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState({ abierto: false, editando: null });
  const [form, setForm] = useState({ username: '', password: '', email: '', full_name: '', role: 'comercial', utilities: [], plv_company_ids: [] });
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const [usersRes, utilsRes, plvCompaniesRes] = await Promise.all([
        api.get('/users'),
        api.get('/utilities'),
        api.get('/plv-companies'),
      ]);
      setUsuarios(usersRes.data);
      setUtilidades(utilsRes.data);
      setEmpresasPlv(plvCompaniesRes.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const abrirCrear = () => {
    setForm({ username: '', password: '', email: '', full_name: '', role: 'comercial', utilities: [], plv_company_ids: [] });
    setModal({ abierto: true, editando: null });
    setError('');
  };

  const abrirEditar = (u) => {
    setForm({
      username: u.username,
      email: u.email || '',
      full_name: u.full_name || '',
      role: u.role,
      utilities: Array.isArray(u.utilities) ? u.utilities : [],
      plv_company_ids: Array.isArray(u.plv_company_ids) ? u.plv_company_ids : [],
    });
    setModal({ abierto: true, editando: u });
    setError('');
  };

  const toggleUtilidad = (code) => {
    setForm((prev) => {
      const yaTiene = prev.utilities.includes(code);
      const nuevas = yaTiene ? prev.utilities.filter((c) => c !== code) : [...prev.utilities, code];
      // Si quita la utilidad PLV, limpiamos también las empresas asignadas.
      const nuevasEmpresas = (code === 'plv' && yaTiene) ? [] : prev.plv_company_ids;
      return { ...prev, utilities: nuevas, plv_company_ids: nuevasEmpresas };
    });
  };

  const toggleEmpresaPlv = (companyId) => {
    setForm((prev) => ({
      ...prev,
      plv_company_ids: prev.plv_company_ids.includes(companyId)
        ? prev.plv_company_ids.filter((id) => id !== companyId)
        : [...prev.plv_company_ids, companyId],
    }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payloadBase = {
        username: form.username,
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        utilities: form.utilities,
        plv_company_ids: form.utilities.includes('plv') ? form.plv_company_ids : [],
      };
      if (modal.editando) {
        await api.put(`/users/${modal.editando.id}`, payloadBase);
      } else {
        await api.post('/users', { ...payloadBase, password: form.password });
      }
      setModal({ abierto: false, editando: null });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Error al guardar');
    }
  };

  const toggleActivo = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      cargar();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Usuarios</h2>
        <button onClick={abrirCrear} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          Nuevo Usuario
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilidades</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{u.full_name || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium">{u.username}</td>
                <td className="px-4 py-3 text-sm">{u.email || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.role === 'admin' ? (
                    <span className="text-xs text-gray-500 italic">Todas</span>
                  ) : Array.isArray(u.utilities) && u.utilities.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {u.utilities.map((c) => {
                        const ut = utilidades.find((x) => x.code === c);
                        return (
                          <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                            {ut?.label || c}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Ninguna</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => abrirEditar(u)} className="text-blue-600 hover:text-blue-800 text-sm">Editar</button>
                  <button onClick={() => toggleActivo(u)} className={`text-sm ${u.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                    {u.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal.abierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">{modal.editando ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario *</label>
                <input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              {!modal.editando && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                  <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                  <option value="comercial">Comercial</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {form.role !== 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Utilidades permitidas</label>
                  <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {utilidades.length === 0 ? (
                      <p className="text-xs text-gray-500">No hay utilidades disponibles.</p>
                    ) : utilidades.map((u) => (
                      <label key={u.code} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.utilities.includes(u.code)}
                          onChange={() => toggleUtilidad(u.code)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm">{u.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Si no marcas ninguna, el usuario no podrá usar ningún formulario.
                  </p>
                </div>
              )}

              {form.role !== 'admin' && form.utilities.includes('plv') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Empresas PLV permitidas</label>
                  <div className="space-y-2 border border-emerald-200 rounded-lg p-3 bg-emerald-50 max-h-48 overflow-y-auto">
                    {empresasPlv.length === 0 ? (
                      <p className="text-xs text-gray-500">Aún no hay empresas PLV dadas de alta.</p>
                    ) : empresasPlv.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.plv_company_ids.includes(e.id)}
                          onChange={() => toggleEmpresaPlv(e.id)}
                          disabled={!e.active}
                          className="w-4 h-4 text-emerald-600 rounded"
                        />
                        <span className={`text-sm ${e.active ? '' : 'text-gray-400 line-through'}`}>
                          {e.code} — {e.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    El usuario solo podrá pedir PLV a las empresas marcadas.
                  </p>
                </div>
              )}

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

export default UsersPage;
