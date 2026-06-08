# AINative PRD Generator MCP Server

**Generate production-ready Product Requirement Documents with full AINative platform awareness and persistent memory.**

An MCP (Model Context Protocol) server that helps AI agents and developers create, validate, and manage PRDs. Unlike generic PRD tools, this server knows every AINative service, API endpoint, SDK, and architectural constraint — so your PRDs reference real platform capabilities from day one.

## Why This MCP?

| Generic PRD Tools | AINative PRD Generator |
|---|---|
| Generic templates | Templates with AINative architecture compliance checklists |
| No memory — PRDs lost on session close | **ZeroDB persistence** — PRDs saved with version history, searchable across sessions |
| No platform awareness | Knows all 22 AINative products, 1,968 API endpoints, 11+ SDKs |
| One-shot generation | Iterative refinement with section-level regeneration |
| No validation | 15 validation rules + API reference verification |

## Requirements

**An AINative account is required for full functionality.** The server uses ZeroDB (AINative's data platform) for:
- Persistent PRD storage with automatic version tracking
- Semantic search across all your saved PRDs
- AI-powered PRD generation via AINative's chat completions API
- Custom template storage

**No account yet?** The server auto-provisions a free ZeroDB instance on first run. You'll get a **claim URL** to take ownership of your data.

**Get a permanent account:**
```bash
npx zerodb-cli init          # Interactive setup
# or sign up at https://ainative.studio
```

> **Without credentials**, the server still works in template-only mode — template rendering, validation, platform discovery, and scoring all function without an account. Only AI generation and memory/persistence features require authentication.

## Quick Start

### Option 1: npx (recommended)

```bash
npx ainative-prd-mcp
```

On first run with no credentials, the server:
1. Provisions a free ZeroDB instance (~800ms)
2. Saves credentials to `.mcp.json` and `.env`
3. Prints a **claim URL** — visit it to take permanent ownership

### Option 2: With existing API key

```bash
ZERODB_API_KEY=ak_your_key npx ainative-prd-mcp
```

### MCP Configuration

Add to your Claude Code, Cursor, or Windsurf MCP config:

```json
{
  "mcpServers": {
    "prd-generator": {
      "command": "npx",
      "args": ["-y", "ainative-prd-mcp"],
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
      "args": ["-y", "ainative-prd-mcp"]
    }
  }
}
```

## Tools (23)

### Generation (4 tools)

| Tool | Description |
|------|-------------|
| `prd_generate` | Generate a full PRD with AI + AINative platform context. Auto-detects relevant services, saves to ZeroDB. |
| `prd_generate_section` | Regenerate a single section (e.g., just the Technical Architecture) without touching the rest. |
| `prd_refine` | Refine an existing PRD based on feedback. Version history tracked automatically. |
| `prd_from_issue` | Generate a PRD from a GitHub issue number. |

### Templates (4 tools)

| Tool | Description |
|------|-------------|
| `prd_list_templates` | List built-in and custom templates. |
| `prd_get_template` | Get a template with placeholder variables. |
| `prd_create_template` | Create a custom template (persisted in ZeroDB across sessions). |
| `prd_render_template` | Render a template with variable substitution (no AI, deterministic). |

**Built-in templates:**
- `standard` — General-purpose PRD with all standard sections
- `ainative-feature` — AINative feature PRD with architecture compliance checklist, TDD test plan, and service mapping
- `agent-capability` — Agent/MCP server PRD with tool schemas, memory strategy, and hosting plan

### Validation (3 tools)

| Tool | Description |
|------|-------------|
| `prd_validate` | Validate against 15 quality rules + AINative architecture constraints. |
| `prd_score` | Score completeness 0-100 with letter grade (A-F). |
| `prd_check_api_refs` | Verify all API endpoint and service references actually exist in the platform. |

**Validation rules include:**
- Structure checks (title, intro, features, acceptance criteria, timeline)
- Content checks (problem statement, user stories, test plan, security)
- AINative-specific checks (correct API paths, ZeroDB usage, no third-party memory services)

### Memory — ZeroDB-Powered (4 tools)

| Tool | Description |
|------|-------------|
| `prd_save` | Save a PRD as a persistent plan artifact. Returns an ID for future retrieval. |
| `prd_load` | Load a saved PRD by ID. Use at session start to resume where you left off. |
| `prd_search` | **Semantic search** across all saved PRDs. Find by topic, not just keywords. |
| `prd_history` | Get **version history** showing exactly how a PRD evolved over time (unified diffs). |

**What makes this unique:**

PRDs are stored as ZeroDB **plan artifacts** — a purpose-built storage format that:
- **Survives across sessions** — close your editor, come back tomorrow, your PRDs are still there
- **Tracks every change** — every `prd_refine` call generates a diff stored in version history
- **Supports semantic search** — find PRDs by meaning ("billing features", "agent deployment") not just title
- **Cross-tool access** — PRDs saved here are also accessible via the ZeroMemory MCP tools (`zerodb_plan_get`)

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

**Source of truth is the GitHub repo** (`SKILLS_REPO`, default
[`the8genc/ai-8gent-skills`](https://github.com/the8genc/ai-8gent-skills)) laid out
as `skills/<slug>/SKILL.md` + `skills/<slug>/references/*.md`. ZeroDB is a cache and
semantic-search layer — author skills in GitHub, then `skill_sync` to refresh the
mirror. `skill_list` / `skill_get` work without any credentials; `skill_search`
(semantic) and `skill_sync` use ZeroDB.

## Transports & Hosting

The server speaks MCP over two transports:

- **stdio** — default for local use (`npx ainative-prd-mcp`)
- **Streamable HTTP** — auto-selected when `$PORT` is set (Railway), or forced with
  `MCP_TRANSPORT=http`. Serves `POST /mcp` plus a `GET /` health check.

Hosted at `https://ainative-prd-mcp-production.up.railway.app/mcp`:

```json
{
  "mcpServers": {
    "prd-generator": {
      "type": "http",
      "url": "https://ainative-prd-mcp-production.up.railway.app/mcp"
    }
  }
}
```

## Examples

### Generate a PRD for a new feature

```
> Use prd_generate to create a PRD for adding webhook notifications to Agent Cloud

Result: Full PRD generated with:
- Correct API paths (/api/v1/agents/webhooks/*)
- ZeroDB for event storage
- Architecture compliance checklist
- TDD test plan with pytest commands
- Saved to ZeroDB with ID for future sessions
```

### Search past PRDs

```
> Use prd_search to find PRDs about billing

Result: 3 PRDs found:
- "PRD: Developer Earnings Dashboard" (similarity: 0.89)
- "PRD: Credit System Overhaul" (similarity: 0.82)
- "PRD: Invoice Generation" (similarity: 0.78)
```

### Validate a PRD

```
> Use prd_validate on this PRD content

Result: Score 73/100 (C)
- Missing: acceptance criteria
- Missing: test plan
- Warning: References "Firebase" — should use ZeroDB instead
- 12/15 rules passed
```

## Authentication

| Method | Config | Notes |
|--------|--------|-------|
| **API Key** (recommended) | `ZERODB_API_KEY=ak_...` | Get one: `npx zerodb-cli init` |
| **Username/Password** | `ZERODB_USERNAME` + `ZERODB_PASSWORD` | Auto-refreshes JWT tokens |
| **Auto-provision** | No config needed | Free instance provisioned on first run |

## Architecture

```
ainative-prd-mcp/
├── index.js                          # MCP server + auto-provisioning
├── src/
│   ├── client/zerodb-client.js       # ZeroDB API client (auth, plans, memory, chat)
│   ├── tools/
│   │   ├── generation-tools.js       # PRD generation (4 tools)
│   │   ├── template-tools.js         # Template management (4 tools)
│   │   ├── validation-tools.js       # PRD validation (3 tools)
│   │   ├── memory-tools.js           # Persistent storage (4 tools)
│   │   └── platform-tools.js         # Service discovery (3 tools)
│   ├── templates/                    # Built-in Markdown templates
│   │   ├── standard.md
│   │   ├── ainative-feature.md
│   │   └── agent-capability.md
│   └── knowledge/
│       └── platform-manifest.json    # All 22 AINative products/services/APIs
├── .claude/CLAUDE.md                 # Rules for Claude Code agents
├── .cody/CODY.md                     # Rules for Cody/other agents
├── .cody/skills/prd-generator/       # Agent skill definition
└── tests/tools.test.js               # 22 tests
```

## Development

```bash
git clone https://github.com/AINative-Studio/ainative-prd-mcp.git
cd ainative-prd-mcp
npm install
npm test              # Run 22 tests
npm run test:coverage # With coverage report
```

## Related

- [ZeroDB MCP Server](https://www.npmjs.com/package/ainative-zerodb-mcp-server) — Full data platform (77 tools)
- [ZeroDB Memory MCP](https://www.npmjs.com/package/ainative-zerodb-memory-mcp) — Agent memory (18 tools)
- [AINative Documentation](https://docs.ainative.studio) — Full platform docs
- [ZeroDB CLI](https://www.npmjs.com/package/zerodb-cli) — Quick setup tool

## License

MIT
