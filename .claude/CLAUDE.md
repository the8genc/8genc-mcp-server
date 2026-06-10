# 8genC MCP Server — Usage Guide

This MCP server provides AINative platform discovery and a GitHub-backed Agent Skills library.
PRD generation is delivered as the `prd-generator` Agent Skill (see below), not as server tools.

## Available Tools (11)

### Platform Discovery
| Tool | Description |
|------|-------------|
| `prd_list_services` | List all 22 AINative products/services with APIs |
| `prd_get_api_catalog` | Get API details for a specific service |
| `prd_suggest_stack` | Suggest AINative services for given requirements |

### Skills (GitHub-backed, ZeroDB-cached)
| Tool | Description |
|------|-------------|
| `skill_list` | List Agent Skills available in the skills repo (pulled live from GitHub) |
| `skill_get` | Get a skill's full `SKILL.md` body (optionally with all reference files) |
| `skill_get_reference` | Get a single reference file for a skill, on demand |
| `skill_search` | Find the right skill for a task (ZeroDB semantic search, GitHub keyword fallback) |
| `skill_sync` | Mirror skills from GitHub into ZeroDB for semantic search + offline use |

### Orchestration (parallel + dependent execution)
| Tool | Description |
|------|-------------|
| `orchestration_manifests` | Handoff manifests (consumes/produces/tools/gates) for the caller's accessible skills |
| `orchestration_plan` | Resolve the manifests into parallel levels + per-node dependency contracts (optionally by `include`/`goals`) |
| `orchestration_guide` | Orchestration spec + how to run it (in-harness or the standalone runtime) |

Skills declare a `manifest:` block in SKILL.md frontmatter; `consumes`/`produces`
across skills form the dependency DAG, which the planner topo-sorts into parallel
levels. Orchestration tools are **RBAC-scoped** — the plan only spans skills the
caller's role/overrides allow.

Skills are also exposed as **MCP prompts** — each skill in the repo appears as a
selectable prompt (name = skill slug) whose body is the `SKILL.md`. An optional
`input` argument appends the task to apply the skill to.

**Skills source of truth is the GitHub repo** (default `the8genc/ai-8gent-skills`,
configurable via `SKILLS_REPO` / `SKILLS_BRANCH`). ZeroDB is a cache + search layer:
edits land in GitHub, then `skill_sync` refreshes the ZeroDB mirror.

## PRD Generation (Agent Skill)

PRD authoring is the **`prd-generator`** skill in `the8genc/ai-8gent-skills`. To write,
validate, score, or refine a PRD: load it with `skill_get prd-generator` (or select the
`prd-generator` MCP prompt) and follow its workflow. The skill carries the templates, the
15-rule validation rubric, the scoring algorithm, and the architecture constraints as
reference files, and it orchestrates this server's platform tools plus your ZeroDB memory tools.

## Behavior Rules

1. **Load the `prd-generator` skill for any PRD work** — `skill_get prd-generator` first, then
   follow its intake → template → discover → generate → validate → score → verify → persist flow.

2. **Use `prd_list_services` first** — before referencing AINative services in a PRD, discover
   what's available with `prd_list_services` / `prd_suggest_stack` so it references real
   platform capabilities. Verify API paths with `prd_get_api_catalog`.

3. **Persist PRDs via ZeroDB memory tools** — the skill saves/recalls PRDs using your
   `zerodb_store_memory` / `zerodb_search_memory` tools (there are no `prd_save`/`prd_load`
   server tools). Store successive versions under a stable key for version history.

4. **Apply the validation rubric** — use the skill's `references/validation-rules.md` to validate
   and score before declaring a PRD complete (replaces the old `prd_validate`/`prd_score`/
   `prd_check_api_refs` tools).

5. **Architecture compliance** — all PRDs must respect AINative constraints:
   - ZeroDB mandatory for data/memory (no third-party alternatives)
   - Service layer pattern (no business logic in API handlers)
   - 80% test coverage minimum
   - TDD approach (tests first)

6. **Discover skills before building agent systems** — when a request involves
   automating a workflow, building agents, or turning an SOP into a system, call
   `skill_list` / `skill_search` first and load the matching skill with `skill_get`.

## Auto-Provisioning

If no `ZERODB_API_KEY` is set, the server automatically provisions a free ZeroDB instance:
- Credentials saved to `.mcp.json` and `.env`
- A **claim URL** is printed — share this with the user so they can claim ownership
- The provisioned instance works immediately for skill search/sync

## Transports

The server speaks MCP over two transports, selected at startup:

- **stdio** (default for local use) — `npx 8genc-mcp-server`
- **Streamable HTTP** — used automatically when `$PORT` is set (Railway), or force
  with `MCP_TRANSPORT=http`. Serves MCP at `POST /mcp` and a health check at `GET /`.

Force stdio even when `$PORT` is set with `MCP_TRANSPORT=stdio`.

### Deployment (Railway)

Deployed at `https://mcp.8genc.com/mcp` (custom domain; also `https://ainative-prd-mcp-production.up.railway.app/mcp`).
Railway sets `$PORT`, so the HTTP transport activates automatically. The server reads
`AINATIVE_API_KEY` / `AINATIVE_API_URL` as aliases for `ZERODB_API_KEY` /
`ZERODB_API_URL`, so the deployed instance uses the real account instead of
auto-provisioning a throwaway database.

MCP client config for the hosted server:

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

## MCP Config (local, stdio)

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

## Auth

- `ZERODB_API_KEY=ak_...` — recommended (get one: `npx zerodb-cli init`)
- `AINATIVE_API_KEY` / `AINATIVE_API_URL` — accepted as aliases (used on Railway)
- `ZERODB_USERNAME` + `ZERODB_PASSWORD` — JWT auth (auto-refreshes)
- No credentials — auto-provisions a free instance on first run

## Skills configuration

- `SKILLS_REPO` — GitHub `owner/repo` of the skills library (default `the8genc/ai-8gent-skills`)
- `SKILLS_BRANCH` — branch to pull from (default `main`)
- `SKILLS_GITHUB_TOKEN` / `GITHUB_TOKEN` — optional, raises GitHub API rate limits
