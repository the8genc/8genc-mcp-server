import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

// OAuth consent screen. An MCP client's /authorize redirected here with a ticket.
export default function Authorize() {
  const { user, loading, mustChangePassword } = useAuth();
  const [params] = useSearchParams();
  const ticket = params.get('ticket');
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ticket) { setErr('Missing authorization request.'); return; }
    api.get(`/oauth/ticket?ticket=${encodeURIComponent(ticket)}`)
      .then(setInfo)
      .catch(() => setErr('This authorization request is invalid or expired.'));
  }, [ticket]);

  if (loading) return <div className="app-loading">Loading…</div>;
  if (ticket && !user) return <Navigate to={`/login?ticket=${encodeURIComponent(ticket)}`} replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  const approve = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await api.post('/oauth/consent', { ticket });
      window.location.href = res.redirectTo; // back to the MCP client
    } catch (e) {
      setErr(e.code === 'not_approved' ? 'Your account is awaiting admin approval — you cannot authorize clients yet.' : (e.message || 'Authorization failed.'));
      setBusy(false);
    }
  };

  return (
    <AuthShell sub="A client is requesting authorization to connect to the 8genC MCP server on your behalf.">
      <span className="eyebrow eyebrow--signal eyebrow-dot">OAuth consent</span>
      <h2 className="auth-card__title">Authorize access</h2>
      {err && <div className="form-msg form-msg--err">{err}</div>}
      {info && (
        <>
          <p className="auth-card__sub"><strong>{info.clientName}</strong> wants to connect to the 8genC MCP server as <strong>{user.username}</strong>.</p>
          <p className="mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', letterSpacing: 'var(--ls-wide)' }}>Scopes: {(info.scopes || []).join(', ') || 'mcp:tools'}</p>
          {user.status === 'approved'
            ? <button className="btn btn--signal btn--block btn--lg" disabled={busy} onClick={approve}>{busy ? 'Authorizing…' : 'Authorize'} <Icon name="shield-check" size={16} /></button>
            : <p className="form-msg form-msg--err">Your account ({user.status}) cannot authorize clients yet.</p>}
        </>
      )}
    </AuthShell>
  );
}
