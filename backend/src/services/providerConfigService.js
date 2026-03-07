const OpenAI = require('openai');
const crypto = require('crypto');
const ModelScopeImageAdapter = require('./langchain/image/ModelScopeImageAdapter');
const OpenAICompatibleImageAdapter = require('./langchain/image/OpenAICompatibleImageAdapter');

const TABLE_NAME = 'ai_provider_configs';
const KEY_ENV_NAME = 'PROVIDER_CONFIG_ENCRYPTION_KEY';
const ENC_PREFIX = 'enc:v1';

function parseProvidersJson(raw) {
  const value = raw == null ? '' : String(raw).trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.providers)) return parsed.providers;
  } catch (_) {
    return [];
  }
  return [];
}

function sanitizeUrlEnv(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  return raw.replace(/[`"']/g, '').replace(/\s+/g, '').replace(/\/+$/, '');
}

function parsePriority(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb > 0 ? Math.floor(fb) : 1;
}

function normalizeBool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  const s = String(value).trim().toLowerCase();
  if (!s) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(s);
}

function maskApiKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}****`;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function shallowClone(value) {
  if (!value || typeof value !== 'object') return {};
  return { ...value };
}

function loadEncryptionKey() {
  const raw = String(process.env[KEY_ENV_NAME] || '').trim();
  if (!raw) return null;

  try {
    const fromBase64 = Buffer.from(raw, 'base64');
    if (fromBase64.length === 32) return fromBase64;
  } catch (_) {
    // ignore base64 parse errors and fallback to utf8
  }

  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) return utf8;
  return null;
}

class ProviderConfigService {
  constructor({ supabase, langChainManager } = {}) {
    this.supabase = supabase;
    this.langChainManager = langChainManager;
    this.tableName = TABLE_NAME;
    this.encryptionKey = loadEncryptionKey();
    this._initialized = false;

    this._defaultConfig = { textProviders: [], imageProviders: [] };
    this._defaultMeta = { source: 'env', updatedBy: '', updatedAt: '' };
    this._runtimeConfig = { textProviders: [], imageProviders: [] };
    this._runtimeMeta = { source: 'runtime', updatedBy: '', updatedAt: '' };
    this._activeRuntimeUserId = '';
    this._activeRuntimeSignature = '';
  }

  _debugEnabled() {
    const raw = String(process.env.PROVIDER_CONFIG_DEBUG || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  _debug(event, payload = {}) {
    if (!this._debugEnabled()) return;
    const safePayload = payload && typeof payload === 'object' ? payload : { value: payload };
    console.log('[provider-config]', event, JSON.stringify(safePayload));
  }

  _requireUserId(userId) {
    const value = typeof userId === 'string' ? userId.trim() : '';
    if (value) return value;
    const err = new Error('用户身份缺失');
    err.status = 401;
    throw err;
  }

  _textProviderId(index) {
    return `text:${index}`;
  }

  _textModelId(providerIndex, modelIndex) {
    return `text:${providerIndex}:model:${modelIndex}`;
  }

  _imageProviderId(index) {
    return `image:${index}`;
  }

  _normalizeTextModel(entry, index) {
    const src = entry && typeof entry === 'object' ? entry : {};
    const model = src.model == null ? '' : String(src.model).trim();
    const priority = parsePriority(src.priority, index + 1);
    return { model, priority };
  }

  _normalizeTextProvider(entry, index, keyMap = new Map()) {
    const src = entry && typeof entry === 'object' ? shallowClone(entry) : {};
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !String(src.apiKey || '').trim());
    const directApiKey = this._readApiKey(src.apiKey);
    const fallbackApiKey = id && keepApiKey && keyMap.has(id) ? keyMap.get(id) : '';
    const apiKey = directApiKey || fallbackApiKey || '';
    const baseModel = src.model == null ? '' : String(src.model).trim();
    const modelsRaw = Array.isArray(src.models) ? src.models : [];
    const models = (modelsRaw.length ? modelsRaw : baseModel ? [{ model: baseModel, priority: 1 }] : [])
      .map((item, modelIndex) => this._normalizeTextModel(item, modelIndex))
      .sort((a, b) => a.priority - b.priority);

    return {
      id,
      name: src.name == null ? '' : String(src.name).trim(),
      enabled: normalizeBool(src.enabled, true),
      baseURL: sanitizeUrlEnv(src.baseURL ?? src.baseUrl ?? ''),
      apiKey,
      priority: parsePriority(src.priority, index + 1),
      models,
    };
  }

  _normalizeImageProvider(entry, index, keyMap = new Map()) {
    const src = entry && typeof entry === 'object' ? shallowClone(entry) : {};
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !String(src.apiKey || '').trim());
    const directApiKey = this._readApiKey(src.apiKey);
    const fallbackApiKey = id && keepApiKey && keyMap.has(id) ? keyMap.get(id) : '';
    const apiKey = directApiKey || fallbackApiKey || '';
    return {
      id,
      name: src.name == null ? '' : String(src.name).trim(),
      enabled: normalizeBool(src.enabled, true),
      baseURL: sanitizeUrlEnv(src.baseURL ?? src.baseUrl ?? ''),
      apiKey,
      model: src.model == null ? '' : String(src.model).trim(),
      priority: parsePriority(src.priority, index + 1),
    };
  }

  _normalizeConfig(input, keyMaps = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const textRaw = Array.isArray(src.textProviders) ? src.textProviders : [];
    const imageRaw = Array.isArray(src.imageProviders) ? src.imageProviders : [];
    const textKeyMap = keyMaps.textKeyMap instanceof Map ? keyMaps.textKeyMap : new Map();
    const imageKeyMap = keyMaps.imageKeyMap instanceof Map ? keyMaps.imageKeyMap : new Map();

    const textProviders = textRaw
      .map((entry, index) => this._normalizeTextProvider(entry, index, textKeyMap))
      .sort((a, b) => a.priority - b.priority);
    const imageProviders = imageRaw
      .map((entry, index) => this._normalizeImageProvider(entry, index, imageKeyMap))
      .sort((a, b) => a.priority - b.priority);

    return { textProviders, imageProviders };
  }

  _storageShape(config, { encryptKeys = false } = {}) {
    const src = config && typeof config === 'object' ? config : {};
    return {
      textProviders: (Array.isArray(src.textProviders) ? src.textProviders : []).map((provider) => ({
        name: provider.name,
        enabled: provider.enabled,
        baseURL: provider.baseURL,
        apiKey: encryptKeys ? this._writeApiKey(provider.apiKey) : provider.apiKey,
        priority: provider.priority,
        models: (Array.isArray(provider.models) ? provider.models : []).map((model) => ({
          model: model.model,
          priority: model.priority,
        })),
      })),
      imageProviders: (Array.isArray(src.imageProviders) ? src.imageProviders : []).map((provider) => ({
        name: provider.name,
        enabled: provider.enabled,
        baseURL: provider.baseURL,
        apiKey: encryptKeys ? this._writeApiKey(provider.apiKey) : provider.apiKey,
        model: provider.model,
        priority: provider.priority,
      })),
    };
  }

  _configSignature(config) {
    return JSON.stringify(this._storageShape(config, { encryptKeys: false }));
  }

  _readApiKey(raw) {
    const value = raw == null ? '' : String(raw).trim();
    if (!value) return '';
    if (!value.startsWith(`${ENC_PREFIX}:`)) return value;
    if (!this.encryptionKey) {
      throw new Error(`[provider-config] encrypted apiKey found but ${KEY_ENV_NAME} is not configured`);
    }

    const parts = value.split(':');
    if (parts.length !== 5) {
      throw new Error('[provider-config] invalid encrypted apiKey format');
    }

    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const cipher = Buffer.from(parts[4], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
    return plain.toString('utf8').trim();
  }

  _writeApiKey(raw) {
    const value = raw == null ? '' : String(raw).trim();
    if (!value) return '';
    if (!this.encryptionKey) {
      const err = new Error(`[provider-config] ${KEY_ENV_NAME} is required to persist provider api keys securely`);
      err.status = 500;
      throw err;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  _buildTextKeyMap(config) {
    const map = new Map();
    const textProviders = Array.isArray(config?.textProviders) ? config.textProviders : [];
    textProviders.forEach((provider, index) => {
      const key = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!key) return;
      const id = typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : this._textProviderId(index);
      map.set(id, key);
    });
    return map;
  }

  _buildImageKeyMap(config) {
    const map = new Map();
    const imageProviders = Array.isArray(config?.imageProviders) ? config.imageProviders : [];
    imageProviders.forEach((provider, index) => {
      const key = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!key) return;
      const id = typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : this._imageProviderId(index);
      map.set(id, key);
    });
    return map;
  }

  _maskForClient(config, meta) {
    const textProviders = (Array.isArray(config?.textProviders) ? config.textProviders : []).map((provider, providerIndex) => {
      const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      return {
        id: this._textProviderId(providerIndex),
        name: provider?.name || '',
        enabled: !!provider?.enabled,
        baseURL: provider?.baseURL || '',
        priority: parsePriority(provider?.priority, providerIndex + 1),
        apiKey: '',
        hasApiKey: !!apiKey,
        apiKeyMasked: maskApiKey(apiKey),
        keepApiKey: !!apiKey,
        models: (Array.isArray(provider?.models) ? provider.models : []).map((model, modelIndex) => ({
          id: this._textModelId(providerIndex, modelIndex),
          model: model?.model || '',
          priority: parsePriority(model?.priority, modelIndex + 1),
        })),
      };
    });

    const imageProviders = (Array.isArray(config?.imageProviders) ? config.imageProviders : []).map((provider, providerIndex) => {
      const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      return {
        id: this._imageProviderId(providerIndex),
        name: provider?.name || '',
        enabled: !!provider?.enabled,
        baseURL: provider?.baseURL || '',
        model: provider?.model || '',
        priority: parsePriority(provider?.priority, providerIndex + 1),
        apiKey: '',
        hasApiKey: !!apiKey,
        apiKeyMasked: maskApiKey(apiKey),
        keepApiKey: !!apiKey,
      };
    });

    return {
      source: meta?.source || 'env',
      updatedBy: meta?.updatedBy || '',
      updatedAt: meta?.updatedAt || '',
      textProviders,
      imageProviders,
    };
  }

  _loadFromEnv() {
    const textRaw = parseProvidersJson(process.env.AI_TEXT_PROVIDERS_JSON);
    const imageRaw = parseProvidersJson(process.env.AI_IMAGE_PROVIDERS_JSON);
    const normalized = this._normalizeConfig({
      textProviders: textRaw,
      imageProviders: imageRaw,
    });
    return {
      config: normalized,
      meta: {
        source: 'env',
        updatedBy: '',
        updatedAt: '',
      },
    };
  }

  _isMissingTableError(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || message.includes('does not exist');
  }

  async _loadUserRow(userId) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return { data: null, error: null };
      return { data: null, error };
    }
    return { data, error: null };
  }

  _extractConfigFromRow(row) {
    const textProviders = (Array.isArray(row?.text_providers) ? row.text_providers : []).map((provider) => ({
      ...(provider && typeof provider === 'object' ? provider : {}),
      apiKey: this._readApiKey(provider?.apiKey),
    }));
    const imageProviders = (Array.isArray(row?.image_providers) ? row.image_providers : []).map((provider) => ({
      ...(provider && typeof provider === 'object' ? provider : {}),
      apiKey: this._readApiKey(provider?.apiKey),
    }));
    return this._normalizeConfig({ textProviders, imageProviders });
  }

  _applyRuntimeConfig(config, meta = {}) {
    const normalized = this._normalizeConfig(config);
    const storageShape = this._storageShape(normalized, { encryptKeys: false });
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify(storageShape.textProviders);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify(storageShape.imageProviders);

    if (this.langChainManager && typeof this.langChainManager.reload === 'function') {
      this.langChainManager.reload(storageShape.textProviders, storageShape.imageProviders);
    }

    this._runtimeConfig = normalized;
    this._runtimeMeta = {
      source: meta.source || 'runtime',
      updatedBy: meta.updatedBy || '',
      updatedAt: meta.updatedAt || '',
    };
  }

  _validateStructure(config) {
    const errors = [];
    const textProviders = Array.isArray(config?.textProviders) ? config.textProviders : [];
    const imageProviders = Array.isArray(config?.imageProviders) ? config.imageProviders : [];

    textProviders.forEach((provider, index) => {
      const providerName = provider?.name || `text_${index + 1}`;
      if (!provider?.name) {
        errors.push({ kind: 'text', provider: providerName, message: '提供商名称不能为空' });
      }
      if (provider?.enabled && !provider?.baseURL) {
        errors.push({ kind: 'text', provider: providerName, message: '启用的文本提供商必须填写 baseURL' });
      }
      if (!Array.isArray(provider?.models) || provider.models.length === 0) {
        if (provider?.enabled) {
          errors.push({ kind: 'text', provider: providerName, message: '启用的文本提供商至少需要一个模型' });
        }
        return;
      }
      provider.models.forEach((model, modelIndex) => {
        if (provider?.enabled && !model?.model) {
          errors.push({
            kind: 'text',
            provider: providerName,
            model: `model_${modelIndex + 1}`,
            message: '模型名称不能为空',
          });
        }
      });
    });

    imageProviders.forEach((provider, index) => {
      const providerName = provider?.name || `image_${index + 1}`;
      if (!provider?.name) {
        errors.push({ kind: 'image', provider: providerName, message: '提供商名称不能为空' });
      }
      if (provider?.enabled && !provider?.baseURL) {
        errors.push({ kind: 'image', provider: providerName, message: '启用的图片提供商必须填写 baseURL' });
      }
      if (provider?.enabled && !provider?.model) {
        errors.push({ kind: 'image', provider: providerName, message: '启用的图片提供商必须填写 model' });
      }
    });

    return errors;
  }

  async _probeTextModel(provider, modelName) {
    try {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL || undefined,
        timeout: Number(process.env.AI_PROVIDER_PROBE_TIMEOUT_MS || 45000),
        maxRetries: 0,
      });
      await client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      });
      return { ok: true, message: 'ok' };
    } catch (error) {
      return { ok: false, message: String(error?.message || error || '文本连通性测试失败') };
    }
  }

  async _probeImageProvider(provider) {
    try {
      const name = typeof provider?.name === 'string' ? provider.name.trim().toLowerCase() : '';
      const adapter = name === 'modelscope'
        ? new ModelScopeImageAdapter(provider)
        : new OpenAICompatibleImageAdapter(provider);
      if (!adapter.isAvailable()) {
        return { ok: false, message: '图片提供商配置不完整或 API Key 无效' };
      }
      await adapter.testConnection();
      return { ok: true, message: 'ok' };
    } catch (error) {
      return { ok: false, message: String(error?.message || error || '图片连通性测试失败') };
    }
  }

  async _validateConnectivity(config) {
    const results = [];
    const textProviders = Array.isArray(config?.textProviders) ? config.textProviders : [];
    const imageProviders = Array.isArray(config?.imageProviders) ? config.imageProviders : [];

    for (const provider of textProviders) {
      if (!provider?.enabled) continue;
      const providerName = provider.name || 'text_provider';
      const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!apiKey) {
        results.push({ kind: 'text', provider: providerName, model: '', ok: false, message: '启用的文本提供商缺少 API Key' });
        continue;
      }
      for (const model of provider.models || []) {
        const modelName = model?.model || '';
        if (!modelName) {
          results.push({ kind: 'text', provider: providerName, model: '', ok: false, message: '模型名称不能为空' });
          continue;
        }
        const tested = await this._probeTextModel(provider, modelName);
        results.push({
          kind: 'text',
          provider: providerName,
          model: modelName,
          ok: !!tested.ok,
          message: tested.message || (tested.ok ? 'ok' : '文本连通性测试失败'),
        });
      }
    }

    for (const provider of imageProviders) {
      if (!provider?.enabled) continue;
      const providerName = provider.name || 'image_provider';
      const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!apiKey) {
        results.push({ kind: 'image', provider: providerName, model: provider?.model || '', ok: false, message: '启用的图片提供商缺少 API Key' });
        continue;
      }
      const tested = await this._probeImageProvider(provider);
      results.push({
        kind: 'image',
        provider: providerName,
        model: provider?.model || '',
        ok: !!tested.ok,
        message: tested.message || (tested.ok ? 'ok' : '图片连通性测试失败'),
      });
    }

    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      results,
      failed,
    };
  }

  async ensureInitialized() {
    if (this._initialized) return;
    await this.bootstrap();
  }

  async bootstrap() {
    const envFallback = this._loadFromEnv();
    this._defaultConfig = envFallback.config;
    this._defaultMeta = envFallback.meta;
    this._applyRuntimeConfig(envFallback.config, envFallback.meta);
    this._initialized = true;
  }

  async _loadUserConfig(userId) {
    await this.ensureInitialized();
    const effectiveUserId = this._requireUserId(userId);

    try {
      const { data, error } = await this._loadUserRow(effectiveUserId);
      if (error) {
        if (!this._isMissingTableError(error)) {
          console.warn('[provider-config] failed to load user config from supabase:', error.message || error);
        }
        this._debug('load_user_config.fallback_env.error', { userId: effectiveUserId, error: String(error?.message || error || '') });
        return { config: this._defaultConfig, meta: this._defaultMeta };
      }
      if (!data) {
        this._debug('load_user_config.fallback_env.no_row', { userId: effectiveUserId });
        return { config: this._defaultConfig, meta: this._defaultMeta };
      }
      const config = this._extractConfigFromRow(data);
      this._debug('load_user_config.supabase_hit', { userId: effectiveUserId, updatedBy: data.updated_by || '', updatedAt: data.updated_at || '' });
      return {
        config,
        meta: {
          source: 'supabase',
          updatedBy: data.updated_by ? String(data.updated_by) : effectiveUserId,
          updatedAt: data.updated_at ? String(data.updated_at) : '',
        },
      };
    } catch (error) {
      const msg = String(error?.message || error || '');
      if (msg.includes(KEY_ENV_NAME) || msg.includes('invalid encrypted apiKey format')) {
        const err = new Error(`读取用户提供商配置失败：${msg}`);
        err.status = 500;
        throw err;
      }
      console.warn('[provider-config] load user config fallback to env:', error?.message || error);
      this._debug('load_user_config.fallback_env.exception', { userId: effectiveUserId, error: msg });
      return { config: this._defaultConfig, meta: this._defaultMeta };
    }
  }

  async activateUserRuntime(userId) {
    const effectiveUserId = this._requireUserId(userId);
    const loaded = await this._loadUserConfig(effectiveUserId);
    const signature = this._configSignature(loaded.config);
    if (this._activeRuntimeUserId === effectiveUserId && this._activeRuntimeSignature === signature) {
      this._debug('activate_user_runtime.skip_same_signature', { userId: effectiveUserId });
      return;
    }

    this._applyRuntimeConfig(loaded.config, loaded.meta);
    this._activeRuntimeUserId = effectiveUserId;
    this._activeRuntimeSignature = signature;
    this._debug('activate_user_runtime.applied', { userId: effectiveUserId, source: loaded.meta?.source || 'env' });
  }

  async getConfig(userId) {
    const loaded = await this._loadUserConfig(userId);
    return this._maskForClient(loaded.config, loaded.meta);
  }

  async testSingle(input, userId) {
    const loaded = await this._loadUserConfig(userId);
    const kind = input?.kind === 'image' ? 'image' : 'text';
    const providerInput = input?.provider && typeof input.provider === 'object' ? input.provider : {};
    const textKeyMap = this._buildTextKeyMap(loaded.config);
    const imageKeyMap = this._buildImageKeyMap(loaded.config);
    const normalized = kind === 'text'
      ? { textProviders: [this._normalizeTextProvider(providerInput, 0, textKeyMap)], imageProviders: [] }
      : { textProviders: [], imageProviders: [this._normalizeImageProvider(providerInput, 0, imageKeyMap)] };

    const structureErrors = this._validateStructure(normalized);
    if (structureErrors.length) {
      const err = new Error('配置校验失败');
      err.status = 400;
      err.details = structureErrors;
      throw err;
    }

    return await this._validateConnectivity(normalized);
  }

  async updateConfig(input, userId = '') {
    const effectiveUserId = this._requireUserId(userId);
    const loaded = await this._loadUserConfig(effectiveUserId);
    const textKeyMap = this._buildTextKeyMap(loaded.config);
    const imageKeyMap = this._buildImageKeyMap(loaded.config);
    const normalized = this._normalizeConfig(input, { textKeyMap, imageKeyMap });

    const structureErrors = this._validateStructure(normalized);
    if (structureErrors.length) {
      const err = new Error('配置校验失败');
      err.status = 400;
      err.details = structureErrors;
      throw err;
    }

    const tested = await this._validateConnectivity(normalized);
    if (!tested.ok) {
      const err = new Error('连通性校验未通过');
      err.status = 400;
      err.code = 'PROVIDER_CONNECTIVITY_FAILED';
      err.details = tested.failed;
      err.results = tested.results;
      throw err;
    }

    const storageShape = this._storageShape(normalized, { encryptKeys: true });
    const now = new Date().toISOString();
    const row = {
      user_id: effectiveUserId,
      text_providers: storageShape.textProviders,
      image_providers: storageShape.imageProviders,
      updated_by: effectiveUserId,
      updated_at: now,
    };

    const { error } = await this.supabase.from(this.tableName).upsert(row, { onConflict: 'user_id' });
    if (error) {
      const err = new Error(`保存配置失败: ${error.message || error}`);
      err.status = this._isMissingTableError(error) ? 500 : 500;
      throw err;
    }

    this._applyRuntimeConfig(normalized, {
      source: 'supabase',
      updatedBy: effectiveUserId,
      updatedAt: now,
    });
    this._activeRuntimeUserId = effectiveUserId;
    this._activeRuntimeSignature = this._configSignature(normalized);

    return {
      config: this._maskForClient(this._runtimeConfig, this._runtimeMeta),
      testResults: tested.results,
    };
  }
}

module.exports = ProviderConfigService;
