import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

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
    <div className="card" style={{ maxWidth: 460 }}>
      <h1>Change password</h1>
      {mustChangePassword && <p className="muted">You must set a new password before continuing.</p>}
      <form onSubmit={submit}>
        <label>Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <label>New password (min 8 chars)</label>
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
        {err && <div className="err">{err}</div>}
        {ok && <div className="ok">Updated.</div>}
        <button className="mt" type="submit">Update password</button>
      </form>
    </div>
  );
}
