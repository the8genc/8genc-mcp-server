import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

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

  if (!token) return <div className="card auth-card"><p className="err">Missing reset token.</p><Link to="/login">Sign in</Link></div>;

  return (
    <div className="card auth-card">
      <h1>Set a new password</h1>
      {done ? (
        <><p className="ok">Password updated.</p><Link to="/login">Sign in</Link></>
      ) : (
        <form onSubmit={submit}>
          <label>New password (min 8 chars)</label>
          <input type="password" value={password} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" />
          {err && <div className="err">{err}</div>}
          <button className="mt" type="submit">Update password</button>
        </form>
      )}
    </div>
  );
}
