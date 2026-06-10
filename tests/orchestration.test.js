import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPlan, formatPlan } from '../src/orchestration/planner.js';
import { parseManifest } from '../src/skills/skills-client.js';

// Fixtures reproducing the documented six-skill pipeline (docs/orchestration.md):
//   L0 product-manager · L1 designer ∥ prd-generator · L2 paid-media ∥ design-loop · L3 builder
const c = (artifact, required = false) => ({ artifact, required });
const MANIFESTS = [
  { id: 'agentic-product-manager', consumes: [], produces: ['personas', 'product-strategy', 'product-prd'], tools: ['coda'], humanGates: [] },
  { id: 'agentic-designer', consumes: [c('personas', true), c('product-strategy')], produces: ['design-tokens', 'brand-guide'], tools: ['webfetch'], humanGates: [] },
  { id: 'prd-generator', consumes: [c('personas')], produces: ['engineering-prd'], tools: [], humanGates: [] },
  { id: 'agentic-paid-media', consumes: [c('personas'), c('product-strategy'), c('brand-guide')], produces: ['media-plan', 'keyword-set'], tools: ['dataforseo'], humanGates: [] },
  { id: 'claude-design-loop', consumes: [c('design-tokens', true), c('brand-guide')], produces: ['design-handoff'], tools: ['designer'], humanGates: ['design-handoff'] },
  { id: 'agentic-platform-builder', consumes: [c('engineering-prd', true), c('design-tokens', true), c('design-handoff', true)], produces: ['built-system'], tools: ['github'], humanGates: [] }
];

describe('buildPlan — parallel levels (full pipeline)', () => {
  const plan = buildPlan(MANIFESTS);

  it('topo-sorts into the documented parallel levels', () => {
    assert.deepEqual(plan.levels, [
      ['agentic-product-manager'],
      ['agentic-designer', 'prd-generator'],
      ['agentic-paid-media', 'claude-design-loop'],
      ['agentic-platform-builder']
    ]);
  });

  it('resolves dependencies (builder waits on all its upstreams)', () => {
    const builder = plan.nodes.get('agentic-platform-builder');
    assert.deepEqual(
      [...builder.dependsOn].sort(),
      ['agentic-designer', 'claude-design-loop', 'prd-generator']
    );
    // designer has no required→ but still an ordering edge from PM
    assert.deepEqual(plan.nodes.get('agentic-designer').dependsOn, ['agentic-product-manager']);
  });

  it('no cycles to break in the canonical graph', () => {
    assert.equal(plan.droppedEdges.length, 0);
  });

  it('formatPlan surfaces parallelism + human gates', () => {
    const f = formatPlan(plan);
    assert.deepEqual(f.parallelism, [1, 2, 2, 1]);
    assert.deepEqual(f.human_gates, [{ skill: 'claude-design-loop', gates: ['design-handoff'] }]);
    assert.equal(f.nodes.length, 6);
  });
});

describe('buildPlan — selection', () => {
  it('goals closure follows REQUIRED consumes only', () => {
    // media-plan is produced by paid-media, whose consumes are all optional → just it
    const plan = buildPlan(MANIFESTS, { goals: ['media-plan'] });
    assert.deepEqual(plan.levels, [['agentic-paid-media']]);
  });

  it('goals closure pulls in required upstreams', () => {
    // built-system needs engineering-prd (prd-generator, requires personas → PM),
    // design-tokens (designer, requires personas → PM), design-handoff (design-loop, requires design-tokens → designer)
    const ids = new Set([...buildPlan(MANIFESTS, { goals: ['built-system'] }).nodes.keys()]);
    for (const need of ['agentic-platform-builder', 'prd-generator', 'agentic-designer', 'claude-design-loop', 'agentic-product-manager']) {
      assert.ok(ids.has(need), `expected ${need} in closure`);
    }
    assert.ok(!ids.has('agentic-paid-media'), 'paid-media is not upstream of built-system');
  });

  it('include runs an explicit subset (with no inter-deps → single level)', () => {
    const plan = buildPlan(MANIFESTS, { include: ['agentic-designer'] });
    assert.deepEqual(plan.levels, [['agentic-designer']]);
  });

  it('throws on goals no skill can produce', () => {
    assert.throws(() => buildPlan(MANIFESTS, { goals: ['nonexistent-artifact'] }), /no skill produces/);
  });
});

describe('buildPlan — cycle resolution', () => {
  it('drops an optional edge to break a cycle', () => {
    const cyclic = [
      { id: 'a', consumes: [c('y')], produces: ['x'], tools: [], humanGates: [] },         // a consumes y (optional)
      { id: 'b', consumes: [c('x', true)], produces: ['y'], tools: [], humanGates: [] }      // b requires x
    ];
    const plan = buildPlan(cyclic);
    assert.equal(plan.droppedEdges.length, 1);
    assert.equal(plan.droppedEdges[0].artifact, 'y'); // the optional edge a→ (b produces y → a) dropped
    assert.equal(plan.levels.flat().length, 2);
  });

  it('throws on an unbreakable required-only cycle', () => {
    const hard = [
      { id: 'a', consumes: [c('y', true)], produces: ['x'], tools: [], humanGates: [] },
      { id: 'b', consumes: [c('x', true)], produces: ['y'], tools: [], humanGates: [] }
    ];
    assert.throws(() => buildPlan(hard), /unbreakable required dependency cycle/);
  });
});

describe('parseManifest', () => {
  it('parses a manifest: block from SKILL.md frontmatter', () => {
    const md = [
      '---',
      'name: agentic-paid-media',
      'description: >',
      '  A paid media strategist.',
      'manifest:',
      '  id: agentic-paid-media',
      '  consumes:',
      '    - { artifact: personas, required: false }',
      '    - { artifact: product-strategy, required: true }',
      '  produces: [keyword-set, media-plan]',
      '  tools: [dataforseo]',
      '  human_gates: []',
      '---',
      '',
      '# Body'
    ].join('\n');
    const m = parseManifest(md);
    assert.equal(m.id, 'agentic-paid-media');
    assert.deepEqual(m.consumes, [
      { artifact: 'personas', required: false },
      { artifact: 'product-strategy', required: true }
    ]);
    assert.deepEqual(m.produces, ['keyword-set', 'media-plan']);
    assert.deepEqual(m.tools, ['dataforseo']);
    assert.deepEqual(m.humanGates, []);
  });

  it('returns null when there is no manifest block', () => {
    assert.equal(parseManifest('---\nname: x\ndescription: y\n---\n# B'), null);
    assert.equal(parseManifest('no frontmatter at all'), null);
  });
});
