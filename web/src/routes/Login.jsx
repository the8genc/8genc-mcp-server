import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

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
    <AuthShell>
      <span className="eyebrow eyebrow--signal eyebrow-dot">Secure sign-in</span>
      <h2 className="auth-card__title">Access terminal</h2>
      <p className="auth-card__sub">{ticket ? 'Sign in to authorize the MCP client.' : 'Sign in to manage tokens and connect your agents.'}</p>

      <form className="field-stack" onSubmit={submit} noValidate>
        <label className="field"><span className="field__label">Username or email</span>
          <input className="field__input" value={identifier} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" /></label>
        <label className="field"><span className="field__label">Password</span>
          <input className="field__input" type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        <div className="field-row"><span /><Link className="link mono field-row__link" to="/forgot-password">Forgot?</Link></div>
        {err && <div className="form-msg form-msg--err">{err}</div>}
        <button className="btn btn--signal btn--block btn--lg" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow-right" />
        </button>
      </form>

      {(providers.google || providers.github) && (
        <>
          <div className="auth-or"><span>or continue with</span></div>
          <div className="social-row">
            {providers.google && <a className="btn btn--ghost social-btn" href={socialHref('google')}><span className="social-g">G</span> Google</a>}
            {providers.github && <a className="btn btn--ghost social-btn" href={socialHref('github')}><Icon name="github" size={16} /> GitHub</a>}
          </div>
        </>
      )}

      <p className="auth-foot">No clearance yet? <Link className="link" to={`/register${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ''}`}>Request access</Link></p>
    </AuthShell>
  );
}
