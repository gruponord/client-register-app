import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import FormField from '../components/FormField';

const ProspectingFormPage = ({ onCambiarFormulario }) => {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useAuth();
  const [maestros, setMaestros] = useState({
    plants: [], beer_brands: [], contract_types: [],
    barrel_volumes: [], barrel_discount_types: [],
    improvement_points: [], interest_brands: [], proposal_priorities: [],
  });
  const [form, setForm] = useState({
    plant_id: '', client_code: '', client_name: '', address: '',
    contact_person: '', contact_phone: '', call_schedule: '',
    current_brands: [], other_brands_text: '',
    contract_type_id: '', barrel_volume_id: '', barrel_discount_type_id: '',
    service_rating: 0, improvement_points: [], interest_brands: [],
    proposal_priorities: [], notes: '',
  });
  const [archivos, setArchivos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  // ID de la opción "Otras marcas" — se busca dinámicamente
  const [otrasMarcasId, setOtrasMarcasId] = useState(null);

  useEffect(() => {
    const cargarMaestros = async () => {
      try {
        const [plants, brands, contracts, volumes, discounts, improvements, interests, priorities] = await Promise.all([
          api.get('/plants?active=true'),
          api.get('/masters/beer_brands?active=true'),
          api.get('/masters/contract_types?active=true'),
          api.get('/masters/barrel_volumes?active=true'),
          api.get('/masters/barrel_discount_types?active=true'),
          api.get('/masters/improvement_points?active=true'),
          api.get('/masters/interest_brands?active=true'),
          api.get('/masters/proposal_priorities?active=true'),
        ]);
        setMaestros({
          plants: plants.data,
          beer_brands: brands.data,
          contract_types: contracts.data,
          barrel_volumes: volumes.data,
          barrel_discount_types: discounts.data,
          improvement_points: improvements.data,
          interest_brands: interests.data,
          proposal_priorities: priorities.data,
        });
        // Buscar el ID de "Otras marcas"
        const otras = brands.data.find((b) => b.code === 'OTR');
        if (otras) setOtrasMarcasId(otras.id);
      } catch (err) {
        console.error('Error cargando maestros:', err);
      }
    };
    cargarMaestros();
  }, []);

  const handleChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (errores[campo]) {
      setErrores((prev) => ({ ...prev, [campo]: '' }));
    }
  };

  const handleCheckboxMulti = (campo, id) => {
    setForm((prev) => {
      const actual = prev[campo];
      if (actual.includes(id)) {
        return { ...prev, [campo]: actual.filter((v) => v !== id) };
      }
      return { ...prev, [campo]: [...actual, id] };
    });
    if (errores[campo]) {
      setErrores((prev) => ({ ...prev, [campo]: '' }));
    }
  };

  const handleArchivos = (e) => {
    const nuevos = Array.from(e.target.files);
    const permitidos = nuevos.filter((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'].includes(ext) && f.size <= 10 * 1024 * 1024;
    });
    setArchivos((prev) => [...prev, ...permitidos]);

    const nuevasPreviews = permitidos.map((f) => {
      if (f.type.startsWith('image/')) {
        return { nombre: f.name, url: URL.createObjectURL(f), esImagen: true };
      }
      return { nombre: f.name, url: null, esImagen: false };
    });
    setPreviews((prev) => [...prev, ...nuevasPreviews]);
  };

  const eliminarArchivo = (index) => {
    setArchivos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const validar = () => {
    const e = {};
    if (!form.plant_id) e.plant_id = 'Obligatorio';
    if (!form.client_name.trim()) e.client_name = 'Obligatorio';
    if (!form.address.trim()) e.address = 'Obligatorio';
    if (!form.contact_person.trim()) e.contact_person = 'Obligatorio';
    if (!form.contact_phone.trim()) e.contact_phone = 'Obligatorio';
    if (!form.call_schedule.trim()) e.call_schedule = 'Obligatorio';
    if (form.current_brands.length === 0) e.current_brands = 'Selecciona al menos una marca';
    if (!form.contract_type_id) e.contract_type_id = 'Obligatorio';
    if (!form.barrel_volume_id) e.barrel_volume_id = 'Obligatorio';
    if (!form.barrel_discount_type_id) e.barrel_discount_type_id = 'Obligatorio';
    if (form.improvement_points.length === 0) e.improvement_points = 'Selecciona al menos uno';
    if (form.interest_brands.length === 0) e.interest_brands = 'Selecciona al menos una';
    if (form.proposal_priorities.length === 0) e.proposal_priorities = 'Selecciona al menos una';
    // other_brands_text obligatorio si "Otras marcas" está seleccionada
    if (otrasMarcasId && form.current_brands.includes(otrasMarcasId) && !form.other_brands_text.trim()) {
      e.other_brands_text = 'Escribe qué otras marcas';
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const formularioCompleto = () => {
    return form.plant_id && form.client_name.trim() && form.address.trim() &&
      form.contact_person.trim() && form.contact_phone.trim() && form.call_schedule.trim() &&
      form.current_brands.length > 0 && form.contract_type_id &&
      form.barrel_volume_id && form.barrel_discount_type_id &&
      form.improvement_points.length > 0 && form.interest_brands.length > 0 &&
      form.proposal_priorities.length > 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validar()) return;

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('plant_id', form.plant_id);
      formData.append('client_code', form.client_code);
      formData.append('client_name', form.client_name);
      formData.append('address', form.address);
      formData.append('contact_person', form.contact_person);
      formData.append('contact_phone', form.contact_phone);
      formData.append('call_schedule', form.call_schedule);
      formData.append('other_brands_text', form.other_brands_text);
      formData.append('contract_type_id', form.contract_type_id);
      formData.append('barrel_volume_id', form.barrel_volume_id);
      formData.append('barrel_discount_type_id', form.barrel_discount_type_id);
      if (form.service_rating > 0) formData.append('service_rating', form.service_rating);
      formData.append('notes', form.notes);

      // Arrays como JSON string
      formData.append('current_brands', JSON.stringify(form.current_brands));
      formData.append('improvement_points', JSON.stringify(form.improvement_points));
      formData.append('interest_brands', JSON.stringify(form.interest_brands));
      formData.append('proposal_priorities', JSON.stringify(form.proposal_priorities));

      archivos.forEach((f) => formData.append('files', f));

      await api.post('/prospecting', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate('/exito-prospeccion');
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Error al enviar el formulario';
      alert(msg);
    } finally {
      setEnviando(false);
    }
  };

  const inputClasses = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm';
  const selectClasses = inputClasses;

  // Comprueba si el formulario tiene datos para avisar al cambiar
  const tienesDatos = () => {
    return form.client_name.trim() || form.address.trim() || form.contact_person.trim() ||
      form.contact_phone.trim() || form.call_schedule.trim() || form.current_brands.length > 0 ||
      form.contract_type_id || form.barrel_volume_id || form.barrel_discount_type_id ||
      form.improvement_points.length > 0 || form.interest_brands.length > 0 ||
      form.proposal_priorities.length > 0 || form.notes.trim();
  };

  const handleCambiar = () => {
    if (tienesDatos()) {
      if (window.confirm('Si cambias de formulario perderás los datos introducidos. ¿Estás seguro?')) {
        onCambiarFormulario('altas');
      }
    } else {
      onCambiarFormulario('altas');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-7 sm:h-8" />
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <span className="text-gray-500 hidden sm:inline">{usuario?.full_name || usuario?.username}</span>
              {usuario?.role === 'admin' && (
                <button onClick={() => navigate('/admin')} className="text-blue-600 hover:text-blue-800">
                  Admin
                </button>
              )}
              <button onClick={() => { cerrarSesion(); navigate('/login'); }} className="text-red-600 hover:text-red-800">
                Salir
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-sm sm:text-lg font-bold text-amber-700">Prospección de Cliente de Cerveza</h1>
            <button onClick={handleCambiar} className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline">
              Cambiar a Alta de Cliente
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6">
        {/* Planta */}
        <FormField label="Planta" obligatorio error={errores.plant_id}>
          <select value={form.plant_id} onChange={(e) => handleChange('plant_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.plants.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </select>
        </FormField>

        {/* Código de cliente */}
        <FormField label="Código de cliente">
          <input type="text" maxLength={10} value={form.client_code} onChange={(e) => handleChange('client_code', e.target.value)} className={inputClasses} />
        </FormField>

        {/* Nombre del cliente */}
        <FormField label="Nombre del cliente" obligatorio error={errores.client_name}>
          <input type="text" maxLength={40} value={form.client_name} onChange={(e) => handleChange('client_name', e.target.value)} className={inputClasses} />
        </FormField>

        {/* Dirección */}
        <FormField label="Dirección" obligatorio error={errores.address}>
          <input type="text" maxLength={40} value={form.address} onChange={(e) => handleChange('address', e.target.value)} className={inputClasses} />
        </FormField>

        {/* Persona de contacto */}
        <FormField label="Persona de contacto" obligatorio error={errores.contact_person}>
          <input type="text" maxLength={40} value={form.contact_person} onChange={(e) => handleChange('contact_person', e.target.value)} className={inputClasses} />
        </FormField>

        {/* Teléfono contacto */}
        <FormField label="Teléfono contacto" obligatorio error={errores.contact_phone}>
          <input type="text" maxLength={40} value={form.contact_phone} onChange={(e) => handleChange('contact_phone', e.target.value)} className={inputClasses} />
        </FormField>

        {/* Horario llamar */}
        <FormField label="Horario llamar" obligatorio error={errores.call_schedule}>
          <input type="text" maxLength={40} value={form.call_schedule} onChange={(e) => handleChange('call_schedule', e.target.value)} className={inputClasses} placeholder="Ej: Mañanas de 9 a 12" />
        </FormField>

        {/* Marcas actuales en barril y botella */}
        <FormField label="Marcas actuales en barril y botella" obligatorio error={errores.current_brands}>
          <div className="space-y-2">
            {maestros.beer_brands.map((brand) => (
              <label key={brand.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.current_brands.includes(brand.id)}
                  onChange={() => handleCheckboxMulti('current_brands', brand.id)}
                  className="w-4 h-4 text-amber-600 rounded" />
                <span className="text-sm">{brand.name}</span>
              </label>
            ))}
          </div>
          {/* Campo de texto para "Otras marcas" */}
          {otrasMarcasId && form.current_brands.includes(otrasMarcasId) && (
            <div className="mt-3">
              <input type="text" maxLength={200} value={form.other_brands_text}
                onChange={(e) => handleChange('other_brands_text', e.target.value)}
                className={inputClasses} placeholder="Escribir qué otras marcas..." />
              {errores.other_brands_text && <p className="mt-1 text-sm text-red-600">{errores.other_brands_text}</p>}
            </div>
          )}
        </FormField>

        {/* Tipo de contrato */}
        <FormField label="Tipo de contrato o compromiso actual" obligatorio error={errores.contract_type_id}>
          <div className="space-y-2">
            {maestros.contract_types.map((ct) => (
              <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="contract_type" checked={form.contract_type_id === String(ct.id)}
                  onChange={() => handleChange('contract_type_id', String(ct.id))}
                  className="w-4 h-4 text-amber-600" />
                <span className="text-sm">{ct.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Volumen de barril */}
        <FormField label="Volumen de barril aproximado al año" obligatorio error={errores.barrel_volume_id}>
          <div className="space-y-2">
            {maestros.barrel_volumes.map((bv) => (
              <label key={bv.id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="barrel_volume" checked={form.barrel_volume_id === String(bv.id)}
                  onChange={() => handleChange('barrel_volume_id', String(bv.id))}
                  className="w-4 h-4 text-amber-600" />
                <span className="text-sm">{bv.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Tipo de descuento */}
        <FormField label="Tipo de descuento en barril" obligatorio error={errores.barrel_discount_type_id}>
          <div className="space-y-2">
            {maestros.barrel_discount_types.map((bdt) => (
              <label key={bdt.id} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="barrel_discount" checked={form.barrel_discount_type_id === String(bdt.id)}
                  onChange={() => handleChange('barrel_discount_type_id', String(bdt.id))}
                  className="w-4 h-4 text-amber-600" />
                <span className="text-sm">{bdt.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Valoración del servicio 1-5 estrellas */}
        <FormField label="¿Cómo valoraría globalmente el servicio que recibe?">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button"
                onClick={() => handleChange('service_rating', form.service_rating === n ? 0 : n)}
                className="text-3xl transition-colors focus:outline-none"
                title={`${n} estrella${n > 1 ? 's' : ''}`}
              >
                <span className={n <= form.service_rating ? 'text-amber-400' : 'text-gray-300'}>
                  ★
                </span>
              </button>
            ))}
            {form.service_rating > 0 && (
              <span className="ml-2 text-sm text-gray-500 self-center">{form.service_rating}/5</span>
            )}
          </div>
        </FormField>

        {/* Puntos de mejora */}
        <FormField label="Puntos de mejora que menciona" obligatorio error={errores.improvement_points}>
          <div className="space-y-2">
            {maestros.improvement_points.map((ip) => (
              <label key={ip.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.improvement_points.includes(ip.id)}
                  onChange={() => handleCheckboxMulti('improvement_points', ip.id)}
                  className="w-4 h-4 text-amber-600 rounded" />
                <span className="text-sm">{ip.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Marcas de interés */}
        <FormField label="¿Con qué marcas nuestras mostraría interés?" obligatorio error={errores.interest_brands}>
          <div className="space-y-2">
            {maestros.interest_brands.map((ib) => (
              <label key={ib.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.interest_brands.includes(ib.id)}
                  onChange={() => handleCheckboxMulti('interest_brands', ib.id)}
                  className="w-4 h-4 text-amber-600 rounded" />
                <span className="text-sm">{ib.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Prioridades de propuesta */}
        <FormField label="¿Qué priorizaría en nuestra propuesta?" obligatorio error={errores.proposal_priorities}>
          <div className="space-y-2">
            {maestros.proposal_priorities.map((pp) => (
              <label key={pp.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.proposal_priorities.includes(pp.id)}
                  onChange={() => handleCheckboxMulti('proposal_priorities', pp.id)}
                  className="w-4 h-4 text-amber-600 rounded" />
                <span className="text-sm">{pp.name}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* Notas adicionales */}
        <FormField label="Notas adicionales (lo que ha dicho el cliente)">
          <textarea rows={4} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)}
            className={inputClasses + ' resize-none'} />
        </FormField>

        {/* Ficheros */}
        <FormField label="Adjuntar ficheros/fotos">
          <input type="file" multiple accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx"
            onChange={handleArchivos}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" />
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {previews.map((p, i) => (
                <div key={i} className="relative bg-gray-100 rounded-lg p-2">
                  {p.esImagen ? (
                    <img src={p.url} alt={p.nombre} className="w-full h-24 object-cover rounded" />
                  ) : (
                    <div className="h-24 flex items-center justify-center text-sm text-gray-600">
                      {p.nombre}
                    </div>
                  )}
                  <button type="button" onClick={() => eliminarArchivo(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormField>

        {/* Botón enviar */}
        <div className="mt-6 mb-10">
          <button
            type="submit"
            disabled={!formularioCompleto() || enviando}
            className="w-full bg-amber-600 text-white py-3.5 rounded-lg font-semibold text-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {enviando ? 'Enviando...' : 'Enviar Prospección'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProspectingFormPage;
