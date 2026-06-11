import { useEffect, useState } from 'react';
import { api } from '../api.js';

const tierLabel = (t) => (t ? t : 'unclassified');

export default function MyAccess() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/me/access').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="form-msg form-msg--err">{err}</div>;
  if (!data) return <div className="app-loading">Loading…</div>;

  const clients = data.clients || [];

  return (
    <>
      <div className="portal__head">
        <div>
          <h1 className="portal__name">My access</h1>
          <p className="portal__email mono">role: {data.role} · skills you can engage + clients you can work on</p>
        </div>
      </div>

      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Skills</h2>
        {data.skills.length === 0 && <p className="token-empty mono">No skills assigned yet. Contact your 8genC admin.</p>}
        {data.skills.map((s) => (
          <div key={s.slug} style={{ padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
            <code>{s.slug}</code> <span className="chip chip--signal" style={{ marginLeft: 6 }}>{tierLabel(s.tier)}</span>
            <div className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{s.description}</div>
          </div>
        ))}
      </div>

      <div className="panel-block" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="h-section" style={{ fontSize: 'var(--fs-lg)' }}>Clients</h2>
        <p className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Shared context + memory you can read/write. Use the <code>client_memory_*</code> tools over MCP
          (pass the client slug when you can access more than one).
        </p>
        {clients.length === 0 && <p className="token-empty mono">You're not assigned to any client yet.</p>}
        {clients.map((c) => {
          const files = Array.isArray(c.coda_files) ? c.coda_files : [];
          const vars = Object.entries(c.variables || {});
          return (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--hairline)' }}>
              <strong>{c.name}</strong> <code className="mono" style={{ fontSize: 'var(--fs-2xs)' }}>{c.slug}</code>
              {files.length > 0 && (
                <ul className="mono" style={{ fontSize: 'var(--fs-xs)', marginTop: 4 }}>
                  {files.map((f, i) => (
                    <li key={i}>{f.label || f.doc_id || 'document'}{f.url ? <> — <a href={f.url} target="_blank" rel="noreferrer">{f.url}</a></> : null}</li>
                  ))}
                </ul>
              )}
              {vars.length > 0 && (
                <div className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                  {vars.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')}
                </div>
              )}
              {c.notes && <div className="mono" style={{ fontSize: 'var(--fs-2xs)' }}>{c.notes}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
