import { useState, useEffect } from 'react';
import api from '../../services/api';

const PlvCompaniesPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState({ abierto: false, editando: null });
  const [form, setForm] = useState({ code: '', name: '' });
  const [emails, setEmails] = useState([]);
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const { data } = await api.get('/plv-companies');
      const conEmails = await Promise.all(
        data.map(async (e) => {
          try {
            const res = await api.get(`/plv-companies/${e.id}`);
            return { ...e, emails: res.data.emails || [] };
          } catch {
            return { ...e, emails: [] };
          }
        })
      );
      setEmpresas(conEmails);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const abrirCrear = () => {
    setForm({ code: '', name: '' });
    setEmails([]);
    setModal({ abierto: true, editando: null });
    setError('');
  };

  const abrirEditar = async (emp) => {
    try {
      const { data } = await api.get(`/plv-companies/${emp.id}`);
      setForm({ code: data.code, name: data.name });
      setEmails(data.emails || []);
      setModal({ abierto: true, editando: data });
      setError('');
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (modal.editando) {
        await api.put(`/plv-companies/${modal.editando.id}`, form);
      } else {
        await api.post('/plv-companies', form);
      }
      setModal({ abierto: false, editando: null });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Error al guardar');
    }
  };

  const agregarEmail = async () => {
    if (!nuevoEmail.trim() || !modal.editando) return;
    try {
      const { data } = await api.post(`/plv-companies/${modal.editando.id}/emails`, { email: nuevoEmail.trim() });
      setEmails((prev) => [...prev, data]);
      setNuevoEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al agregar email');
    }
  };

  const eliminarEmail = async (emailId) => {
    if (!modal.editando) return;
    try {
      await api.delete(`/plv-companies/${modal.editando.id}/emails/${emailId}`);
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const toggleActivo = async (emp) => {
    try {
      await api.put(`/plv-companies/${emp.id}`, { active: !emp.active });
      cargar();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Empresas PLV</h2>
        <button onClick={abrirCrear} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          Nueva Empresa
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emails destinatarios</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : empresas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No hay datos</td></tr>
            ) : empresas.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{e.code}</td>
                <td className="px-4 py-3 text-sm">{e.name}</td>
                <td className="px-4 py-3 text-sm">
                  {e.emails && e.emails.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.emails.map((em) => (
                        <span key={em.id} className="inline-block bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded">
                          {em.email}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs italic">Sin emails</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {e.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => abrirEditar(e)} className="text-blue-600 hover:text-blue-800 text-sm">Editar</button>
                  <button onClick={() => toggleActivo(e)} className={`text-sm ${e.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                    {e.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.abierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{modal.editando ? 'Editar Empresa PLV' : 'Nueva Empresa PLV'}</h3>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <input type="text" required maxLength={20} value={form.code}
                  onChange={(ev) => setForm({ ...form, code: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" required maxLength={100} value={form.name}
                  onChange={(ev) => setForm({ ...form, name: ev.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setModal({ abierto: false, editando: null })}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  {modal.editando ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>

            {modal.editando && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-md font-semibold text-emerald-700 mb-3">Emails destinatarios de peticiones PLV</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Cada petición PLV de esta empresa se enviará a todos los emails listados.
                </p>

                <div className="flex gap-2 mb-3">
                  <input type="email" placeholder="nuevo@email.com" value={nuevoEmail}
                    onChange={(ev) => setNuevoEmail(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); agregarEmail(); } }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                  <button type="button" onClick={agregarEmail}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
                    Añadir
                  </button>
                </div>

                {emails.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No hay emails asignados</p>
                ) : (
                  <ul className="space-y-2">
                    {emails.map((em) => (
                      <li key={em.id} className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                        <span className="text-sm">{em.email}</span>
                        <button type="button" onClick={() => eliminarEmail(em.id)}
                          className="text-red-500 hover:text-red-700 text-sm">
                          Eliminar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlvCompaniesPage;
