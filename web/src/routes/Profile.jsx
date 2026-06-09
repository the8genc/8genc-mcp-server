import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  return (
    <div className="card">
      <h1>Profile</h1>
      <table>
        <tbody>
          <tr><th>Username</th><td>{user.username}</td></tr>
          <tr><th>Email</th><td>{user.email || <span className="muted">—</span>} {user.email_verified
            ? <span className="badge approved">verified</span> : <span className="badge pending">unverified</span>}</td></tr>
          <tr><th>Role</th><td>{user.role}</td></tr>
          <tr><th>Status</th><td><span className={`badge ${user.status}`}>{user.status}</span></td></tr>
        </tbody>
      </table>
      <div className="mt"><Link to="/change-password"><button className="secondary">Change password</button></Link></div>
    </div>
  );
}
