import { useNavigate } from 'react-router-dom';

const ProspectingSuccessPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
        <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-12 mx-auto mb-6" />

        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">Prospección registrada correctamente</h1>
        <p className="text-gray-500 mb-8">
          El formulario de prospección se ha enviado con éxito. Se ha notificado por email a los destinatarios de la planta.
        </p>

        <button
          onClick={() => navigate('/formulario')}
          className="bg-amber-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-amber-700 transition-colors"
        >
          Nuevo Registro
        </button>
      </div>
    </div>
  );
};

export default ProspectingSuccessPage;
