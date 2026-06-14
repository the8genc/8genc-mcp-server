#!/usr/bin/env node
/**
 * Parse the skills repo's README.md (the area/level source of truth) into a committed
 * catalog the MCP site + AX endpoints render from: src/site/skills-catalog.json.
 *
 * Usage:
 *   node scripts/sync-skill-catalog.mjs            # fetch README via `gh` (authed)
 *   node scripts/sync-skill-catalog.mjs <path.md>  # parse a local README copy
 * Then: node scripts/render-skills.mjs  (writes the HTML into site/tools.html)
 *
 * The repo is private, so the live fetch needs `gh` auth or SKILLS_GITHUB_TOKEN; the
 * committed JSON is what the deployed server/site actually use.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.SKILLS_REPO || 'the8genc/ai-8gent-skills';

const AREAS = {
  business: 'Business', technology: 'Technology', marketing: 'Marketing', sales: 'Sales'
};
const LEVELS = [
  { n: 0, name: 'Service area', plural: 'Service areas', blurb: 'Top orchestrator for a discipline — triages an engagement and routes it to a category lead.' },
  { n: 1, name: 'Category lead', plural: 'Category leads', blurb: 'Owns a category, sets the strategy, and orchestrates its sub-agents.' },
  { n: 2, name: 'Sub-agent', plural: 'Sub-agents', blurb: 'A specific job — produces one typed artifact and dispatches its task agent.' },
  { n: 3, name: 'Task agent', plural: 'Task agents', blurb: 'One focused task with a deliberately limited toolset.' }
];

// Anchor skills that predate the taxonomy (no *(Area Ln)* marker in README).
const OVERRIDES = {
  '8gentic-content-writer': { area: 'marketing', level: 1 },
  '8gentic-paid-media': { area: 'marketing', level: 1 },
  '8gentic-platform-builder': { area: 'technology', level: 1 },
  '8gentic-product-manager': { area: 'technology', level: 1 },
  '8gentic-designer': { area: 'technology', level: 1 },
  '8gentic-web-dev': { area: 'technology', level: 1 },
  '8gentic-prd': { area: 'technology', level: 2 },
  '8gentic-pos-manager': { area: 'technology', level: 2 },
  '8gentic-canva-designer': { area: 'technology', level: 2, parent: '8gentic-designer' },
  '8gentic-claude-designer': { area: 'technology', level: 2, parent: '8gentic-designer' },
  '8gentic-figma-designer': { area: 'technology', level: 2, parent: '8gentic-designer' },
  '8gentic-framer-dev': { area: 'technology', level: 2, parent: '8gentic-web-dev' },
  '8gentic-squarespace-dev': { area: 'technology', level: 2, parent: '8gentic-web-dev' },
  '8gentic-web-qa': { area: 'technology', level: 3, parent: '8gentic-web-dev' }
};

function readme() {
  const arg = process.argv[2];
  if (arg && existsSync(arg)) return readFileSync(arg, 'utf8');
  return execSync(`gh api "repos/${REPO}/contents/README.md?ref=main" -H "Accept: application/vnd.github.raw"`, {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
}

const cleanDesc = (d) =>
  d.replace(/^\s*\*\([^)]*\)\*\s*/, '')          // leading *(Area Ln ...)* marker
   .replace(/\*\*/g, '')                          // bold
   .replace(/`/g, '')                             // code ticks
   .replace(/\s+/g, ' ')
   .trim();

function parseMarker(desc) {
  const m = desc.match(/^\*\((Business|Technology|Marketing|Sales)\s+L(\d)[^)]*\)\*/i);
  if (m) return { area: m[1].toLowerCase(), level: Number(m[2]) };
  return null;
}

const md = readme();
const rowRe = /^\|\s*\[(8gentic-[a-z0-9-]+)\]\([^)]*\)\s*\|\s*(.+?)\s*\|\s*$/;
const skills = [];
const seen = new Set();
for (const line of md.split('\n')) {
  const r = line.match(rowRe);
  if (!r) continue;
  const slug = r[1];
  if (seen.has(slug)) continue;
  seen.add(slug);
  const rawDesc = r[2];
  let area = null;
  let level = null;
  let parent = null;
  const marker = parseMarker(rawDesc);
  if (marker) { area = marker.area; level = marker.level; }
  // design / web-dev sub-agent markers + anchor overrides
  if (OVERRIDES[slug]) ({ area, level, parent } = { area, level, parent, ...OVERRIDES[slug] });
  if (!area || level == null) {
    // L0 service areas: slug is the area, level 0
    if (AREAS[slug.replace('8gentic-', '')]) { area = slug.replace('8gentic-', ''); level = 0; }
  }
  if (!area || level == null) { console.error(`[sync] unclassified: ${slug} — "${rawDesc.slice(0, 60)}"`); continue; }
  skills.push({ slug, area, level, parent: parent || null, desc: cleanDesc(rawDesc) });
}

skills.sort((a, b) => a.area.localeCompare(b.area) || a.level - b.level || a.slug.localeCompare(b.slug));
const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0 };
for (const s of skills) byLevel[s.level]++;

const catalog = {
  repo: REPO,
  total: skills.length,
  areas: Object.entries(AREAS).map(([key, name]) => ({ key, name })),
  levels: LEVELS.map((l) => ({ ...l, count: byLevel[l.n] })),
  skills
};
writeFileSync(join(ROOT, 'src/site/skills-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.error(`[sync] wrote src/site/skills-catalog.json — ${skills.length} skills (L0:${byLevel[0]} L1:${byLevel[1]} L2:${byLevel[2]} L3:${byLevel[3]})`);
