import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Register() {
  const [f, setF] = useState({ username: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.post('/register', f);
      setDone(true);
    } catch (e2) {
      setErr(e2.code === 'username_or_email_taken' ? 'That username or email is already in use.'
        : e2.message || 'Registration failed.');
    } finally { setBusy(false); }
  };

  if (done) return (
    <div className="card auth-card">
      <h1>Check your email</h1>
      <p className="muted">We sent a verification link. After verifying, an <strong>admin must approve</strong> your account before you can use the MCP server.</p>
      <Link to="/login">Back to sign in</Link>
    </div>
  );

  return (
    <div className="card auth-card">
      <h1>Create account</h1>
      <form onSubmit={submit}>
        <label>Username</label>
        <input value={f.username} onChange={on('username')} autoFocus />
        <label>Email</label>
        <input type="email" value={f.email} onChange={on('email')} />
        <label>Password (min 8 chars)</label>
        <input type="password" value={f.password} onChange={on('password')} autoComplete="new-password" />
        {err && <div className="err">{err}</div>}
        <button className="mt" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <div className="mt small"><Link to="/login">Already have an account? Sign in</Link></div>
    </div>
  );
}
