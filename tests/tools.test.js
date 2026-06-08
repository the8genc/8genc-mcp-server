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
    assert.equal(pkg.name, 'ainative-prd-mcp');
    assert.equal(pkg.type, 'module');
    assert.ok(pkg.bin['ainative-prd-mcp']);
  });

  it('has all required source files', () => {
    const required = [
      'index.js',
      'src/client/zerodb-client.js',
      'src/tools/generation-tools.js',
      'src/tools/template-tools.js',
      'src/tools/validation-tools.js',
      'src/tools/memory-tools.js',
      'src/tools/platform-tools.js',
      'src/knowledge/platform-manifest.json',
      'src/templates/standard.md',
      'src/templates/ainative-feature.md',
      'src/templates/agent-capability.md'
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

describe('Templates', () => {
  it('standard template has required sections', () => {
    const tpl = readFileSync(join(ROOT, 'src/templates/standard.md'), 'utf8');
    assert.ok(tpl.includes('{{PRODUCT_NAME}}'));
    assert.ok(tpl.includes('{{TARGET_AUDIENCE}}'));
    assert.ok(tpl.includes('{{CORE_FEATURES}}'));
    assert.ok(tpl.includes('AINative Services'));
    assert.ok(tpl.includes('Acceptance Criteria'));
  });

  it('ainative-feature template has compliance checklist', () => {
    const tpl = readFileSync(join(ROOT, 'src/templates/ainative-feature.md'), 'utf8');
    assert.ok(tpl.includes('Architecture Compliance'));
    assert.ok(tpl.includes('service layer'));
    assert.ok(tpl.includes('ZeroDB'));
    assert.ok(tpl.includes('Test Plan'));
    assert.ok(tpl.includes('80%'));
  });

  it('agent-capability template has MCP sections', () => {
    const tpl = readFileSync(join(ROOT, 'src/templates/agent-capability.md'), 'utf8');
    assert.ok(tpl.includes('MCP Server Design'));
    assert.ok(tpl.includes('Memory Strategy'));
    assert.ok(tpl.includes('Sequential Thinking'));
    assert.ok(tpl.includes('Hosting'));
  });
});

describe('Tool Definitions', () => {
  it('generation tools have correct schemas', async () => {
    const { GENERATION_TOOLS } = await import('../src/tools/generation-tools.js');
    assert.equal(GENERATION_TOOLS.length, 4);

    const generate = GENERATION_TOOLS.find(t => t.name === 'prd_generate');
    assert.ok(generate);
    assert.ok(generate.inputSchema.required.includes('product_name'));
    assert.ok(generate.inputSchema.required.includes('core_features'));
  });

  it('template tools have correct schemas', async () => {
    const { TEMPLATE_TOOLS } = await import('../src/tools/template-tools.js');
    assert.equal(TEMPLATE_TOOLS.length, 4);
  });

  it('validation tools have correct schemas', async () => {
    const { VALIDATION_TOOLS } = await import('../src/tools/validation-tools.js');
    assert.equal(VALIDATION_TOOLS.length, 3);

    const validate = VALIDATION_TOOLS.find(t => t.name === 'prd_validate');
    assert.ok(validate);
  });

  it('memory tools have correct schemas', async () => {
    const { MEMORY_TOOLS } = await import('../src/tools/memory-tools.js');
    assert.equal(MEMORY_TOOLS.length, 4);

    const save = MEMORY_TOOLS.find(t => t.name === 'prd_save');
    assert.ok(save);
    assert.ok(save.inputSchema.required.includes('title'));
    assert.ok(save.inputSchema.required.includes('content'));
  });

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

  it('all 23 tools have unique names', async () => {
    const { ALL_TOOLS } = await import('../src/server.js');
    assert.equal(ALL_TOOLS.length, 23);

    const names = ALL_TOOLS.map(t => t.name);
    assert.equal(new Set(names).size, 23, 'Duplicate tool names found');
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

describe('Validation Rules', () => {
  it('validates a good PRD as passing', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');

    const goodPrd = `# My Product PRD

## 1. Introduction

This is a product for developers.

## 2. Problem Statement

Developers need better tools.

## 3. Target Audience

Developers building AI applications.

## 4. User Stories

As a developer, I want to generate PRDs quickly.

## 5. Core Features and Requirements

- Feature 1: PRD generation
- Feature 2: Template management

## 6. Technical Architecture

Uses /api/v1/zerodb for data storage.
Uses ZeroDB and ZeroMemory for persistence.

### API Endpoints

POST /api/v1/prd/generate

## 7. Acceptance Criteria

Given a product description
When the user calls prd_generate
Then a complete PRD is returned

## 8. Test Plan

Run pytest with 80% coverage target.

## 9. Timeline

Phase 1: Design (1 week)
Phase 2: Implementation (2 weeks)

## 10. Security

Authentication via JWT tokens. Input validation on all endpoints.

${'x'.repeat(500)}
`;

    const mockClient = { isAuthenticated: false };
    const result = await executeValidationTool('prd_validate', { content: goodPrd }, mockClient);
    assert.ok(result.summary.score >= 80, `Score too low: ${result.summary.score}`);
  });

  it('validates a bad PRD as failing', async () => {
    const { executeValidationTool } = await import('../src/tools/validation-tools.js');

    const badPrd = 'This is a short PRD with no sections.';
    const mockClient = { isAuthenticated: false };
    const result = await executeValidationTool('prd_validate', { content: badPrd }, mockClient);
    assert.ok(result.summary.failed > 5, `Too few failures: ${result.summary.failed}`);
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
