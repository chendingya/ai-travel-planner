/**
 * 配置管理
 * 集中管理所有环境变量和配置
 */
require('dotenv').config();

function sanitizeUrlEnv(value) {
  if (value == null) return value;
  const raw = String(value).trim();
  if (!raw) return '';
  const unwrapped = (() => {
    let s = raw;
    let changed = true;
    while (changed) {
      changed = false;
      const first = s[0];
      const last = s[s.length - 1];
      if ((first === '`' && last === '`') || (first === '"' && last === '"') || (first === "'" && last === "'")) {
        s = s.slice(1, -1).trim();
        changed = true;
      }
    }
    return s;
  })();
  return unwrapped.replace(/\s+/g, '').replace(/[`"']/g, '');
}

function parsePriority(value, fallback) {
  const raw = value == null ? '' : String(value).trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb > 0 ? Math.floor(fb) : 1;
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb > 0 ? Math.floor(fb) : 0;
}

function normalizeBool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function parseProvidersJson(raw) {
  const value = raw == null ? '' : String(raw).trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.providers)) return parsed.providers;
  } catch (error) {
    return null;
  }
  return null;
}

function normalizeProviderEntry(entry, index, defaults = {}) {
  const src = entry && typeof entry === 'object' ? entry : {};
  const nameRaw = typeof src.name === 'string' ? src.name.trim() : '';
  const nameDefault = typeof defaults.name === 'string' ? defaults.name : `provider_${index + 1}`;
  const name = nameRaw || nameDefault;
  const enabledRaw = src.enabled ?? defaults.enabled;
  const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : enabledRaw == null ? true : String(enabledRaw).toLowerCase() === 'true';
  const baseURLRaw = src.baseURL ?? src.baseUrl ?? defaults.baseURL ?? defaults.baseUrl ?? '';
  const baseURL = sanitizeUrlEnv(baseURLRaw);
  const apiKeyRaw = src.apiKey ?? src.api_key ?? defaults.apiKey ?? defaults.api_key ?? '';
  const apiKey = apiKeyRaw == null ? '' : String(apiKeyRaw);
  const modelRaw = src.model ?? defaults.model ?? '';
  const model = modelRaw == null ? '' : String(modelRaw);
  const priority = parsePriority(src.priority ?? defaults.priority, index + 1);
  return { name, enabled, baseURL, apiKey, model, priority };
}

function normalizeRagEmbeddingProviderEntry(entry, index, defaults = {}) {
  const normalized = normalizeProviderEntry(entry, index, defaults);
  const src = entry && typeof entry === 'object' ? entry : {};
  return {
    ...normalized,
    dimensions: parsePositiveInt(src.dimensions ?? src.dimension ?? defaults.dimensions, 1024) || 1024,
  };
}

function normalizeRagRerankProviderEntry(entry, index, defaults = {}) {
  const normalized = normalizeProviderEntry(entry, index, defaults);
  const src = entry && typeof entry === 'object' ? entry : {};
  const rawPath = src.path ?? defaults.path ?? '/rerank';
  const path = (() => {
    const value = rawPath == null ? '' : String(rawPath).trim();
    if (!value) return '/rerank';
    return value.startsWith('/') ? value : `/${value}`;
  })();
  return {
    ...normalized,
    path,
    timeoutMs: parsePositiveInt(src.timeoutMs ?? defaults.timeoutMs, 10000) || 10000,
    candidateFactor: parsePositiveInt(src.candidateFactor ?? defaults.candidateFactor, 3) || 3,
  };
}

function expandTextProviders(entries) {
  const out = [];
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry, index) => {
    const normalized = normalizeProviderEntry(entry, index);
    const models = entry && typeof entry === 'object' ? entry.models : null;
    if (Array.isArray(models) && models.length) {
      models.forEach((modelEntry, modelIndex) => {
        const modelObj = typeof modelEntry === 'string' ? { model: modelEntry } : modelEntry;
        const modelName = modelObj && typeof modelObj.model === 'string' ? modelObj.model : '';
        out.push({
          ...normalized,
          model: modelName || normalized.model,
          priority: normalized.priority,
          providerPriority: normalized.priority,
          modelPriority: parsePriority(modelObj && modelObj.priority != null ? modelObj.priority : modelIndex + 1, modelIndex + 1),
          _providerOrder: index,
          _modelOrder: modelIndex,
        });
      });
      return;
    }
    out.push({
      ...normalized,
      providerPriority: normalized.priority,
      modelPriority: 1,
      _providerOrder: index,
      _modelOrder: 0,
    });
  });
  return out
    .sort((a, b) =>
      parsePriority(a.providerPriority ?? a.priority, 1) - parsePriority(b.providerPriority ?? b.priority, 1) ||
      parsePriority(a.modelPriority, 1) - parsePriority(b.modelPriority, 1) ||
      parsePriority(a._providerOrder, 0) - parsePriority(b._providerOrder, 0) ||
      parsePriority(a._modelOrder, 0) - parsePriority(b._modelOrder, 0)
    )
    .map(({ _providerOrder, _modelOrder, ...provider }) => provider);
}

const config = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
  },

  // Supabase 配置
  supabase: {
    url: process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || process.env.PUBLIC_SUPABASE_ANON_KEY
      || process.env.SUPABASE_KEY,
  },

  // CORS 配置
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
};

/**
 * 获取启用的文本生成提供商（按优先级排序）
 */
function getEnabledTextProviders() {
  const jsonProviders = parseProvidersJson(process.env.AI_TEXT_PROVIDERS_JSON);
  if (Array.isArray(jsonProviders) && jsonProviders.length) {
    return expandTextProviders(jsonProviders)
      .filter((provider) => provider.enabled && provider.apiKey)
      .sort((a, b) => a.priority - b.priority);
  }
  return [];
}

/**
 * 获取启用的图片生成提供商（按优先级排序）
 */
function getEnabledImageProviders() {
  const jsonProviders = parseProvidersJson(process.env.AI_IMAGE_PROVIDERS_JSON);
  if (Array.isArray(jsonProviders) && jsonProviders.length) {
    return jsonProviders
      .map((entry, index) => normalizeProviderEntry(entry, index))
      .filter((provider) => provider.enabled && provider.apiKey)
      .sort((a, b) => a.priority - b.priority);
  }
  return [];
}

function getEnabledRagEmbeddingProviders() {
  const jsonProviders = parseProvidersJson(process.env.AI_RAG_EMBEDDING_PROVIDERS_JSON);
  if (Array.isArray(jsonProviders) && jsonProviders.length) {
    return jsonProviders
      .map((entry, index) => normalizeRagEmbeddingProviderEntry(entry, index))
      .filter((provider) => provider.enabled && provider.apiKey)
      .sort((a, b) => a.priority - b.priority);
  }

  const apiKey = process.env.QWEN_EMBEDDING_API_KEY || '';
  if (!apiKey) return [];
  return [normalizeRagEmbeddingProviderEntry({
    name: 'qwen-embedding',
    enabled: (process.env.RAG_ENABLED || 'true').toLowerCase() !== 'false',
    baseURL: process.env.QWEN_EMBEDDING_BASE_URL || 'https://api-inference.modelscope.cn/v1',
    apiKey,
    model: process.env.QWEN_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
    dimensions: process.env.QWEN_EMBEDDING_DIM || '1024',
    priority: 1,
  }, 0)];
}

function getEnabledRagRerankProviders() {
  const jsonProviders = parseProvidersJson(process.env.AI_RAG_RERANK_PROVIDERS_JSON);
  if (Array.isArray(jsonProviders) && jsonProviders.length) {
    return jsonProviders
      .map((entry, index) => normalizeRagRerankProviderEntry(entry, index))
      .filter((provider) => provider.enabled && provider.baseURL)
      .sort((a, b) => a.priority - b.priority);
  }

  const baseURL = process.env.RERANK_BASE_URL || '';
  const apiKey = process.env.RERANK_API_KEY || '';
  const enabled = normalizeBool(process.env.RERANK_ENABLED || 'false', false);
  if (!enabled || !baseURL) return [];
  return [normalizeRagRerankProviderEntry({
    name: 'rag-rerank',
    enabled,
    baseURL,
    apiKey,
    model: process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3',
    path: process.env.RERANK_PATH || '/rerank',
    timeoutMs: process.env.RERANK_TIMEOUT_MS || '10000',
    candidateFactor: process.env.RERANK_CANDIDATE_FACTOR || '3',
    priority: 1,
  }, 0)];
}

module.exports = {
  config,
  getEnabledTextProviders,
  getEnabledImageProviders,
  getEnabledRagEmbeddingProviders,
  getEnabledRagRerankProviders,
  getEmbeddingConfig,
  getRerankConfig,
};

/**
 * 获取 Qwen Embedding 配置
 * 返回 null 表示未配置，ragService 将自动降级（跳过 RAG）
 */
function getEmbeddingConfig() {
  const provider = getEnabledRagEmbeddingProviders()[0] || null;
  if (!provider) return null;
  return {
    apiKey: provider.apiKey,
    provider: provider.name,
    model: provider.model || 'Qwen/Qwen3-Embedding-8B',
    dim: provider.dimensions || 1024,
    baseURL: provider.baseURL || 'https://api-inference.modelscope.cn/v1',
    kbSlug:    process.env.RAG_KB_SLUG             || 'travel-cn-public',
    datasetVersion: process.env.RAG_DATASET_VERSION || '',
    enabled: normalizeBool(process.env.RAG_ENABLED, true) && provider.enabled !== false,
    topK:      parseInt(process.env.RAG_TOP_K || '5', 10),
    threshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.35'),
    denseTopK: parseInt(process.env.RAG_DENSE_TOP_K || '20', 10),
    sparseTopK: parseInt(process.env.RAG_SPARSE_TOP_K || '20', 10),
    rrfTopK: parseInt(process.env.RAG_RRF_TOP_K || '30', 10),
    rrfK: parseInt(process.env.RAG_RRF_K || '60', 10),
    sparseThreshold: parseFloat(process.env.RAG_SPARSE_THRESHOLD || '0.05'),
    intentCatalogPageSize: parseInt(process.env.RAG_INTENT_CATALOG_PAGE_SIZE || '1000', 10),
    intentCatalogTtlMs: parseInt(process.env.RAG_INTENT_CATALOG_TTL_MS || String(10 * 60 * 1000), 10),
  };
}

/**
 * 获取 Rerank 服务配置
 * RERANK_ENABLED=true 且 RERANK_BASE_URL 已填写时方生效
 */
function getRerankConfig() {
  const provider = getEnabledRagRerankProviders()[0] || null;
  const baseURL = provider?.baseURL || process.env.RERANK_BASE_URL || '';
  const enabled = normalizeBool(process.env.RERANK_ENABLED || 'false', false) && !!provider && !!baseURL;
  return {
    enabled,
    provider: provider?.name || '',
    baseURL:         baseURL || 'http://localhost:8001',
    path:            provider?.path || process.env.RERANK_PATH || '/rerank',
    model:           provider?.model || process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3',
    apiKey:          provider?.apiKey || process.env.RERANK_API_KEY || '',
    candidateFactor: parsePositiveInt(provider?.candidateFactor, process.env.RERANK_CANDIDATE_FACTOR || '3') || 3,
    timeoutMs:       parsePositiveInt(provider?.timeoutMs, process.env.RERANK_TIMEOUT_MS || '10000') || 10000,
  };
}
