import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FormPage from './FormPage';
import ProspectingFormPage from './ProspectingFormPage';
import PlvFormPage from './PlvFormPage';
import OfertasFormPage from './OfertasFormPage';

// Codigos que son PERMISOS dentro de una utilidad, no pantallas propias.
// Reutilizan el mecanismo de utilidades para que el admin los asigne con el
// mismo checkbox, pero no deben aparecer en el selector ni contar para decidir
// si hay que ensenarlo: un usuario con 'ofertas' y 'ofertas_dto' tiene UNA
// utilidad, y debe entrar directo en vez de ver un selector de un solo boton.
const PERMISOS = ['ofertas_dto'];

// El admin puede usar todas las utilidades aunque no las tenga marcadas.
const utilidadesPermitidas = (usuario) => {
  if (!usuario) return [];
  if (usuario.role === 'admin') return ['altas', 'prospecting', 'plv', 'ofertas'];
  const propias = Array.isArray(usuario.utilities) ? usuario.utilities : [];
  return propias.filter((c) => !PERMISOS.includes(c));
};

// Mapeo codigo utilidad -> id interno de formulario
const tipoDesdeCodigo = (codigo) => {
  if (codigo === 'altas') return 'altas';
  if (codigo === 'prospecting') return 'prospeccion';
  if (codigo === 'plv') return 'plv';
  if (codigo === 'ofertas') return 'ofertas';
  return null;
};

const FormSelectorPage = () => {
  const { usuario, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const permitidas = utilidadesPermitidas(usuario);

  // Si solo tiene una utilidad, entrar directamente sin selector.
  const inicial = permitidas.length === 1 ? tipoDesdeCodigo(permitidas[0]) : null;
  const [formularioActivo, setFormularioActivo] = useState(inicial);

  const cambiarFormulario = (tipo) => {
    if (tipo === 'selector') {
      if (permitidas.length > 1) setFormularioActivo(null);
      return;
    }
    const codigo = tipo === 'altas' ? 'altas' : tipo === 'prospeccion' ? 'prospecting'
      : tipo === 'plv' ? 'plv' : tipo === 'ofertas' ? 'ofertas' : null;
    if (!codigo || !permitidas.includes(codigo)) return;
    setFormularioActivo(tipo);
  };

  if (permitidas.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-12 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Sin acceso a formularios</h1>
          <p className="text-sm text-gray-600 mb-6">
            Tu usuario no tiene ninguna utilidad asignada. Contacta con el administrador
            para que te habilite acceso.
          </p>
          <button
            onClick={() => { cerrarSesion(); navigate('/login'); }}
            className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (formularioActivo === 'altas') {
    return <FormPage onCambiarFormulario={cambiarFormulario} permitidas={permitidas} />;
  }
  if (formularioActivo === 'prospeccion') {
    return <ProspectingFormPage onCambiarFormulario={cambiarFormulario} permitidas={permitidas} />;
  }
  if (formularioActivo === 'plv') {
    return <PlvFormPage onCambiarFormulario={cambiarFormulario} permitidas={permitidas} />;
  }
  if (formularioActivo === 'ofertas') {
    return <OfertasFormPage onCambiarFormulario={cambiarFormulario} permitidas={permitidas} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">Selecciona el tipo de formulario</h1>
          <p className="text-gray-500 mt-2">Elige qué tipo de registro quieres realizar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {permitidas.includes('altas') && (
            <button onClick={() => setFormularioActivo('altas')}
              className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-blue-500 p-6 text-left transition-all hover:shadow-xl group">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Alta de Cliente</h2>
              <p className="text-sm text-gray-500">
                Registrar un nuevo cliente con todos sus datos comerciales, fiscales y logísticos.
              </p>
            </button>
          )}

          {permitidas.includes('prospecting') && (
            <button onClick={() => setFormularioActivo('prospeccion')}
              className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-amber-500 p-6 text-left transition-all hover:shadow-xl group">
              <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-200 transition-colors">
                <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Prospección de Cerveza</h2>
              <p className="text-sm text-gray-500">
                Registrar información sobre un cliente potencial de cerveza: marcas, volumen, intereses.
              </p>
            </button>
          )}

          {permitidas.includes('ofertas') && (
            <button onClick={() => setFormularioActivo('ofertas')}
              className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-indigo-500 p-6 text-left transition-all hover:shadow-xl group">
              <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14h6m-6-4h6m2 9H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Listado de Precios</h2>
              <p className="text-sm text-gray-500">
                Montar un listado de precios personalizado para un cliente y compartirlo en PDF.
              </p>
            </button>
          )}

          {permitidas.includes('plv') && (
            <button onClick={() => setFormularioActivo('plv')}
              className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-emerald-500 p-6 text-left transition-all hover:shadow-xl group">
              <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Petición PLV</h2>
              <p className="text-sm text-gray-500">
                Pedir material PLV (mobiliario, parasoles, botelleros...) a una empresa del grupo.
              </p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormSelectorPage;
