import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('PRD MCP Server - Package Structure', () => {
  it('has valid package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.name, '8genc-mcp-server');
    assert.equal(pkg.type, 'module');
    assert.ok(pkg.bin['8genc-mcp-server']);
  });

  it('has all required source files', () => {
    const required = [
      'index.js',
      'src/client/zerodb-client.js',
      'src/tools/platform-tools.js',
      'src/tools/skill-tools.js',
      'src/skills/skills-client.js',
      'src/knowledge/platform-manifest.json'
    ];
    for (const file of required) {
      assert.ok(existsSync(join(ROOT, file)), `Missing: ${file}`);
    }
  });
});

describe('Platform Manifest', () => {
  let manifest;

  before(() => {
    manifest = JSON.parse(
      readFileSync(join(ROOT, 'src/knowledge/platform-manifest.json'), 'utf8')
    );
  });

  it('has platform metadata', () => {
    assert.equal(manifest.platform, 'AINative Studio');
    assert.ok(manifest.base_url);
    assert.ok(manifest.docs_url);
  });

  it('lists all major products', () => {
    const names = manifest.products.map(p => p.name);
    assert.ok(names.includes('ZeroDB'), 'Missing ZeroDB');
    assert.ok(names.includes('ZeroMemory'), 'Missing ZeroMemory');
    assert.ok(names.includes('Agent Cloud'), 'Missing Agent Cloud');
    assert.ok(names.includes('AI Kit'), 'Missing AI Kit');
    assert.ok(names.includes('Chat Completions API'), 'Missing Chat Completions API');
    assert.ok(names.includes('Echo Developer Program'), 'Missing Echo Developer Program');
    assert.ok(names.includes('Live Streaming'), 'Missing Live Streaming');
    assert.ok(names.includes('MCP Hosting'), 'Missing MCP Hosting');
  });

  it('has at least 15 products', () => {
    assert.ok(manifest.products.length >= 15, `Only ${manifest.products.length} products`);
  });

  it('includes architecture constraints', () => {
    assert.ok(manifest.architecture.constraints.length >= 5);
    assert.ok(manifest.architecture.backend.includes('FastAPI'));
  });

  it('includes SDK listings', () => {
    assert.ok(manifest.sdks.npm.length >= 5);
    assert.ok(manifest.sdks.pypi.length >= 3);
    assert.ok(manifest.sdks.mcp_servers.length >= 3);
  });
});

describe('Tool Definitions', () => {
  it('platform tools have correct schemas', async () => {
    const { PLATFORM_TOOLS } = await import('../src/tools/platform-tools.js');
    assert.equal(PLATFORM_TOOLS.length, 3);
  });

  it('skill tools have correct schemas', async () => {
    const { SKILL_TOOLS } = await import('../src/tools/skill-tools.js');
    assert.equal(SKILL_TOOLS.length, 5);

    const get = SKILL_TOOLS.find(t => t.name === 'skill_get');
    assert.ok(get);
    assert.ok(get.inputSchema.required.includes('skill'));

    const names = SKILL_TOOLS.map(t => t.name);
    for (const expected of ['skill_list', 'skill_get', 'skill_get_reference', 'skill_search', 'skill_sync']) {
      assert.ok(names.includes(expected), `Missing skill tool: ${expected}`);
    }
  });

  it('orchestration tools have correct schemas', async () => {
    const { ORCHESTRATION_TOOLS } = await import('../src/tools/orchestration-tools.js');
    assert.equal(ORCHESTRATION_TOOLS.length, 3);
    assert.deepEqual(
      ORCHESTRATION_TOOLS.map((t) => t.name),
      ['orchestration_manifests', 'orchestration_plan', 'orchestration_guide']
    );
  });

  it('all 11 tools have unique names', async () => {
    const { ALL_TOOLS } = await import('../src/server.js');
    assert.equal(ALL_TOOLS.length, 11); // 3 platform + 5 skill + 3 orchestration

    const names = ALL_TOOLS.map(t => t.name);
    assert.equal(new Set(names).size, 11, 'Duplicate tool names found');
  });
});

describe('Skills Frontmatter Parser', () => {
  it('parses name and folded description', async () => {
    const { parseFrontmatter, stripFrontmatter } = await import('../src/skills/skills-client.js');
    const md = [
      '---',
      'name: my-skill',
      'description: >',
      '  First line of the description',
      '  continues on the second line.',
      '---',
      '',
      '# Body heading',
      'Body text.'
    ].join('\n');

    const fm = parseFrontmatter(md);
    assert.equal(fm.name, 'my-skill');
    assert.equal(fm.description, 'First line of the description continues on the second line.');

    const body = stripFrontmatter(md);
    assert.ok(body.startsWith('# Body heading'));
    assert.ok(!body.includes('name: my-skill'));
  });

  it('returns empty object when no frontmatter', async () => {
    const { parseFrontmatter } = await import('../src/skills/skills-client.js');
    assert.deepEqual(parseFrontmatter('# Just a heading\ntext'), {});
  });
});

describe('Platform Tools - Service Discovery', () => {
  it('lists all services', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_list_services', {}, {});
    assert.ok(result.count >= 15);
    assert.ok(result.categories.length >= 5);
  });

  it('filters by category', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_list_services', { category: 'Data Platform' }, {});
    assert.ok(result.count >= 1);
    assert.ok(result.services.some(s => s.name === 'ZeroDB'));
  });

  it('gets API catalog for ZeroDB', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_get_api_catalog', { service: 'ZeroDB' }, {});
    assert.equal(result.service, 'ZeroDB');
    assert.ok(result.api_prefix);
    assert.ok(result.features.length >= 3);
  });

  it('suggests stack for requirements', async () => {
    const { executePlatformTool } = await import('../src/tools/platform-tools.js');
    const result = await executePlatformTool('prd_suggest_stack', {
      requirements: 'Build an agent that remembers user preferences and stores files',
      features: ['memory', 'file storage', 'search']
    }, { isAuthenticated: false });
    assert.ok(result.suggested_stack.length >= 2);
    assert.ok(result.suggested_stack.some(s => s.service === 'ZeroDB'));
    assert.ok(result.suggested_stack.some(s => s.service === 'ZeroMemory'));
  });
});
