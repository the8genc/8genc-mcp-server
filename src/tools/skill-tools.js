/**
 * Skill Tools — 5 tools exposing Agent Skills pulled from a GitHub repo
 * (canonical) and cached/searchable via ZeroDB.
 *
 * Tools:
 *   skill_list          — List all skills available in the skills repo
 *   skill_get           — Get a skill's full SKILL.md (optionally + references)
 *   skill_get_reference — Get a single reference file for a skill
 *   skill_search        — Semantic search over skills (ZeroDB mirror)
 *   skill_sync          — Mirror skills from GitHub into ZeroDB
 *
 * The SkillsClient is constructed once at startup and passed in via the
 * shared context object alongside the ZeroDB client.
 */

export const SKILL_TOOLS = [
  {
    name: 'skill_list',
    description:
      'List all Agent Skills available in the skills repo (the8genc/ai-8gent-skills by default). Each entry includes the skill name, slug, description (with trigger phrases), and its reference files. Skills are pulled live from GitHub. Call this first to discover which skills exist before applying one.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Bypass the in-memory cache and re-fetch from GitHub (default: false)',
          default: false
        }
      }
    }
  },
  {
    name: 'skill_get',
    description:
      'Get the full content of a skill by slug or name, including its SKILL.md body and (optionally) all reference files. Use this to load a skill before doing the work it describes.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Skill slug or name (e.g., "agentic-platform-builder")'
        },
        with_references: {
          type: 'boolean',
          description: 'Also fetch the full content of every reference file (default: false)',
          default: false
        }
      },
      required: ['skill']
    }
  },
  {
    name: 'skill_get_reference',
    description:
      'Get a single reference file for a skill (e.g., "references/testing-patterns.md"). Load reference files on demand when the SKILL.md says to.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Skill slug' },
        reference: {
          type: 'string',
          description: 'Reference file path, e.g. "references/agent-patterns.md" or "agent-patterns.md"'
        }
      },
      required: ['skill', 'reference']
    }
  },
  {
    name: 'skill_search',
    description:
      'Semantic search across all skills to find the right one for a task. Queries the ZeroDB mirror when available (run skill_sync first), otherwise falls back to keyword matching over the live GitHub list.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the task (e.g., "automate my content workflow")'
        },
        limit: { type: 'integer', description: 'Max results', default: 10, minimum: 1, maximum: 50 }
      },
      required: ['query']
    }
  },
  {
    name: 'skill_sync',
    description:
      'Mirror skills from the GitHub repo into ZeroDB so they can be semantically searched and served offline. GitHub remains the source of truth — this refreshes the cache. Sync all skills, or one by slug.',
    inputSchema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Optional: sync only this skill slug. Omit to sync all skills.'
        }
      }
    }
  }
];

export async function executeSkillTool(toolName, args, ctx) {
  const skills = ctx?.skills;
  if (!skills) {
    return { error: 'Skills client not initialized.' };
  }

  switch (toolName) {
    case 'skill_list': {
      const list = await skills.listSkills({ refresh: args.refresh === true });
      return {
        repo: skills.repo,
        branch: skills.branch,
        count: list.length,
        skills: list,
        message:
          list.length === 0
            ? 'No skills found in the repo.'
            : `Found ${list.length} skill(s). Use skill_get to load one.`
      };
    }

    case 'skill_get': {
      const skill = await skills.getSkill(args.skill, {
        withReferences: args.with_references === true
      });
      return skill;
    }

    case 'skill_get_reference': {
      const content = await skills.getReference(args.skill, args.reference);
      return { skill: args.skill, reference: args.reference, content };
    }

    case 'skill_search': {
      const res = await skills.searchSkills(args.query, args.limit || 10);
      return {
        query: args.query,
        source: res.source,
        count: res.results.length,
        results: res.results,
        message:
          res.source === 'github' && skills.zerodb?.isAuthenticated
            ? `Matched ${res.results.length} via keyword (ZeroDB had no skill mirror — run skill_sync for semantic search).`
            : `Matched ${res.results.length} skill(s).`
      };
    }

    case 'skill_sync': {
      const res = await skills.syncToZeroDB({ slug: args.skill || null });
      return {
        ...res,
        message: `Synced ${res.count} skill(s) from ${res.repo}@${res.branch} into ZeroDB.`
      };
    }

    default:
      return null;
  }
}
