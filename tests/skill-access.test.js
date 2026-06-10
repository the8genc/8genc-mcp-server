import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveUser,
  isAdmin,
  canUseTool,
  canAccessSkill,
  canUserAccess,
  OWNER,
  ROLE_RANK,
  TIER_RANK
} from '../src/auth/access.js';

describe('resolveUser', () => {
  it('returns OWNER when there is no authInfo (stdio / no-auth)', () => {
    assert.equal(resolveUser(undefined), OWNER);
    assert.equal(resolveUser({}), OWNER);
    assert.equal(resolveUser({ extra: {} }), OWNER); // no userId
    assert.equal(OWNER.owner, true);
  });
  it('reads userId/role from authInfo.extra', () => {
    const u = resolveUser({ extra: { userId: 'u1', role: 'consultant', status: 'approved' } });
    assert.deepEqual(u, { userId: 'u1', role: 'consultant', owner: false });
  });
  it('defaults a missing role to legacy "user"', () => {
    assert.equal(resolveUser({ extra: { userId: 'u2' } }).role, 'user');
  });
});

describe('isAdmin / canUseTool', () => {
  it('owner and admin are admins', () => {
    assert.equal(isAdmin(OWNER), true);
    assert.equal(isAdmin({ role: 'admin' }), true);
    assert.equal(isAdmin({ role: 'consultant' }), false);
  });
  it('skill_sync is admin-only; other tools open to any authenticated user', () => {
    assert.equal(canUseTool({ role: 'consultant' }, 'skill_sync'), false);
    assert.equal(canUseTool({ role: 'client' }, 'skill_sync'), false);
    assert.equal(canUseTool(OWNER, 'skill_sync'), true);
    assert.equal(canUseTool({ role: 'admin' }, 'skill_sync'), true);
    for (const t of ['prd_list_services', 'skill_list', 'skill_get', 'skill_search', 'skill_get_reference']) {
      assert.equal(canUseTool({ role: 'client' }, t), true, `${t} should be open`);
    }
  });
});

describe('canAccessSkill (pure tiers + overrides)', () => {
  it('admin and owner see everything, even unclassified or disabled', () => {
    assert.equal(canAccessSkill({ role: 'admin', tier: null, enabled: false }), true);
    assert.equal(canAccessSkill({ owner: true, tier: null, enabled: false }), true);
  });

  it('disabled skills are hidden from non-admins regardless of tier', () => {
    assert.equal(canAccessSkill({ role: 'consultant', tier: 'consultant', enabled: false }), false);
  });

  it('tier defaults: consultant sees consultant+client; client sees only client', () => {
    assert.equal(canAccessSkill({ role: 'consultant', tier: 'consultant' }), true);
    assert.equal(canAccessSkill({ role: 'consultant', tier: 'client' }), true);
    assert.equal(canAccessSkill({ role: 'consultant', tier: 'admin' }), false);

    assert.equal(canAccessSkill({ role: 'client', tier: 'client' }), true);
    assert.equal(canAccessSkill({ role: 'client', tier: 'consultant' }), false);
    assert.equal(canAccessSkill({ role: 'client', tier: 'admin' }), false);
  });

  it('legacy "user" satisfies no tier (lowest rank)', () => {
    assert.equal(canAccessSkill({ role: 'user', tier: 'client' }), false);
    assert.equal(canAccessSkill({ role: 'user', tier: 'consultant' }), false);
  });

  it('unclassified (tier null) is admin-only', () => {
    assert.equal(canAccessSkill({ role: 'consultant', tier: null }), false);
    assert.equal(canAccessSkill({ role: 'client', tier: null }), false);
  });

  it('allow override grants access despite tier; deny override revokes it', () => {
    // client gets a consultant-tier skill via allow (their "defined set")
    assert.equal(canAccessSkill({ role: 'client', tier: 'consultant', override: 'allow' }), true);
    // client gets an unclassified skill via allow
    assert.equal(canAccessSkill({ role: 'client', tier: null, override: 'allow' }), true);
    // consultant explicitly denied a client-tier skill they'd otherwise see
    assert.equal(canAccessSkill({ role: 'consultant', tier: 'client', override: 'deny' }), false);
  });
});

describe('canUserAccess (user × access-set entry)', () => {
  it('maps a resolved user + access-set meta to a decision', () => {
    const client = { role: 'client', owner: false };
    assert.equal(canUserAccess(client, { tier: 'client', enabled: true }), true);
    assert.equal(canUserAccess(client, { tier: 'consultant', enabled: true }), false);
    assert.equal(canUserAccess(client, { tier: 'consultant', override: 'allow' }), true);
    assert.equal(canUserAccess(OWNER, { tier: null, enabled: false }), true);
  });
  it('treats a missing meta as unclassified (admin-only)', () => {
    assert.equal(canUserAccess({ role: 'consultant' }, {}), false);
    assert.equal(canUserAccess({ role: 'admin' }, {}), true);
  });
});

describe('rank tables', () => {
  it('order admin > consultant > client > user, tiers mirror roles', () => {
    assert.ok(ROLE_RANK.admin > ROLE_RANK.consultant);
    assert.ok(ROLE_RANK.consultant > ROLE_RANK.client);
    assert.ok(ROLE_RANK.client > ROLE_RANK.user);
    assert.equal(TIER_RANK.consultant, ROLE_RANK.consultant);
    assert.equal(TIER_RANK.client, ROLE_RANK.client);
  });
});
