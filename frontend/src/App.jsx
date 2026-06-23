import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Plants from './pages/Plants';
import Sensors from './pages/Sensors';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import AIRecommendations from './pages/AIRecommendations';
import Maintenance from './pages/Maintenance';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import ChangePassword from './pages/ChangePassword';

const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="plants" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN']}><Plants /></ProtectedRoute>} />
        <Route path="sensors" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN']}><Sensors /></ProtectedRoute>} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="ai" element={<AIRecommendations />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Users /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Settings /></ProtectedRoute>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
