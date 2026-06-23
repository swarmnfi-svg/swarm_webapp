import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await authAPI.login({ email, password });
      const authData = data.data;
      localStorage.setItem('token', authData.token);
      const userData = {
        id: authData.id,
        name: authData.name,
        email: authData.email,
        role: authData.role,
        plantIds: authData.plantIds || [],
      };
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return userData;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch { /* ignore */ }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isPlantAdmin = user?.role === 'PLANT_ADMIN';
  const isOperator = user?.role === 'OPERATOR';
  const canManagePlants = isSuperAdmin || isPlantAdmin;
  const canManageUsers = isSuperAdmin;

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading,
      isSuperAdmin, isPlantAdmin, isOperator,
      canManagePlants, canManageUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
