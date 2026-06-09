import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChange] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user, mustChangePassword } = await api.get('/me');
      setUser(user);
      setMustChange(!!mustChangePassword);
    } catch {
      setUser(null);
      setMustChange(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (identifier, password) => {
    const res = await api.post('/login', { identifier, password });
    setUser(res.user);
    setMustChange(!!res.mustChangePassword);
    return res;
  };

  const logout = async () => {
    await api.post('/logout');
    setUser(null);
    setMustChange(false);
  };

  return (
    <Ctx.Provider value={{ user, mustChangePassword, loading, refresh, login, logout, setMustChange }}>
      {children}
    </Ctx.Provider>
  );
}
