/**
 * Orchestration Tools — expose the skills repo's orchestration layer over MCP so
 * an authenticated agent can run the skills as a parallel, dependency-ordered DAG
 * (in addition to independently). Discovery/planning only — the server does not
 * execute agents; it hands back the plan + contracts the caller's harness runs.
 *
 * Everything is scoped to the caller's ACCESSIBLE skills (RBAC): the plan only
 * spans skills the user's role/overrides allow.
 *
 *   orchestration_manifests — the machine-readable handoff graph (consumes/produces/tools/gates)
 *   orchestration_plan      — resolve the DAG into parallel levels + per-node contracts
 *   orchestration_guide     — the orchestration spec + how to run it (in-harness or standalone)
 */
import { buildPlan, formatPlan } from '../orchestration/planner.js';

export const ORCHESTRATION_TOOLS = [
  {
    name: 'orchestration_manifests',
    description:
      "List the orchestration manifests for the skills you can access — each skill's machine-readable handoff contract (consumes/produces artifacts, tool tokens, human gates). consumes/produces across skills form the dependency graph. Call orchestration_plan to resolve it into parallel/dependent execution levels.",
    inputSchema: {
      type: 'object',
      properties: {
        refresh: { type: 'boolean', description: 'Bypass cache and re-fetch from GitHub', default: false }
      }
    }
  },
  {
    name: 'orchestration_plan',
    description:
      'Resolve the accessible skills into an execution plan: parallel levels (skills in the same level run concurrently), per-node dependency inputs, produced artifacts, tool tokens, and human gates. Independent skills fan out; dependent skills are ordered by their artifact handoffs. Optionally target a subset by skill id or by goal artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        goals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target artifact names — plans only the upstream closure needed to produce them (e.g. ["media-plan"]).'
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit skill ids to run (their dependencies are added automatically). Overrides goals.'
        },
        refresh: { type: 'boolean', description: 'Bypass cache and re-fetch from GitHub', default: false }
      }
    }
  },
  {
    name: 'orchestration_guide',
    description:
      'Get the orchestration spec (manifests, typed-artifact blackboard, planner, runner) and how to run it in your authenticated context — either in-harness (your agent runs each plan level) or via the standalone TS runtime. Scoped to your accessible skills.',
    inputSchema: { type: 'object', properties: {} }
  }
];

export async function executeOrchestrationTool(name, args = {}, ctx, { isAccessible } = {}) {
  const skills = ctx?.skills;
  if (!skills) return { error: 'Skills client not initialized.' };
  const allow = typeof isAccessible === 'function' ? isAccessible : () => true;

  const all = await skills.listManifests({ refresh: args.refresh === true });
  const manifests = all.filter((m) => allow(m.slug || m.id));

  switch (name) {
    case 'orchestration_manifests': {
      return {
        count: manifests.length,
        manifests: manifests.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          consumes: m.consumes,
          produces: m.produces,
          tools: m.tools,
          human_gates: m.humanGates
        })),
        note:
          'These are the dependency graph. A skill that consumes an artifact another produces depends on it (required = hard ordering, optional = enrichment). Call orchestration_plan to get the parallel/dependent levels.'
      };
    }

    case 'orchestration_plan': {
      if (!manifests.length) {
        return { error: 'No orchestration-enabled skills are accessible to you. Ask an admin to grant access, or run skills independently.' };
      }
      const include = Array.isArray(args.include) && args.include.length ? args.include : undefined;
      const goals = Array.isArray(args.goals) && args.goals.length ? args.goals : undefined;
      if (include) {
        const ids = new Set(manifests.map((m) => m.id));
        const denied = include.filter((i) => !ids.has(i));
        if (denied.length) {
          return { error: `Not accessible or unknown skill id(s): ${denied.join(', ')}` };
        }
      }
      let plan;
      try {
        plan = buildPlan(manifests, { include, goals });
      } catch (err) {
        return { error: err.message };
      }
      return {
        ...formatPlan(plan),
        skills_considered: manifests.map((m) => m.id),
        how_to_run:
          'Execute levels top to bottom. Skills within a level have no dependency on each other — run them concurrently. For each node: read its `inputs` artifacts, apply the skill (skill_get or its MCP prompt of the same name), then record its `produces` artifacts. Pause at any human_gates before starting the dependent level. See orchestration_guide for the standalone runtime.'
      };
    }

    case 'orchestration_guide': {
      let doc = '';
      let readme = '';
      try {
        doc = await skills.getRaw('docs/orchestration.md');
      } catch (err) {
        doc = `(could not load docs/orchestration.md: ${err.message})`;
      }
      try {
        readme = await skills.getRaw('orchestrator/README.md');
      } catch {
        readme = '';
      }
      return {
        scope: `Your accessible orchestration skills: ${manifests.map((m) => m.id).join(', ') || '(none)'}. Any plan or run is limited to these.`,
        paths: {
          in_harness:
            'Path A — your agent drives it: call orchestration_plan, then for each level run the skills concurrently using their MCP prompts / skill_get, passing artifacts between levels. No extra infra.',
          standalone:
            'Path B — the orchestrator/ TS runtime (Claude Agent SDK) runs the DAG with a typed artifact blackboard. Needs ANTHROPIC_API_KEY and an orchestrator.mcp.json mapping each tool token (e.g. dataforseo, coda) to an MCP server.'
        },
        orchestration_doc: doc,
        runtime_readme: readme
      };
    }

    default:
      return null;
  }
}
