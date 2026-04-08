const FormField = ({ label, obligatorio = false, error, children }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
        {obligatorio && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default FormField;
