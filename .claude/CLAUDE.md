# AINative PRD Generator MCP — Usage Guide

This MCP server generates, validates, and manages Product Requirement Documents with full AINative platform awareness.

## Available Tools (23)

### Generation
| Tool | Description |
|------|-------------|
| `prd_generate` | Generate a full PRD with AI + AINative platform context |
| `prd_generate_section` | Generate a single PRD section for iterative refinement |
| `prd_refine` | Refine an existing PRD based on feedback (version history tracked) |
| `prd_from_issue` | Generate a PRD from a GitHub issue number |

### Templates
| Tool | Description |
|------|-------------|
| `prd_list_templates` | List built-in and custom PRD templates |
| `prd_get_template` | Get a template with placeholder variables |
| `prd_create_template` | Create a custom template (persisted in ZeroDB) |
| `prd_render_template` | Render a template with variable substitution (no AI) |

### Validation
| Tool | Description |
|------|-------------|
| `prd_validate` | Validate PRD against 15 quality rules + AINative constraints |
| `prd_score` | Score PRD completeness 0-100 with grade (A-F) |
| `prd_check_api_refs` | Verify all API/service references exist in the platform |

### Memory (ZeroDB-Powered)
| Tool | Description |
|------|-------------|
| `prd_save` | Save PRD as a persistent plan artifact with version tracking |
| `prd_load` | Load a saved PRD by ID (use at session start to resume work) |
| `prd_search` | Semantic search across all saved PRDs |
| `prd_history` | Get version history showing how a PRD evolved (diffs) |

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

Skills are also exposed as **MCP prompts** — each skill in the repo appears as a
selectable prompt (name = skill slug) whose body is the `SKILL.md`. An optional
`input` argument appends the task to apply the skill to.

**Skills source of truth is the GitHub repo** (default `the8genc/ai-8gent-skills`,
configurable via `SKILLS_REPO` / `SKILLS_BRANCH`). ZeroDB is a cache + search layer:
edits land in GitHub, then `skill_sync` refreshes the ZeroDB mirror.

## Behavior Rules

1. **Use `prd_list_services` first** — before writing any PRD, discover what AINative services are available so the PRD references real platform capabilities.

2. **Always save PRDs** — after generating or refining a PRD, call `prd_save` so the user can retrieve it in future sessions.

3. **Validate before finalizing** — run `prd_validate` and `prd_check_api_refs` before declaring a PRD complete.

4. **Use AINative-specific templates** — prefer `ainative-feature` or `agent-capability` templates over `standard` when the PRD is for an AINative platform feature.

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
- The provisioned instance works immediately for PRD storage and search

## Transports

The server speaks MCP over two transports, selected at startup:

- **stdio** (default for local use) — `npx ainative-prd-mcp`
- **Streamable HTTP** — used automatically when `$PORT` is set (Railway), or force
  with `MCP_TRANSPORT=http`. Serves MCP at `POST /mcp` and a health check at `GET /`.

Force stdio even when `$PORT` is set with `MCP_TRANSPORT=stdio`.

### Deployment (Railway)

Deployed at `https://ainative-prd-mcp-production.up.railway.app/mcp`. Railway sets
`$PORT`, so the HTTP transport activates automatically. The server reads
`AINATIVE_API_KEY` / `AINATIVE_API_URL` as aliases for `ZERODB_API_KEY` /
`ZERODB_API_URL`, so the deployed instance uses the real account instead of
auto-provisioning a throwaway database.

MCP client config for the hosted server:

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

## MCP Config (local, stdio)

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

## Auth

- `ZERODB_API_KEY=ak_...` — recommended (get one: `npx zerodb-cli init`)
- `AINATIVE_API_KEY` / `AINATIVE_API_URL` — accepted as aliases (used on Railway)
- `ZERODB_USERNAME` + `ZERODB_PASSWORD` — JWT auth (auto-refreshes)
- No credentials — auto-provisions a free instance on first run

## Skills configuration

- `SKILLS_REPO` — GitHub `owner/repo` of the skills library (default `the8genc/ai-8gent-skills`)
- `SKILLS_BRANCH` — branch to pull from (default `main`)
- `SKILLS_GITHUB_TOKEN` / `GITHUB_TOKEN` — optional, raises GitHub API rate limits
