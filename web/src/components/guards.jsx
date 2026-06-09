import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function RequireAuth({ children }) {
  const { user, loading, mustChangePassword } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  // Force password change before anything else (e.g. seeded admin / admin reset).
  if (mustChangePassword && loc.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export function StatusBadge({ value }) {
  return <span className={`badge ${value}`}>{value}</span>;
}
