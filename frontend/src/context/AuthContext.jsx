import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(() => {
    const saved = localStorage.getItem('usuario');
    return saved ? JSON.parse(saved) : null;
  });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const verificar = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setCargando(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        setUsuario(data);
        localStorage.setItem('usuario', JSON.stringify(data));
      } catch {
        cerrarSesion();
      } finally {
        setCargando(false);
      }
    };
    verificar();
  }, []);

  const iniciarSesion = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    return data.usuario;
  };

  const cerrarSesion = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
};
