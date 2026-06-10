import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function Register() {
  const [params] = useSearchParams();
  const ticket = params.get('ticket');
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
      setErr(e2.code === 'username_or_email_taken' ? 'That username or email is already in use.' : (e2.message || 'Registration failed.'));
    } finally { setBusy(false); }
  };

  if (done) return (
    <AuthShell>
      <div className="auth-icon"><Icon name="mail-check" size={26} /></div>
      <h2 className="auth-card__title">Request received</h2>
      <p className="auth-card__sub">We sent a verification link to <strong>{f.email}</strong>. After you verify, an <strong>8genC admin reviews and approves</strong> your account before the channel opens.</p>
      <Link className="btn btn--ghost btn--block" to="/login">Back to sign in</Link>
    </AuthShell>
  );

  return (
    <AuthShell>
      <span className="eyebrow eyebrow--signal eyebrow-dot">Request access</span>
      <h2 className="auth-card__title">New clearance</h2>
      <p className="auth-card__sub">Register an account. An admin reviews every request before the channel opens.</p>
      <form className="field-stack" onSubmit={submit} noValidate>
        <label className="field"><span className="field__label">Username</span>
          <input className="field__input" value={f.username} onChange={on('username')} autoFocus autoComplete="username" /></label>
        <label className="field"><span className="field__label">Work email</span>
          <input className="field__input" type="email" value={f.email} onChange={on('email')} autoComplete="email" /></label>
        <label className="field"><span className="field__label">Password (min 8 chars)</span>
          <input className="field__input" type="password" value={f.password} onChange={on('password')} autoComplete="new-password" /></label>
        {err && <div className="form-msg form-msg--err">{err}</div>}
        <button className="btn btn--signal btn--block btn--lg" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Request access'} <Icon name="arrow-right" />
        </button>
      </form>
      <p className="auth-foot">Already cleared? <Link className="link" to="/login">Sign in</Link></p>
    </AuthShell>
  );
}
