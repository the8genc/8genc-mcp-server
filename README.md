# 8genC MCP Server

**AINative platform discovery + a GitHub-backed Agent Skills library, over MCP.**

An MCP (Model Context Protocol) server that gives AI agents two things: live knowledge of the
AINative platform (every service, API endpoint, SDK, and architectural constraint), and a
library of **Agent Skills** loaded straight from GitHub and exposed as MCP tools and prompts.

> **PRD generation moved to a skill.** Earlier versions baked PRD authoring into the server as
> 15 tools. That capability now lives in the [`prd-generator`](https://github.com/the8genc/ai-8gent-skills/tree/main/skills/prd-generator)
> Agent Skill in `the8genc/ai-8gent-skills` — load it with `skill_get prd-generator` (or select
> it as an MCP prompt). The skill calls this server's platform tools and your ZeroDB memory tools,
> so the full PRD workflow is now defined in the skills repo, not hard-coded here. See
> [PRD Generation (now an Agent Skill)](#prd-generation-now-an-agent-skill).

## Requirements

**No account needed to start.** Platform discovery (`prd_list_services`, `prd_get_api_catalog`,
`prd_suggest_stack`) and the core skill tools (`skill_list`, `skill_get`, `skill_get_reference`)
work with zero credentials.

An AINative account (ZeroDB) unlocks the search/sync layer:
- `skill_search` — semantic search over skills
- `skill_sync` — mirror the GitHub skills into ZeroDB for offline use

**No account yet?** The server auto-provisions a free ZeroDB instance on first run and prints a
**claim URL** to take ownership.

**Get a permanent account:**
```bash
npx zerodb-cli init          # Interactive setup
# or sign up at https://ainative.studio
```

## Quick Start

### Option 1: npx (recommended)

```bash
npx 8genc-mcp-server
```

On first run with no credentials, the server:
1. Provisions a free ZeroDB instance (~800ms)
2. Saves credentials to `.mcp.json` and `.env`
3. Prints a **claim URL** — visit it to take permanent ownership

### Option 2: With existing API key

```bash
ZERODB_API_KEY=ak_your_key npx 8genc-mcp-server
```

### MCP Configuration

Add to your Claude Code, Cursor, or Windsurf MCP config:

```json
{
  "mcpServers": {
    "prd-generator": {
      "command": "npx",
      "args": ["-y", "8genc-mcp-server"],
      "env": {
        "ZERODB_API_KEY": "ak_your_key",
        "ZERODB_API_URL": "https://api.ainative.studio"
      }
    }
  }
}
```

**No API key?** Omit the env block — the server auto-provisions:

```json
{
  "mcpServers": {
    "prd-generator": {
      "command": "npx",
      "args": ["-y", "8genc-mcp-server"]
    }
  }
}
```

## Tools (11)

### Platform Discovery (3 tools)

| Tool | Description |
|------|-------------|
| `prd_list_services` | List all 22 AINative products with descriptions, API prefixes, SDKs, and pricing. |
| `prd_get_api_catalog` | Get detailed API information for a specific service. |
| `prd_suggest_stack` | Given requirements, suggest which AINative services to use with justifications. |

**Known AINative services:** ZeroDB, ZeroMemory, Agent Cloud, AI Kit, Cody CLI, Chat Completions API, Live Streaming, Multimodal Generation, Embeddings API, Echo Developer Program, OpenCap Stack, ZeroInvoice, ZeroCommerce, ZeroPipeline, Browser Agent, Content Workflow, AX Audit, Community Platform, MCP Hosting, Sequential Thinking, Agent402, QNN API

### Skills — GitHub-backed, ZeroDB-cached (5 tools)

| Tool | Description |
|------|-------------|
| `skill_list` | List Agent Skills in the skills repo (pulled live from GitHub). |
| `skill_get` | Get a skill's full `SKILL.md` body (optionally with all reference files). |
| `skill_get_reference` | Get a single reference file for a skill, on demand. |
| `skill_search` | Find the right skill for a task — ZeroDB semantic search, GitHub keyword fallback. |
| `skill_sync` | Mirror skills from GitHub into ZeroDB for semantic search + offline use. |

Skills are also exposed as **MCP prompts**: every skill in the repo shows up as a
selectable prompt (name = its slug), with an optional `input` argument for the task
to apply it to.

### Orchestration — parallel + dependent agent execution (3 tools)

Skills carry a machine-readable `manifest:` block (`consumes`/`produces` artifacts,
`tools`, `human_gates`). Those handoffs form a dependency graph; the planner resolves
it into **parallel levels** so independent skills run concurrently and dependent ones
in order. These tools expose that planning over MCP — **scoped to the skills the
caller can access** (RBAC), so each user only orchestrates their allowed set.

| Tool | Description |
|------|-------------|
| `orchestration_manifests` | List the handoff manifests for your accessible skills (the dependency graph). |
| `orchestration_plan` | Resolve the DAG into parallel levels + per-node inputs/outputs/gates. Target a subset by `include` skill ids or `goals` artifacts. |
| `orchestration_guide` | The orchestration spec + how to run it in your context (in-harness, or the standalone runtime). |

The server plans and hands back contracts; execution happens in the caller's harness
(each level run concurrently) or the skills repo's standalone orchestrator runtime.

**Source of truth is the GitHub repo** (`SKILLS_REPO`, default
[`the8genc/ai-8gent-skills`](https://github.com/the8genc/ai-8gent-skills)) laid out
as `skills/<slug>/SKILL.md` + `skills/<slug>/references/*.md`. ZeroDB is a cache and
semantic-search layer — author skills in GitHub, then `skill_sync` to refresh the
mirror. `skill_list` / `skill_get` work without any credentials; `skill_search`
(semantic) and `skill_sync` use ZeroDB.

## PRD Generation (now an Agent Skill)

PRD authoring is no longer a set of server tools — it's the **`prd-generator`** Agent Skill in
[`the8genc/ai-8gent-skills`](https://github.com/the8genc/ai-8gent-skills/tree/main/skills/prd-generator).
Load it the same way as any skill:

```
> skill_get prd-generator
# …or select the "prd-generator" MCP prompt
```

The skill is **declarative** — it carries the full workflow (intake → template → discover services
→ generate → validate → score → verify API refs → persist) plus the 3 PRD templates, the 15-rule
validation rubric, and the AINative architecture constraints as reference files. It does the work
by **orchestrating tools** rather than re-implementing them:

- **Platform ground truth** → this server's `prd_list_services` / `prd_get_api_catalog` /
  `prd_suggest_stack`.
- **Persistence & versioning** → your ZeroDB memory tools (`zerodb_store_memory`,
  `zerodb_search_memory`, `zerodb_semantic_search`).

This keeps the PRD capability versioned in the skills repo (edit there, `skill_sync` to refresh)
instead of shipping in the server.

## Transports & Hosting

The server speaks MCP over two transports:

- **stdio** — default for local use (`npx 8genc-mcp-server`)
- **Streamable HTTP** — auto-selected when `$PORT` is set (Railway), or forced with
  `MCP_TRANSPORT=http`. Serves `POST /mcp` plus a `GET /` health check.

Hosted at `https://mcp.8genc.com/mcp` (also reachable at the Railway domain
`https://ainative-prd-mcp-production.up.railway.app/mcp`):

```json
{
  "mcpServers": {
    "prd-generator": {
      "type": "http",
      "url": "https://mcp.8genc.com/mcp"
    }
  }
}
```

## Access control (OAuth2 + portal)

When `DATABASE_URL` is set, `POST /mcp` is **protected** — every request must carry a valid
credential for an **approved** account, and a web portal is served at
**`https://mcp.8genc.com/access`**. (Without `DATABASE_URL` the server runs unauthenticated, for
local/stdio use.)

**Two ways to authenticate** — both gated on account status `approved`:

1. **OAuth 2.1 (browser sign-in at connect)** — the server is its own authorization server
   (`mcpAuthRouter`, RFC 9728 metadata + PKCE). Clients that support MCP OAuth (e.g. Claude) open a
   browser, you sign in (email/password, or Google/GitHub when configured), consent, and the client
   receives a token.
2. **Personal access token** — create one in the portal and add it as a Bearer header:
   ```json
   { "mcpServers": { "prd-generator": {
       "type": "http", "url": "https://mcp.8genc.com/mcp",
       "headers": { "Authorization": "Bearer 8genc_pat_…" } } } }
   ```

**The portal (`/access`)** has two personas:
- **Users** — register, verify email, manage profile/password, create & revoke personal access
  tokens, see approval status + connection instructions.
- **Admins** — approve/reject pending accounts, block/unblock, reset passwords, and elevate
  email-verified users to admin.

New accounts are **pending until an admin approves**. The first admin is seeded as `admin`/`admin`
and must change its password on first login.

**Config** (see `.env.example`): `DATABASE_URL` (Postgres), `JWT_SECRET`, `PUBLIC_BASE_URL`,
`ADMIN_SEED_PASSWORD`, optional `GOOGLE_*`/`GITHUB_*` for social login, and `EMAIL_*` for
verification/reset delivery (defaults to dev-mode, logging links to stdout).

## Examples

### Write a PRD (via the skill)

```
> Write a PRD for adding webhook notifications to Agent Cloud

The prd-generator skill loads, then:
- Calls prd_suggest_stack / prd_list_services to pick real AINative services
- Fills the ainative-feature template (compliance checklist, TDD test plan)
- Uses real API paths (/api/v1/agents/...), verified via prd_get_api_catalog
- Scores the PRD against the 15-rule rubric
- Persists it via your ZeroDB memory tools for future sessions
```

### Discover the platform

```
> Use prd_suggest_stack for "an agent that remembers user preferences and stores files"

Result: suggested stack —
- ZeroMemory (preference recall, entity profiles)
- ZeroDB (file storage, vectors)
- Agent Cloud (deployment)
```

### Find and load a skill

```
> skill_search "turn a SOP into an automated system"

Result: agentic-platform-builder (best match)
> skill_get agentic-platform-builder
```

## Authentication

| Method | Config | Notes |
|--------|--------|-------|
| **API Key** (recommended) | `ZERODB_API_KEY=ak_...` | Get one: `npx zerodb-cli init` |
| **Username/Password** | `ZERODB_USERNAME` + `ZERODB_PASSWORD` | Auto-refreshes JWT tokens |
| **Auto-provision** | No config needed | Free instance provisioned on first run |

## Architecture

```
8genc-mcp-server/
├── index.js                          # MCP server + auto-provisioning
├── src/
│   ├── client/zerodb-client.js       # ZeroDB API client (auth, memory, search)
│   ├── tools/
│   │   ├── platform-tools.js         # Service discovery (3 tools)
│   │   └── skill-tools.js            # Agent Skills (5 tools)
│   ├── skills/skills-client.js       # GitHub-canonical skills loader + ZeroDB cache
│   ├── transport/http.js             # Streamable HTTP transport
│   └── knowledge/
│       └── platform-manifest.json    # All 22 AINative products/services/APIs
├── .claude/CLAUDE.md                 # Rules for Claude Code agents
├── .cody/CODY.md                     # Rules for Cody/other agents
└── tests/tools.test.js               # 16 tests
```

> The PRD workflow, templates, validation rubric, and architecture constraints live in the
> [`prd-generator`](https://github.com/the8genc/ai-8gent-skills/tree/main/skills/prd-generator)
> skill, not in this repo.

## Development

```bash
git clone https://github.com/the8genc/8genc-mcp-server.git
cd 8genc-mcp-server
npm install
npm test              # Run 16 tests
npm run test:coverage # With coverage report
```

## Related

- [ZeroDB MCP Server](https://www.npmjs.com/package/ainative-zerodb-mcp-server) — Full data platform (77 tools)
- [ZeroDB Memory MCP](https://www.npmjs.com/package/ainative-zerodb-memory-mcp) — Agent memory (18 tools)
- [AINative Documentation](https://docs.ainative.studio) — Full platform docs
- [ZeroDB CLI](https://www.npmjs.com/package/zerodb-cli) — Quick setup tool

## License

MIT
