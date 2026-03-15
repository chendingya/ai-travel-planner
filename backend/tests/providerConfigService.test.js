const test = require('node:test');
const assert = require('node:assert/strict');
const ProviderConfigService = require('../src/services/providerConfigService');

const USER_A = '00000000-0000-0000-0000-000000000001';
const USER_B = '00000000-0000-0000-0000-000000000002';
const ENC_KEY = '12345678901234567890123456789012';

const createSupabaseMock = (initialRows = []) => {
  const rows = new Map();
  for (const row of initialRows) {
    if (row && typeof row.user_id === 'string' && row.user_id) {
      rows.set(row.user_id, { ...row });
    }
  }

  const state = {
    rows,
    upsertCount: 0,
  };

  return {
    state,
    from: () => {
      const filters = {};
      return {
        select() {
          return this;
        },
        eq(field, value) {
          filters[field] = value;
          return this;
        },
        async maybeSingle() {
          const userId = typeof filters.user_id === 'string' ? filters.user_id : '';
          if (!userId || !state.rows.has(userId)) return { data: null, error: null };
          return { data: { ...state.rows.get(userId) }, error: null };
        },
        async upsert(payload) {
          if (!payload || typeof payload.user_id !== 'string' || !payload.user_id) {
            return { data: null, error: { message: 'user_id required' } };
          }
          state.rows.set(payload.user_id, { ...payload });
          state.upsertCount += 1;
          return { data: [payload], error: null };
        },
      };
    },
  };
};

const createManagerMock = () => ({
  calls: [],
  reload(textProviders, imageProviders) {
    this.calls.push({
      textProviders: Array.isArray(textProviders) ? textProviders : [],
      imageProviders: Array.isArray(imageProviders) ? imageProviders : [],
    });
    return {
      text: Array.isArray(textProviders) ? textProviders.length : 0,
      image: Array.isArray(imageProviders) ? imageProviders.length : 0,
    };
  },
});

const withEnvBackup = async (fn) => {
  const snapshot = {
    AI_TEXT_PROVIDERS_JSON: process.env.AI_TEXT_PROVIDERS_JSON,
    AI_IMAGE_PROVIDERS_JSON: process.env.AI_IMAGE_PROVIDERS_JSON,
    AI_RAG_EMBEDDING_PROVIDERS_JSON: process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON,
    AI_RAG_RERANK_PROVIDERS_JSON: process.env.AI_RAG_RERANK_PROVIDERS_JSON,
    PROVIDER_CONFIG_ENCRYPTION_KEY: process.env.PROVIDER_CONFIG_ENCRYPTION_KEY,
    QWEN_EMBEDDING_API_KEY: process.env.QWEN_EMBEDDING_API_KEY,
    QWEN_EMBEDDING_BASE_URL: process.env.QWEN_EMBEDDING_BASE_URL,
    QWEN_EMBEDDING_MODEL: process.env.QWEN_EMBEDDING_MODEL,
    QWEN_EMBEDDING_DIM: process.env.QWEN_EMBEDDING_DIM,
    RERANK_ENABLED: process.env.RERANK_ENABLED,
    RERANK_BASE_URL: process.env.RERANK_BASE_URL,
    RERANK_PATH: process.env.RERANK_PATH,
    RERANK_MODEL: process.env.RERANK_MODEL,
    RERANK_API_KEY: process.env.RERANK_API_KEY,
    RERANK_TIMEOUT_MS: process.env.RERANK_TIMEOUT_MS,
    RERANK_CANDIDATE_FACTOR: process.env.RERANK_CANDIDATE_FACTOR,
  };
  try {
    await fn();
  } finally {
    if (snapshot.AI_TEXT_PROVIDERS_JSON == null) delete process.env.AI_TEXT_PROVIDERS_JSON;
    else process.env.AI_TEXT_PROVIDERS_JSON = snapshot.AI_TEXT_PROVIDERS_JSON;

    if (snapshot.AI_IMAGE_PROVIDERS_JSON == null) delete process.env.AI_IMAGE_PROVIDERS_JSON;
    else process.env.AI_IMAGE_PROVIDERS_JSON = snapshot.AI_IMAGE_PROVIDERS_JSON;

    if (snapshot.AI_RAG_EMBEDDING_PROVIDERS_JSON == null) delete process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON;
    else process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON = snapshot.AI_RAG_EMBEDDING_PROVIDERS_JSON;

    if (snapshot.AI_RAG_RERANK_PROVIDERS_JSON == null) delete process.env.AI_RAG_RERANK_PROVIDERS_JSON;
    else process.env.AI_RAG_RERANK_PROVIDERS_JSON = snapshot.AI_RAG_RERANK_PROVIDERS_JSON;

    if (snapshot.PROVIDER_CONFIG_ENCRYPTION_KEY == null) delete process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
    else process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = snapshot.PROVIDER_CONFIG_ENCRYPTION_KEY;

    if (snapshot.QWEN_EMBEDDING_API_KEY == null) delete process.env.QWEN_EMBEDDING_API_KEY;
    else process.env.QWEN_EMBEDDING_API_KEY = snapshot.QWEN_EMBEDDING_API_KEY;

    if (snapshot.QWEN_EMBEDDING_BASE_URL == null) delete process.env.QWEN_EMBEDDING_BASE_URL;
    else process.env.QWEN_EMBEDDING_BASE_URL = snapshot.QWEN_EMBEDDING_BASE_URL;

    if (snapshot.QWEN_EMBEDDING_MODEL == null) delete process.env.QWEN_EMBEDDING_MODEL;
    else process.env.QWEN_EMBEDDING_MODEL = snapshot.QWEN_EMBEDDING_MODEL;

    if (snapshot.QWEN_EMBEDDING_DIM == null) delete process.env.QWEN_EMBEDDING_DIM;
    else process.env.QWEN_EMBEDDING_DIM = snapshot.QWEN_EMBEDDING_DIM;

    if (snapshot.RERANK_ENABLED == null) delete process.env.RERANK_ENABLED;
    else process.env.RERANK_ENABLED = snapshot.RERANK_ENABLED;

    if (snapshot.RERANK_BASE_URL == null) delete process.env.RERANK_BASE_URL;
    else process.env.RERANK_BASE_URL = snapshot.RERANK_BASE_URL;

    if (snapshot.RERANK_PATH == null) delete process.env.RERANK_PATH;
    else process.env.RERANK_PATH = snapshot.RERANK_PATH;

    if (snapshot.RERANK_MODEL == null) delete process.env.RERANK_MODEL;
    else process.env.RERANK_MODEL = snapshot.RERANK_MODEL;

    if (snapshot.RERANK_API_KEY == null) delete process.env.RERANK_API_KEY;
    else process.env.RERANK_API_KEY = snapshot.RERANK_API_KEY;

    if (snapshot.RERANK_TIMEOUT_MS == null) delete process.env.RERANK_TIMEOUT_MS;
    else process.env.RERANK_TIMEOUT_MS = snapshot.RERANK_TIMEOUT_MS;

    if (snapshot.RERANK_CANDIDATE_FACTOR == null) delete process.env.RERANK_CANDIDATE_FACTOR;
    else process.env.RERANK_CANDIDATE_FACTOR = snapshot.RERANK_CANDIDATE_FACTOR;
  }
};

test('bootstrap loads env defaults and getConfig works per user', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'text-a',
        enabled: true,
        baseURL: 'https://example.com/v1',
        apiKey: 'sk-a',
        models: [
          { model: 'm2', priority: 2 },
          { model: 'm1', priority: 1 },
        ],
        priority: 2,
      },
    ]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'img-a',
        enabled: true,
        baseURL: 'https://example.com/v1',
        apiKey: 'sk-img',
        model: 'gpt-image-1',
        priority: 1,
      },
    ]);

    const supabase = createSupabaseMock();
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    await service.bootstrap();

    const config = await service.getConfig(USER_A);
    assert.equal(config.textProviders.length, 1);
    assert.equal(config.textProviders[0].models.length, 2);
    assert.equal(config.textProviders[0].models[0].model, 'm1');
    assert.equal(config.imageProviders[0].name, 'img-a');
    const runtime = await service.getRuntimeContext(USER_A);
    assert.equal(runtime.config.textProviders[0].name, 'text-a');
  });
});

test('updateConfig stores encrypted key and keepApiKey works', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;

    const initialService = new ProviderConfigService({ supabase: createSupabaseMock(), langChainManager: createManagerMock() });
    const encryptedOldKey = initialService._writeApiKey('sk-old-text');

    const supabase = createSupabaseMock([
      {
        user_id: USER_A,
        text_providers: [
          {
            name: 'text-a',
            enabled: true,
            baseURL: 'https://example.com/v1',
            apiKey: encryptedOldKey,
            priority: 1,
            models: [{ model: 'm1', priority: 1 }],
          },
        ],
        image_providers: [],
        updated_by: USER_A,
        updated_at: '',
      },
    ]);
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    service._probeTextModel = async () => ({ ok: true, message: 'ok' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();
    const current = await service.getConfig(USER_A);
    const textProvider = current.textProviders[0];

    await service.updateConfig(
      {
        textProviders: [
          {
            ...textProvider,
            enabled: true,
            apiKey: '',
            keepApiKey: true,
            models: [{ model: 'm1', priority: 1 }],
          },
        ],
        imageProviders: [],
      },
      USER_A
    );

    const stored = supabase.state.rows.get(USER_A);
    assert.equal(typeof stored.text_providers[0].apiKey, 'string');
    assert.equal(stored.text_providers[0].apiKey.startsWith('enc:v1:'), true);
    assert.equal(service._readApiKey(stored.text_providers[0].apiKey), 'sk-old-text');
  });
});

test('updateConfig persists rag embedding and rerank providers without mutating global runtime env', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_RAG_RERANK_PROVIDERS_JSON = JSON.stringify([]);
    process.env.QWEN_EMBEDDING_API_KEY = '';
    process.env.RERANK_ENABLED = 'false';
    process.env.RERANK_BASE_URL = '';
    process.env.RERANK_API_KEY = '';

    const supabase = createSupabaseMock();
    const manager = createManagerMock();
    const service = new ProviderConfigService({
      supabase,
      langChainManager: manager,
    });
    service._probeEmbeddingProvider = async () => ({ ok: true, message: 'ok' });
    service._probeRerankProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();

    const saved = await service.updateConfig(
      {
        textProviders: [],
        imageProviders: [],
        ragEmbeddingProviders: [
          {
            name: 'embed-a',
            enabled: true,
            baseURL: 'https://embed.example.com/v1',
            apiKey: 'sk-embed',
            model: 'embed-model',
            dimensions: 768,
            priority: 1,
          },
        ],
        ragRerankProviders: [
          {
            name: 'rerank-a',
            enabled: true,
            baseURL: 'https://rerank.example.com',
            apiKey: 'sk-rerank',
            model: 'rerank-model',
            path: '/rerank',
            timeoutMs: 8000,
            candidateFactor: 4,
            priority: 1,
          },
        ],
      },
      USER_A
    );

    assert.equal(saved.config.ragEmbeddingProviders.length, 1);
    assert.equal(saved.config.ragRerankProviders.length, 1);

    const stored = supabase.state.rows.get(USER_A);
    assert.equal(service._readApiKey(stored.rag_embedding_providers[0].apiKey), 'sk-embed');
    assert.equal(service._readApiKey(stored.rag_rerank_providers[0].apiKey), 'sk-rerank');
    assert.equal(process.env.QWEN_EMBEDDING_API_KEY, '');
    assert.equal(process.env.QWEN_EMBEDDING_MODEL, undefined);
    assert.equal(process.env.RERANK_ENABLED, 'false');
    assert.equal(process.env.RERANK_BASE_URL, '');
    assert.equal(process.env.RERANK_PATH, undefined);

    const runtime = await service.getRuntimeContext(USER_A);
    assert.equal(runtime.config.ragEmbeddingProviders[0].name, 'embed-a');
    assert.equal(runtime.config.ragRerankProviders[0].name, 'rerank-a');
  });
});

test('updateConfig rejects on connectivity failure and does not persist', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);

    const supabase = createSupabaseMock();
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    service._probeTextModel = async () => ({ ok: false, message: 'boom' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();
    const reloadCountBefore = manager.calls.length;

    await assert.rejects(
      () =>
        service.updateConfig(
          {
            textProviders: [
              {
                name: 'text-fail',
                enabled: true,
                baseURL: 'https://example.com/v1',
                apiKey: 'sk-fail',
                priority: 1,
                models: [{ model: 'm1', priority: 1 }],
              },
            ],
            imageProviders: [],
          },
          USER_A
        ),
      (error) => error && error.status === 400
    );

    assert.equal(supabase.state.upsertCount, 0);
    assert.equal(manager.calls.length, reloadCountBefore);
  });
});

test('updateConfig is user-scoped and keeps global manager runtime untouched', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);

    const supabase = createSupabaseMock();
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    service._probeTextModel = async () => ({ ok: true, message: 'ok' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();

    await service.updateConfig(
      {
        textProviders: [
          {
            name: 'text-ok',
            enabled: true,
            baseURL: 'https://example.com/v1',
            apiKey: 'sk-text-ok',
            priority: 1,
            models: [{ model: 'm1', priority: 1 }],
          },
        ],
        imageProviders: [],
      },
      USER_A
    );

    const userA = await service.getConfig(USER_A);
    const userB = await service.getConfig(USER_B);

    assert.equal(supabase.state.upsertCount, 1);
    assert.equal(manager.calls.length, 0);
    assert.equal(userA.textProviders[0].name, 'text-ok');
    assert.equal(userB.textProviders.length, 0);
  });
});

test('user without db row falls back to local env even when another user has row', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'env-provider',
        enabled: true,
        baseURL: 'https://env.example.com/v1',
        apiKey: 'sk-env',
        priority: 1,
        models: [{ model: 'env-model', priority: 1 }],
      },
    ]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);

    const seedService = new ProviderConfigService({ supabase: createSupabaseMock(), langChainManager: createManagerMock() });
    const encryptedDbKey = seedService._writeApiKey('sk-db');

    const supabase = createSupabaseMock([
      {
        user_id: USER_A,
        text_providers: [
          {
            name: 'db-provider',
            enabled: true,
            baseURL: 'https://db.example.com/v1',
            apiKey: encryptedDbKey,
            priority: 1,
            models: [{ model: 'db-model', priority: 1 }],
          },
        ],
        image_providers: [],
        updated_by: USER_A,
        updated_at: '',
      },
    ]);

    const service = new ProviderConfigService({ supabase, langChainManager: createManagerMock() });
    await service.bootstrap();

    const configA = await service.getConfig(USER_A);
    const configB = await service.getConfig(USER_B);

    assert.equal(configA.textProviders[0].name, 'db-provider');
    assert.equal(configB.textProviders[0].name, 'env-provider');
  });
});

test('user can clear provider kind and empty array should not fall back to env defaults', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'env-text',
        enabled: true,
        baseURL: 'https://env.example.com/v1',
        apiKey: 'sk-env-text',
        priority: 1,
        models: [{ model: 'env-model', priority: 1 }],
      },
    ]);
    process.env.AI_RAG_RERANK_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'env-rerank',
        enabled: true,
        baseURL: 'https://rerank.env.example.com',
        apiKey: 'sk-env-rerank',
        model: 'env-rerank-model',
        path: '/rerank',
        timeoutMs: 10000,
        candidateFactor: 3,
        priority: 1,
      },
    ]);

    const supabase = createSupabaseMock([
      {
        user_id: USER_A,
        text_providers: [],
        image_providers: [],
        rag_embedding_providers: [],
        rag_rerank_providers: [],
        updated_by: USER_A,
        updated_at: '',
      },
    ]);

    const service = new ProviderConfigService({ supabase, langChainManager: createManagerMock() });
    await service.bootstrap();

    const config = await service.getConfig(USER_A);
    assert.equal(config.textProviders.length, 0);
    assert.equal(config.ragRerankProviders.length, 0);
  });
});

test('keepApiKey=true should keep stored key even if payload contains apiKey', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);

    const seedService = new ProviderConfigService({ supabase: createSupabaseMock(), langChainManager: createManagerMock() });
    const encryptedOldKey = seedService._writeApiKey('sk-old');

    const supabase = createSupabaseMock([
      {
        user_id: USER_A,
        text_providers: [
          {
            name: 'text-a',
            enabled: true,
            baseURL: 'https://example.com/v1',
            apiKey: encryptedOldKey,
            priority: 1,
            models: [{ model: 'm1', priority: 1 }],
          },
        ],
        image_providers: [],
        updated_by: USER_A,
        updated_at: '',
      },
    ]);

    const service = new ProviderConfigService({ supabase, langChainManager: createManagerMock() });
    service._probeTextModel = async () => ({ ok: true, message: 'ok' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();
    const current = await service.getConfig(USER_A);
    const provider = current.textProviders[0];

    await service.updateConfig(
      {
        textProviders: [
          {
            ...provider,
            keepApiKey: true,
            apiKey: 'sk-new-should-be-ignored',
            models: [{ model: 'm1', priority: 1 }],
          },
        ],
        imageProviders: [],
      },
      USER_A
    );

    const stored = supabase.state.rows.get(USER_A);
    assert.equal(service._readApiKey(stored.text_providers[0].apiKey), 'sk-old');
  });
});

test('missing provider ids should not trigger full-kind connectivity checks when keepApiKey=true', async () => {
  await withEnvBackup(async () => {
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = ENC_KEY;
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'text-a',
        enabled: true,
        baseURL: 'https://text.example.com/v1',
        apiKey: 'sk-text',
        priority: 1,
        models: [{ model: 'm1', priority: 1 }],
      },
    ]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'image-a',
        enabled: true,
        baseURL: 'https://image.example.com/v1',
        apiKey: 'sk-image',
        model: 'gpt-image-1',
        priority: 1,
      },
    ]);
    process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'embed-a',
        enabled: true,
        baseURL: 'https://embed.example.com/v1',
        apiKey: 'sk-embed',
        model: 'embed-1',
        dimensions: 1024,
        priority: 1,
      },
    ]);
    process.env.AI_RAG_RERANK_PROVIDERS_JSON = JSON.stringify([
      {
        name: 'rerank-a',
        enabled: true,
        baseURL: 'https://rerank.example.com',
        apiKey: 'sk-rerank',
        model: 'rerank-1',
        path: '/rerank',
        timeoutMs: 10000,
        candidateFactor: 3,
        priority: 1,
      },
    ]);

    const service = new ProviderConfigService({ supabase: createSupabaseMock(), langChainManager: createManagerMock() });
    let textProbeCount = 0;
    let imageProbeCount = 0;
    let embeddingProbeCount = 0;
    let rerankProbeCount = 0;

    service._probeTextModel = async () => {
      textProbeCount += 1;
      return { ok: true, message: 'ok' };
    };
    service._probeImageProvider = async () => {
      imageProbeCount += 1;
      return { ok: true, message: 'ok' };
    };
    service._probeEmbeddingProvider = async () => {
      embeddingProbeCount += 1;
      return { ok: true, message: 'ok' };
    };
    service._probeRerankProvider = async () => {
      rerankProbeCount += 1;
      return { ok: true, message: 'ok' };
    };

    await service.bootstrap();

    await service.updateConfig(
      {
        textProviders: [
          {
            id: '',
            name: 'text-a',
            enabled: true,
            baseURL: 'https://text.example.com/v1',
            apiKey: '',
            hasApiKey: true,
            keepApiKey: true,
            priority: 1,
            models: [{ id: '', model: 'm1', priority: 1 }],
          },
        ],
        imageProviders: [
          {
            id: '',
            name: 'image-a',
            enabled: true,
            baseURL: 'https://image.example.com/v1',
            model: 'gpt-image-1',
            apiKey: '',
            hasApiKey: true,
            keepApiKey: true,
            priority: 1,
          },
        ],
        ragEmbeddingProviders: [
          {
            id: '',
            name: 'embed-a',
            enabled: true,
            baseURL: 'https://embed.example.com/v1',
            model: 'embed-2',
            dimensions: 1024,
            apiKey: '',
            hasApiKey: true,
            keepApiKey: true,
            priority: 1,
          },
        ],
        ragRerankProviders: [
          {
            id: '',
            name: 'rerank-a',
            enabled: true,
            baseURL: 'https://rerank.example.com',
            model: 'rerank-1',
            path: '/rerank',
            timeoutMs: 10000,
            candidateFactor: 3,
            apiKey: '',
            hasApiKey: true,
            keepApiKey: true,
            priority: 1,
          },
        ],
      },
      USER_A
    );

    assert.equal(textProbeCount, 0);
    assert.equal(imageProbeCount, 0);
    assert.equal(embeddingProbeCount, 1);
    assert.equal(rerankProbeCount, 0);
  });
});
