import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { StatusBadge } from './guards.jsx';
import Icon from './Icon.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="site-header">
        <div className="container site-header__bar">
          <a href="/" className="wordmark" aria-label="8genC home"><img className="wordmark__img" src={`${import.meta.env.BASE_URL}assets/8genc-wordmark-white.png`} alt="8genC" /><span className="wordmark__sub">Access</span></a>
          <nav className="nav" aria-label="Primary">
            <ul className="nav__links">
              {user && <li><Link className="nav__link" to="/">Dashboard</Link></li>}
              {user && <li><Link className="nav__link" to="/tokens">Tokens</Link></li>}
              {user && user.role !== 'admin' && <li><Link className="nav__link" to="/my-access">My access</Link></li>}
              {user && <li><Link className="nav__link" to="/profile">Profile</Link></li>}
              {user?.role === 'admin' && <li><Link className="nav__link" to="/admin/users">Users</Link></li>}
              {user?.role === 'admin' && <li><Link className="nav__link" to="/admin/skills">Skills</Link></li>}
              {user?.role === 'admin' && <li><Link className="nav__link" to="/admin/clients">Clients</Link></li>}
            </ul>
            {user && (
              <div className="nowrap-actions">
                {user.role === 'admin' && <span className="chip chip--signal">admin</span>}
                <StatusBadge value={user.status} />
                <button className="btn btn--ghost" onClick={async () => { await logout(); nav('/login'); }}>
                  <Icon name="log-out" size={15} /> Sign out
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="portal">
        <div className="container portal__inner">{children}</div>
      </main>
    </>
  );
}
