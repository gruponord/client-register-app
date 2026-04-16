import { useState } from 'react';
import FormPage from './FormPage';
import ProspectingFormPage from './ProspectingFormPage';

const FormSelectorPage = () => {
  const [formularioActivo, setFormularioActivo] = useState(null); // null = selector, 'altas' | 'prospeccion'

  if (formularioActivo === 'altas') {
    return <FormPage onCambiarFormulario={(tipo) => setFormularioActivo(tipo === 'selector' ? null : tipo)} />;
  }

  if (formularioActivo === 'prospeccion') {
    return <ProspectingFormPage onCambiarFormulario={(tipo) => setFormularioActivo(tipo === 'selector' ? null : tipo)} />;
  }

  // Pantalla de selección
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">Selecciona el tipo de formulario</h1>
          <p className="text-gray-500 mt-2">Elige qué tipo de registro quieres realizar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Alta de Cliente */}
          <button
            onClick={() => setFormularioActivo('altas')}
            className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-blue-500 p-8 text-left transition-all hover:shadow-xl group"
          >
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

          {/* Prospección de Cerveza */}
          <button
            onClick={() => setFormularioActivo('prospeccion')}
            className="bg-white rounded-xl shadow-lg border-2 border-transparent hover:border-amber-500 p-8 text-left transition-all hover:shadow-xl group"
          >
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
        </div>
      </div>
    </div>
  );
};

export default FormSelectorPage;
