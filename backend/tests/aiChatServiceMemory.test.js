const test = require('node:test');
const assert = require('node:assert/strict');
const { HumanMessage } = require('@langchain/core/messages');
const AIChatService = require('../src/services/aiChatService');

const USER_A = '00000000-0000-0000-0000-000000000001';
const USER_B = '00000000-0000-0000-0000-000000000002';

const createSupabaseMock = ({ plans = [], memories = [], semanticMemories = [] } = {}) => {
  const state = {
    memories: Array.isArray(memories) ? [...memories] : [],
    semanticMemories: Array.isArray(semanticMemories) ? [...semanticMemories] : [],
  };

  return {
    state,
    rpc(fnName, args) {
      if (fnName !== 'match_ai_user_semantic_memories') {
        return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'rpc not found' } });
      }
      const userId = typeof args?.query_user_id === 'string' ? args.query_user_id : '';
      const minSimilarity = Number(args?.min_similarity || 0);
      const limit = Number(args?.match_count || 4);
      const rows = state.semanticMemories
        .filter((row) => row.user_id === userId && Number(row.similarity || 0) >= minSimilarity)
        .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
        .slice(0, limit)
        .map((row) => ({ ...row }));
      return Promise.resolve({ data: rows, error: null });
    },
    from(tableName) {
      const filters = {};
      const query = {
        operation: 'select',
        selectColumns: '*',
        select(_columns, options = {}) {
          this.operation = 'select';
          this.selectColumns = _columns || '*';
          this.selectOptions = options || {};
          return this;
        },
        delete() {
          this.operation = 'delete';
          return this;
        },
        update(payload) {
          this.operation = 'update';
          this.payload = payload;
          return this;
        },
        eq(field, value) {
          filters[field] = value;
          return this;
        },
        order() {
          return this;
        },
        async maybeSingle() {
          if (tableName === 'plans') {
            const id = typeof filters.id === 'string' ? filters.id : '';
            const userId = typeof filters.user_id === 'string' ? filters.user_id : '';
            const hit = plans.find((row) => row && row.id === id && row.user_id === userId);
            if (!hit) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
            return { data: { ...hit }, error: null };
          }
          return { data: null, error: { code: 'PGRST205', message: 'table not found' } };
        },
        async upsert(payload) {
          if (tableName === 'ai_user_memories') {
            const index = state.memories.findIndex(
              (row) => row.user_id === payload.user_id && row.memory_key === payload.memory_key,
            );
            if (index >= 0) state.memories[index] = { ...state.memories[index], ...payload };
            else state.memories.push({ ...payload });
          } else if (tableName === 'ai_user_semantic_memories') {
            const index = state.semanticMemories.findIndex(
              (row) => row.user_id === payload.user_id && row.memory_fingerprint === payload.memory_fingerprint,
            );
            if (index >= 0) state.semanticMemories[index] = { ...state.semanticMemories[index], ...payload };
            else state.semanticMemories.push({ id: payload.memory_fingerprint, ...payload });
          }
          return { error: null };
        },
        then(resolve) {
          if (this.operation === 'delete' && tableName === 'ai_user_memories') {
            state.memories = state.memories.filter((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return true;
              if (filters.memory_key && row.memory_key !== filters.memory_key) return true;
              return false;
            });
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          if (this.operation === 'update' && tableName === 'ai_user_semantic_memories') {
            state.semanticMemories = state.semanticMemories.map((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return row;
              if (filters.id && row.id !== filters.id) return row;
              return { ...row, ...(this.payload || {}) };
            });
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          if (tableName === 'ai_user_memories') {
            const rows = state.memories.filter((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return false;
              return true;
            });
            return Promise.resolve(resolve({ data: rows.map((row) => ({ ...row })), error: null }));
          }
          if (tableName === 'ai_user_semantic_memories') {
            const rows = state.semanticMemories.filter((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return false;
              return true;
            });
            if (this.selectOptions?.head) {
              return Promise.resolve(resolve({ data: null, error: null, count: rows.length }));
            }
            return Promise.resolve(resolve({ data: rows.map((row) => ({ ...row })), error: null }));
          }
          return Promise.resolve(resolve({ data: null, error: { code: 'PGRST205', message: 'table not found' } }));
        },
      };

      return query;
    },
  };
};

const createService = ({ plans = [], memories = [], semanticMemories = [] } = {}) => {
  const manager = {
    invokeText: async () => '',
    textAdapters: [
      {
        name: 'modelscope',
        baseURL: 'https://api-inference.modelscope.cn/v1',
        apiKey: 'mock-token',
      },
    ],
  };
  const service = new AIChatService(manager, createSupabaseMock({ plans, memories, semanticMemories }));
  service.semanticMemoryService.createEmbedding = async () => Array.from({ length: 4000 }, () => 0.01);
  return service;
};

const withEnv = async (patch, fn) => {
  const snapshot = {};
  for (const key of Object.keys(patch)) snapshot[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(patch)) process.env[key] = value;
    await fn();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('plan context summary should cover all daily itinerary days', async () => {
  const service = createService({
    plans: [
      {
        id: 'plan-1',
        user_id: USER_A,
        destination: '杭州',
        duration: 3,
        budget: 3000,
        travelers: 2,
        preferences: '美食,文化',
        plan_details: {
          daily_itinerary: [
            { day: 1, theme: '西湖一日游', activities: [{ time: '上午', description: '断桥漫步' }] },
            { day: 2, theme: '灵隐寺与龙井', activities: [{ time: '下午', description: '龙井茶园' }] },
            { day: 3, theme: '宋城体验', activities: [{ time: '晚上', description: '宋城千古情' }] },
          ],
          budget_breakdown: { 住宿: 1200, 餐饮: 900, 交通: 400, 门票: 500 },
          tips: ['周末景区人多，建议提前预约'],
        },
      },
    ],
  });

  const text = await service.planContextService.loadPlanContextSummary('plan-1', USER_A);
  assert.ok(text.includes('Day 1'));
  assert.ok(text.includes('Day 2'));
  assert.ok(text.includes('Day 3'));
  assert.ok(text.includes('预算分解'));
});

test('plan context summary should be empty for non-owner', async () => {
  const service = createService({
    plans: [{ id: 'plan-1', user_id: USER_A, destination: '杭州', plan_details: {} }],
  });
  const text = await service.planContextService.loadPlanContextSummary('plan-1', USER_B);
  assert.equal(text, '');
});

test('short memory should keep summary and recent window only', async () => {
  await withEnv(
    {
      AI_CHAT_SHORT_MEMORY_ENABLED: 'true',
      AI_CHAT_SHORT_MEMORY_MAX_MESSAGES: '4',
      AI_CHAT_SHORT_MEMORY_TOKEN_BUDGET: '10000',
    },
    async () => {
      const service = createService();
      const messages = Array.from({ length: 10 }).map((_, idx) =>
        new HumanMessage(`msg-${String(idx + 1).padStart(2, '0')}`)
      );
      const shortMemory = service.sessionMemoryService.buildShortMemoryMessages(messages, '这是历史摘要');
      assert.ok(shortMemory.length <= 5);
      const first = shortMemory[0];
      assert.equal(typeof first.getType === 'function' ? first.getType() : '', 'system');
      const mergedText = shortMemory.map((m) => service.sessionMemoryService.extractTextFromMessage(m)).join('\n');
      assert.ok(mergedText.includes('msg-10'));
      assert.ok(!mergedText.includes('msg-01'));
    }
  );
});

test('memory candidate should only accept whitelist keys', async () => {
  const service = createService();
  const valid = service.longTermMemoryService.normalizeMemoryCandidate({
    memory_key: 'budget_preference',
    memory_value: { max_budget: 5000 },
    confidence: 0.9,
  });
  const invalid = service.longTermMemoryService.normalizeMemoryCandidate({
    memory_key: 'random_key',
    memory_value: { foo: 'bar' },
    confidence: 0.9,
  });
  assert.ok(valid);
  assert.equal(valid.memory_key, 'budget_preference');
  assert.equal(invalid, null);
});

test('semantic memory candidate should only accept supported memory types', async () => {
  const service = createService();
  const valid = service.semanticMemoryService.normalizeSemanticCandidate({
    memory_text: '用户喜欢历史街区和本地小馆',
    memory_type: 'preference',
    tags: ['历史', '美食'],
    confidence: 0.9,
    salience: 0.8,
  });
  const invalid = service.semanticMemoryService.normalizeSemanticCandidate({
    memory_text: '这次周末去长沙',
    memory_type: 'temporary_task',
    confidence: 0.9,
  });

  assert.ok(valid);
  assert.equal(valid.memory_type, 'preference');
  assert.equal(valid.tags.length, 2);
  assert.equal(invalid, null);
});

test('manual long memory save and delete should work per key', async () => {
  const service = createService({
    memories: [
      {
        user_id: USER_A,
        memory_key: 'food_preference',
        memory_value: { text: '喜欢本地小馆' },
        confidence: 0.8,
        updated_at: '2026-03-07T10:00:00.000Z',
      },
    ],
  });

  await service.saveLongTermMemory({
    userId: USER_A,
    memoryKey: 'budget_preference',
    memoryValue: '预算控制在 3000 元内',
    confidence: 1,
    sourceSessionId: 'manual',
  });

  const afterSave = await service.getLongTermMemories(USER_A);
  assert.equal(afterSave.length, 2);
  const budgetMemory = afterSave.find((item) => item.memory_key === 'budget_preference');
  assert.ok(budgetMemory);
  assert.equal(budgetMemory.memory_value.text, '预算控制在 3000 元内');

  await service.deleteLongTermMemory(USER_A, 'food_preference');
  const afterDelete = await service.getLongTermMemories(USER_A);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].memory_key, 'budget_preference');
});

test('manual long memory save should reject unsupported key', async () => {
  const service = createService();
  await assert.rejects(
    () =>
      service.saveLongTermMemory({
        userId: USER_A,
        memoryKey: 'not_allowed',
        memoryValue: 'xxx',
        confidence: 1,
        sourceSessionId: 'manual',
      }),
    (error) => error && error.status === 400,
  );
});

test('token estimate should not severely underestimate Chinese text', async () => {
  const service = createService();
  const chinese = service.sessionMemoryService.estimateTokenCount('请问我要去哪些地方？');
  const english = service.sessionMemoryService.estimateTokenCount('Please recommend places to visit in Yangzhou.');

  assert.ok(chinese >= 8);
  assert.ok(english >= 8);
  assert.ok(chinese > 3);
});

test('usage metrics should normalize common provider payloads', async () => {
  const service = createService();
  const normalized = service._extractUsageMetrics({
    usage_metadata: {
      input_tokens: 321,
      output_tokens: 98,
      total_tokens: 419,
    },
  }, 'event');

  assert.ok(normalized);
  assert.equal(normalized.prompt_tokens_actual, 321);
  assert.equal(normalized.completion_tokens_actual, 98);
  assert.equal(normalized.total_tokens_actual, 419);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'token_usage_source'), false);
});

test('usage metrics should normalize nested response metadata token usage', async () => {
  const service = createService();
  const normalized = service._extractUsageMetrics({
    data: {
      output: {
        response_metadata: {
          tokenUsage: {
            promptTokens: 210,
            completionTokens: 44,
            totalTokens: 254,
          },
        },
      },
    },
  }, 'event');

  assert.ok(normalized);
  assert.equal(normalized.prompt_tokens_actual, 210);
  assert.equal(normalized.completion_tokens_actual, 44);
  assert.equal(normalized.total_tokens_actual, 254);
});

test('usage source label should prefer provider and model', async () => {
  const service = createService();
  assert.equal(service._formatUsageSourceLabel('deepseek', 'deepseek-chat'), 'deepseek / deepseek-chat');
  assert.equal(service._formatUsageSourceLabel('openai', ''), 'openai');
  assert.equal(service._formatUsageSourceLabel('', 'gpt-4o-mini'), 'gpt-4o-mini');
});

test('semantic profile should aggregate tags and highlights', async () => {
  const service = createService({
    memories: [
      {
        user_id: USER_A,
        memory_key: 'budget_preference',
        memory_value: { text: '预算优先' },
      },
    ],
    semanticMemories: [
      {
        id: 'sem-1',
        user_id: USER_A,
        memory_text: '用户偏好老城漫步和博物馆',
        memory_type: 'interest',
        tags: ['文化', '老城'],
        confidence: 0.91,
        salience: 0.95,
        recall_count: 4,
        last_recalled_at: '2026-03-07T10:00:00.000Z',
        updated_at: '2026-03-07T10:00:00.000Z',
      },
      {
        id: 'sem-2',
        user_id: USER_A,
        memory_text: '用户对排队时间敏感，不喜欢高密度打卡',
        memory_type: 'constraint',
        tags: ['节奏', '避堵'],
        confidence: 0.88,
        salience: 0.83,
        recall_count: 2,
        last_recalled_at: '2026-03-06T10:00:00.000Z',
        updated_at: '2026-03-06T10:00:00.000Z',
      },
    ],
  });

  const profile = await service.getMemoryProfile(USER_A);
  assert.equal(profile.structured_memories.length, 1);
  assert.equal(profile.semantic_profile.stats.total_memories, 2);
  assert.ok(profile.semantic_profile.tags.includes('文化'));
  assert.equal(profile.semantic_profile.highlights[0].id, 'sem-1');
  assert.equal(profile.semantic_profile.recent_memories.length, 2);
});

test('memory metrics should include semantic memory fields', async () => {
  const service = createService();
  const chunk = service._buildMemoryMetricsChunk({
    sessionId: 'session-1',
    source: 'chat',
    systemTokensEstimate: 120,
    historyTokensEstimate: 80,
    userTokensEstimate: 40,
    longTermMemories: [{ memory_key: 'budget_preference' }],
    semanticMemorySearch: {
      totalCount: 6,
      memories: [{ id: 'sem-1' }, { id: 'sem-2' }],
    },
    semanticMemoryTokensEstimate: 55,
    planContextBlock: '',
    shortMemoryMetrics: { compressed: false },
  });

  assert.equal(chunk.type, 'memory_metrics');
  assert.equal(chunk.metrics.semantic_memory_count, 6);
  assert.equal(chunk.metrics.semantic_memory_retrieved, 2);
  assert.equal(chunk.metrics.semantic_memory_tokens_estimate, 55);
});
