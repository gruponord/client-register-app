import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import FormField from '../components/FormField';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const DIAS_DESCANSO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'No cierra'];

const generarHoras = () => {
  const horas = [];
  for (let h = 0; h < 24; h++) {
    horas.push(`${String(h).padStart(2, '0')}:00`);
    horas.push(`${String(h).padStart(2, '0')}:30`);
  }
  return horas;
};

const HORAS = generarHoras();

const FormPage = () => {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useAuth();
  const [maestros, setMaestros] = useState({
    plants: [], commercials: [], client_actions: [], client_classes: [],
    billing_types: [], payment_methods: [], visit_periods: [],
  });
  const [form, setForm] = useState({
    plant_id: '', commercial_id: '', client_action_id: '',
    group_code: '', previous_code: '', point_of_sale: '',
    commercial_name: '', economic_segmentation: '',
    business_name: '', nif_cif: '', street_address: '', postal_code: '',
    city: '', phone: '', contact_email: '', billing_email: '',
    client_class_id: '', billing_type_id: '', payment_method_id: '',
    visit_days: [], client_position: '', visit_period_id: '',
    telesales: '', barrel_client: '', delivery_days: [],
    delivery_time_start: '', delivery_time_end: '',
    rest_days: [], morning_order: '', observations: '',
  });
  const [archivos, setArchivos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const cargarMaestros = async () => {
      try {
        const [plants, commercials, actions, classes, billing, payment, periods] = await Promise.all([
          api.get('/plants?active=true'),
          api.get('/masters/commercials?active=true'),
          api.get('/masters/client_actions?active=true'),
          api.get('/masters/client_classes?active=true'),
          api.get('/masters/billing_types?active=true'),
          api.get('/masters/payment_methods?active=true'),
          api.get('/masters/visit_periods?active=true'),
        ]);
        setMaestros({
          plants: plants.data,
          commercials: commercials.data,
          client_actions: actions.data,
          client_classes: classes.data,
          billing_types: billing.data,
          payment_methods: payment.data,
          visit_periods: periods.data,
        });
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

  const handleCheckbox = (campo, valor) => {
    setForm((prev) => {
      const actual = prev[campo];
      if (actual.includes(valor)) {
        return { ...prev, [campo]: actual.filter((v) => v !== valor) };
      }
      return { ...prev, [campo]: [...actual, valor] };
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
    if (!form.commercial_id) e.commercial_id = 'Obligatorio';
    if (!form.client_action_id) e.client_action_id = 'Obligatorio';
    if (!form.commercial_name.trim()) e.commercial_name = 'Obligatorio';
    if (!form.economic_segmentation) e.economic_segmentation = 'Obligatorio';
    if (!form.business_name.trim()) e.business_name = 'Obligatorio';
    if (!form.nif_cif.trim()) e.nif_cif = 'Obligatorio';
    if (!form.street_address.trim()) e.street_address = 'Obligatorio';
    if (!form.postal_code.trim()) e.postal_code = 'Obligatorio';
    if (!form.city.trim()) e.city = 'Obligatorio';
    if (!form.phone.trim()) e.phone = 'Obligatorio';
    else if (!/^[0-9+\s()-]+$/.test(form.phone)) e.phone = 'Solo números';
    if (!form.contact_email.trim()) e.contact_email = 'Obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) e.contact_email = 'Email no válido';
    if (!form.billing_email.trim()) e.billing_email = 'Obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billing_email)) e.billing_email = 'Email no válido';
    if (!form.client_class_id) e.client_class_id = 'Obligatorio';
    if (!form.billing_type_id) e.billing_type_id = 'Obligatorio';
    if (!form.payment_method_id) e.payment_method_id = 'Obligatorio';
    if (form.visit_days.length === 0) e.visit_days = 'Selecciona al menos un día';
    if (!form.client_position.trim()) e.client_position = 'Obligatorio';
    if (!form.visit_period_id) e.visit_period_id = 'Obligatorio';
    if (form.telesales === '') e.telesales = 'Obligatorio';
    if (form.barrel_client === '') e.barrel_client = 'Obligatorio';
    if (form.delivery_days.length === 0) e.delivery_days = 'Selecciona al menos un día';
    if (!form.delivery_time_start) e.delivery_time_start = 'Obligatorio';
    if (!form.delivery_time_end) e.delivery_time_end = 'Obligatorio';
    if (form.rest_days.length === 0) e.rest_days = 'Selecciona al menos una opción';
    if (form.morning_order === '') e.morning_order = 'Obligatorio';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const formularioCompleto = () => {
    return form.plant_id && form.commercial_id && form.client_action_id &&
      form.commercial_name.trim() && form.economic_segmentation &&
      form.business_name.trim() && form.nif_cif.trim() && form.street_address.trim() &&
      form.postal_code.trim() && form.city.trim() && form.phone.trim() &&
      form.contact_email.trim() && form.billing_email.trim() &&
      form.client_class_id && form.billing_type_id && form.payment_method_id &&
      form.visit_days.length > 0 && form.client_position.trim() && form.visit_period_id &&
      form.telesales !== '' && form.barrel_client !== '' && form.delivery_days.length > 0 &&
      form.delivery_time_start && form.delivery_time_end && form.rest_days.length > 0 &&
      form.morning_order !== '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validar()) return;

    setEnviando(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          formData.append(key, value.join(', '));
        } else {
          formData.append(key, value);
        }
      });
      archivos.forEach((f) => formData.append('files', f));

      await api.post('/submissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate('/exito');
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Error al enviar el formulario';
      alert(msg);
    } finally {
      setEnviando(false);
    }
  };

  const inputClasses = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm';
  const selectClasses = inputClasses;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-8" />
            <h1 className="text-lg font-bold text-gray-800">Registro de Alta de Cliente</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{usuario?.full_name || usuario?.username}</span>
            {usuario?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="text-sm text-blue-600 hover:text-blue-800">
                Admin
              </button>
            )}
            <button onClick={() => { cerrarSesion(); navigate('/login'); }} className="text-sm text-red-600 hover:text-red-800">
              Salir
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6">
        {/* 1. Planta */}
        <FormField label="Planta" obligatorio error={errores.plant_id}>
          <select value={form.plant_id} onChange={(e) => handleChange('plant_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.plants.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </select>
        </FormField>

        {/* 2. Comercial */}
        <FormField label="Comercial" obligatorio error={errores.commercial_id}>
          <select value={form.commercial_id} onChange={(e) => handleChange('commercial_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.commercials.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
        </FormField>

        {/* 3. Acción de cliente */}
        <FormField label="Acción de cliente" obligatorio error={errores.client_action_id}>
          <select value={form.client_action_id} onChange={(e) => handleChange('client_action_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.client_actions.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </FormField>

        {/* Campos opcionales */}
        <FormField label="Grupo de cliente">
          <input type="text" value={form.group_code} onChange={(e) => handleChange('group_code', e.target.value)} className={inputClasses} />
        </FormField>

        <FormField label="Código anterior">
          <input type="text" value={form.previous_code} onChange={(e) => handleChange('previous_code', e.target.value)} className={inputClasses} />
        </FormField>

        <FormField label="Punto de venta">
          <input type="text" value={form.point_of_sale} onChange={(e) => handleChange('point_of_sale', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 8. Nombre comercial */}
        <FormField label="Nombre comercial" obligatorio error={errores.commercial_name}>
          <input type="text" maxLength={40} value={form.commercial_name} onChange={(e) => handleChange('commercial_name', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 9. Segmentación económica */}
        <FormField label="Segmentación económica" obligatorio error={errores.economic_segmentation}>
          <div className="flex gap-6">
            {['A', 'B', 'C', 'D'].map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="economic_segmentation" value={s}
                  checked={form.economic_segmentation === s}
                  onChange={() => handleChange('economic_segmentation', s)}
                  className="w-4 h-4 text-blue-600" />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* 10. Razón social */}
        <FormField label="Razón social" obligatorio error={errores.business_name}>
          <input type="text" maxLength={40} value={form.business_name} onChange={(e) => handleChange('business_name', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 11. NIF/CIF */}
        <FormField label="NIF/CIF" obligatorio error={errores.nif_cif}>
          <input type="text" maxLength={20} value={form.nif_cif} onChange={(e) => handleChange('nif_cif', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 12-14. Dirección */}
        <FormField label="Calle y número" obligatorio error={errores.street_address}>
          <input type="text" maxLength={40} value={form.street_address} onChange={(e) => handleChange('street_address', e.target.value)} className={inputClasses} />
        </FormField>

        <FormField label="Código postal" obligatorio error={errores.postal_code}>
          <input type="text" maxLength={10} value={form.postal_code} onChange={(e) => handleChange('postal_code', e.target.value)} className={inputClasses} />
        </FormField>

        <FormField label="Población" obligatorio error={errores.city}>
          <input type="text" maxLength={50} value={form.city} onChange={(e) => handleChange('city', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 15. Teléfono */}
        <FormField label="Teléfono" obligatorio error={errores.phone}>
          <input type="text" maxLength={20} value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputClasses} placeholder="Solo números" />
        </FormField>

        {/* 16-17. Emails */}
        <FormField label="Mail contacto" obligatorio error={errores.contact_email}>
          <input type="email" maxLength={40} value={form.contact_email} onChange={(e) => handleChange('contact_email', e.target.value)} className={inputClasses} />
        </FormField>

        <FormField label="Mail facturación" obligatorio error={errores.billing_email}>
          <input type="email" maxLength={40} value={form.billing_email} onChange={(e) => handleChange('billing_email', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 18-20. Selects maestros */}
        <FormField label="Clase de cliente" obligatorio error={errores.client_class_id}>
          <select value={form.client_class_id} onChange={(e) => handleChange('client_class_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.client_classes.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
        </FormField>

        <FormField label="Tipo de facturación" obligatorio error={errores.billing_type_id}>
          <select value={form.billing_type_id} onChange={(e) => handleChange('billing_type_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.billing_types.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}
          </select>
        </FormField>

        <FormField label="Forma de pago" obligatorio error={errores.payment_method_id}>
          <select value={form.payment_method_id} onChange={(e) => handleChange('payment_method_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.payment_methods.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </select>
        </FormField>

        {/* 21. Día de visita */}
        <FormField label="Día de visita" obligatorio error={errores.visit_days}>
          <div className="flex flex-wrap gap-4">
            {DIAS_SEMANA.map((dia) => (
              <label key={dia} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.visit_days.includes(dia)}
                  onChange={() => handleCheckbox('visit_days', dia)}
                  className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">{dia}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* 22. Posición de cliente */}
        <FormField label="Posición de cliente" obligatorio error={errores.client_position}>
          <input type="text" maxLength={50} value={form.client_position} onChange={(e) => handleChange('client_position', e.target.value)} className={inputClasses} />
        </FormField>

        {/* 23. Periodo de visita */}
        <FormField label="Periodo de visita" obligatorio error={errores.visit_period_id}>
          <select value={form.visit_period_id} onChange={(e) => handleChange('visit_period_id', e.target.value)} className={selectClasses}>
            <option value="">Seleccionar...</option>
            {maestros.visit_periods.map((v) => <option key={v.id} value={v.id}>{v.code} - {v.name}</option>)}
          </select>
        </FormField>

        {/* 24. Televenta */}
        <FormField label="Televenta" obligatorio error={errores.telesales}>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="telesales" checked={form.telesales === 'true'}
                onChange={() => handleChange('telesales', 'true')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">Sí</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="telesales" checked={form.telesales === 'false'}
                onChange={() => handleChange('telesales', 'false')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">No</span>
            </label>
          </div>
        </FormField>

        {/* 25. Cliente barril */}
        <FormField label="Cliente barril" obligatorio error={errores.barrel_client}>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="barrel_client" checked={form.barrel_client === 'true'}
                onChange={() => handleChange('barrel_client', 'true')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">Sí</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="barrel_client" checked={form.barrel_client === 'false'}
                onChange={() => handleChange('barrel_client', 'false')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">No</span>
            </label>
          </div>
        </FormField>

        {/* 26. Día de reparto */}
        <FormField label="Día de reparto" obligatorio error={errores.delivery_days}>
          <div className="flex flex-wrap gap-4">
            {DIAS_SEMANA.map((dia) => (
              <label key={dia} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.delivery_days.includes(dia)}
                  onChange={() => handleCheckbox('delivery_days', dia)}
                  className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">{dia}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* 27. Horario de reparto */}
        <FormField label="Horario de reparto" obligatorio error={errores.delivery_time_start || errores.delivery_time_end}>
          <div className="flex gap-4 items-center">
            <select value={form.delivery_time_start} onChange={(e) => handleChange('delivery_time_start', e.target.value)} className={selectClasses}>
              <option value="">Hora inicio</option>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-500">a</span>
            <select value={form.delivery_time_end} onChange={(e) => handleChange('delivery_time_end', e.target.value)} className={selectClasses}>
              <option value="">Hora fin</option>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </FormField>

        {/* 28. Día de descanso */}
        <FormField label="Día de descanso" obligatorio error={errores.rest_days}>
          <div className="flex flex-wrap gap-4">
            {DIAS_DESCANSO.map((dia) => (
              <label key={dia} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.rest_days.includes(dia)}
                  onChange={() => handleCheckbox('rest_days', dia)}
                  className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">{dia}</span>
              </label>
            ))}
          </div>
        </FormField>

        {/* 29. Pedido mañana */}
        <FormField label="¿Lleva pedido mañana?" obligatorio error={errores.morning_order}>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="morning_order" checked={form.morning_order === 'true'}
                onChange={() => handleChange('morning_order', 'true')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">Sí</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="morning_order" checked={form.morning_order === 'false'}
                onChange={() => handleChange('morning_order', 'false')} className="w-4 h-4 text-blue-600" />
              <span className="text-sm">No</span>
            </label>
          </div>
        </FormField>

        {/* 30. Observaciones */}
        <FormField label="Observaciones">
          <textarea rows={4} value={form.observations} onChange={(e) => handleChange('observations', e.target.value)}
            className={inputClasses + ' resize-none'} />
        </FormField>

        {/* 31. Ficheros */}
        <FormField label="Adjuntar ficheros/fotos">
          <input type="file" multiple accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx"
            onChange={handleArchivos}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
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
            className="w-full bg-blue-600 text-white py-3.5 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {enviando ? 'Enviando...' : 'Registrar Alta'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormPage;
