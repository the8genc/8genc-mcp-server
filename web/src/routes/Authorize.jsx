import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

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

  if (loading) return <div className="wrap muted">Loading…</div>;
  if (!ticket) return <div className="card auth-card"><p className="err">Missing authorization request.</p></div>;
  // Not signed in → send to login, preserving the ticket.
  if (!user) return <Navigate to={`/login?ticket=${encodeURIComponent(ticket)}`} replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  const approve = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await api.post('/oauth/consent', { ticket });
      window.location.href = res.redirectTo; // back to the MCP client
    } catch (e) {
      if (e.code === 'not_approved') setErr('Your account is awaiting admin approval — you cannot authorize clients yet.');
      else setErr(e.message || 'Authorization failed.');
      setBusy(false);
    }
  };

  return (
    <div className="card auth-card">
      <h1>Authorize access</h1>
      {err && <div className="err">{err}</div>}
      {info && (
        <>
          <p><strong>{info.clientName}</strong> wants to connect to the 8genC MCP server as <strong>{user.username}</strong>.</p>
          <p className="muted small">Scopes: {(info.scopes || []).join(', ') || 'mcp:tools'}</p>
          {user.status === 'approved' ? (
            <div className="row mt">
              <button disabled={busy} onClick={approve}>{busy ? 'Authorizing…' : 'Authorize'}</button>
            </div>
          ) : (
            <p className="err">Your account ({user.status}) cannot authorize clients yet.</p>
          )}
        </>
      )}
    </div>
  );
}
