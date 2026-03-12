const test = require('node:test');
const assert = require('node:assert/strict');

const RagService = require('../src/services/ragService');

function createSupabaseMock(handler) {
  return {
    async rpc(name, payload) {
      return handler(name, payload);
    },
    from() {
      throw new Error('from() should not be called in this test');
    },
  };
}

test('RagService search keeps city+type scope and rerank order', async () => {
  const supabase = createSupabaseMock(async (name, payload) => {
    if (name === 'match_travel_knowledge_sparse') {
      assert.equal(payload.filter_city, '杭州');
      assert.equal(payload.filter_type, 'food');
      return {
        data: [
          {
            external_id: 'doc-a',
            city: '杭州',
            type: 'food',
            title: '西湖醋鱼',
            content: '老牌杭帮菜代表。',
            sparse_score: 0.91,
          },
        ],
        error: null,
      };
    }

    if (name === 'match_travel_knowledge') {
      assert.equal(payload.filter_city, '杭州');
      assert.equal(payload.filter_type, 'food');
      return {
        data: [
          {
            external_id: 'doc-b',
            city: '杭州',
            type: 'food',
            title: '片儿川',
            content: '杭州经典面食。',
            similarity: 0.88,
          },
        ],
        error: null,
      };
    }

    throw new Error(`unexpected rpc: ${name}`);
  });

  const service = new RagService(
    supabase,
    {
      apiKey: 'test-key',
      topK: 2,
      denseTopK: 5,
      sparseTopK: 5,
      rrfTopK: 5,
    },
    {
      enabled: true,
      candidateFactor: 3,
    }
  );

  service.embedText = async () => [0.1, 0.2, 0.3];
  service.rerankChunks = async (_query, chunks) => [
    { ...chunks.find((item) => item.external_id === 'doc-b'), rerank_score: 0.95 },
    { ...chunks.find((item) => item.external_id === 'doc-a'), rerank_score: 0.72 },
  ];

  const result = await service.search('杭州有什么美食推荐？', { city: '杭州', topK: 2 });

  assert.equal(result.scopeName, 'city+type');
  assert.equal(result.filterCity, '杭州');
  assert.equal(result.filterType, 'food');
  assert.equal(result.finalRows.length, 2);
  assert.equal(result.finalRows[0].external_id, 'doc-b');
  assert.equal(result.finalRows[1].external_id, 'doc-a');
});

test('RagService search falls back to global scope when filtered scopes miss', async () => {
  const supabase = createSupabaseMock(async (name, payload) => {
    const scopedMiss = payload.filter_city === '杭州';

    if (name === 'match_travel_knowledge_sparse') {
      return {
        data: scopedMiss ? [] : [
          {
            external_id: 'doc-global',
            city: '北京',
            type: 'guide',
            title: '北京通用攻略',
            content: '适合第一次来北京的游客。',
            sparse_score: 0.67,
          },
        ],
        error: null,
      };
    }

    if (name === 'match_travel_knowledge') {
      return { data: [], error: null };
    }

    throw new Error(`unexpected rpc: ${name}`);
  });

  const service = new RagService(
    supabase,
    {
      apiKey: 'test-key',
      topK: 1,
      denseTopK: 3,
      sparseTopK: 3,
      rrfTopK: 3,
    },
    { enabled: false }
  );

  service.embedText = async () => [0.1, 0.2, 0.3];

  const result = await service.search('杭州两日攻略', { city: '杭州', topK: 1 });

  assert.equal(result.scopeName, 'global');
  assert.equal(result.finalRows.length, 1);
  assert.equal(result.finalRows[0].external_id, 'doc-global');

  const summary = service.buildSearchSummary(result, { includeContent: false });
  assert.match(summary.text, /命中范围: global/);
  assert.match(summary.text, /北京通用攻略/);
});