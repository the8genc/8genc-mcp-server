import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const FILTERS = ['all', 'pending', 'approved', 'blocked'];

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
      if (r.tempPassword) setMsg(`Temporary password (share securely): ${r.tempPassword}`);
      else setMsg('Done.');
      load();
    } catch (e) {
      setErr(e.message || 'Action failed');
    }
  };

  return (
    <div className="card">
      <div className="spread">
        <h1>Users</h1>
        <div className="row">
          {FILTERS.map((f) => (
            <button key={f} className={f === filter ? '' : 'secondary'} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}
      <table className="mt">
        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td className="small">{u.email || '—'} {u.email_verified
                  ? <span className="badge approved">✓</span> : <span className="badge pending">unverified</span>}</td>
                <td>{u.role}</td>
                <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                <td className="row">
                  {u.status === 'pending' && <button className="ghost" onClick={() => act(u.id, 'approve')}>Approve</button>}
                  {u.status !== 'blocked' && !self && <button className="ghost danger" onClick={() => act(u.id, 'block', 'Block this user?')}>Block</button>}
                  {u.status === 'blocked' && <button className="ghost" onClick={() => act(u.id, 'unblock')}>Unblock</button>}
                  <button className="ghost" onClick={() => act(u.id, 'reset-password', 'Reset this user\'s password?')}>Reset PW</button>
                  {u.role !== 'admin' && (
                    <button className="ghost" disabled={!u.email_verified}
                      title={u.email_verified ? '' : 'User must verify email first'}
                      onClick={() => act(u.id, 'elevate')}>Make admin</button>
                  )}
                  {u.role === 'admin' && !self && <button className="ghost" onClick={() => act(u.id, 'demote')}>Demote</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {users.length === 0 && <p className="muted">No users for this filter.</p>}
    </div>
  );
}
