import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [exito, setExito] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setCargando(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setExito(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al restablecer la contraseña');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">Nueva contraseña</h1>
          <p className="text-gray-500 mt-2">Introduce tu nueva contraseña</p>
        </div>

        {exito ? (
          <div>
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-lg text-sm mb-6">
              Contraseña actualizada correctamente. Ya puedes iniciar sesión con tu nueva contraseña.
            </div>
            <Link to="/login" className="block w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 text-center transition-colors">
              Iniciar Sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                autoFocus
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {cargando ? 'Guardando...' : 'Restablecer contraseña'}
            </button>

            <Link to="/login" className="block text-center text-blue-600 hover:text-blue-800 text-sm font-medium">
              Volver al inicio de sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
