import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  { path: '/admin', label: 'Dashboard', exact: true },
  { path: '/admin/usuarios', label: 'Usuarios' },
  {
    label: 'Maestros',
    children: [
      { path: '/admin/plantas', label: 'Plantas' },
      { path: '/admin/maestros/commercials', label: 'Comerciales' },
      { path: '/admin/maestros/client_actions', label: 'Acciones de Cliente' },
      { path: '/admin/maestros/client_classes', label: 'Clases de Cliente' },
      { path: '/admin/maestros/billing_types', label: 'Tipos de Facturación' },
      { path: '/admin/maestros/payment_methods', label: 'Formas de Pago' },
      { path: '/admin/maestros/visit_periods', label: 'Periodos de Visita' },
    ],
  },
  {
    label: 'Maestros Prospección',
    children: [
      { path: '/admin/maestros/beer_brands', label: 'Marcas Cerveza' },
      { path: '/admin/maestros/contract_types', label: 'Tipos Contrato' },
      { path: '/admin/maestros/barrel_volumes', label: 'Volúmenes Barril' },
      { path: '/admin/maestros/barrel_discount_types', label: 'Tipos Descuento Barril' },
      { path: '/admin/maestros/improvement_points', label: 'Puntos de Mejora' },
      { path: '/admin/maestros/interest_brands', label: 'Marcas Interés' },
      { path: '/admin/maestros/proposal_priorities', label: 'Prioridades Propuesta' },
    ],
  },
  { path: '/admin/respuestas', label: 'Respuestas Altas' },
  { path: '/admin/prospecciones', label: 'Prospecciones' },
  { path: '/admin/auditoria', label: 'Auditoría' },
];

const AdminLayout = () => {
  const { usuario, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const [submenusAbiertos, setSubmenusAbiertos] = useState({});
  const [sidebarAbierto, setSidebarAbierto] = useState(false);

  const handleLogout = () => {
    cerrarSesion();
    navigate('/login');
  };

  const linkClasses = ({ isActive }) =>
    `block px-4 py-2 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Overlay móvil */}
      {sidebarAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={() => setSidebarAbierto(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-800 text-white transform transition-transform lg:translate-x-0 ${sidebarAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-700">
          <img src="/logo_GNP.jpg" alt="Grupo Nord Pirineus" className="h-10 mb-2 brightness-0 invert" />
          <h1 className="text-lg font-bold">Alta de Clientes</h1>
          <p className="text-xs text-gray-400 mt-1">Panel de Administración</p>
        </div>

        <nav className="p-4 space-y-1">
          {menuItems.map((item) => {
            if (item.children) {
              const abierto = submenusAbiertos[item.label] || false;
              return (
                <div key={item.label}>
                  <button
                    onClick={() => setSubmenusAbiertos(prev => ({ ...prev, [item.label]: !prev[item.label] }))}
                    className="w-full text-left px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex justify-between items-center"
                  >
                    {item.label}
                    <span className={`transform transition-transform ${abierto ? 'rotate-180' : ''}`}>&#9662;</span>
                  </button>
                  {abierto && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <NavLink key={child.path} to={child.path} className={linkClasses} onClick={() => setSidebarAbierto(false)}>
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink key={item.path} to={item.path} end={item.exact} className={linkClasses} onClick={() => setSidebarAbierto(false)}>
                {item.label}
              </NavLink>
            );
          })}

          <div className="pt-4 border-t border-gray-700 mt-4">
            <NavLink to="/formulario" className="block px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white">
              Ir al Formulario
            </NavLink>
          </div>
        </nav>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarAbierto(true)}
            className="lg:hidden text-gray-600 hover:text-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-4 ml-auto">
            <span className="text-sm text-gray-600">
              {usuario?.full_name || usuario?.username}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
