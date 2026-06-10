import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function RequireAuth({ children }) {
  const { user, loading, mustChangePassword } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="app-loading">Authenticating…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (mustChangePassword && loc.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Authenticating…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/* Status → tactical chip (ok / warn / alert). */
export function StatusBadge({ value }) {
  const cls = value === 'approved' ? 'chip--ok' : value === 'pending' ? 'chip--warn' : value === 'blocked' ? 'chip--alert' : 'chip--signal';
  return <span className={`chip ${cls}`}><span className="status-dot"></span> {value}</span>;
}
