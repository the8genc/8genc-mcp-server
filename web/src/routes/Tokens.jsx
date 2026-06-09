import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Tokens() {
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null); // { token } shown once
  const [err, setErr] = useState('');

  const load = () => api.get('/tokens').then((r) => setTokens(r.tokens)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await api.post('/tokens', { name: name || 'token' });
      setCreated(res);
      setName('');
      load();
    } catch (e2) { setErr(e2.message || 'Could not create token'); }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this token? Clients using it will lose access.')) return;
    await api.del(`/tokens/${id}`);
    load();
  };

  return (
    <>
      <div className="card">
        <h1>Personal access tokens</h1>
        <p className="muted small">Use a token as a <code>Bearer</code> credential in your MCP client config.</p>
        <form onSubmit={create} className="row mt">
          <input placeholder="Token name (e.g. laptop)" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
          <button type="submit">Create token</button>
        </form>
        {err && <div className="err">{err}</div>}
        {created && (
          <div className="card mt">
            <p className="ok">Copy this token now — it won't be shown again.</p>
            <pre>{created.token}</pre>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Your tokens</h2>
        {tokens.length === 0 ? <p className="muted">No tokens yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="muted">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="muted">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '—'}</td>
                  <td>{t.revoked_at ? <span className="badge blocked">revoked</span> : <span className="badge approved">active</span>}</td>
                  <td>{!t.revoked_at && <button className="ghost danger" onClick={() => revoke(t.id)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
