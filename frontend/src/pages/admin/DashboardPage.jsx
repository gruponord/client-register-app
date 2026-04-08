import { useState, useEffect } from 'react';
import api from '../../services/api';

const DashboardPage = () => {
  const [stats, setStats] = useState({ submissions: 0, users: 0, plants: 0 });

  useEffect(() => {
    const cargar = async () => {
      try {
        const [subs, users, plants] = await Promise.all([
          api.get('/submissions?limit=1'),
          api.get('/users'),
          api.get('/plants'),
        ]);
        setStats({
          submissions: subs.data.total || 0,
          users: users.data.length || 0,
          plants: plants.data.length || 0,
        });
      } catch (err) {
        console.error('Error cargando dashboard:', err);
      }
    };
    cargar();
  }, []);

  const cards = [
    { label: 'Total Altas', valor: stats.submissions, color: 'bg-blue-500' },
    { label: 'Usuarios', valor: stats.users, color: 'bg-green-500' },
    { label: 'Plantas', valor: stats.plants, color: 'bg-purple-500' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border p-6">
            <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center mb-4`}>
              <span className="text-white text-xl font-bold">#</span>
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{card.valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
