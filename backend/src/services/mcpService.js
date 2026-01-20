const { z } = require('zod');
const { DynamicStructuredTool } = require('@langchain/core/tools');

class MCPService {
  constructor(config = {}) {
    const sseUrlRaw =
      process.env.MCP_12306_URL ||
      'https://mcp.api-inference.modelscope.net/27e6b8cbcea047/sse';
    const authorizationRaw = process.env.MCP_12306_AUTHORIZATION || '';
    const tokenRaw = process.env.MCP_12306_TOKEN || '';
    const authorization = authorizationRaw
      ? authorizationRaw.trim()
      : tokenRaw
        ? `Bearer ${tokenRaw.trim()}`
        : '';
    const amapUrlRaw =
      process.env.MCP_AMAP_URL;
    const amapAuthorizationRaw = process.env.MCP_AMAP_AUTHORIZATION || '';
    const amapTokenRaw = process.env.MCP_AMAP_TOKEN || '';
    const amapAuthorization = amapAuthorizationRaw
      ? amapAuthorizationRaw.trim()
      : amapTokenRaw
        ? `Bearer ${amapTokenRaw.trim()}`
        : '';

    const bingUrlRaw =
      process.env.MCP_BING_URL;
    const bingAuthorizationRaw = process.env.MCP_BING_AUTHORIZATION || '';
    const bingTokenRaw = process.env.MCP_BING_TOKEN || '';
    const bingAuthorization = bingAuthorizationRaw
      ? bingAuthorizationRaw.trim()
      : bingTokenRaw
        ? `Bearer ${bingTokenRaw.trim()}`
        : '';

    const envServersRaw = process.env.MCP_SERVERS_JSON || process.env.MCP_CONFIG_JSON || '';
    const parseJsonEnv = (raw) => {
      if (!raw || typeof raw !== 'string') return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    const looksLikeServerMap = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const entries = Object.entries(value);
      if (!entries.length) return false;
      return entries.some(([, cfg]) => {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
        return (
          typeof cfg.transport === 'string' ||
          typeof cfg.type === 'string' ||
          typeof cfg.url === 'string' ||
          typeof cfg.command === 'string'
        );
      });
    };

    const extractServers = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      if (value.mcpServers && typeof value.mcpServers === 'object') return value.mcpServers;
      if (value.mcp_servers && typeof value.mcp_servers === 'object') return value.mcp_servers;
      if (value.servers && typeof value.servers === 'object') return value.servers;
      return looksLikeServerMap(value) ? value : null;
    };

    const normalizeUrl = (value) => {
      if (typeof value !== 'string') return '';
      let s = value.trim();
      if (!s) return '';
      s = s.replace(/^["'“”‘’`]+/, '').replace(/["'“”‘’`]+$/, '').trim();
      return s;
    };

    const serversFromEnv = extractServers(parseJsonEnv(envServersRaw));
    const serversFromConfig = extractServers(config);

    const normalizeServers = (servers) => {
      const out = {};
      const raw = servers && typeof servers === 'object' ? servers : {};
      for (const [name, cfg] of Object.entries(raw)) {
        if (!cfg || typeof cfg !== 'object') continue;
        const transportRaw =
          typeof cfg.transport === 'string' ? cfg.transport : typeof cfg.type === 'string' ? cfg.type : '';
        const transport = String(transportRaw || '').toLowerCase();
        const normalizedTransport =
          transport === 'stdio' || transport === 'sse' || transport === 'streamable_http'
            ? transport === 'streamable_http'
              ? 'sse'
              : transport
            : '';
        if (!normalizedTransport) continue;
        const entry = { transport: normalizedTransport };
        if (normalizedTransport === 'stdio') {
          if (typeof cfg.command !== 'string' || !cfg.command.trim()) continue;
          if (typeof cfg.command === 'string') entry.command = cfg.command;
          if (Array.isArray(cfg.args)) entry.args = cfg.args;
        } else {
          const url = normalizeUrl(cfg.url);
          if (!url) continue;
          entry.url = url;
          if (cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)) {
            entry.headers = { ...cfg.headers };
          }
        }
        out[name] = entry;
      }
      return out;
    };

    const normalizedFromConfig = normalizeServers(serversFromConfig);
    const normalizedFromEnv = normalizeServers(serversFromEnv);

    const defaults = {
      '12306-mcp': {
        transport: 'sse',
        url: normalizeUrl(sseUrlRaw),
        headers: authorization ? { Authorization: authorization } : undefined,
      },
      'bing-cn-mcp-server': {
        transport: 'sse',
        url: normalizeUrl(bingUrlRaw),
        headers: bingAuthorization ? { Authorization: bingAuthorization } : undefined,
      },
      'amap-maps': {
        transport: 'sse',
        url: normalizeUrl(amapUrlRaw),
        headers: amapAuthorization ? { Authorization: amapAuthorization } : undefined,
      },
    };

    const merged = { ...defaults, ...normalizedFromEnv, ...normalizedFromConfig };
    if (!merged['12306-mcp'] || typeof merged['12306-mcp'] !== 'object') {
      merged['12306-mcp'] = defaults['12306-mcp'];
    }
    this.servers = merged;

    this._sdk = null;
    this._clients = new Map();
    this._toolsCache = null;
    this._toolsCacheAt = 0;
    this._toolsCacheTtlMs = Number(process.env.MCP_TOOLS_CACHE_TTL_MS || '30000');
  }

  _withTimeout(promise, timeoutMs, code) {
    const msRaw = Number(timeoutMs);
    const ms = Number.isFinite(msRaw) && msRaw > 0 ? msRaw : 30000;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        const t = setTimeout(() => {
          const err = new Error(code || 'MCP_TIMEOUT');
          err.code = code || 'MCP_TIMEOUT';
          reject(err);
        }, ms);
        if (t && typeof t.unref === 'function') t.unref();
      }),
    ]);
  }

  async _loadSdk() {
    if (this._sdk) return this._sdk;

    const [{ Client }, { StdioClientTransport }, { SSEClientTransport }, types] = await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),
      import('@modelcontextprotocol/sdk/client/stdio.js'),
      import('@modelcontextprotocol/sdk/client/sse.js'),
      import('@modelcontextprotocol/sdk/types.js'),
    ]);

    this._sdk = {
      Client,
      StdioClientTransport,
      SSEClientTransport,
      ListToolsResultSchema: types.ListToolsResultSchema,
      CallToolResultSchema: types.CallToolResultSchema,
    };

    return this._sdk;
  }

  _publicServerConfig(name) {
    const cfg = this.servers[name] || null;
    if (!cfg) return null;
    const out = {};
    if (cfg.transport) out.transport = cfg.transport;
    if (cfg.command) out.command = cfg.command;
    if (Array.isArray(cfg.args)) out.args = cfg.args;
    if (cfg.url) out.url = cfg.url;
    return out;
  }

  async _getClient(serverName) {
    const existing = this._clients.get(serverName);
    if (existing) return existing;

    const sdk = await this._loadSdk();
    const cfg = this.servers[serverName];
    if (!cfg) throw new Error(`Unknown MCP server: ${serverName}`);

    const client = new sdk.Client(
      { name: 'ai-travel-planner-backend', version: '1.0.0' },
      { capabilities: {} }
    );

    let transport = null;
    if (cfg.transport === 'stdio') {
      transport = new sdk.StdioClientTransport({
        command: cfg.command,
        args: cfg.args || [],
      });
    } else if (cfg.transport === 'sse') {
      const headers = cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : undefined;
      transport = new sdk.SSEClientTransport(new URL(cfg.url), headers ? { requestInit: { headers } } : undefined);
    } else {
      throw new Error(`Unsupported MCP transport: ${cfg.transport}`);
    }

    await client.connect(transport);
    const wrapped = { client, transport };
    this._clients.set(serverName, wrapped);
    return wrapped;
  }

  _coerceJsonSchemaToZod(schema) {
    if (!schema || typeof schema !== 'object') return z.any();
    const type = schema.type;

    if (type === 'string') return z.string();
    if (type === 'number' || type === 'integer') return z.number();
    if (type === 'boolean') return z.boolean();
    if (type === 'array') {
      const item = this._coerceJsonSchemaToZod(schema.items);
      return z.array(item);
    }
    if (type === 'object' || schema.properties) {
      const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
      const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set();
      const shape = {};
      for (const [key, propSchema] of Object.entries(props)) {
        let zs = this._coerceJsonSchemaToZod(propSchema);
        if (!required.has(key)) zs = zs.optional();
        shape[key] = zs;
      }
      return z.object(shape).passthrough();
    }

    if (Array.isArray(schema.anyOf)) return z.any();
    if (Array.isArray(schema.oneOf)) return z.any();
    if (Array.isArray(schema.allOf)) return z.any();

    return z.any();
  }

  async listTools({ refresh = false } = {}) {
    const now = Date.now();
    if (!refresh && this._toolsCache && now - this._toolsCacheAt < this._toolsCacheTtlMs) {
      return this._toolsCache;
    }

    const sdk = await this._loadSdk();
    const aggregated = [];
    for (const serverName of Object.keys(this.servers)) {
      try {
        const { client } = await this._getClient(serverName);
        const response = await client.request({ method: 'tools/list' }, sdk.ListToolsResultSchema);
        const tools = Array.isArray(response?.tools) ? response.tools : [];
        for (const tool of tools) {
          aggregated.push({ server: serverName, tool });
        }
      } catch {
        continue;
      }
    }

    this._toolsCache = aggregated;
    this._toolsCacheAt = now;
    return aggregated;
  }

  async initialize({ refreshTools = true } = {}) {
    const strict = process.env.MCP_STRICT_STARTUP === 'true';
    const timeoutMs = Number(process.env.MCP_STARTUP_TIMEOUT_MS || '45000');
    const perServer = {};

    for (const serverName of Object.keys(this.servers)) {
      const start = Date.now();
      try {
        const sdk = await this._loadSdk();
        const { client } = await this._withTimeout(this._getClient(serverName), timeoutMs, 'MCP_STARTUP_TIMEOUT');
        const response = await this._withTimeout(
          client.request({ method: 'tools/list' }, sdk.ListToolsResultSchema),
          timeoutMs,
          'MCP_STARTUP_TIMEOUT'
        );
        const toolNames = (Array.isArray(response?.tools) ? response.tools : []).map((t) => t?.name).filter(Boolean);
        perServer[serverName] = { ok: true, duration_ms: Date.now() - start, tool_count: toolNames.length };
      } catch (e) {
        perServer[serverName] = { ok: false, duration_ms: Date.now() - start, error: String(e?.message || e) };
        if (strict) throw e;
      }
    }

    if (refreshTools) {
      try {
        await this._withTimeout(this.listTools({ refresh: true }), timeoutMs, 'MCP_STARTUP_TIMEOUT');
      } catch (e) {
        if (strict) throw e;
      }
    }

    return { ok: Object.values(perServer).every((x) => x && x.ok), per_server: perServer };
  }

  async callTool(serverName, toolName, args) {
    const sdk = await this._loadSdk();
    const { client } = await this._getClient(serverName);
    const response = await client.request(
      { method: 'tools/call', params: { name: toolName, arguments: args || {} } },
      sdk.CallToolResultSchema
    );

    return response;
  }

  _stringifyToolResult(result) {
    const content = Array.isArray(result?.content) ? result.content : [];
    const parts = [];
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
      else if (typeof item.text === 'string') parts.push(item.text);
      else parts.push(JSON.stringify(item));
    }
    if (parts.length) return parts.join('\n');
    if (result == null) return '';
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  async getLangChainTools({ refresh = false } = {}) {
    const listed = await this.listTools({ refresh });
    const tools = [];

    for (const entry of listed) {
      const serverName = entry.server;
      const tool = entry.tool;
      const toolName = tool?.name ? String(tool.name) : '';
      if (!toolName) continue;

      const description = typeof tool?.description === 'string' ? tool.description : '';
      const inputSchema = tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : null;
      const schema = this._coerceJsonSchemaToZod(inputSchema || { type: 'object' });

      tools.push(
        new DynamicStructuredTool({
          name: toolName,
          description: description || `${serverName}:${toolName}`,
          schema,
          func: async (input) => {
            const result = await this.callTool(serverName, toolName, input);
            return this._stringifyToolResult(result);
          },
        })
      );
    }

    return tools;
  }

  async status({ scope = 'summary' } = {}) {
    const normalized = (scope || 'summary').toLowerCase();
    const status = {
      servers: Object.fromEntries(Object.keys(this.servers).map((k) => [k, this._publicServerConfig(k)])),
      per_server: null,
      tool_probe: {
        ok: false,
        duration_ms: null,
        tool_count: null,
        tool_names: [],
        error: null,
      },
    };

    if (normalized === 'each' || normalized === 'per_server') {
      const perServer = {};
      for (const serverName of Object.keys(this.servers)) {
        const probe = { ok: false, duration_ms: null, tool_count: null, tool_names: [], error: null };
        const start = Date.now();
        try {
          const sdk = await this._loadSdk();
          const { client } = await this._getClient(serverName);
          const response = await client.request({ method: 'tools/list' }, sdk.ListToolsResultSchema);
          const toolNames = (Array.isArray(response?.tools) ? response.tools : []).map((t) => t?.name).filter(Boolean);
          probe.ok = true;
          probe.duration_ms = Date.now() - start;
          probe.tool_count = toolNames.length;
          probe.tool_names = toolNames.slice(0, 80);
        } catch (e) {
          probe.duration_ms = Date.now() - start;
          probe.error = String(e?.message || e);
        }
        perServer[serverName] = probe;
      }
      status.per_server = perServer;
    }

    const start = Date.now();
    try {
      const listed = await this.listTools({ refresh: true });
      const names = listed.map((x) => x?.tool?.name).filter(Boolean);
      status.tool_probe.ok = names.length > 0;
      status.tool_probe.duration_ms = Date.now() - start;
      status.tool_probe.tool_count = names.length;
      status.tool_probe.tool_names = names.slice(0, 80);
    } catch (e) {
      status.tool_probe.duration_ms = Date.now() - start;
      status.tool_probe.error = String(e?.message || e);
    }

    return status;
  }
}

module.exports = MCPService;
