import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

export default function Tokens() {
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null); // { token } shown once
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => api.get('/tokens').then((r) => setTokens(r.tokens)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await api.post('/tokens', { name: name || 'token' });
      setCreated(res); setName(''); setShowForm(false); load();
    } catch (e2) { setErr(e2.message || 'Could not create token'); }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this token? Clients using it will lose access.')) return;
    await api.del(`/tokens/${id}`); load();
  };

  const copyToken = () => {
    navigator.clipboard?.writeText(created.token).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  };

  return (
    <>
      <div className="portal__head">
        <div><h1 className="portal__name">Personal access tokens</h1><p className="portal__email mono">Bearer credentials for your MCP client</p></div>
        {!showForm && <button className="btn btn--signal" onClick={() => setShowForm(true)}><Icon name="plus" size={15} /> New token</button>}
      </div>

      <div className="panel-block">
        {created && (
          <div className="token-reveal">
            <div className="token-reveal__head"><Icon name="check-circle-2" size={16} /> Token created — copy it now, you won't see it again.</div>
            <div className="token-reveal__row">
              <code className="token-reveal__code">{created.token}</code>
              <button className="copy-btn" onClick={copyToken}><Icon name="copy" size={14} /><span>{copied ? 'Copied' : 'Copy'}</span></button>
            </div>
          </div>
        )}

        {showForm && (
          <form className="token-form" onSubmit={create}>
            <label className="field"><span className="field__label">Token name</span>
              <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="cursor-laptop" autoFocus /></label>
            <div className="token-form__actions">
              <button className="btn btn--signal" type="submit">Generate token</button>
              <button className="btn btn--ghost" type="button" onClick={() => { setShowForm(false); setName(''); }}>Cancel</button>
            </div>
          </form>
        )}
        {err && <div className="form-msg form-msg--err">{err}</div>}

        {tokens.length === 0 ? (
          <p className="token-empty mono">No tokens yet. Create one to connect a client.</p>
        ) : (
          <table className="token-table">
            <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td className="tk-name">{t.name}</td>
                  <td className="mono tk-date">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="mono tk-date">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : '—'}</td>
                  <td>{t.revoked_at ? <span className="chip chip--alert">revoked</span> : <span className="chip chip--ok">active</span>}</td>
                  <td>{!t.revoked_at && <button className="iconbtn iconbtn--danger" onClick={() => revoke(t.id)}><Icon name="trash-2" size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
