#!/usr/bin/env node
/**
 * Render the skills catalog (src/site/skills-catalog.json) into the MCP site:
 * the "Agent Skills" tab of site/tools.html (between SKILLS:START/END markers) and
 * the page's skill/tool counts. Run after scripts/sync-skill-catalog.mjs.
 *   node scripts/render-skills.mjs           # write
 *   node scripts/render-skills.mjs --check   # fail if stale (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const TOOLS_TOTAL = 16; // platform 3 + skills 5 + orchestration 3 + client 3 + credentials 2
const cat = JSON.parse(readFileSync(join(ROOT, 'src/site/skills-catalog.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LEVEL_TAG = { 0: 'L0 · service area', 1: 'L1 · category lead', 2: 'L2 · sub-agent', 3: 'L3 · task agent' };
const LEVEL_CHIP = { 0: 'chip--signal', 1: 'chip--info', 2: 'chip--ok', 3: 'chip--warn' };
const areaName = (k) => cat.areas.find((a) => a.key === k)?.name || k;

function levelExplainer() {
  const cards = cat.levels.map((l) =>
    `        <article class="skillcard">
          <div class="skillcard__head"><code class="skillcard__slug">L${l.n}</code><span class="chip ${LEVEL_CHIP[l.n]}">${esc(l.name)}</span></div>
          <p class="skillcard__desc">${esc(l.blurb)}</p>
        </article>`
  ).join('\n');
  return `      <div class="skilllist">\n${cards}\n      </div>`;
}

function areaSection(area) {
  const skills = cat.skills.filter((s) => s.area === area.key).sort((a, b) => a.level - b.level || a.slug.localeCompare(b.slug));
  const rows = skills.map((s) =>
    `          <article class="toolrow ticks"><span class="tick-tr"></span><span class="tick-br"></span><div class="toolrow__main"><code class="toolrow__name">${esc(s.slug)}</code><p class="toolrow__desc">${esc(s.desc)}</p></div><div class="toolrow__meta"><span class="tag">${LEVEL_TAG[s.level]}</span></div></article>`
  ).join('\n');
  return `      <div class="catgroup">
        <div class="catgroup__head">
          <span class="kicker kicker--bare signal">// ${esc(area.name)}</span>
          <h2 class="h-section">${esc(area.name)}</h2>
          <p class="muted">${skills.length} skills — a service area that orchestrates its category leads, sub-agents, and task agents.</p>
        </div>
        <div class="toollist">
${rows}
        </div>
      </div>`;
}

const howTo = `      <div class="callout callout--info">
        <i data-lucide="sparkles"></i>
        <p>A skill is a <strong>discipline an agent loads to act</strong>, not code that runs itself. Find one with <code>skill_search</code>, load it with <code>skill_get &lt;slug&gt;</code> (or select the same-named <strong>MCP prompt</strong>), and let <code>orchestration_plan</code> resolve a multi-skill engagement into parallel + dependent levels. Access is RBAC-scoped, with per-client memory + credentials.</p>
      </div>
      <div class="codeblock" style="margin-top:var(--space-5)">
        <div class="codeblock__bar"><span class="codeblock__label">Use a skill over MCP</span></div>
        <pre class="codeblock__body">{ "tool": "skill_search", "arguments": { "query": "build a go-to-market plan" } }
{ "tool": "skill_get", "arguments": { "skill": "8gentic-gtm-strategy" } }
{ "tool": "orchestration_plan", "arguments": { "goals": ["icp", "sales-playbook"] } }
// or select the MCP prompt named  8gentic-gtm-strategy  with your task as input</pre>
      </div>`;

const body = `
      <div class="catgroup__head">
        <span class="kicker kicker--bare signal">// the8genc/ai-8gent-skills</span>
        <h2 class="h-section">An operating system of ${cat.total} Agent Skills</h2>
        <p class="muted">Four levels of operation, mirroring 8genC's service areas: a top <strong>service area</strong> routes to a <strong>category lead</strong>, which orchestrates <strong>sub-agents</strong> and <strong>task agents</strong>. Authored in GitHub, served live over MCP.</p>
      </div>
${levelExplainer()}
${cat.areas.map(areaSection).join('\n')}
${howTo}
      `;

function replaceRegion(src, startRe, endRe, inner) {
  const s = src.match(startRe);
  const e = src.match(endRe);
  if (!s || !e) throw new Error('SKILLS markers not found in tools.html');
  return src.slice(0, s.index + s[0].length) + '\n' + inner + '\n      ' + src.slice(e.index);
}

const path = join(ROOT, 'site/tools.html');
let html = readFileSync(path, 'utf8');
let out = replaceRegion(html, /<!-- SKILLS:START[^>]*-->/, /<!-- SKILLS:END -->/, body);
// Stats: Agent Skills count + MCP Tools count in the catstat row.
out = out.replace(/(<span class="catstat__n">)\d+(<\/span><span class="catstat__l mono">Agent Skills<\/span>)/, `$1${cat.total}$2`);
out = out.replace(/(<span class="catstat__n">)\d+(<\/span><span class="catstat__l mono">MCP Tools<\/span>)/, `$1${TOOLS_TOTAL}$2`);

if (out === html) {
  console.log('= tools.html already up to date');
} else if (CHECK) {
  console.error('✗ site/tools.html is stale — run `node scripts/render-skills.mjs`');
  process.exit(1);
} else {
  writeFileSync(path, out);
  console.log(`✓ wrote site/tools.html — ${cat.total} skills across ${cat.areas.length} areas`);
}
