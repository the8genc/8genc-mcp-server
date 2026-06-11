import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';

const ROLES = ['user', 'consultant', 'client', 'admin'];
const tierLabel = (t) => (t ? t : 'unclassified');

export default function UserAccess() {
  const { id } = useParams();
  const [data, setData] = useState(null); // { user, catalog, overrides, clients }
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await api.get(`/admin/users/${id}/access`));
    } catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (err && !data) return <div className="form-msg form-msg--err">{err}</div>;
  if (!data) return <div className="app-loading">Loading…</div>;

  const { user, catalog, overrides, clients = [] } = data;
  const overrideBySkill = Object.fromEntries((overrides || []).map((o) => [o.skill_id, o.effect]));

  const setRole = async (role) => {
    setMsg(''); setErr('');
    try { await api.post(`/admin/users/${id}/role`, { role }); setMsg(`Role set to ${role}.`); load(); }
    catch (e) { setErr(e.message || 'Failed to set role'); }
  };

  const setOverride = async (skillId, effect) => {
    setMsg(''); setErr('');
    try { await api.put(`/admin/users/${id}/overrides`, { skillId, effect }); load(); }
    catch (e) { setErr(e.message || 'Failed to set override'); }
  };

  return (
    <>
      <div className="portal__head">
        <div>
          <h1 className="portal__name">{user.username}</h1>
          <p className="portal__email mono">{user.email || '—'} · access management</p>
        </div>
        <Link className="btn btn--ghost" to="/admin/users">← Users</Link>
      </div>

      {msg && <div className="form-msg form-msg--ok">{msg}</div>}
      {err && <div className="form-msg form-msg--err">{err}</div>}

      {/* Role */}
      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Role</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          admin = all · consultant = most skills · client = only allow-listed skills
        </p>
        <div className="tabbar">
          {ROLES.map((r) => (
            <button
              key={r}
              className={`btn ${user.role === r ? 'btn--signal' : 'btn--ghost'}`}
              disabled={r === 'admin' && !user.email_verified}
              title={r === 'admin' && !user.email_verified ? 'User must verify email first' : ''}
              onClick={() => setRole(r)}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* Per-skill overrides */}
      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Skill access</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          “Default” follows the skill tier for this role. Allow/Deny overrides it — use Allow to grant a client a specific skill.
        </p>
        <table className="token-table utable">
          <thead><tr><th>Skill</th><th>Tier</th><th>Access</th></tr></thead>
          <tbody>
            {catalog.map((s) => {
              const cur = overrideBySkill[s.id] ?? 'default';
              return (
                <tr key={s.id}>
                  <td className="tk-name"><code>{s.slug}</code></td>
                  <td className="mono">{tierLabel(s.tier)}</td>
                  <td>
                    <div className="row">
                      {['default', 'allow', 'deny'].map((opt) => (
                        <button
                          key={opt}
                          className={`iconbtn ${cur === opt ? 'iconbtn--active' : ''}`}
                          onClick={() => setOverride(s.id, opt === 'default' ? null : opt)}
                        >{opt}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {catalog.length === 0 && <p className="token-empty mono">No skills in the catalog yet — rescan in Skills.</p>}
      </div>

      {/* Client memberships (manage on the client page) */}
      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Client access</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Clients this user can read/write context + memory for. Data-scope and membership are managed on each client.
        </p>
        {clients.length === 0 && <p className="token-empty mono">Not a member of any client.</p>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {clients.map((c) => (
            <Link key={c.id} className="iconbtn" to={`/admin/clients/${c.id}`}>{c.name} →</Link>
          ))}
        </div>
        <p className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-faint)', marginTop: 'var(--space-3)' }}>
          Add or remove this user on a client via <Link to="/admin/clients">Clients</Link>.
        </p>
      </div>
    </>
  );
}
