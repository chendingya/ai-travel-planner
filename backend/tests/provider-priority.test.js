const test = require('node:test');
const assert = require('node:assert/strict');

const LangChainManager = require('../src/services/langchain/LangChainManager');
const PlanService = require('../src/services/planService');
const AIChatService = require('../src/services/aiChatService');

test('LangChainManager.invokeText uses runtime adapter order when no provider is explicitly constrained', async () => {
  const originalDefaultPrimary = process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY;
  const originalDefaultPreferred = process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED;
  process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY = 'env-only-provider';
  process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED = 'env-only-provider';

  const calls = [];
  const ctx = {
    textAdapters: [
      {
        name: 'runtime-first',
        model: 'model-a',
        invoke: async () => {
          calls.push('runtime-first');
          throw new Error('first failed');
        },
      },
      {
        name: 'runtime-second',
        model: 'model-b',
        invoke: async () => {
          calls.push('runtime-second');
          return 'ok';
        },
      },
    ],
    _resolveTextAdapters() {
      return this.textAdapters;
    },
    _debugEnabled: () => false,
    _stringifyErrorMessage: (error) => String(error?.message || error || ''),
    _isProviderProtocolError: () => false,
  };

  try {
    const result = await LangChainManager.prototype.invokeText.call(ctx, [
      { role: 'user', content: 'hello' },
    ]);
    assert.equal(result, 'ok');
    assert.deepEqual(calls, ['runtime-first', 'runtime-second']);
  } finally {
    if (originalDefaultPrimary == null) delete process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY;
    else process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY = originalDefaultPrimary;
    if (originalDefaultPreferred == null) delete process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED;
    else process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED = originalDefaultPreferred;
  }
});

test('PlanService prefers current runtime provider over env MCP primary and does not hard-restrict fallback chain', async () => {
  const originalMcpPrimary = process.env.AI_TEXT_PROVIDER_MCP_PRIMARY;
  const originalMcpPreferred = process.env.AI_TEXT_PROVIDER_MCP_PREFERRED;
  process.env.AI_TEXT_PROVIDER_MCP_PRIMARY = 'env-mcp-provider';
  process.env.AI_TEXT_PROVIDER_MCP_PREFERRED = 'env-mcp-provider';

  let receivedOptions = null;
  const langChainManager = {
    textAdapters: [{ name: 'runtime-mcp-provider' }, { name: 'runtime-fallback-provider' }],
    invokeText: async (_messages, options) => {
      receivedOptions = options;
      return 'ok';
    },
  };
  const service = new PlanService(langChainManager, null, null);

  try {
    const result = await service._invokeTextWithMcpPreferred([{ role: 'user', content: 'hello' }]);
    assert.equal(result, 'ok');
    assert.equal(receivedOptions.provider, 'runtime-mcp-provider');
    assert.equal(receivedOptions.allowedProviders, undefined);
  } finally {
    if (originalMcpPrimary == null) delete process.env.AI_TEXT_PROVIDER_MCP_PRIMARY;
    else process.env.AI_TEXT_PROVIDER_MCP_PRIMARY = originalMcpPrimary;
    if (originalMcpPreferred == null) delete process.env.AI_TEXT_PROVIDER_MCP_PREFERRED;
    else process.env.AI_TEXT_PROVIDER_MCP_PREFERRED = originalMcpPreferred;
  }
});

test('AIChatService default preferred provider follows current runtime adapters before env defaults', () => {
  const originalDefaultPrimary = process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY;
  const originalDefaultPreferred = process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED;
  process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY = 'env-default-provider';
  process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED = 'env-default-provider';

  try {
    const service = new AIChatService(
      { textAdapters: [{ name: 'runtime-provider' }, { name: 'runtime-fallback' }] },
      null,
      {},
    );
    assert.equal(service._pickPreferredProviderName({ enableTools: false }), 'runtime-provider');
    assert.equal(service._pickPreferredProviderName({ enableTools: true }), 'runtime-provider');
  } finally {
    if (originalDefaultPrimary == null) delete process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY;
    else process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY = originalDefaultPrimary;
    if (originalDefaultPreferred == null) delete process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED;
    else process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED = originalDefaultPreferred;
  }
});

test('LangChainManager keeps provider priority ahead of nested model priority', () => {
  const manager = new LangChainManager(
    [
      {
        name: 'provider-a',
        enabled: true,
        baseURL: 'https://provider-a.example.com/v1',
        apiKey: 'sk-provider-a',
        priority: 1,
        models: [
          { model: 'a-model-2', priority: 2 },
          { model: 'a-model-1', priority: 1 },
        ],
      },
      {
        name: 'provider-b',
        enabled: true,
        baseURL: 'https://provider-b.example.com/v1',
        apiKey: 'sk-provider-b',
        priority: 2,
        models: [
          { model: 'b-model-1', priority: 1 },
        ],
      },
    ],
    [],
    [],
    [],
  );

  const ordered = manager.getAvailableTextProviders().map((item) => `${item.name}/${item.model}`);
  assert.deepEqual(ordered, [
    'provider-a/a-model-1',
    'provider-a/a-model-2',
    'provider-b/b-model-1',
  ]);
});

test('LangChainManager provider context isolates per-request adapters from default adapters', async () => {
  const manager = new LangChainManager(
    [
      {
        name: 'default-provider',
        enabled: true,
        baseURL: 'https://default.example.com/v1',
        apiKey: 'sk-default',
        priority: 1,
        model: 'default-model',
      },
    ],
    [],
    [],
    [],
  );

  const outside = manager.getAvailableTextProviders().map((item) => item.name);
  const inside = await manager.runWithProviderContext(
    manager.createProviderContext({
      textProviders: [
        {
          name: 'user-provider',
          enabled: true,
          baseURL: 'https://user.example.com/v1',
          apiKey: 'sk-user',
          priority: 1,
          model: 'user-model',
        },
      ],
      imageProviders: [],
      ragEmbeddingProviders: [],
      ragRerankProviders: [],
    }),
    async () => manager.getAvailableTextProviders().map((item) => item.name),
  );
  const after = manager.getAvailableTextProviders().map((item) => item.name);

  assert.deepEqual(outside, ['default-provider']);
  assert.deepEqual(inside, ['user-provider']);
  assert.deepEqual(after, ['default-provider']);
});

test('AIChatService search_travel_knowledge returns a bounded guidance message after per-turn limit', async () => {
  const service = new AIChatService({ textAdapters: [] }, null, {
    ragService: {
      isAvailable: () => true,
      search: async (query) => ({ intent: { query }, rows: [] }),
      buildSearchSummary: () => ({ text: 'mock search result' }),
    },
  });

  const tool = service._createTravelKnowledgeTool({
    sessionId: 'session-1',
    perTurnMaxCalls: 2,
    callCounter: { count: 0 },
    rate_limit_key: 'test-user',
  });

  const first = await tool.func({ query: '金华景点' });
  const second = await tool.func({ query: '金华美食' });
  const third = await tool.func({ query: '金华住宿' });

  assert.equal(first, 'mock search result');
  assert.equal(second, 'mock search result');
  assert.match(third, /已达到本轮 search_travel_knowledge 调用上限/);
  assert.match(third, /请不要继续调用该工具/);
});
