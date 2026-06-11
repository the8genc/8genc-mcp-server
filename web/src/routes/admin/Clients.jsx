import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await api.get('/admin/clients');
      setClients(r.clients);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (!name.trim()) return;
    try {
      const r = await api.post('/admin/clients', { name: name.trim() });
      setName('');
      setMsg(`Created “${r.client.name}” (${r.client.slug}).`);
      load();
    } catch (e2) { setErr(e2.message || 'Create failed'); }
  };

  const setStatus = async (id, status) => {
    setMsg(''); setErr('');
    try { await api.patch(`/admin/clients/${id}`, { status }); load(); }
    catch (e2) { setErr(e2.message || 'Update failed'); }
  };

  return (
    <>
      <div className="portal__head">
        <div>
          <h1 className="portal__name">Clients</h1>
          <p className="portal__email mono">Tenants with shared context + dedicated memory. Members read/write a client's context.</p>
        </div>
      </div>

      <form className="row" onSubmit={create} style={{ gap: 8, marginBottom: 'var(--space-4)' }}>
        <input placeholder="New client name (e.g. Acme Corp)" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn btn--signal" type="submit">Provision client</button>
      </form>

      {msg && <div className="form-msg form-msg--ok">{msg}</div>}
      {err && <div className="form-msg form-msg--err">{err}</div>}

      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <table className="token-table utable">
          <thead><tr><th>Client</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="tk-name"><Link to={`/admin/clients/${c.id}`}>{c.name}</Link></td>
                <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{c.slug}</td>
                <td><span className={`chip ${c.status === 'active' ? 'chip--ok' : 'chip--warn'}`}>{c.status}</span></td>
                <td>
                  <div className="row">
                    <Link className="iconbtn" to={`/admin/clients/${c.id}`}>Manage →</Link>
                    {c.status === 'active'
                      ? <button className="iconbtn iconbtn--danger" onClick={() => setStatus(c.id, 'archived')}>Archive</button>
                      : <button className="iconbtn" onClick={() => setStatus(c.id, 'active')}>Restore</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && <p className="token-empty mono">No clients yet — provision one above.</p>}
      </div>
    </>
  );
}
