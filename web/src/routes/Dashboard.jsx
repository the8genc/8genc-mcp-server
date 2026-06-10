import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const approved = user.status === 'approved';
  const mcpUrl = `${window.location.origin}/mcp`;
  const [copied, setCopied] = useState(false);

  const config = `{ "mcpServers": { "prd-generator": {
  "type": "http",
  "url": "${mcpUrl}",
  "headers": { "Authorization": "Bearer 8genc_pat_…" }
} } }`;

  const copy = () => {
    navigator.clipboard?.writeText(config).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <div className="portal__head">
        <div className="portal__id">
          <div className="avatar">{(user.username || '?').slice(0, 2).toUpperCase()}</div>
          <div>
            <h1 className="portal__name">{user.username}</h1>
            <p className="portal__email mono">{user.email || 'no email on file'}</p>
          </div>
        </div>
        <div className="portal__status">
          {approved
            ? <span className="chip chip--ok"><Icon name="shield-check" size={14} /> Approved · {user.role}</span>
            : <span className={`chip ${user.status === 'blocked' ? 'chip--alert' : 'chip--warn'}`}><span className="status-dot"></span> {user.status}</span>}
        </div>
      </div>

      {!approved && (
        <div className="panel-block">
          <span className="kicker kicker--bare signal">// Clearance status</span>
          <h2 className="panel-block__title" style={{ marginTop: 'var(--space-3)' }}>
            {user.status === 'pending' ? 'Account under review' : 'Account blocked'}
          </h2>
          <p className="panel-block__sub">
            {user.status === 'pending'
              ? `You're in the queue. An 8genC admin will approve your account and assign your track. You'll be able to connect the moment you're cleared${user.email_verified ? '.' : ' — verify your email to speed this up.'}`
              : 'This account is blocked. Contact an administrator.'}
          </p>
          <ol className="track-timeline" style={{ marginTop: 'var(--space-5)' }}>
            <li className="tl tl--done"><span className="tl__dot"></span><span className="tl__label">Account registered</span><span className="tl__meta mono">done</span></li>
            <li className={`tl ${user.email_verified ? 'tl--done' : 'tl--active'}`}><span className="tl__dot"></span><span className="tl__label">Email verified</span><span className="tl__meta mono">{user.email_verified ? 'done' : 'pending'}</span></li>
            <li className={`tl ${user.status === 'pending' ? 'tl--active' : ''}`}><span className="tl__dot"></span><span className="tl__label">Admin approval</span><span className="tl__meta mono">{user.status === 'blocked' ? 'blocked' : 'in review'}</span></li>
            <li className="tl"><span className="tl__dot"></span><span className="tl__label">Channel access</span><span className="tl__meta mono">locked</span></li>
          </ol>
        </div>
      )}

      {approved && (
        <div className="panel-block">
          <div className="panel-block__head">
            <span className="kicker kicker--bare signal">// Connection</span>
            <span className="chip chip--ok"><span className="status-dot"></span> Operational</span>
          </div>
          <h2 className="panel-block__title">You're cleared. Connect an agent.</h2>
          <p className="panel-block__sub">Create a token on the <Link className="link" to="/tokens">Tokens</Link> page, then drop this into your MCP client — or sign in with OAuth at connect time.</p>
          <div className="codeblock">
            <div className="codeblock__bar">
              <span className="codeblock__label">mcp.json</span>
              <button className="copy-btn" onClick={copy}><Icon name="copy" size={14} /><span>{copied ? 'Copied' : 'Copy'}</span></button>
            </div>
            <pre className="codeblock__body">{config}</pre>
          </div>
          <a className="link mono" href="/docs" style={{ display: 'inline-block', marginTop: 16, fontSize: 'var(--fs-xs)', letterSpacing: 'var(--ls-wide)', textTransform: 'uppercase' }}>Full setup manual →</a>
        </div>
      )}
    </>
  );
}
