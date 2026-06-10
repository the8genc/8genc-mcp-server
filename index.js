#!/usr/bin/env node

/**
 * 8genC MCP Server
 *
 * AINative platform discovery + a GitHub-backed Agent Skills library:
 * - Full AINative platform awareness (22 products, 1968 API endpoints)
 * - Agent Skills pulled from a GitHub repo (the8genc/ai-8gent-skills) and
 *   cached in ZeroDB — exposed as both MCP tools and MCP prompts
 * - Auto-provisioning: no account needed to start, free instant database
 *
 * PRD generation/validation/templates/memory are no longer server tools — that
 * capability now lives in the `prd-generator` Agent Skill (the8genc/ai-8gent-skills),
 * loaded at runtime via the skill_* tools / MCP prompt. The skill calls the platform
 * tools below and the agent's own ZeroDB memory tools for persistence.
 *
 * 8 tools + skills-as-prompts across 2 categories:
 *   Platform (3): prd_list_services, prd_get_api_catalog, prd_suggest_stack
 *   Skills   (5): skill_list, skill_get, skill_get_reference, skill_search, skill_sync
 *
 * Transports:
 *   stdio  — default for local use (`npx 8genc-mcp-server`)
 *   http   — Streamable HTTP, used on Railway (auto when $PORT is set)
 *
 * Usage:
 *   npx 8genc-mcp-server                    # stdio, auto-provisions on first run
 *   PORT=8080 node index.js                 # Streamable HTTP on :8080
 *   MCP_TRANSPORT=http PORT=8080 node index.js
 */

import { webcrypto } from 'node:crypto';
// The MCP Streamable HTTP transport relies on the global Web Crypto API, which is
// only a global on Node 19+. Polyfill it so the HTTP transport works on older
// runtimes (e.g. Railway's default Node) regardless of version.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('./package.json');

import { createMcpServer, ALL_TOOLS } from './src/server.js';
import { ZeroDBClient } from './src/client/zerodb-client.js';
import { SkillsClient } from './src/skills/skills-client.js';
import { startHttpServer } from './src/transport/http.js';
import { config } from './src/config.js';
import { closePool } from './src/db/pool.js';
import { startCleanup } from './src/db/cleanup.js';
import { startStatusHeartbeat } from './src/site/status.js';
import { buildAuth } from './src/auth/buildAuth.js';

// Load .env
dotenv.config();

const SERVER_NAME = '8genc-mcp-server';

const hasCreds = () =>
  !!(
    process.env.ZERODB_API_KEY ||
    process.env.ZERODB_USERNAME ||
    process.env.AINATIVE_API_KEY ||
    process.env.AINATIVE_API_TOKEN ||
    process.env.AINATIVE_USERNAME
  );

// ─────────────────────────────────────────────────────────────────
// Credential resolution: env → .mcp.json scan → auto-provision
// ─────────────────────────────────────────────────────────────────
if (!hasCreds()) {
  const { existsSync, readFileSync, writeFileSync, appendFileSync } = await import('fs');
  const { dirname, join } = await import('path');

  // 1. Scan up directory tree for .mcp.json
  let dir = process.cwd();
  let foundInMcp = false;
  for (let i = 0; i < 6; i++) {
    const candidatePath = join(dir, '.mcp.json');
    if (existsSync(candidatePath)) {
      try {
        const mcp = JSON.parse(readFileSync(candidatePath, 'utf-8'));
        const servers = mcp.mcpServers || {};
        const prdServer =
          servers['prd-generator'] ||
          servers['ainative-prd'] ||
          servers['zerodb-memory'] ||
          Object.values(servers).find((s) => (s.args || []).join(' ').includes('prd'));
        const env = prdServer?.env;
        if (env) {
          if (env.ZERODB_API_KEY) process.env.ZERODB_API_KEY = env.ZERODB_API_KEY;
          if (env.ZERODB_USERNAME) process.env.ZERODB_USERNAME = env.ZERODB_USERNAME;
          if (env.ZERODB_PASSWORD) process.env.ZERODB_PASSWORD = env.ZERODB_PASSWORD;
          if (env.ZERODB_PROJECT_ID) process.env.ZERODB_PROJECT_ID = env.ZERODB_PROJECT_ID;
          if (env.ZERODB_API_URL) process.env.ZERODB_API_URL = env.ZERODB_API_URL;
          console.error(`  Loaded credentials from ${candidatePath}`);
          foundInMcp = true;
          break;
        }
      } catch (_) {}
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 2. Auto-provision a free ZeroDB instance if still no credentials
  if (!foundInMcp && !hasCreds()) {
    console.error('\n  No credentials found — provisioning a free ZeroDB instance...');
    try {
      const https = await import('https');
      const creds = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ agree_terms: true });
        const req = https.default.request(
          {
            hostname: 'api.ainative.studio',
            port: 443,
            path: '/api/v1/public/instant-db',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode === 200) resolve(JSON.parse(data));
              else reject(new Error(`HTTP ${res.statusCode}`));
            });
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      process.env.ZERODB_API_KEY = creds.api_key;
      process.env.ZERODB_PROJECT_ID = creds.project_id;
      process.env.ZERODB_API_URL = 'https://api.ainative.studio';

      // Write .mcp.json so next run loads from file
      const mcpPath = join(process.cwd(), '.mcp.json');
      const mcpConfig = {
        mcpServers: {
          'prd-generator': {
            command: 'npx',
            args: ['-y', '8genc-mcp-server'],
            env: {
              ZERODB_API_KEY: creds.api_key,
              ZERODB_PROJECT_ID: creds.project_id,
              ZERODB_API_URL: 'https://api.ainative.studio'
            }
          }
        }
      };
      let existing = {};
      if (existsSync(mcpPath)) {
        try {
          existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
        } catch (_) {}
      }
      writeFileSync(
        mcpPath,
        JSON.stringify(
          { ...existing, mcpServers: { ...(existing.mcpServers || {}), ...mcpConfig.mcpServers } },
          null,
          2
        ) + '\n'
      );

      // Append to .env
      const envPath = join(process.cwd(), '.env');
      const envBlock = `\n# ZeroDB (auto-provisioned by 8genc-mcp-server)\nZERODB_API_KEY=${creds.api_key}\nZERODB_PROJECT_ID=${creds.project_id}\nZERODB_API_URL=https://api.ainative.studio\n`;
      if (existsSync(envPath)) {
        if (!readFileSync(envPath, 'utf-8').includes('ZERODB_API_KEY')) appendFileSync(envPath, envBlock);
      } else writeFileSync(envPath, envBlock.trimStart());

      console.error(`  Auto-provisioned! Project: ${creds.project_id}`);
      console.error(`  API Key: ${creds.api_key.slice(0, 16)}...`);
      if (creds.expires_at) console.error(`  Expires: ${creds.expires_at}`);
      if (creds.claim_url) console.error(`  Claim your account: ${creds.claim_url}`);
      console.error(`  Saved to .mcp.json and .env\n`);
    } catch (provisionErr) {
      console.error(`  Auto-provision failed: ${provisionErr.message}`);
      console.error('  Get credentials: npx zerodb-cli init');
      console.error('  Or sign up: https://ainative.studio\n');
    }
  }
}

async function main() {
  // Banner
  console.error('\n');
  console.error('   █████╗  ██████╗ ███████╗███╗   ██╗ ██████╗');
  console.error('  ██╔══██╗██╔════╝ ██╔════╝████╗  ██║██╔════╝');
  console.error('  ╚█████╔╝██║  ███╗█████╗  ██╔██╗ ██║██║     ');
  console.error('  ██╔══██╗██║   ██║██╔══╝  ██║╚██╗██║██║     ');
  console.error('  ╚█████╔╝╚██████╔╝███████╗██║ ╚████║╚██████╗');
  console.error('   ╚════╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝');
  console.error('\n  8genC MCP Server');
  console.error('\n===========================================');
  console.error(`  8genC MCP Server v${PKG_VERSION}`);
  console.error('  AINative platform discovery + Agent Skills');
  console.error('===========================================\n');

  // Initialize ZeroDB client
  const client = new ZeroDBClient({
    baseUrl: process.env.ZERODB_API_URL || process.env.AINATIVE_API_URL || 'https://api.ainative.studio',
    apiKey: process.env.ZERODB_API_KEY || process.env.AINATIVE_API_KEY,
    projectId: process.env.ZERODB_PROJECT_ID || process.env.AINATIVE_PROJECT_ID,
    username: process.env.ZERODB_USERNAME || process.env.AINATIVE_USERNAME,
    password: process.env.ZERODB_PASSWORD || process.env.AINATIVE_PASSWORD
  });
  await client.initialize();

  // Skills client (GitHub-canonical, ZeroDB cache/search)
  const skills = new SkillsClient({ zerodb: client });

  if (client.isAuthenticated) {
    console.error(`  Connected to ZeroDB (${client.baseUrl})`);
    console.error(`  All ${ALL_TOOLS.length} tools available (platform discovery + skills)\n`);
  } else {
    console.error('  Running without ZeroDB credentials');
    console.error('  Platform discovery + skill_list/skill_get work');
    console.error('  skill_search/skill_sync require auth\n');
  }
  console.error(`  Skills source: ${skills.repo}@${skills.branch}\n`);

  const ctx = { client, skills, serverName: SERVER_NAME, version: PKG_VERSION };
  const createServer = () => createMcpServer(ctx);

  // ── Transport selection ──────────────────────────────────────
  const transport = process.env.MCP_TRANSPORT || (process.env.PORT ? 'http' : 'stdio');

  if (transport === 'http') {
    const port = parseInt(process.env.PORT || '8080', 10);
    // Build the auth bundle (migrations + verifier + portal API) when DATABASE_URL is set.
    let auth = null;
    if (config.authEnabled) {
      try {
        auth = await buildAuth();
        console.error('  Auth enabled: /mcp requires an approved credential; portal at /access\n');
      } catch (err) {
        console.error(`  AUTH INIT FAILED (${err.message}). Refusing to start an unprotected server.`);
        process.exit(1);
      }
    } else {
      console.error('  Auth DISABLED (no DATABASE_URL): /mcp is open. Set DATABASE_URL to protect it.\n');
    }
    await startHttpServer({ createServer, port, serverName: SERVER_NAME, version: PKG_VERSION, auth });
    if (auth) startCleanup(); // daily sweep of expired auth rows
    if (config.authEnabled) startStatusHeartbeat(); // uptime/latency samples for /api/status
    console.error(`  MCP Server listening on http://0.0.0.0:${port}/mcp (${ALL_TOOLS.length} tools)\n`);
  } else {
    const server = createServer();
    await server.connect(new StdioServerTransport());
    console.error(`  MCP Server connected via stdio (${ALL_TOOLS.length} tools)\n`);
  }
}

// Graceful shutdown — close the DB pool so connections drain cleanly.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error('\n  Shutting down...');
  try { await closePool(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err.message);
  console.error('\n  Get credentials: npx zerodb-cli init');
  console.error('  Or sign up: https://ainative.studio\n');
  process.exit(1);
});
