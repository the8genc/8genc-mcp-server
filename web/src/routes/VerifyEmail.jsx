import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('working'); // working | ok | error
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); return; }
    api.post('/verify-email', { token }).then(() => setState('ok')).catch(() => setState('error'));
  }, [params]);

  return (
    <AuthShell>
      <div className="auth-icon"><Icon name="mail-check" size={26} /></div>
      <h2 className="auth-card__title">Email verification</h2>
      {state === 'working' && <p className="auth-card__sub">Verifying…</p>}
      {state === 'ok' && <p className="auth-card__sub">Your email is verified. You can sign in once an admin approves your account.</p>}
      {state === 'error' && <p className="form-msg form-msg--err">This verification link is invalid or expired.</p>}
      <Link className="btn btn--ghost btn--block" to="/login">Back to sign in</Link>
    </AuthShell>
  );
}
