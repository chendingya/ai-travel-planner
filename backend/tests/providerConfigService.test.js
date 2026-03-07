const test = require('node:test');
const assert = require('node:assert/strict');
const ProviderConfigService = require('../src/services/providerConfigService');

const createSupabaseMock = (initialRow = null) => {
  const state = {
    row: initialRow ? { ...initialRow } : null,
    upsertCount: 0,
  };

  return {
    state,
    from: () => {
      let queryId = '';
      return {
        select() {
          return this;
        },
        eq(_field, value) {
          queryId = value;
          return this;
        },
        async maybeSingle() {
          if (!state.row) return { data: null, error: null };
          if (queryId && state.row.id !== queryId) return { data: null, error: null };
          return { data: { ...state.row }, error: null };
        },
        async upsert(payload) {
          state.row = { ...payload };
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
  };
  try {
    await fn();
  } finally {
    if (snapshot.AI_TEXT_PROVIDERS_JSON == null) delete process.env.AI_TEXT_PROVIDERS_JSON;
    else process.env.AI_TEXT_PROVIDERS_JSON = snapshot.AI_TEXT_PROVIDERS_JSON;
    if (snapshot.AI_IMAGE_PROVIDERS_JSON == null) delete process.env.AI_IMAGE_PROVIDERS_JSON;
    else process.env.AI_IMAGE_PROVIDERS_JSON = snapshot.AI_IMAGE_PROVIDERS_JSON;
  }
};

test('bootstrap normalizes env config and expands text models order by priority', async () => {
  await withEnvBackup(async () => {
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

    const config = await service.getConfig();
    assert.equal(config.textProviders.length, 1);
    assert.equal(config.textProviders[0].models.length, 2);
    assert.equal(config.textProviders[0].models[0].model, 'm1');
    assert.equal(config.textProviders[0].models[1].model, 'm2');
    assert.equal(config.textProviders[0].hasApiKey, true);
    assert.equal(config.imageProviders[0].name, 'img-a');
    assert.equal(manager.calls.length >= 1, true);
  });
});

test('updateConfig keeps api key when keepApiKey is true and apiKey is empty', async () => {
  await withEnvBackup(async () => {
    const supabase = createSupabaseMock({
      id: 'global',
      text_providers: [
        {
          name: 'text-a',
          enabled: true,
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-old-text',
          priority: 1,
          models: [{ model: 'm1', priority: 1 }],
        },
      ],
      image_providers: [],
      updated_by: null,
      updated_at: '',
    });
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    service._probeTextModel = async () => ({ ok: true, message: 'ok' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();
    const current = await service.getConfig();
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
      '00000000-0000-0000-0000-000000000001'
    );

    assert.equal(supabase.state.row.text_providers[0].apiKey, 'sk-old-text');
  });
});

test('updateConfig rejects on connectivity failure and does not persist', async () => {
  await withEnvBackup(async () => {
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
          '00000000-0000-0000-0000-000000000002'
        ),
      (error) => error && error.status === 400
    );

    assert.equal(supabase.state.upsertCount, 0);
    assert.equal(manager.calls.length, reloadCountBefore);
  });
});

test('updateConfig persists and triggers runtime reload on success', async () => {
  await withEnvBackup(async () => {
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify([]);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify([]);

    const supabase = createSupabaseMock();
    const manager = createManagerMock();
    const service = new ProviderConfigService({ supabase, langChainManager: manager });
    service._probeTextModel = async () => ({ ok: true, message: 'ok' });
    service._probeImageProvider = async () => ({ ok: true, message: 'ok' });

    await service.bootstrap();
    const reloadCountBefore = manager.calls.length;

    const saved = await service.updateConfig(
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
        imageProviders: [
          {
            name: 'img-ok',
            enabled: true,
            baseURL: 'https://example.com/v1',
            apiKey: 'sk-img-ok',
            model: 'gpt-image-1',
            priority: 1,
          },
        ],
      },
      '00000000-0000-0000-0000-000000000003'
    );

    assert.equal(supabase.state.upsertCount, 1);
    assert.equal(manager.calls.length, reloadCountBefore + 1);
    assert.equal(saved.config.textProviders[0].name, 'text-ok');
    assert.equal(saved.config.imageProviders[0].name, 'img-ok');
  });
});
