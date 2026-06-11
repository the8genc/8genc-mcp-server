import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // scope editor state
  const [files, setFiles] = useState([]);
  const [vars, setVars] = useState([]);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [c, u] = await Promise.all([api.get(`/admin/clients/${id}`), api.get('/admin/users?status=approved')]);
      setClient(c.client);
      setMembers(c.members);
      setAllUsers(u.users);
      setFiles(Array.isArray(c.client.coda_files) ? c.client.coda_files : []);
      setVars(Object.entries(c.client.variables || {}));
      setNotes(c.client.notes || '');
    } catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (err && !client) return <div className="form-msg form-msg--err">{err}</div>;
  if (!client) return <div className="app-loading">Loading…</div>;

  const saveScope = async () => {
    setMsg(''); setErr('');
    const variables = {};
    for (const [k, v] of vars) if (k.trim()) variables[k.trim()] = v;
    try {
      await api.patch(`/admin/clients/${id}`, {
        coda_files: files.filter((f) => f.url || f.doc_id || f.label),
        variables,
        notes: notes || null
      });
      setMsg('Client data-scope saved.');
    } catch (e) { setErr(e.message || 'Save failed'); }
  };

  const addMember = async () => {
    if (!pick) return;
    setMsg(''); setErr('');
    try { const r = await api.post(`/admin/clients/${id}/members`, { userId: pick }); setMembers(r.members); setPick(''); }
    catch (e) { setErr(e.message || 'Add failed'); }
  };
  const removeMember = async (userId) => {
    setMsg(''); setErr('');
    try { const r = await api.del(`/admin/clients/${id}/members/${userId}`); setMembers(r.members); }
    catch (e) { setErr(e.message || 'Remove failed'); }
  };

  const memberIds = new Set(members.map((m) => m.id));
  const candidates = allUsers.filter((u) => !memberIds.has(u.id));

  return (
    <>
      <div className="portal__head">
        <div>
          <h1 className="portal__name">{client.name}</h1>
          <p className="portal__email mono">{client.slug} · {client.status} · memory namespace session:client-{client.id.slice(0, 8)}…</p>
        </div>
        <Link className="btn btn--ghost" to="/admin/clients">← Clients</Link>
      </div>

      {msg && <div className="form-msg form-msg--ok">{msg}</div>}
      {err && <div className="form-msg form-msg--err">{err}</div>}

      {/* Members */}
      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Members</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Anyone here can read/write this client's memory + sees its scope. Assign consultants and the client's own users.
        </p>
        <table className="token-table utable">
          <thead><tr><th>User</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="tk-name">{m.username} <span className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{m.email}</span></td>
                <td className="mono">{m.role}</td>
                <td><button className="iconbtn iconbtn--danger" onClick={() => removeMember(m.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="token-empty mono">No members yet.</p>}
        <div className="row" style={{ gap: 8, marginTop: 'var(--space-3)' }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— add a member —</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
          </select>
          <button className="iconbtn" disabled={!pick} onClick={addMember}>+ Add member</button>
        </div>
      </div>

      {/* Data-scope */}
      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Data-scope</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Shared pointers injected into members' skill/prompt context. The agent fetches contents via its own Coda MCP.
        </p>

        <h3 className="mono" style={{ marginTop: 'var(--space-4)' }}>Coda files</h3>
        {files.map((f, i) => (
          <div className="row" key={i} style={{ gap: 8, marginBottom: 6 }}>
            <input placeholder="label" value={f.label || ''} onChange={(e) => setFiles(files.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <input placeholder="https://coda.io/d/…" style={{ minWidth: 240 }} value={f.url || ''} onChange={(e) => setFiles(files.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            <input placeholder="doc_id (optional)" value={f.doc_id || ''} onChange={(e) => setFiles(files.map((x, j) => j === i ? { ...x, doc_id: e.target.value } : x))} />
            <button className="iconbtn iconbtn--danger" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="iconbtn" onClick={() => setFiles([...files, { label: '', url: '', doc_id: '' }])}>+ Add Coda file</button>

        <h3 className="mono" style={{ marginTop: 'var(--space-4)' }}>Variables</h3>
        {vars.map(([k, v], i) => (
          <div className="row" key={i} style={{ gap: 8, marginBottom: 6 }}>
            <input placeholder="key" value={k} onChange={(e) => setVars(vars.map((x, j) => j === i ? [e.target.value, x[1]] : x))} />
            <input placeholder="value" style={{ minWidth: 240 }} value={typeof v === 'string' ? v : JSON.stringify(v)} onChange={(e) => setVars(vars.map((x, j) => j === i ? [x[0], e.target.value] : x))} />
            <button className="iconbtn iconbtn--danger" onClick={() => setVars(vars.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="iconbtn" onClick={() => setVars([...vars, ['', '']])}>+ Add variable</button>

        <h3 className="mono" style={{ marginTop: 'var(--space-4)' }}>Notes</h3>
        <textarea rows={3} style={{ width: '100%' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope notes for the agent…" />

        <div style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn btn--signal" onClick={saveScope}>Save data-scope</button>
        </div>
      </div>
    </>
  );
}
