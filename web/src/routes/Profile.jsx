import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';

export default function Profile() {
  const { user } = useAuth();
  return (
    <>
      <div className="portal__head">
        <div className="portal__id">
          <div className="avatar">{(user.username || '?').slice(0, 2).toUpperCase()}</div>
          <div><h1 className="portal__name">{user.username}</h1><p className="portal__email mono">{user.email || 'no email on file'}</p></div>
        </div>
      </div>

      <div className="panel-block">
        <span className="kicker kicker--bare signal">// Account</span>
        <table className="token-table" style={{ marginTop: 'var(--space-4)' }}>
          <tbody>
            <tr><td className="tk-name">Username</td><td className="mono">{user.username}</td></tr>
            <tr><td className="tk-name">Email</td><td className="mono">{user.email || '—'} {user.email_verified
              ? <span className="chip chip--ok">verified</span> : <span className="chip chip--warn">unverified</span>}</td></tr>
            <tr><td className="tk-name">Role</td><td className="mono">{user.role}</td></tr>
            <tr><td className="tk-name">Status</td><td><span className={`chip ${user.status === 'approved' ? 'chip--ok' : user.status === 'blocked' ? 'chip--alert' : 'chip--warn'}`}>{user.status}</span></td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Link className="btn btn--ghost" to="/change-password"><Icon name="key-round" size={15} /> Change password</Link>
        </div>
      </div>
    </>
  );
}
