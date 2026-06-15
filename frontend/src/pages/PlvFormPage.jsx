import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import FormField from '../components/FormField';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const PlvFormPage = ({ onCambiarFormulario, permitidas = [] }) => {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useAuth();

  const [empresas, setEmpresas] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [cargandoArticulos, setCargandoArticulos] = useState(false);

  const [form, setForm] = useState({
    company_id: '',
    client_code: '',
    client_name: '',
    request_date: hoyISO(),
    notes: '',
  });
  const [lineas, setLineas] = useState({}); // { [articleId]: { units, delivery_date, return_date } }
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  // Cargar empresas PLV activas que el usuario tiene asignadas (admin: todas).
  useEffect(() => {
    const cargar = async () => {
      try {
        const { data } = await api.get('/plv-companies?active=true');
        const filtradas = usuario?.role === 'admin'
          ? data
          : data.filter((e) => (usuario?.plv_company_ids || []).includes(e.id));
        setEmpresas(filtradas);
        if (filtradas.length === 1) {
          setForm((prev) => ({ ...prev, company_id: String(filtradas[0].id) }));
        }
      } catch (err) {
        console.error('Error cargando empresas PLV:', err);
      }
    };
    cargar();
  }, [usuario]);

  // Cargar catalogo de la empresa elegida
  useEffect(() => {
    const cargar = async () => {
      if (!form.company_id) { setArticulos([]); return; }
      setCargandoArticulos(true);
      try {
        const { data } = await api.get(`/plv-articles?company_id=${form.company_id}&active=true`);
        setArticulos(data);
        setLineas({}); // limpiar al cambiar empresa
      } catch (err) {
        console.error('Error cargando artículos:', err);
      } finally {
        setCargandoArticulos(false);
      }
    };
    cargar();
  }, [form.company_id]);

  // Agrupar artículos por grupo (para el render del catálogo).
  const articulosAgrupados = useMemo(() => {
    const map = {};
    for (const a of articulos) {
      const key = a.group_name || 'Sin grupo';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [articulos]);

  const handleChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (errores[campo]) setErrores((prev) => ({ ...prev, [campo]: '' }));
  };

  const handleLinea = (articleId, campo, valor) => {
    setLineas((prev) => ({
      ...prev,
      [articleId]: { ...(prev[articleId] || {}), [campo]: valor },
    }));
  };

  const lineasValidas = () => {
    return Object.entries(lineas)
      .filter(([, l]) => l && parseInt(l.units) > 0)
      .map(([articleId, l]) => ({
        article_id: parseInt(articleId),
        units: parseInt(l.units),
        delivery_date: l.delivery_date || null,
        return_date: l.return_date || null,
      }));
  };

  const validar = () => {
    const e = {};
    if (!form.company_id) e.company_id = 'Obligatorio';
    if (!form.client_code.trim()) e.client_code = 'Obligatorio';
    if (!form.client_name.trim()) e.client_name = 'Obligatorio';
    if (!form.request_date) e.request_date = 'Obligatorio';
    if (lineasValidas().length === 0) e.lineas = 'Debes pedir al menos un artículo con unidades > 0';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const formularioCompleto = () =>
    form.company_id && form.client_code.trim() && form.client_name.trim() &&
    form.request_date && lineasValidas().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    try {
      await api.post('/plv', {
        company_id: parseInt(form.company_id),
        client_code: form.client_code,
        client_name: form.client_name,
        request_date: form.request_date,
        notes: form.notes,
        lines: lineasValidas(),
      });
      navigate('/exito-plv');
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Error al enviar la petición';
      alert(msg);
    } finally {
      setEnviando(false);
    }
  };

  const tieneDatos = () =>
    form.client_code.trim() || form.client_name.trim() || form.notes.trim() ||
    Object.values(lineas).some((l) => l && parseInt(l.units) > 0);

  const handleCambiar = (destino) => {
    if (tieneDatos()) {
      if (window.confirm('Si cambias de formulario perderás los datos introducidos. ¿Estás seguro?')) {
        onCambiarFormulario(destino);
      }
    } else {
      onCambiarFormulario(destino);
    }
  };

  const inputClasses = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm';
  const numInputClasses = 'w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-emerald-500';
  const dateInputClasses = 'border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-7 sm:h-8" />
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <span className="text-gray-500 hidden sm:inline">{usuario?.full_name || usuario?.username}</span>
              {usuario?.role === 'admin' && (
                <button onClick={() => navigate('/admin')} className="text-blue-600 hover:text-blue-800">Admin</button>
              )}
              <button onClick={() => { cerrarSesion(); navigate('/login'); }} className="text-red-600 hover:text-red-800">Salir</button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
            <h1 className="text-sm sm:text-lg font-bold text-emerald-700">Petición PLV</h1>
            <div className="space-x-3">
              {permitidas.includes('altas') && (
                <button onClick={() => handleCambiar('altas')} className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline">
                  Cambiar a Alta de Cliente
                </button>
              )}
              {permitidas.includes('prospecting') && (
                <button onClick={() => handleCambiar('prospeccion')} className="text-xs sm:text-sm text-amber-600 hover:text-amber-800 underline">
                  Cambiar a Prospección
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-6">
        {empresas.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No tienes empresas PLV asignadas. Pide al administrador que te habilite alguna.
          </div>
        ) : (
          <>
            <FormField label="Empresa" obligatorio error={errores.company_id}>
              <select value={form.company_id} onChange={(e) => handleChange('company_id', e.target.value)} className={inputClasses}>
                <option value="">Seleccionar...</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.code} — {emp.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Fecha solicitud" obligatorio error={errores.request_date}>
              <input type="date" value={form.request_date}
                onChange={(e) => handleChange('request_date', e.target.value)} className={inputClasses} />
            </FormField>

            <FormField label="Código cliente" obligatorio error={errores.client_code}>
              <input type="text" maxLength={20} value={form.client_code}
                onChange={(e) => handleChange('client_code', e.target.value)} className={inputClasses} />
            </FormField>

            <FormField label="Nombre cliente" obligatorio error={errores.client_name}>
              <input type="text" maxLength={100} value={form.client_name}
                onChange={(e) => handleChange('client_name', e.target.value)} className={inputClasses} />
            </FormField>

            {/* Catalogo */}
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gray-700 mb-2">Artículos</h2>
              {errores.lineas && <p className="text-sm text-red-600 mb-2">{errores.lineas}</p>}

              {!form.company_id ? (
                <p className="text-sm text-gray-500">Selecciona primero una empresa.</p>
              ) : cargandoArticulos ? (
                <p className="text-sm text-gray-500">Cargando catálogo...</p>
              ) : articulos.length === 0 ? (
                <p className="text-sm text-gray-500">Esta empresa aún no tiene artículos en su catálogo.</p>
              ) : (
                Object.entries(articulosAgrupados).map(([grupo, items]) => (
                  <div key={grupo} className="bg-white rounded-lg shadow mb-4 overflow-hidden">
                    <h3 className="bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{grupo}</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Marca</th>
                            <th className="px-3 py-2 text-left">Cód</th>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-center">Unidades</th>
                            <th className="px-3 py-2 text-left">Entrega</th>
                            <th className="px-3 py-2 text-left">Retirada</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((a) => (
                            <tr key={a.id}>
                              <td className="px-3 py-2">{a.brand_name || <span className="text-gray-400">—</span>}</td>
                              <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                              <td className="px-3 py-2">{a.description}</td>
                              <td className="px-3 py-2 text-center">
                                <input type="number" min="0" value={lineas[a.id]?.units || ''}
                                  onChange={(e) => handleLinea(a.id, 'units', e.target.value)}
                                  className={numInputClasses} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="date" value={lineas[a.id]?.delivery_date || ''}
                                  onChange={(e) => handleLinea(a.id, 'delivery_date', e.target.value)}
                                  className={dateInputClasses} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="date" value={lineas[a.id]?.return_date || ''}
                                  onChange={(e) => handleLinea(a.id, 'return_date', e.target.value)}
                                  className={dateInputClasses} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>

            <FormField label="Notas (opcional)">
              <textarea rows={4} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)}
                className={inputClasses + ' resize-none'} />
            </FormField>

            <div className="mt-6 mb-10">
              <button type="submit" disabled={!formularioCompleto() || enviando}
                className="w-full bg-emerald-600 text-white py-3.5 rounded-lg font-semibold text-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {enviando ? 'Enviando...' : 'Enviar Petición'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};

export default PlvFormPage;
