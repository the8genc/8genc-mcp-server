/**
 * Skills Client — pulls Agent Skills from a GitHub repo (canonical source)
 * and caches them in ZeroDB for semantic search and offline serving.
 *
 * Source of truth: a GitHub skills repo laid out as
 *   skills/<slug>/SKILL.md           (YAML frontmatter: name, description)
 *   skills/<slug>/references/*.md    (supporting reference files)
 *   REGISTRY.md                      (human-readable index)
 *
 * Default repo: the8genc/ai-8gent-skills
 *
 * GitHub is canonical. ZeroDB is a cache + semantic-search layer:
 *   - skill_list / skill_get pull live from GitHub (with in-memory TTL cache)
 *   - skill_sync mirrors skills into ZeroDB
 *   - skill_search queries the ZeroDB mirror
 */

import axios from 'axios';

const GITHUB_API = 'https://api.github.com';
const GITHUB_RAW = 'https://raw.githubusercontent.com';

// Process-level in-memory cache so we don't hammer the GitHub API (and its
// 60 req/hr unauthenticated limit) on every prompts/list or tools/call.
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class SkillsClient {
  constructor(config = {}) {
    this.repo = config.repo || process.env.SKILLS_REPO || 'the8genc/ai-8gent-skills';
    this.branch = config.branch || process.env.SKILLS_BRANCH || 'main';
    this.token =
      config.token ||
      process.env.SKILLS_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN ||
      null;
    this.zerodb = config.zerodb || null;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;

    this._listCache = null; // { at: number, skills: [...] }
  }

  // ── GitHub access ──────────────────────────────────────────────

  _apiHeaders() {
    const h = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ainative-prd-mcp',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async _tree() {
    const url = `${GITHUB_API}/repos/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`;
    try {
      const res = await axios.get(url, { headers: this._apiHeaders(), timeout: 20000 });
      return res.data.tree || [];
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      throw new Error(`GitHub tree fetch failed for ${this.repo}@${this.branch} (${status}): ${detail}`);
    }
  }

  async getRaw(path) {
    const url = `${GITHUB_RAW}/${this.repo}/${this.branch}/${path}`;
    const headers = { 'User-Agent': 'ainative-prd-mcp' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    try {
      const res = await axios.get(url, {
        headers,
        timeout: 20000,
        responseType: 'text',
        transformResponse: [(d) => d] // keep markdown as a raw string
      });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      throw new Error(`GitHub raw fetch failed for ${path} (${status}): ${err.message}`);
    }
  }

  // ── Skill discovery ────────────────────────────────────────────

  /**
   * List all skills in the repo. Returns metadata only (no full body).
   * Cached in-memory for ttlMs; pass { refresh: true } to bypass.
   */
  async listSkills({ refresh = false } = {}) {
    if (!refresh && this._listCache && Date.now() - this._listCache.at < this.ttlMs) {
      return this._listCache.skills;
    }

    const tree = await this._tree();
    const skillFiles = tree.filter(
      (t) => t.type === 'blob' && /^skills\/[^/]+\/SKILL\.md$/.test(t.path)
    );

    const skills = [];
    for (const f of skillFiles) {
      const slug = f.path.split('/')[1];
      let meta = {};
      try {
        const content = await this.getRaw(f.path);
        meta = parseFrontmatter(content);
      } catch {
        // If a single SKILL.md fails, still surface the skill by slug.
      }
      const references = tree
        .filter(
          (t) => t.type === 'blob' && t.path.startsWith(`skills/${slug}/references/`)
        )
        .map((t) => t.path.replace(`skills/${slug}/`, ''));

      skills.push({
        name: meta.name || slug,
        slug,
        description: (meta.description || '').trim(),
        path: f.path,
        references
      });
    }

    this._listCache = { at: Date.now(), skills };
    return skills;
  }

  /**
   * Get a single skill by slug or name. Returns frontmatter, full body,
   * and (optionally) the contents of its reference files.
   */
  async getSkill(idOrSlug, { withReferences = false } = {}) {
    const skills = await this.listSkills();
    const match =
      skills.find((s) => s.slug === idOrSlug) ||
      skills.find((s) => s.name === idOrSlug) ||
      skills.find((s) => s.slug.toLowerCase() === String(idOrSlug).toLowerCase());

    if (!match) {
      const available = skills.map((s) => s.slug).join(', ');
      throw new Error(`Skill "${idOrSlug}" not found. Available: ${available || '(none)'}`);
    }

    const raw = await this.getRaw(match.path);
    const meta = parseFrontmatter(raw);
    const body = stripFrontmatter(raw);

    const result = {
      name: meta.name || match.slug,
      slug: match.slug,
      description: (meta.description || '').trim(),
      path: match.path,
      frontmatter: meta,
      content: raw,
      body,
      references: match.references,
      source: `https://github.com/${this.repo}/blob/${this.branch}/${match.path}`
    };

    if (withReferences && match.references.length) {
      result.reference_contents = {};
      for (const ref of match.references) {
        try {
          result.reference_contents[ref] = await this.getRaw(`skills/${match.slug}/${ref}`);
        } catch (err) {
          result.reference_contents[ref] = `(failed to load: ${err.message})`;
        }
      }
    }

    return result;
  }

  /** Get a single reference file for a skill. */
  async getReference(slug, refPath) {
    const clean = refPath.replace(/^references\//, '');
    return this.getRaw(`skills/${slug}/references/${clean}`);
  }

  // ── ZeroDB cache / semantic search ─────────────────────────────

  /** Mirror all skills (or one) into ZeroDB for semantic search + offline use. */
  async syncToZeroDB({ slug = null } = {}) {
    if (!this.zerodb?.isAuthenticated) {
      throw new Error('Syncing skills to ZeroDB requires credentials (ZERODB_API_KEY or AINATIVE_API_KEY).');
    }

    const list = await this.listSkills({ refresh: true });
    const targets = slug ? list.filter((s) => s.slug === slug) : list;
    const synced = [];

    for (const s of targets) {
      const full = await this.getSkill(s.slug);
      // Index the description + body so semantic recall matches on triggers.
      const indexed = `Skill: ${full.name}\n${full.description}\n\n${full.body}`.slice(0, 8000);
      await this.zerodb.storeMemory(
        indexed,
        'skills',
        ['skill', s.slug, 'ai-8gent-skills'],
        {
          type: 'skill',
          skill_slug: s.slug,
          skill_name: full.name,
          description: full.description,
          references: s.references,
          repo: this.repo,
          branch: this.branch,
          source: full.source
        }
      );
      synced.push(s.slug);
    }

    return { synced, count: synced.length, repo: this.repo, branch: this.branch };
  }

  /** Semantic search over the ZeroDB skill mirror, with GitHub fallback. */
  async searchSkills(query, limit = 10) {
    if (this.zerodb?.isAuthenticated) {
      try {
        const res = await this.zerodb.searchMemory(`skill ${query}`, limit, 'agent');
        const hits = (res.results || []).filter((r) => r.metadata?.type === 'skill');
        if (hits.length) {
          return {
            source: 'zerodb',
            results: hits.map((r) => ({
              slug: r.metadata.skill_slug,
              name: r.metadata.skill_name,
              description: r.metadata.description,
              references: r.metadata.references || [],
              similarity: r.similarity || r.score
            }))
          };
        }
      } catch {
        // Fall through to GitHub keyword match.
      }
    }

    // Fallback: token-overlap keyword match over the live GitHub list.
    const skills = await this.listSkills();
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);
    const scored = skills
      .map((s) => {
        const hay = `${s.name} ${s.slug} ${s.description}`.toLowerCase();
        const score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
        return { ...s, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { source: 'github', results: scored };
  }
}

// ── Frontmatter helpers ──────────────────────────────────────────

function stripQuotes(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Minimal YAML frontmatter parser. Handles top-level scalars and folded/literal
 * block scalars (`key: >` / `key: |`) which the skill `description` field uses.
 * Good enough for SKILL.md frontmatter — not a general YAML parser.
 */
export function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  let key = null;
  let folded = false;
  let buf = [];

  const flush = () => {
    if (key !== null) {
      out[key] = buf.join(' ').replace(/\s+/g, ' ').trim();
    }
    buf = [];
  };

  for (const rawLine of m[1].split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    const indented = /^\s+/.test(rawLine);

    if (top && !indented) {
      flush();
      key = top[1];
      const val = top[2];
      if (val === '>' || val === '|' || val === '>-' || val === '|-' || val === '') {
        folded = val === '>' || val === '|' || val === '>-' || val === '|-';
        buf = val === '' ? [] : [];
      } else {
        folded = false;
        buf = [stripQuotes(val)];
      }
    } else if (folded && (indented || line.trim() === '')) {
      buf.push(line.trim());
    }
  }
  flush();
  return out;
}

export function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length).trimStart() : md;
}
