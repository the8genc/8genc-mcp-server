import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/forgot-password', { email }); } catch { /* ignore */ }
    setDone(true);
  };
  return (
    <div className="card auth-card">
      <h1>Reset password</h1>
      {done ? (
        <p className="ok">If that email exists, a reset link has been sent.</p>
      ) : (
        <form onSubmit={submit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <button className="mt" type="submit">Send reset link</button>
        </form>
      )}
      <div className="mt small"><Link to="/login">Back to sign in</Link></div>
    </div>
  );
}
