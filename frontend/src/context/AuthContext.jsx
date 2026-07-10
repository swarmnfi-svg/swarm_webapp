import { createContext, useContext, useState, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

const toUserData = (authData) => ({
  id: authData.id,
  name: authData.name,
  email: authData.email,
  role: authData.role,
  plantIds: (authData.plantIds || []).map(Number),
  nodeIds: (authData.nodeIds || []).map(Number),
});

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

  const persistUser = useCallback((userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await authAPI.login({ email, password });
      const authData = data.data;
      localStorage.setItem('token', authData.token);
      return persistUser(toUserData(authData));
    } finally {
      setLoading(false);
    }
  }, [persistUser]);

  const signup = useCallback(async (payload) => {
    setLoading(true);
    try {
      const { data } = await authAPI.signup(payload);
      const authData = data.data;
      localStorage.setItem('token', authData.token);
      return persistUser(toUserData(authData));
    } finally {
      setLoading(false);
    }
  }, [persistUser]);

  const refreshUser = useCallback(async () => {
    const { data } = await authAPI.me();
    return persistUser(toUserData(data.data));
  }, [persistUser]);

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
  const canManageUsers = isSuperAdmin || isPlantAdmin;

  return (
    <AuthContext.Provider value={{
      user, login, signup, logout, refreshUser, loading,
      isSuperAdmin, isPlantAdmin, isOperator,
      canManagePlants, canManageUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
