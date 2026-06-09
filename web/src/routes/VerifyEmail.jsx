import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('working'); // working | ok | error
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); return; }
    api.post('/verify-email', { token }).then(() => setState('ok')).catch(() => setState('error'));
  }, [params]);

  return (
    <div className="card auth-card">
      <h1>Email verification</h1>
      {state === 'working' && <p className="muted">Verifying…</p>}
      {state === 'ok' && <p className="ok">Your email is verified. You can sign in once an admin approves your account.</p>}
      {state === 'error' && <p className="err">This verification link is invalid or expired.</p>}
      <Link to="/login">Back to sign in</Link>
    </div>
  );
}
