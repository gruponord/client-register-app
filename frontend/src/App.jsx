import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import FormPage from './pages/FormPage';
import SuccessPage from './pages/SuccessPage';
import DashboardPage from './pages/admin/DashboardPage';
import UsersPage from './pages/admin/UsersPage';
import MastersPage from './pages/admin/MastersPage';
import PlantsPage from './pages/admin/PlantsPage';
import AuditPage from './pages/admin/AuditPage';
import SubmissionsPage from './pages/admin/SubmissionsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Formulario - cualquier usuario autenticado */}
          <Route path="/formulario" element={
            <ProtectedRoute>
              <FormPage />
            </ProtectedRoute>
          } />
          <Route path="/exito" element={
            <ProtectedRoute>
              <SuccessPage />
            </ProtectedRoute>
          } />

          {/* Admin - solo rol admin */}
          <Route path="/admin" element={
            <ProtectedRoute requiereAdmin>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="maestros/:tipo" element={<MastersPage />} />
            <Route path="plantas" element={<PlantsPage />} />
            <Route path="respuestas" element={<SubmissionsPage />} />
            <Route path="auditoria" element={<AuditPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
