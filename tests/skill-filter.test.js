import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideSlug,
  filterSkillResult,
  buildClientContextBlock,
  OWNER
} from '../src/auth/access.js';

const DEFAULT_TIER = 'consultant';

// Map<slug, {tier, enabled, override}> as skillAccess.loadAccessSet returns.
const accessSet = new Map([
  ['prd-generator', { tier: 'consultant', enabled: true, override: null }],
  ['agentic-designer', { tier: 'client', enabled: true, override: null }],
  ['secret-skill', { tier: 'admin', enabled: true, override: null }],
  ['client-allowed', { tier: 'consultant', enabled: true, override: 'allow' }],
  ['disabled-skill', { tier: 'client', enabled: false, override: null }]
]);

describe('decideSlug', () => {
  const consultant = { role: 'consultant', owner: false };
  const client = { role: 'client', owner: false };

  it('admin/owner always allowed, even on a null access set', () => {
    assert.equal(decideSlug({ role: 'admin' }, 'secret-skill', null, DEFAULT_TIER), true);
    assert.equal(decideSlug(OWNER, 'anything', null, DEFAULT_TIER), true);
  });

  it('fail-closed: non-admin with a null access set is denied', () => {
    assert.equal(decideSlug(consultant, 'prd-generator', null, DEFAULT_TIER), false);
  });

  it('consultant sees consultant+client tiers, not admin tier', () => {
    assert.equal(decideSlug(consultant, 'prd-generator', accessSet, DEFAULT_TIER), true);
    assert.equal(decideSlug(consultant, 'agentic-designer', accessSet, DEFAULT_TIER), true);
    assert.equal(decideSlug(consultant, 'secret-skill', accessSet, DEFAULT_TIER), false);
  });

  it('client sees only client-tier or allow-overridden skills', () => {
    assert.equal(decideSlug(client, 'agentic-designer', accessSet, DEFAULT_TIER), true);
    assert.equal(decideSlug(client, 'prd-generator', accessSet, DEFAULT_TIER), false);
    assert.equal(decideSlug(client, 'client-allowed', accessSet, DEFAULT_TIER), true);
  });

  it('disabled skills are denied to non-admins', () => {
    assert.equal(decideSlug(client, 'disabled-skill', accessSet, DEFAULT_TIER), false);
  });

  it('a slug absent from the catalog falls back to the default tier', () => {
    // default tier consultant → consultant yes, client no
    assert.equal(decideSlug(consultant, 'brand-new', accessSet, DEFAULT_TIER), true);
    assert.equal(decideSlug(client, 'brand-new', accessSet, DEFAULT_TIER), false);
  });
});

describe('filterSkillResult', () => {
  const client = { role: 'client', owner: false };

  it('filters skill_list .skills and recomputes count', () => {
    const res = {
      repo: 'r', branch: 'main', count: 3,
      skills: [{ slug: 'agentic-designer' }, { slug: 'prd-generator' }, { slug: 'client-allowed' }]
    };
    const out = filterSkillResult(res, client, accessSet, DEFAULT_TIER);
    assert.deepEqual(out.skills.map((s) => s.slug), ['agentic-designer', 'client-allowed']);
    assert.equal(out.count, 2);
  });

  it('filters skill_search .results and recomputes count', () => {
    const res = {
      query: 'x', source: 'zerodb', count: 2,
      results: [{ slug: 'secret-skill' }, { slug: 'agentic-designer' }]
    };
    const out = filterSkillResult(res, client, accessSet, DEFAULT_TIER);
    assert.deepEqual(out.results.map((r) => r.slug), ['agentic-designer']);
    assert.equal(out.count, 1);
  });

  it('passes non-skill results through untouched', () => {
    assert.equal(filterSkillResult(null, client, accessSet, DEFAULT_TIER), null);
    const plain = { message: 'ok' };
    assert.deepEqual(filterSkillResult(plain, client, accessSet, DEFAULT_TIER), plain);
  });
});

describe('buildClientContextBlock', () => {
  it('returns null for no row or an empty scope', () => {
    assert.equal(buildClientContextBlock(null), null);
    assert.equal(buildClientContextBlock({ coda_files: [], variables: {}, notes: null }), null);
  });

  it('renders Coda files, variables, and notes', () => {
    const block = buildClientContextBlock({
      coda_files: [{ doc_id: 'd1', url: 'https://coda.io/d/abc', label: 'Roadmap' }],
      variables: { tenant: 'acme', region: 'us-east' },
      notes: 'Use only Q3 data.'
    });
    assert.match(block, /## Client Context/);
    assert.match(block, /Roadmap — https:\/\/coda\.io\/d\/abc/);
    assert.match(block, /tenant: acme/);
    assert.match(block, /Use only Q3 data\./);
  });

  it('caps long notes', () => {
    const block = buildClientContextBlock({ coda_files: [], variables: {}, notes: 'x'.repeat(5000) });
    assert.ok(block.length < 2500);
  });
});
