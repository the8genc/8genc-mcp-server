# www.8genc.com — Agent Experience edge worker

`www.8genc.com` is hosted on **Framer**, whose managed hosting can't serve
`/.well-known/*`, `/llms.txt`, `/openapi.json`, custom 404 content types, or
custom response headers. This Cloudflare Worker sits in front of the Framer site
and supplies all of that, proxying every page/asset request through to Framer
untouched. It closes the AINative AX-audit gaps Framer can't.

| AX check | Where it's fixed |
|----------|------------------|
| Structured Data (JSON-LD) | **Framer head snippet** (below) |
| MCP Discovery (`<meta>`) | **Framer head snippet** (below) |
| MCP Discovery (`/.well-known/mcp.json`, `ai-plugin.json`) | Worker |
| API Documentation (`/openapi.json`) | Worker |
| Machine-Readable (`/llms.txt`, `/robots.txt`) | Worker |
| Authentication Standards (`/.well-known/oauth-protected-resource`) | Worker |
| Error Handling (JSON 404 for agents) | Worker |
| Rate Limiting (`RateLimit-*` headers) | Worker (+ Cloudflare rule for enforcement) |

---

## Part 1 — Framer head snippet (do this regardless)

Framer **Site Settings → General → Custom Code → End of `<head>`**, paste:

```html
<link rel="mcp-server" href="https://mcp.8genc.com/mcp">
<meta name="mcp-server" content="https://mcp.8genc.com/mcp">
<link rel="alternate" type="application/json" href="https://mcp.8genc.com/.well-known/mcp.json" title="MCP manifest">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":["Organization","ProfessionalService"],"@id":"https://www.8genc.com/#org","name":"8genC","url":"https://www.8genc.com","logo":"https://mcp.8genc.com/assets/8genc-logomark-black.png","description":"Fractional leadership balanced with agentic execution."},
{"@type":"WebSite","@id":"https://www.8genc.com/#website","url":"https://www.8genc.com/","name":"8genC","publisher":{"@id":"https://www.8genc.com/#org"}},
{"@type":"WebAPI","name":"8genC MCP Server","url":"https://mcp.8genc.com/mcp","documentation":"https://mcp.8genc.com/docs","provider":{"@id":"https://www.8genc.com/#org"}}
]}</script>
```

Publish. (These must be in the server-rendered `<head>`; the audit crawler
doesn't run JS, so a Framer code component won't count — only Custom Code does.)

---

## Part 2 — Deploy the Worker

**Prerequisite:** `8genc.com` must be a zone in Cloudflare (move the domain's
nameservers to Cloudflare; keep the existing Framer DNS records). Today
`www.8genc.com` is a CNAME → `sites.framer.app`.

### Origin setup (avoids a proxy loop)
The Worker must pull page content from a hostname that Framer serves this site
for **but that is not itself behind the Worker**. Pick one:

- **Recommended:** in Framer, add a second custom domain e.g.
  `framer-origin.8genc.com`. In Cloudflare add `framer-origin` as **DNS-only
  (grey cloud)** CNAME → `sites.framer.app`. Set `ORIGIN =
  "https://framer-origin.8genc.com"` in `wrangler.toml`. This serves true
  production content.
- **Quick start:** leave `ORIGIN` as the project's `*.framer.app` URL
  (`https://minimum-function-158626.framer.app`). Note that URL tracks the
  *staging* publish.

### DNS / route
1. In Cloudflare, ensure `www.8genc.com` is **proxied (orange cloud)** CNAME →
   `sites.framer.app`.
2. Deploy:
   ```bash
   cd edge
   npx wrangler deploy        # first run: npx wrangler login
   ```
   The `routes` block binds the Worker to `www.8genc.com/*`.

### Rate-limit enforcement (optional but recommended)
The Worker *advertises* `RateLimit-*` headers (what the audit checks). For real
enforcement add a **Cloudflare → Security → Rate limiting** rule on
`www.8genc.com` (e.g. 600 req/min per IP) — the proper place for it.

---

## Verify

```bash
for p in /llms.txt /robots.txt /openapi.json \
         /.well-known/mcp.json /.well-known/ai-plugin.json \
         /.well-known/oauth-protected-resource; do
  curl -s -o /dev/null -w "%{http_code} %{content_type}  $p\n" "https://www.8genc.com$p"
done
curl -s -o /dev/null -w "404 agent  -> %{http_code} %{content_type}\n" https://www.8genc.com/nope-xyz
curl -sD - -o /dev/null https://www.8genc.com/ | grep -i ratelimit
# and confirm normal pages still render:
curl -s -o /dev/null -w "home -> %{http_code}\n" https://www.8genc.com/
```

Then re-run the AINative AX audit on `https://www.8genc.com`.
