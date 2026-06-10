import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPw] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const token = params.get('token');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/reset-password', { token, password });
      setDone(true);
    } catch (e2) {
      setErr(e2.message || 'Reset failed. The link may be invalid or expired.');
    }
  };

  if (!token) return (
    <AuthShell>
      <h2 className="auth-card__title">Reset password</h2>
      <p className="form-msg form-msg--err">Missing reset token.</p>
      <Link className="btn btn--ghost btn--block" to="/login">Sign in</Link>
    </AuthShell>
  );

  return (
    <AuthShell>
      <span className="eyebrow eyebrow--signal eyebrow-dot">Recover access</span>
      <h2 className="auth-card__title">Set a new password</h2>
      {done ? (
        <>
          <p className="form-msg form-msg--ok">Password updated.</p>
          <Link className="btn btn--signal btn--block btn--lg" to="/login">Sign in</Link>
        </>
      ) : (
        <form className="field-stack" onSubmit={submit} noValidate>
          <label className="field"><span className="field__label">New password (min 8 chars)</span>
            <input className="field__input" type="password" value={password} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" /></label>
          {err && <div className="form-msg form-msg--err">{err}</div>}
          <button className="btn btn--signal btn--block btn--lg" type="submit">Update password <Icon name="arrow-right" /></button>
        </form>
      )}
    </AuthShell>
  );
}
