import { useState } from 'react';

const DataTable = ({ columnas, datos, total, pagina, totalPaginas, onCambioPagina, onBuscar, acciones, cargando }) => {
  const [busqueda, setBusqueda] = useState('');

  const handleBuscar = (e) => {
    e.preventDefault();
    if (onBuscar) onBuscar(busqueda);
  };

  return (
    <div>
      {onBuscar && (
        <form onSubmit={handleBuscar} className="mb-4 flex gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            Buscar
          </button>
        </form>
      )}

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columnas.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
              {acciones && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cargando ? (
              <tr>
                <td colSpan={columnas.length + (acciones ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : datos.length === 0 ? (
              <tr>
                <td colSpan={columnas.length + (acciones ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                  No hay datos
                </td>
              </tr>
            ) : (
              datos.map((fila, i) => (
                <tr key={fila.id || i} className="hover:bg-gray-50 cursor-pointer">
                  {columnas.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {col.render ? col.render(fila[col.key], fila) : fila[col.key]}
                    </td>
                  ))}
                  {acciones && (
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {acciones(fila)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-700">
            Página {pagina} de {totalPaginas} ({total} registros)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onCambioPagina(pagina - 1)}
              disabled={pagina <= 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >
              Anterior
            </button>
            <button
              onClick={() => onCambioPagina(pagina + 1)}
              disabled={pagina >= totalPaginas}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
