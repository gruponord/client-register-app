import { useState, useEffect } from 'react';
import api from '../../services/api';

const ProspectingSubmissionsPage = () => {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ plant_id: '', from: '', to: '' });
  const [plantas, setPlantas] = useState([]);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    const cargarMaestros = async () => {
      try {
        const { data } = await api.get('/plants');
        setPlantas(data);
      } catch (err) {
        console.error('Error:', err);
      }
    };
    cargarMaestros();
  }, []);

  const cargar = async (pag = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pag);
      params.append('limit', 20);
      if (filtros.plant_id) params.append('plant_id', filtros.plant_id);
      if (filtros.from) params.append('from', filtros.from);
      if (filtros.to) params.append('to', filtros.to);

      const { data } = await api.get(`/prospecting?${params.toString()}`);
      setRegistros(data.data);
      setTotal(data.total);
      setPagina(data.page);
      setTotalPaginas(data.totalPages);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const verDetalle = async (id) => {
    try {
      const { data } = await api.get(`/prospecting/${id}`);
      setDetalle(data);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const renderEstrellas = (rating) => {
    if (!rating) return 'No valorado';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating) + ` (${rating}/5)`;
  };

  const renderNombres = (items) => {
    if (!items || items.length === 0) return '-';
    return items.map((i) => i.name).join(', ');
  };

  const esImagen = (mime) => mime && mime.startsWith('image/');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Prospecciones de Cerveza</h2>
      </div>

      {/* Filtros */}
      <form onSubmit={(e) => { e.preventDefault(); cargar(1); }}
        className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select value={filtros.plant_id} onChange={(e) => setFiltros({ ...filtros, plant_id: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las plantas</option>
          {plantas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={filtros.from} onChange={(e) => setFiltros({ ...filtros, from: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filtros.to} onChange={(e) => setFiltros({ ...filtros, to: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700">
          Filtrar
        </button>
      </form>

      {/* Tabla */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Planta</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registrado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cargando ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No hay registros</td></tr>
            ) : registros.map((r) => (
              <tr key={r.id} onClick={() => verDetalle(r.id)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 text-sm">{r.id}</td>
                <td className="px-4 py-3 text-sm">{new Date(r.created_at).toLocaleString('es-ES')}</td>
                <td className="px-4 py-3 text-sm">{r.plant_name}</td>
                <td className="px-4 py-3 text-sm">{r.client_name}</td>
                <td className="px-4 py-3 text-sm">{r.contact_person}</td>
                <td className="px-4 py-3 text-sm">{r.contact_phone}</td>
                <td className="px-4 py-3 text-sm">{r.user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-700">Página {pagina} de {totalPaginas} ({total} registros)</span>
          <div className="flex gap-2">
            <button onClick={() => cargar(pagina - 1)} disabled={pagina <= 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">Anterior</button>
            <button onClick={() => cargar(pagina + 1)} disabled={pagina >= totalPaginas}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100">Siguiente</button>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Detalle Prospección #{detalle.id}</h3>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ['Fecha', new Date(detalle.created_at).toLocaleString('es-ES')],
                ['Registrado por', detalle.user_name],
                ['Planta', detalle.plant_name],
                ['Código de cliente', detalle.client_code],
                ['Nombre del cliente', detalle.client_name],
                ['Dirección', detalle.address],
                ['Persona de contacto', detalle.contact_person],
                ['Teléfono contacto', detalle.contact_phone],
                ['Horario llamar', detalle.call_schedule],
              ].map(([campo, valor]) => (
                <div key={campo} className="bg-gray-50 rounded px-3 py-2">
                  <span className="font-medium text-gray-600">{campo}:</span>{' '}
                  <span className="text-gray-800">{valor || '-'}</span>
                </div>
              ))}
            </div>

            {/* Campos especiales con más espacio */}
            <div className="mt-4 space-y-3 text-sm">
              <div className="bg-amber-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Marcas actuales:</span>{' '}
                <span className="text-gray-800">
                  {renderNombres(detalle.current_brands_names)}
                  {detalle.other_brands_text ? ` (Otras: ${detalle.other_brands_text})` : ''}
                </span>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Tipo de contrato:</span>{' '}
                <span className="text-gray-800">{detalle.contract_type_name || '-'}</span>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Volumen barril/año:</span>{' '}
                <span className="text-gray-800">{detalle.barrel_volume_name || '-'}</span>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Tipo descuento:</span>{' '}
                <span className="text-gray-800">{detalle.barrel_discount_type_name || '-'}</span>
              </div>
              <div className="bg-amber-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Valoración servicio:</span>{' '}
                <span className="text-amber-600">{renderEstrellas(detalle.service_rating)}</span>
              </div>
              <div className="bg-amber-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Puntos de mejora:</span>{' '}
                <span className="text-gray-800">{renderNombres(detalle.improvement_points_names)}</span>
              </div>
              <div className="bg-amber-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Marcas nuestras con interés:</span>{' '}
                <span className="text-gray-800">{renderNombres(detalle.interest_brands_names)}</span>
              </div>
              <div className="bg-amber-50 rounded px-3 py-2">
                <span className="font-medium text-gray-600">Prioridades propuesta:</span>{' '}
                <span className="text-gray-800">{renderNombres(detalle.proposal_priorities_names)}</span>
              </div>
              {detalle.notes && (
                <div className="bg-gray-50 rounded px-3 py-2">
                  <span className="font-medium text-gray-600">Notas:</span>{' '}
                  <span className="text-gray-800 whitespace-pre-wrap">{detalle.notes}</span>
                </div>
              )}
            </div>

            {/* Ficheros adjuntos */}
            {detalle.files && detalle.files.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <h4 className="font-semibold text-gray-700 mb-3">Ficheros adjuntos ({detalle.files.length})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {detalle.files.map((f) => (
                    <div key={f.id} className="bg-gray-50 rounded-lg p-2 text-center">
                      {esImagen(f.mime_type) ? (
                        <img src={`/uploads/prospecting/${detalle.id}/${f.stored_path.split('/').pop()}`}
                          alt={f.original_name} className="w-full h-32 object-cover rounded mb-2" />
                      ) : (
                        <div className="h-32 flex items-center justify-center bg-gray-100 rounded mb-2">
                          <span className="text-gray-500 text-xs">{f.original_name}</span>
                        </div>
                      )}
                      <a href={`/uploads/prospecting/${detalle.id}/${f.stored_path.split('/').pop()}`}
                        download={f.original_name}
                        className="text-blue-600 hover:text-blue-800 text-xs">
                        Descargar
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProspectingSubmissionsPage;
