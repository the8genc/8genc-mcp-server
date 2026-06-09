import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ticket = params.get('ticket');
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ google: false, github: false });

  useEffect(() => {
    api.get('/oauth/providers').then((r) => setProviders(r.providers || {})).catch(() => {});
    if (params.get('error') === 'blocked') setErr('This account is blocked.');
    else if (params.get('error')) setErr('Social sign-in failed. Please try again.');
  }, [params]);

  // After login, resume an OAuth authorize flow if a ticket is present.
  const afterAuth = (mustChange) => {
    if (mustChange) return nav('/change-password', { replace: true });
    if (ticket) return nav(`/authorize?ticket=${encodeURIComponent(ticket)}`, { replace: true });
    nav('/', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await login(identifier, password);
      afterAuth(res.mustChangePassword);
    } catch (e2) {
      setErr(e2.code === 'account_blocked' ? 'This account is blocked.' : 'Invalid username/email or password.');
    } finally { setBusy(false); }
  };

  const socialHref = (p) => `/access/api/oauth/${p}/start${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''}`;

  return (
    <div className="card auth-card">
      <h1>Sign in</h1>
      <p className="muted small">{ticket ? 'Sign in to authorize the MCP client' : '8genC MCP access portal'}</p>

      {(providers.google || providers.github) && (
        <div className="mt">
          {providers.google && <a href={socialHref('google')}><button className="secondary" style={{ width: '100%', marginBottom: 8 }}>Continue with Google</button></a>}
          {providers.github && <a href={socialHref('github')}><button className="secondary" style={{ width: '100%' }}>Continue with GitHub</button></a>}
          <p className="muted small" style={{ textAlign: 'center', margin: '14px 0 0' }}>or</p>
        </div>
      )}

      <form onSubmit={submit}>
        <label>Username or email</label>
        <input value={identifier} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div className="err">{err}</div>}
        <button className="mt" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row mt small spread">
        <Link to={`/register${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''}`}>Create account</Link>
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}
