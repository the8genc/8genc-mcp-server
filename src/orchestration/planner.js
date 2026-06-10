/**
 * Orchestration planner — a faithful JS port of the skills repo's
 * orchestrator/src/planner/dag.ts. Pure (no I/O), so it's unit-testable.
 *
 * Given the skills' capability manifests ({ id, consumes, produces, ... }) it:
 *   1. selects which skills to run (explicit `include`, the upstream closure for
 *      `goals` artifacts, or all),
 *   2. derives dependency edges by matching one skill's `produces` to another's
 *      `consumes` (skipping self-edges),
 *   3. breaks cycles by dropping optional edges (a required-only cycle is a hard
 *      error),
 *   4. topologically sorts (Kahn) into PARALLEL LEVELS — every skill in a level
 *      can run concurrently; a later level depends on earlier ones.
 *
 * This is the structure that lets a connected agent run independent skills in
 * parallel and dependent ones in order — the orchestration layer's core value.
 */

/** Kahn's algorithm, grouping nodes into parallel levels. */
function kahn(nodes, edges) {
  const nodeSet = new Set(nodes);
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from).push(e.to);
  }

  const placed = new Set();
  const levels = [];
  let frontier = nodes.filter((n) => (indeg.get(n) ?? 0) === 0).sort();

  while (frontier.length) {
    levels.push(frontier);
    const next = [];
    for (const n of frontier) {
      placed.add(n);
      for (const m of adj.get(n)) {
        indeg.set(m, (indeg.get(m) ?? 0) - 1);
        if ((indeg.get(m) ?? 0) === 0 && !placed.has(m)) next.push(m);
      }
    }
    frontier = [...new Set(next)].sort();
  }
  return { levels, placed };
}

/** Upstream closure needed to produce the goal artifacts (follows required consumes only). */
function selectForGoals(goals, byId, producerOf) {
  const sel = new Set();
  const visit = (artifact) => {
    for (const p of producerOf.get(artifact) ?? []) {
      if (sel.has(p)) continue;
      sel.add(p);
      const m = byId.get(p);
      for (const c of m.consumes) if (c.required) visit(c.artifact);
    }
  };
  for (const g of goals) visit(g);
  if (sel.size === 0) {
    throw new Error(`no skill produces any of the goal artifacts: ${goals.join(', ')}`);
  }
  return sel;
}

/**
 * Build the execution plan from skill manifests.
 * @param {Array<{id,consumes:Array<{artifact,required}>,produces:string[],tools?:string[],humanGates?:string[],slug?:string,name?:string}>} manifests
 * @param {{include?:string[], goals?:string[]}} [opts]
 */
export function buildPlan(manifests, opts = {}) {
  const byId = new Map(manifests.map((m) => [m.id, m]));

  const producerOf = new Map();
  for (const m of manifests) {
    for (const a of m.produces || []) {
      const arr = producerOf.get(a) ?? [];
      arr.push(m.id);
      producerOf.set(a, arr);
    }
  }

  let selected;
  if (opts.include?.length) {
    selected = new Set(opts.include);
  } else if (opts.goals?.length) {
    selected = selectForGoals(opts.goals, byId, producerOf);
  } else {
    selected = new Set(byId.keys());
  }
  for (const id of selected) {
    if (!byId.has(id)) throw new Error(`Unknown skill in selection: ${id}`);
  }

  // edges among the selected set (skip self-edges)
  let edges = [];
  for (const id of selected) {
    const m = byId.get(id);
    for (const c of m.consumes || []) {
      const producers = (producerOf.get(c.artifact) ?? []).filter(
        (p) => selected.has(p) && p !== id
      );
      for (const p of producers) {
        edges.push({ from: p, to: id, artifact: c.artifact, required: c.required });
      }
    }
  }

  // cycle resolution: while a cycle remains, drop one optional edge inside it.
  const droppedEdges = [];
  const nodes = [...selected];
  let guard = 0;
  for (;;) {
    const { placed } = kahn(nodes, edges);
    if (placed.size === selected.size) break;
    if (guard++ > 10000) throw new Error('cycle resolution exceeded guard');

    const cyclic = new Set(nodes.filter((n) => !placed.has(n)));
    const victim = edges.find((e) => cyclic.has(e.from) && cyclic.has(e.to) && !e.required);
    if (!victim) {
      const stuck = edges
        .filter((e) => cyclic.has(e.from) && cyclic.has(e.to))
        .map((e) => `${e.from}->${e.to}(${e.artifact})`)
        .join(', ');
      throw new Error(
        `unbreakable required dependency cycle among [${[...cyclic].join(', ')}] via ${stuck}`
      );
    }
    edges = edges.filter((e) => e !== victim);
    droppedEdges.push({
      from: victim.from,
      to: victim.to,
      artifact: victim.artifact,
      reason: 'optional edge dropped to break a cycle'
    });
  }

  const { levels } = kahn(nodes, edges);

  const planNodes = new Map();
  for (const id of selected) {
    const m = byId.get(id);
    const inEdges = edges.filter((e) => e.to === id);
    const inputs = [];
    for (const c of m.consumes || []) {
      const e = inEdges.find((x) => x.artifact === c.artifact);
      if (e) inputs.push({ artifact: c.artifact, from: e.from, required: c.required });
    }
    planNodes.set(id, {
      id,
      dependsOn: [...new Set(inEdges.map((e) => e.from))],
      inputs,
      produces: m.produces || [],
      tools: m.tools || [],
      humanGates: m.humanGates || []
    });
  }

  return { nodes: planNodes, levels, producerOf, droppedEdges };
}

/** Serialize a Plan into a flat, agent-friendly object (Maps → arrays/objects). */
export function formatPlan(plan) {
  return {
    levels: plan.levels, // parallel frontiers: every id in levels[i] can run concurrently
    parallelism: plan.levels.map((l) => l.length),
    nodes: [...plan.nodes.values()],
    dropped_edges: plan.droppedEdges,
    human_gates: [...plan.nodes.values()]
      .filter((n) => n.humanGates.length)
      .map((n) => ({ skill: n.id, gates: n.humanGates }))
  };
}
