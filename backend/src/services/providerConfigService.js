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
  constructor({ supabase, langChainManager, onRuntimeConfigApplied } = {}) {
    this.supabase = supabase;
    this.langChainManager = langChainManager;
    this.onRuntimeConfigApplied = typeof onRuntimeConfigApplied === 'function' ? onRuntimeConfigApplied : null;
    this.tableName = TABLE_NAME;
    this.encryptionKey = loadEncryptionKey();
    this._initialized = false;

    this._defaultConfig = { textProviders: [], imageProviders: [], ragEmbeddingProviders: [], ragRerankProviders: [] };
    this._defaultMeta = { source: 'env', updatedBy: '', updatedAt: '' };
    this._runtimeConfig = { textProviders: [], imageProviders: [], ragEmbeddingProviders: [], ragRerankProviders: [] };
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

  _ragEmbeddingProviderId(index) {
    return `rag-embedding:${index}`;
  }

  _ragRerankProviderId(index) {
    return `rag-rerank:${index}`;
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
    const directApiKey = this._readApiKey(src.apiKey);
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !directApiKey);
    const hasExistingApiKey = id && keyMap.has(id);
    const keptApiKey = hasExistingApiKey ? keyMap.get(id) : '';
    const apiKey = keepApiKey ? keptApiKey : directApiKey;
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
    const directApiKey = this._readApiKey(src.apiKey);
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !directApiKey);
    const hasExistingApiKey = id && keyMap.has(id);
    const keptApiKey = hasExistingApiKey ? keyMap.get(id) : '';
    const apiKey = keepApiKey ? keptApiKey : directApiKey;
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

  _normalizeRagEmbeddingProvider(entry, index, keyMap = new Map()) {
    const src = entry && typeof entry === 'object' ? shallowClone(entry) : {};
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    const directApiKey = this._readApiKey(src.apiKey);
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !directApiKey);
    const keptApiKey = id && keyMap.has(id) ? keyMap.get(id) : '';
    const apiKey = keepApiKey ? keptApiKey : directApiKey;
    const dimensions = Number(src.dimensions ?? src.dimension);
    return {
      id,
      name: src.name == null ? '' : String(src.name).trim(),
      enabled: normalizeBool(src.enabled, true),
      baseURL: sanitizeUrlEnv(src.baseURL ?? src.baseUrl ?? ''),
      apiKey,
      model: src.model == null ? '' : String(src.model).trim(),
      dimensions: Number.isFinite(dimensions) && dimensions > 0 ? Math.floor(dimensions) : 1024,
      priority: parsePriority(src.priority, index + 1),
    };
  }

  _normalizeRagRerankProvider(entry, index, keyMap = new Map()) {
    const src = entry && typeof entry === 'object' ? shallowClone(entry) : {};
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    const directApiKey = this._readApiKey(src.apiKey);
    const keepApiKey = normalizeBool(src.keepApiKey, false) || (src.hasApiKey === true && !directApiKey);
    const keptApiKey = id && keyMap.has(id) ? keyMap.get(id) : '';
    const apiKey = keepApiKey ? keptApiKey : directApiKey;
    const rawPath = src.path == null ? '/rerank' : String(src.path).trim();
    const timeoutMs = Number(src.timeoutMs);
    const candidateFactor = Number(src.candidateFactor);
    return {
      id,
      name: src.name == null ? '' : String(src.name).trim(),
      enabled: normalizeBool(src.enabled, true),
      baseURL: sanitizeUrlEnv(src.baseURL ?? src.baseUrl ?? ''),
      apiKey,
      model: src.model == null ? '' : String(src.model).trim(),
      path: rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '/rerank',
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 10000,
      candidateFactor: Number.isFinite(candidateFactor) && candidateFactor > 0 ? Math.floor(candidateFactor) : 3,
      priority: parsePriority(src.priority, index + 1),
    };
  }

  _normalizeConfig(input, keyMaps = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const textRaw = Array.isArray(src.textProviders) ? src.textProviders : [];
    const imageRaw = Array.isArray(src.imageProviders) ? src.imageProviders : [];
    const ragEmbeddingRaw = Array.isArray(src.ragEmbeddingProviders) ? src.ragEmbeddingProviders : [];
    const ragRerankRaw = Array.isArray(src.ragRerankProviders) ? src.ragRerankProviders : [];
    const textKeyMap = keyMaps.textKeyMap instanceof Map ? keyMaps.textKeyMap : new Map();
    const imageKeyMap = keyMaps.imageKeyMap instanceof Map ? keyMaps.imageKeyMap : new Map();
    const ragEmbeddingKeyMap = keyMaps.ragEmbeddingKeyMap instanceof Map ? keyMaps.ragEmbeddingKeyMap : new Map();
    const ragRerankKeyMap = keyMaps.ragRerankKeyMap instanceof Map ? keyMaps.ragRerankKeyMap : new Map();

    const textProviders = textRaw
      .map((entry, index) => this._normalizeTextProvider(entry, index, textKeyMap))
      .sort((a, b) => a.priority - b.priority);
    const imageProviders = imageRaw
      .map((entry, index) => this._normalizeImageProvider(entry, index, imageKeyMap))
      .sort((a, b) => a.priority - b.priority);
    const ragEmbeddingProviders = ragEmbeddingRaw
      .map((entry, index) => this._normalizeRagEmbeddingProvider(entry, index, ragEmbeddingKeyMap))
      .sort((a, b) => a.priority - b.priority);
    const ragRerankProviders = ragRerankRaw
      .map((entry, index) => this._normalizeRagRerankProvider(entry, index, ragRerankKeyMap))
      .sort((a, b) => a.priority - b.priority);

    return { textProviders, imageProviders, ragEmbeddingProviders, ragRerankProviders };
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
      ragEmbeddingProviders: (Array.isArray(src.ragEmbeddingProviders) ? src.ragEmbeddingProviders : []).map((provider) => ({
        name: provider.name,
        enabled: provider.enabled,
        baseURL: provider.baseURL,
        apiKey: encryptKeys ? this._writeApiKey(provider.apiKey) : provider.apiKey,
        model: provider.model,
        dimensions: provider.dimensions,
        priority: provider.priority,
      })),
      ragRerankProviders: (Array.isArray(src.ragRerankProviders) ? src.ragRerankProviders : []).map((provider) => ({
        name: provider.name,
        enabled: provider.enabled,
        baseURL: provider.baseURL,
        apiKey: encryptKeys ? this._writeApiKey(provider.apiKey) : provider.apiKey,
        model: provider.model,
        path: provider.path,
        timeoutMs: provider.timeoutMs,
        candidateFactor: provider.candidateFactor,
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

  _buildRagEmbeddingKeyMap(config) {
    const map = new Map();
    const providers = Array.isArray(config?.ragEmbeddingProviders) ? config.ragEmbeddingProviders : [];
    providers.forEach((provider, index) => {
      const key = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!key) return;
      const id = typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : this._ragEmbeddingProviderId(index);
      map.set(id, key);
    });
    return map;
  }

  _buildRagRerankKeyMap(config) {
    const map = new Map();
    const providers = Array.isArray(config?.ragRerankProviders) ? config.ragRerankProviders : [];
    providers.forEach((provider, index) => {
      const key = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!key) return;
      const id = typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : this._ragRerankProviderId(index);
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

    const ragEmbeddingProviders = (Array.isArray(config?.ragEmbeddingProviders) ? config.ragEmbeddingProviders : []).map((provider, providerIndex) => {
      const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      return {
        id: this._ragEmbeddingProviderId(providerIndex),
        name: provider?.name || '',
        enabled: !!provider?.enabled,
        baseURL: provider?.baseURL || '',
        model: provider?.model || '',
        dimensions: Number(provider?.dimensions) > 0 ? Number(provider.dimensions) : 1024,
        priority: parsePriority(provider?.priority, providerIndex + 1),
        apiKey: '',
        hasApiKey: !!apiKey,
        apiKeyMasked: maskApiKey(apiKey),
        keepApiKey: !!apiKey,
      };
    });

    const ragRerankProviders = (Array.isArray(config?.ragRerankProviders) ? config.ragRerankProviders : []).map((provider, providerIndex) => {
      const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
      return {
        id: this._ragRerankProviderId(providerIndex),
        name: provider?.name || '',
        enabled: !!provider?.enabled,
        baseURL: provider?.baseURL || '',
        model: provider?.model || '',
        path: provider?.path || '/rerank',
        timeoutMs: Number(provider?.timeoutMs) > 0 ? Number(provider.timeoutMs) : 10000,
        candidateFactor: Number(provider?.candidateFactor) > 0 ? Number(provider.candidateFactor) : 3,
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
      ragEmbeddingProviders,
      ragRerankProviders,
    };
  }

  _loadFromEnv() {
    const textRaw = parseProvidersJson(process.env.AI_TEXT_PROVIDERS_JSON);
    const imageRaw = parseProvidersJson(process.env.AI_IMAGE_PROVIDERS_JSON);
    const ragEmbeddingRaw = parseProvidersJson(process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON);
    const ragRerankRaw = parseProvidersJson(process.env.AI_RAG_RERANK_PROVIDERS_JSON);
    const ragEmbeddingProviders = Array.isArray(ragEmbeddingRaw) && ragEmbeddingRaw.length
      ? ragEmbeddingRaw
      : (process.env.QWEN_EMBEDDING_API_KEY
        ? [{
            name: 'qwen-embedding',
            enabled: (process.env.RAG_ENABLED || 'true').toLowerCase() !== 'false',
            baseURL: process.env.QWEN_EMBEDDING_BASE_URL || 'https://api-inference.modelscope.cn/v1',
            apiKey: process.env.QWEN_EMBEDDING_API_KEY || '',
            model: process.env.QWEN_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
            dimensions: process.env.QWEN_EMBEDDING_DIM || '1024',
            priority: 1,
          }]
        : []);
    const ragRerankProviders = Array.isArray(ragRerankRaw) && ragRerankRaw.length
      ? ragRerankRaw
      : ((process.env.RERANK_ENABLED || 'false').toLowerCase() === 'true' && process.env.RERANK_BASE_URL
        ? [{
            name: 'rag-rerank',
            enabled: true,
            baseURL: process.env.RERANK_BASE_URL || '',
            apiKey: process.env.RERANK_API_KEY || '',
            model: process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3',
            path: process.env.RERANK_PATH || '/rerank',
            timeoutMs: process.env.RERANK_TIMEOUT_MS || '10000',
            candidateFactor: process.env.RERANK_CANDIDATE_FACTOR || '3',
            priority: 1,
          }]
        : []);
    const normalized = this._normalizeConfig({
      textProviders: textRaw,
      imageProviders: imageRaw,
      ragEmbeddingProviders,
      ragRerankProviders,
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
    const ragEmbeddingProviders = (Array.isArray(row?.rag_embedding_providers) ? row.rag_embedding_providers : []).map((provider) => ({
      ...(provider && typeof provider === 'object' ? provider : {}),
      apiKey: this._readApiKey(provider?.apiKey),
    }));
    const ragRerankProviders = (Array.isArray(row?.rag_rerank_providers) ? row.rag_rerank_providers : []).map((provider) => ({
      ...(provider && typeof provider === 'object' ? provider : {}),
      apiKey: this._readApiKey(provider?.apiKey),
    }));
    return this._normalizeConfig({ textProviders, imageProviders, ragEmbeddingProviders, ragRerankProviders });
  }

  _syncRagRuntimeEnv(storageShape) {
    const ragEmbeddingProviders = Array.isArray(storageShape?.ragEmbeddingProviders) ? storageShape.ragEmbeddingProviders : [];
    const ragRerankProviders = Array.isArray(storageShape?.ragRerankProviders) ? storageShape.ragRerankProviders : [];
    process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON = JSON.stringify(ragEmbeddingProviders);
    process.env.AI_RAG_RERANK_PROVIDERS_JSON = JSON.stringify(ragRerankProviders);

    const embeddingProvider = ragEmbeddingProviders.find((provider) => provider && provider.enabled && provider.apiKey) || null;
    process.env.QWEN_EMBEDDING_API_KEY = embeddingProvider?.apiKey || '';
    process.env.QWEN_EMBEDDING_BASE_URL = embeddingProvider?.baseURL || '';
    process.env.QWEN_EMBEDDING_MODEL = embeddingProvider?.model || '';
    process.env.QWEN_EMBEDDING_DIM = String(embeddingProvider?.dimensions || '');

    const rerankProvider = ragRerankProviders.find((provider) => provider && provider.enabled && provider.baseURL) || null;
    process.env.RERANK_ENABLED = rerankProvider ? 'true' : 'false';
    process.env.RERANK_BASE_URL = rerankProvider?.baseURL || '';
    process.env.RERANK_PATH = rerankProvider?.path || '/rerank';
    process.env.RERANK_MODEL = rerankProvider?.model || '';
    process.env.RERANK_API_KEY = rerankProvider?.apiKey || '';
    process.env.RERANK_TIMEOUT_MS = String(rerankProvider?.timeoutMs || '');
    process.env.RERANK_CANDIDATE_FACTOR = String(rerankProvider?.candidateFactor || '');
  }

  _applyRuntimeConfig(config, meta = {}) {
    const normalized = this._normalizeConfig(config);
    const storageShape = this._storageShape(normalized, { encryptKeys: false });
    process.env.AI_TEXT_PROVIDERS_JSON = JSON.stringify(storageShape.textProviders);
    process.env.AI_IMAGE_PROVIDERS_JSON = JSON.stringify(storageShape.imageProviders);
    this._syncRagRuntimeEnv(storageShape);

    if (this.langChainManager && typeof this.langChainManager.reload === 'function') {
      this.langChainManager.reload(storageShape.textProviders, storageShape.imageProviders);
    }

    this._runtimeConfig = normalized;
    this._runtimeMeta = {
      source: meta.source || 'runtime',
      updatedBy: meta.updatedBy || '',
      updatedAt: meta.updatedAt || '',
    };

    if (this.onRuntimeConfigApplied) {
      try {
        this.onRuntimeConfigApplied({
          config: normalized,
          meta: this._runtimeMeta,
          storageShape,
        });
      } catch (error) {
        console.warn('[provider-config] onRuntimeConfigApplied failed:', error?.message || error);
      }
    }
  }

  _validateStructure(config) {
    const errors = [];
    const textProviders = Array.isArray(config?.textProviders) ? config.textProviders : [];
    const imageProviders = Array.isArray(config?.imageProviders) ? config.imageProviders : [];
    const ragEmbeddingProviders = Array.isArray(config?.ragEmbeddingProviders) ? config.ragEmbeddingProviders : [];
    const ragRerankProviders = Array.isArray(config?.ragRerankProviders) ? config.ragRerankProviders : [];

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

    ragEmbeddingProviders.forEach((provider, index) => {
      const providerName = provider?.name || `rag_embedding_${index + 1}`;
      if (!provider?.name) {
        errors.push({ kind: 'embedding', provider: providerName, message: 'Embedding 提供商名称不能为空' });
      }
      if (provider?.enabled && !provider?.baseURL) {
        errors.push({ kind: 'embedding', provider: providerName, message: '启用的 Embedding 提供商必须填写 baseURL' });
      }
      if (provider?.enabled && !provider?.model) {
        errors.push({ kind: 'embedding', provider: providerName, message: '启用的 Embedding 提供商必须填写 model' });
      }
      if (provider?.enabled && !(Number(provider?.dimensions) > 0)) {
        errors.push({ kind: 'embedding', provider: providerName, message: 'Embedding 维度必须为正整数' });
      }
    });

    ragRerankProviders.forEach((provider, index) => {
      const providerName = provider?.name || `rag_rerank_${index + 1}`;
      if (!provider?.name) {
        errors.push({ kind: 'rerank', provider: providerName, message: 'Rerank 提供商名称不能为空' });
      }
      if (provider?.enabled && !provider?.baseURL) {
        errors.push({ kind: 'rerank', provider: providerName, message: '启用的 Rerank 提供商必须填写 baseURL' });
      }
      if (provider?.enabled && !provider?.path) {
        errors.push({ kind: 'rerank', provider: providerName, message: '启用的 Rerank 提供商必须填写 path' });
      }
    });

    return errors;
  }

  async _probeEmbeddingProvider(provider) {
    const body = JSON.stringify({
      model: provider.model,
      input: ['ping'],
      dimensions: provider.dimensions,
      encoding_format: 'float',
    });
    const url = new URL(`${provider.baseURL}/embeddings`);
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    return await new Promise((resolve) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        path: `${url.pathname}${url.search || ''}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json?.error) {
              resolve({ ok: false, message: String(json.error?.message || 'Embedding 连接测试失败') });
              return;
            }
            const embedding = json?.data?.[0]?.embedding;
            if (!Array.isArray(embedding)) {
              resolve({ ok: false, message: 'Embedding 接口返回格式异常' });
              return;
            }
            resolve({ ok: true, message: 'ok' });
          } catch (_) {
            resolve({ ok: false, message: 'Embedding 接口返回了无效 JSON' });
          }
        });
      });
      req.on('error', (error) => resolve({ ok: false, message: String(error?.message || error || 'Embedding 连接测试失败') }));
      req.write(body);
      req.end();
    });
  }

  async _probeRerankProvider(provider) {
    const body = JSON.stringify({
      query: 'ping',
      documents: ['ping'],
      model: provider.model,
      return_documents: false,
    });
    const url = new URL(`${provider.baseURL}${provider.path.startsWith('/') ? provider.path : `/${provider.path}`}`);
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    return await new Promise((resolve) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        path: `${url.pathname}${url.search || ''}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (Array.isArray(json) || Array.isArray(json?.results) || Array.isArray(json?.scores) || Array.isArray(json?.data)) {
              resolve({ ok: true, message: 'ok' });
              return;
            }
            if (json?.error) {
              resolve({ ok: false, message: String(json.error?.message || 'Rerank 连接测试失败') });
              return;
            }
            resolve({ ok: false, message: 'Rerank 接口返回格式异常' });
          } catch (_) {
            resolve({ ok: false, message: 'Rerank 接口返回了无效 JSON' });
          }
        });
      });
      req.setTimeout(Number(provider.timeoutMs) > 0 ? Number(provider.timeoutMs) : 10000, () => {
        req.destroy();
        resolve({ ok: false, message: 'Rerank 连接测试超时' });
      });
      req.on('error', (error) => resolve({ ok: false, message: String(error?.message || error || 'Rerank 连接测试失败') }));
      req.write(body);
      req.end();
    });
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
    const ragEmbeddingProviders = Array.isArray(config?.ragEmbeddingProviders) ? config.ragEmbeddingProviders : [];
    const ragRerankProviders = Array.isArray(config?.ragRerankProviders) ? config.ragRerankProviders : [];

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

    for (const provider of ragEmbeddingProviders) {
      if (!provider?.enabled) continue;
      const providerName = provider.name || 'rag_embedding_provider';
      const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
      if (!apiKey) {
        results.push({ kind: 'embedding', provider: providerName, model: provider?.model || '', ok: false, message: '启用的 Embedding 提供商缺少 API Key' });
        continue;
      }
      const tested = await this._probeEmbeddingProvider(provider);
      results.push({
        kind: 'embedding',
        provider: providerName,
        model: provider?.model || '',
        ok: !!tested.ok,
        message: tested.message || (tested.ok ? 'ok' : 'Embedding 连通性测试失败'),
      });
    }

    for (const provider of ragRerankProviders) {
      if (!provider?.enabled) continue;
      const providerName = provider.name || 'rag_rerank_provider';
      const tested = await this._probeRerankProvider(provider);
      results.push({
        kind: 'rerank',
        provider: providerName,
        model: provider?.model || '',
        ok: !!tested.ok,
        message: tested.message || (tested.ok ? 'ok' : 'Rerank 连通性测试失败'),
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
    const requestedKind = typeof input?.kind === 'string' ? input.kind.trim().toLowerCase() : 'text';
    const kind = ['text', 'image', 'embedding', 'rerank'].includes(requestedKind) ? requestedKind : 'text';
    const providerInput = input?.provider && typeof input.provider === 'object' ? input.provider : {};
    const textKeyMap = this._buildTextKeyMap(loaded.config);
    const imageKeyMap = this._buildImageKeyMap(loaded.config);
    const ragEmbeddingKeyMap = this._buildRagEmbeddingKeyMap(loaded.config);
    const ragRerankKeyMap = this._buildRagRerankKeyMap(loaded.config);
    const normalized = kind === 'text'
      ? { textProviders: [this._normalizeTextProvider(providerInput, 0, textKeyMap)], imageProviders: [], ragEmbeddingProviders: [], ragRerankProviders: [] }
      : kind === 'image'
        ? { textProviders: [], imageProviders: [this._normalizeImageProvider(providerInput, 0, imageKeyMap)], ragEmbeddingProviders: [], ragRerankProviders: [] }
        : kind === 'embedding'
          ? { textProviders: [], imageProviders: [], ragEmbeddingProviders: [this._normalizeRagEmbeddingProvider(providerInput, 0, ragEmbeddingKeyMap)], ragRerankProviders: [] }
          : { textProviders: [], imageProviders: [], ragEmbeddingProviders: [], ragRerankProviders: [this._normalizeRagRerankProvider(providerInput, 0, ragRerankKeyMap)] };

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
    const ragEmbeddingKeyMap = this._buildRagEmbeddingKeyMap(loaded.config);
    const ragRerankKeyMap = this._buildRagRerankKeyMap(loaded.config);
    const normalized = this._normalizeConfig(input, { textKeyMap, imageKeyMap, ragEmbeddingKeyMap, ragRerankKeyMap });

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
      rag_embedding_providers: storageShape.ragEmbeddingProviders,
      rag_rerank_providers: storageShape.ragRerankProviders,
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
