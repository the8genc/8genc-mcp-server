import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';

const FILTERS = ['all', 'pending', 'approved', 'blocked'];
const chipClass = (s) => (s === 'approved' ? 'chip--ok' : s === 'blocked' ? 'chip--alert' : 'chip--warn');

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const r = await api.get(`/admin/users${q}`);
      setUsers(r.users);
    } catch (e) { setErr(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMsg(''); setErr('');
    try {
      const r = await api.post(`/admin/users/${id}/${action}`);
      setMsg(r.tempPassword ? `Temporary password (share securely): ${r.tempPassword}` : 'Done.');
      load();
    } catch (e) { setErr(e.message || 'Action failed'); }
  };

  return (
    <>
      <div className="portal__head">
        <div><h1 className="portal__name">Users</h1><p className="portal__email mono">Approve, block, and manage access</p></div>
      </div>

      <div className="tabbar">
        {FILTERS.map((f) => (
          <button key={f} className={`btn ${f === filter ? 'btn--signal' : 'btn--ghost'}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {msg && <div className="form-msg form-msg--ok">{msg}</div>}
      {err && <div className="form-msg form-msg--err">{err}</div>}

      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <table className="token-table utable">
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id}>
                  <td className="tk-name">{u.username}</td>
                  <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>
                    {u.email || '—'} {u.email_verified ? <span className="chip chip--ok">✓</span> : <span className="chip chip--warn">unverified</span>}
                  </td>
                  <td className="mono">{u.role}</td>
                  <td><span className={`chip ${chipClass(u.status)}`}>{u.status}</span></td>
                  <td>
                    <div className="row">
                      {u.status === 'pending' && <button className="iconbtn" onClick={() => act(u.id, 'approve')}>Approve</button>}
                      {u.status !== 'blocked' && !self && <button className="iconbtn iconbtn--danger" onClick={() => act(u.id, 'block', 'Block this user?')}>Block</button>}
                      {u.status === 'blocked' && <button className="iconbtn" onClick={() => act(u.id, 'unblock')}>Unblock</button>}
                      {!self && <button className="iconbtn" onClick={() => act(u.id, 'reset-password', "Reset this user's password?")}>Reset PW</button>}
                      {u.role !== 'admin' && (
                        <button className="iconbtn" disabled={!u.email_verified} title={u.email_verified ? '' : 'User must verify email first'} onClick={() => act(u.id, 'elevate')}>Make admin</button>
                      )}
                      {u.role === 'admin' && !self && <button className="iconbtn" onClick={() => act(u.id, 'demote')}>Demote</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <p className="token-empty mono">No users for this filter.</p>}
      </div>
    </>
  );
}
