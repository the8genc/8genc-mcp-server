/**
 * ZeroDB API Client for PRD MCP Server
 *
 * Handles authentication, auto-provisioning, and API calls to ZeroDB.
 * Reuses patterns from zerodb-memory-mcp client.
 */

import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CREDENTIALS_PATH = join(homedir(), '.zerodb', 'credentials.json');
const DEFAULT_BASE_URL = 'https://api.ainative.studio';

export class ZeroDBClient {
  constructor(config = {}) {
    // ZERODB_* is canonical; AINATIVE_* are accepted as aliases so the
    // Railway deployment (which sets AINATIVE_API_KEY / AINATIVE_API_URL)
    // authenticates against the real account instead of auto-provisioning.
    this.baseUrl =
      config.baseUrl ||
      process.env.ZERODB_BASE_URL ||
      process.env.ZERODB_API_URL ||
      process.env.AINATIVE_API_URL ||
      process.env.API_BASE_URL ||
      DEFAULT_BASE_URL;
    this.apiKey =
      config.apiKey ||
      process.env.ZERODB_API_KEY ||
      process.env.AINATIVE_API_KEY ||
      process.env.AINATIVE_API_TOKEN ||
      null;
    this.projectId = config.projectId || process.env.ZERODB_PROJECT_ID || process.env.AINATIVE_PROJECT_ID || null;
    this.username = config.username || process.env.ZERODB_USERNAME || process.env.AINATIVE_USERNAME || null;
    this.password = config.password || process.env.ZERODB_PASSWORD || process.env.AINATIVE_PASSWORD || null;
    this.token = null;
    this.tokenExpiry = null;
  }

  async initialize() {
    // Try loading saved credentials
    if (!this.apiKey && !this.username) {
      this.loadCredentials();
    }

    // Auto-provision if no credentials at all
    if (!this.apiKey && !this.username) {
      await this.autoProvision();
    }

    // Authenticate if using username/password
    if (this.username && this.password && !this.apiKey) {
      await this.authenticate();
    }

    return this;
  }

  loadCredentials() {
    try {
      if (existsSync(CREDENTIALS_PATH)) {
        const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
        this.apiKey = creds.api_key || this.apiKey;
        this.projectId = creds.project_id || this.projectId;
        this.baseUrl = creds.base_url || this.baseUrl;
      }
    } catch {
      // Ignore credential load errors
    }
  }

  async autoProvision() {
    try {
      const res = await axios.post(`${this.baseUrl}/api/v1/public/instant-db`, {
        purpose: 'prd-generator-mcp'
      });
      const { api_key, project_id } = res.data;
      this.apiKey = api_key;
      this.projectId = project_id;

      // Save for future sessions
      const dir = join(homedir(), '.zerodb');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(CREDENTIALS_PATH, JSON.stringify({
        api_key,
        project_id,
        base_url: this.baseUrl,
        provisioned_by: 'ainative-prd-mcp'
      }, null, 2));
    } catch (err) {
      // Auto-provision failed — tools will work in template-only mode
      console.error(`Auto-provision failed: ${err.message}`);
    }
  }

  async authenticate() {
    try {
      const res = await axios.post(`${this.baseUrl}/api/v1/public/auth/login-json`, {
        username: this.username,
        password: this.password
      });
      this.token = res.data.access_token;
      this.tokenExpiry = Date.now() + 23 * 60 * 1000; // 23 min refresh cycle
    } catch (err) {
      throw new Error(`Authentication failed: ${err.message}`);
    }
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    } else if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.projectId) {
      headers['x-project-id'] = this.projectId;
    }
    return headers;
  }

  async refreshIfNeeded() {
    if (this.token && this.tokenExpiry && Date.now() > this.tokenExpiry) {
      await this.authenticate();
    }
  }

  async request(method, path, data = null) {
    await this.refreshIfNeeded();
    const url = `${this.baseUrl}${path}`;
    const config = {
      method,
      url,
      headers: this.getHeaders(),
      timeout: 30000
    };
    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      config.data = data;
    }
    try {
      const res = await axios(config);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message;
      throw new Error(`API ${method} ${path} failed (${status}): ${detail}`);
    }
  }

  // Plan artifact operations (used for PRD persistence)
  async createPlan(title, content, type = 'prd') {
    return this.request('POST', '/api/v1/public/memory/v2/plan/', {
      title, content, type
    });
  }

  async getPlan(id) {
    return this.request('GET', `/api/v1/public/memory/v2/plan/${id}`);
  }

  async updatePlan(id, updates) {
    return this.request('PATCH', `/api/v1/public/memory/v2/plan/${id}`, updates);
  }

  async getPlanHistory(id) {
    return this.request('GET', `/api/v1/public/memory/v2/plan/${id}/history`);
  }

  // Memory operations (for PRD search and recall)
  async storeMemory(content, sessionId, tags = [], metadata = {}) {
    const namespace = sessionId ? `session:${sessionId}` : 'global';
    return this.request('POST', '/api/v1/public/memory/v2/remember', {
      content,
      namespace,
      tags,
      metadata,
      memory_type: 'episodic',
      importance: 0.7
    });
  }

  async searchMemory(query, limit = 10, scope = 'agent') {
    return this.request('POST', '/api/v1/public/memory/v2/recall', {
      query, limit, namespace: 'global'
    });
  }

  // Chat completions (for AI-powered PRD generation)
  async chatCompletion(messages, options = {}) {
    return this.request('POST', '/api/v1/chat/completions', {
      model: options.model || 'meta-llama/Llama-3.3-70B-Instruct',
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 8000,
      stream: false
    });
  }

  get isAuthenticated() {
    return !!(this.apiKey || this.token);
  }
}
