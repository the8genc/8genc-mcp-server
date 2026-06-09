import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await login(identifier, password);
      nav(res.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (e2) {
      setErr(e2.code === 'account_blocked' ? 'This account is blocked.' : 'Invalid username/email or password.');
    } finally { setBusy(false); }
  };

  return (
    <div className="card auth-card">
      <h1>Sign in</h1>
      <p className="muted small">8genC MCP access portal</p>
      <form onSubmit={submit}>
        <label>Username or email</label>
        <input value={identifier} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div className="err">{err}</div>}
        <button className="mt" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row mt small spread">
        <Link to="/register">Create account</Link>
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}
