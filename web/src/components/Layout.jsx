import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { StatusBadge } from './guards.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <nav className="top">
        <strong>8genC MCP</strong>
        {user && <Link to="/">Dashboard</Link>}
        {user && <Link to="/tokens">Tokens</Link>}
        {user && <Link to="/profile">Profile</Link>}
        {user?.role === 'admin' && <Link to="/admin/users">Admin</Link>}
        <span className="grow" />
        {user && (
          <>
            <span className="small muted">{user.username}</span>
            {user.role === 'admin' && <StatusBadge value="admin" />}
            <StatusBadge value={user.status} />
            <button className="ghost" onClick={async () => { await logout(); nav('/login'); }}>Sign out</button>
          </>
        )}
      </nav>
      <div className="wrap">{children}</div>
    </>
  );
}
