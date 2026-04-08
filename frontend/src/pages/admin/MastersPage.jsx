import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

const TITULOS = {
  commercials: 'Comerciales',
  client_actions: 'Acciones de Cliente',
  client_classes: 'Clases de Cliente',
  billing_types: 'Tipos de Facturación',
  payment_methods: 'Formas de Pago',
  visit_periods: 'Periodos de Visita',
};

const MastersPage = () => {
  const { tipo } = useParams();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState({ abierto: false, editando: null });
  const [form, setForm] = useState({ code: '', name: '' });
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const { data } = await api.get(`/masters/${tipo}`);
      setDatos(data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [tipo]);

  const abrirCrear = () => {
    setForm({ code: '', name: '' });
    setModal({ abierto: true, editando: null });
    setError('');
  };

  const abrirEditar = (item) => {
    setForm({ code: item.code, name: item.name });
    setModal({ abierto: true, editando: item });
    setError('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (modal.editando) {
        await api.put(`/masters/${tipo}/${modal.editando.id}`, form);
      } else {
        await api.post(`/masters/${tipo}`, form);
      }
      setModal({ abierto: false, editando: null });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Error al guardar');
    }
  };

  const toggleActivo = async (item) => {
    try {
      await api.put(`/masters/${tipo}/${item.id}`, { active: !item.active });
      cargar();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{TITULOS[tipo] || tipo}</h2>
        <button onClick={abrirCrear} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          Nuevo Registro
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : datos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No hay datos</td></tr>
            ) : datos.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                <td className="px-4 py-3 text-sm">{item.name}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {item.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => abrirEditar(item)} className="text-blue-600 hover:text-blue-800 text-sm">Editar</button>
                  <button onClick={() => toggleActivo(item)} className={`text-sm ${item.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                    {item.active ? 'Desactivar' : 'Activar'}
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
            <h3 className="text-lg font-bold mb-4">{modal.editando ? 'Editar Registro' : 'Nuevo Registro'}</h3>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <input type="text" required maxLength={20} value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" required maxLength={100} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
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

export default MastersPage;
