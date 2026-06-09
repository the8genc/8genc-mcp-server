import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const mcpUrl = `${window.location.origin}/mcp`;
  const approved = user.status === 'approved';

  const configExample = JSON.stringify({
    mcpServers: { 'prd-generator': { type: 'http', url: mcpUrl, headers: { Authorization: 'Bearer <YOUR_TOKEN>' } } }
  }, null, 2);

  return (
    <>
      <div className="card">
        <div className="spread">
          <h1>Welcome, {user.username}</h1>
          <span className={`badge ${user.status}`}>{user.status}</span>
        </div>
        {!approved && user.status === 'pending' && (
          <p className="muted">Your account is awaiting admin approval. You'll be able to connect to the MCP server once approved
            {user.email_verified ? '.' : ' (verify your email to speed this up).'}</p>
        )}
        {user.status === 'blocked' && <p className="err">Your account is blocked. Contact an administrator.</p>}
        {approved && <p className="ok">Your account is approved — you can connect to the MCP server.</p>}
      </div>

      {approved && (
        <div className="card">
          <h2>Connect to the MCP server</h2>
          <p className="small muted">Endpoint</p>
          <pre>{mcpUrl}</pre>
          <p className="small muted mt">Option A — Personal access token (works in any MCP client)</p>
          <ol className="small">
            <li>Create a token on the <Link to="/tokens">Tokens</Link> page.</li>
            <li>Add it as a Bearer header in your client config:</li>
          </ol>
          <pre>{configExample}</pre>
          <p className="small muted mt">Option B — Browser sign-in (OAuth) is available in clients that support it (e.g. Claude);
            point them at the endpoint above and you'll be prompted to sign in.</p>
        </div>
      )}
    </>
  );
}
