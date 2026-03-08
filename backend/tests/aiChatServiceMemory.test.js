const test = require('node:test');
const assert = require('node:assert/strict');
const { HumanMessage } = require('@langchain/core/messages');
const AIChatService = require('../src/services/aiChatService');

const USER_A = '00000000-0000-0000-0000-000000000001';
const USER_B = '00000000-0000-0000-0000-000000000002';

const createSupabaseMock = ({ plans = [], memories = [] } = {}) => {
  const state = {
    memories: Array.isArray(memories) ? [...memories] : [],
  };

  return {
    state,
    from(tableName) {
      const filters = {};
      const query = {
        operation: 'select',
        select() {
          this.operation = 'select';
          return this;
        },
        delete() {
          this.operation = 'delete';
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
          if (tableName === 'ai_user_memories') {
            const rows = state.memories.filter((row) => {
              if (filters.user_id && row.user_id !== filters.user_id) return false;
              return true;
            });
            return Promise.resolve(resolve({ data: rows.map((row) => ({ ...row })), error: null }));
          }
          return Promise.resolve(resolve({ data: null, error: { code: 'PGRST205', message: 'table not found' } }));
        },
      };

      return query;
    },
  };
};

const createService = ({ plans = [], memories = [] } = {}) => {
  const manager = {
    invokeText: async () => '',
  };
  return new AIChatService(manager, createSupabaseMock({ plans, memories }));
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
