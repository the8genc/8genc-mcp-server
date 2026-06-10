import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/forgot-password', { email }); } catch { /* ignore */ }
    setDone(true);
  };
  return (
    <AuthShell>
      <span className="eyebrow eyebrow--signal eyebrow-dot">Recover access</span>
      <h2 className="auth-card__title">Reset password</h2>
      {done ? (
        <p className="form-msg form-msg--ok">If that email exists, a reset link has been sent.</p>
      ) : (
        <form className="field-stack" onSubmit={submit} noValidate>
          <label className="field"><span className="field__label">Email</span>
            <input className="field__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <button className="btn btn--signal btn--block btn--lg" type="submit">Send reset link <Icon name="arrow-right" /></button>
        </form>
      )}
      <p className="auth-foot"><Link className="link" to="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
