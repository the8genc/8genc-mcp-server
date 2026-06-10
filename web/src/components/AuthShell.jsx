/* Split-auth layout: tactical brand panel (left) + form card (right).
   Wraps every public auth view (login/register/verify/reset/status). */
const MOTIF = `${import.meta.env.BASE_URL}assets/technology.png`;
const WORDMARK = `${import.meta.env.BASE_URL}assets/8genc-wordmark-white.png`;

export default function AuthShell({ children, sub = 'Authorized personnel only. Every account is reviewed before it can put an agent on the 8genC MCP server.' }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header__bar">
          <a href="/" className="wordmark" aria-label="8genC home">
            <img className="wordmark__img" src={WORDMARK} alt="8genC" /><span className="wordmark__sub">Access</span>
          </a>
          <nav className="nav" aria-label="Primary">
            <a href="/" className="nav__link" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>← Back to site</a>
          </nav>
        </div>
      </header>

      <main className="access-main">
        <div className="auth-split">
          <aside className="auth-brand bg-grid">
            <img className="auth-brand__motif motif" src={MOTIF} alt="" aria-hidden="true" />
            <div className="auth-brand__top">
              <img className="auth-brand__wordmark" src={WORDMARK} alt="8genC" />
              <span className="kicker">mcp.8genc.com / access</span>
            </div>
            <div className="auth-brand__mid">
              <h1 className="display auth-brand__title">The channel is<br /><span className="signal">closed by default.</span></h1>
              <p className="lede">{sub}</p>
            </div>
            <div className="auth-brand__foot">
              <div className="auth-brand__stat"><span className="status-dot"></span> Endpoint operational</div>
              <div className="auth-brand__rule"></div>
              <div className="auth-brand__lines mono">
                <span>OAUTH 2.1 · PKCE</span>
                <span>BEARER · 8genc_pat_…</span>
                <span>ADMIN-GATED APPROVAL</span>
              </div>
            </div>
          </aside>

          <section className="auth-form">
            <div className="auth-card ticks">
              <span className="tick-tr"></span><span className="tick-br"></span>
              {children}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
