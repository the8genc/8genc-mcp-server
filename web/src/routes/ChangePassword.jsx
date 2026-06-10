import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function ChangePassword() {
  const { mustChangePassword, refresh, setMustChange } = useAuth();
  const nav = useNavigate();
  const [currentPassword, setCur] = useState('');
  const [newPassword, setNew] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/change-password', { currentPassword, newPassword });
      setMustChange(false);
      await refresh();
      setOk(true);
      setTimeout(() => nav('/', { replace: true }), 600);
    } catch (e2) {
      setErr(e2.code === 'invalid_credentials' ? 'Current password is incorrect.' : (e2.message || 'Could not change password.'));
    }
  };

  return (
    <AuthShell sub="Set a new password to secure your account before connecting agents to the channel.">
      <span className="eyebrow eyebrow--signal eyebrow-dot">Security</span>
      <h2 className="auth-card__title">Change password</h2>
      {mustChangePassword && <p className="auth-card__sub">You must set a new password before continuing.</p>}
      <form className="field-stack" onSubmit={submit} noValidate>
        <label className="field"><span className="field__label">Current password</span>
          <input className="field__input" type="password" value={currentPassword} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span className="field__label">New password (min 8 chars)</span>
          <input className="field__input" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" /></label>
        {err && <div className="form-msg form-msg--err">{err}</div>}
        {ok && <div className="form-msg form-msg--ok">Updated.</div>}
        <button className="btn btn--signal btn--block btn--lg" type="submit">Update password <Icon name="arrow-right" /></button>
      </form>
    </AuthShell>
  );
}
