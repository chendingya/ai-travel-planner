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
    PROVIDER_CONFIG_ENCRYPTION_KEY: process.env.PROVIDER_CONFIG_ENCRYPTION_KEY,
  };
  try {
    await fn();
  } finally {
    if (snapshot.AI_TEXT_PROVIDERS_JSON == null) delete process.env.AI_TEXT_PROVIDERS_JSON;
    else process.env.AI_TEXT_PROVIDERS_JSON = snapshot.AI_TEXT_PROVIDERS_JSON;

    if (snapshot.AI_IMAGE_PROVIDERS_JSON == null) delete process.env.AI_IMAGE_PROVIDERS_JSON;
    else process.env.AI_IMAGE_PROVIDERS_JSON = snapshot.AI_IMAGE_PROVIDERS_JSON;

    if (snapshot.PROVIDER_CONFIG_ENCRYPTION_KEY == null) delete process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
    else process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = snapshot.PROVIDER_CONFIG_ENCRYPTION_KEY;
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
    assert.equal(manager.calls.length >= 1, true);
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

test('updateConfig is user-scoped and triggers runtime reload on success', async () => {
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
    assert.equal(manager.calls.length >= 2, true);
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
