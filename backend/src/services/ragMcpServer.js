'use strict';

const z = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

class RagMcpServer {
  constructor(ragService, options = {}) {
    this.ragService = ragService || null;
    this.name = options.name || process.env.RAG_MCP_SERVER_NAME || 'ai-travel-planner-rag';
    this.version = options.version || process.env.RAG_MCP_SERVER_VERSION || '1.0.0';
    this.enableJsonResponse = options.enableJsonResponse ?? ((process.env.RAG_MCP_ENABLE_JSON_RESPONSE || 'true').toLowerCase() !== 'false');
    this.authToken = options.authToken || process.env.RAG_MCP_AUTH_TOKEN || '';
  }

  isEnabled() {
    return !!(this.ragService && this.ragService.isAvailable());
  }

  _isAuthorized(req) {
    if (!this.authToken) return true;
    const auth = typeof req.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
    return auth === `Bearer ${this.authToken}`;
  }

  createServer() {
    const server = new McpServer(
      {
        name: this.name,
        version: this.version,
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      }
    );

    server.registerTool(
      'search_travel_knowledge',
      {
        description: '检索旅游知识库。内部流程包含意图解析、稀疏/稠密混合召回、RRF 融合，以及可选 rerank。',
        inputSchema: {
          query: z.string().describe('用户问题，例如“杭州西湖附近有什么好吃的”'),
          city: z.string().optional().describe('可选，手动指定城市，优先于自动解析'),
          type: z.string().optional().describe('可选，手动指定类型，如 food/attraction/guide/transport'),
          topK: z.number().int().min(1).max(10).optional().describe('最终返回条数，默认使用后端配置'),
          threshold: z.number().min(0).max(1).optional().describe('Dense 召回阈值'),
          sparseThreshold: z.number().min(0).optional().describe('Sparse 召回阈值'),
          includeContent: z.boolean().optional().describe('是否在文本结果中附带片段内容，默认 true'),
          previewChars: z.number().int().min(50).max(1000).optional().describe('每条内容预览字符数，默认 220'),
        },
      },
      async (args) => {
        const query = typeof args?.query === 'string' ? args.query.trim() : '';
        if (!query) {
          return {
            content: [{ type: 'text', text: '缺少 query，无法执行检索。' }],
          };
        }

        const result = await this.ragService.search(query, {
          city: typeof args?.city === 'string' ? args.city.trim() : undefined,
          type: typeof args?.type === 'string' ? args.type.trim() : undefined,
          topK: Number.isFinite(args?.topK) ? args.topK : undefined,
          threshold: Number.isFinite(args?.threshold) ? args.threshold : undefined,
          sparseThreshold: Number.isFinite(args?.sparseThreshold) ? args.sparseThreshold : undefined,
        });
        const summary = this.ragService.buildSearchSummary(result, {
          includeContent: args?.includeContent !== false,
          previewChars: Number.isFinite(args?.previewChars) ? args.previewChars : 220,
        });

        return {
          content: [{ type: 'text', text: summary.text }],
          structuredContent: {
            query: result.query,
            intent: result.intent,
            scopeName: result.scopeName,
            filterCity: result.filterCity,
            filterType: result.filterType,
            results: summary.items.map((row, index) => ({
              rank: index + 1,
              externalId: row.external_id || row.externalId || null,
              city: row.city || '',
              type: row.type || '',
              title: row.title || '',
              similarity: typeof row.similarity === 'number' ? row.similarity : null,
              sparseScore: typeof row.sparse_score === 'number' ? row.sparse_score : null,
              rrfScore: typeof row.rrf_score === 'number' ? row.rrf_score : null,
              rerankScore: typeof row.rerank_score === 'number' ? row.rerank_score : null,
              sources: Array.isArray(row.sources) ? row.sources : [],
              content: row.content || '',
            })),
          },
        };
      }
    );

    return server;
  }

  async handlePost(req, res) {
    if (!this.isEnabled()) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'RAG MCP service is unavailable',
        },
        id: null,
      });
      return;
    }

    if (!this._isAuthorized(req)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized',
        },
        id: null,
      });
      return;
    }

    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: this.enableJsonResponse,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error?.message || 'Internal server error',
          },
          id: null,
        });
      }
    } finally {
      if (this.enableJsonResponse) {
        await transport.close().catch(() => {});
        await server.close().catch(() => {});
      } else {
        res.on('close', () => {
          transport.close().catch(() => {});
          server.close().catch(() => {});
        });
      }
    }
  }

  handleMethodNotAllowed(req, res) {
    const allow = 'POST';
    res.status(405).set('Allow', allow).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  }
}

module.exports = RagMcpServer;