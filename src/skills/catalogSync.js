/**
 * Sync the live GitHub skill list into the Postgres skills_catalog. New skills
 * get the configured default tier; existing rows keep their admin-classified
 * tier (see skillsCatalog.upsertFromGithub). Reused by the admin skill_sync tool
 * and the admin "rescan" dashboard endpoint.
 */
import * as skillsCatalog from '../db/repositories/skillsCatalog.js';
import { config } from '../config.js';

export async function syncCatalog(skills) {
  const list = await skills.listSkills({ refresh: true });
  const res = await skillsCatalog.upsertFromGithub(list, {
    defaultTier: config.rbacDefaultTier,
    repo: skills.repo,
    branch: skills.branch
  });
  return { ...res, repo: skills.repo, branch: skills.branch };
}
