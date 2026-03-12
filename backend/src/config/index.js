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
        const priority = parsePriority(
          modelObj && modelObj.priority != null ? modelObj.priority : normalized.priority + modelIndex,
          normalized.priority + modelIndex
        );
        out.push({
          ...normalized,
          model: modelName || normalized.model,
          priority,
        });
      });
      return;
    }
    out.push(normalized);
  });
  return out;
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

module.exports = {
  config,
  getEnabledTextProviders,
  getEnabledImageProviders,
  getEmbeddingConfig,
  getRerankConfig,
};

/**
 * 获取 Qwen Embedding 配置
 * 返回 null 表示未配置，ragService 将自动降级（跳过 RAG）
 */
function getEmbeddingConfig() {
  const apiKey = process.env.QWEN_EMBEDDING_API_KEY || '';
  if (!apiKey) return null;
  return {
    apiKey,
    model:     process.env.QWEN_EMBEDDING_MODEL    || 'Qwen/Qwen3-Embedding-8B',
    dim:       parseInt(process.env.QWEN_EMBEDDING_DIM || '1024', 10),
    baseURL:   process.env.QWEN_EMBEDDING_BASE_URL || 'https://api-inference.modelscope.cn/v1',
    kbSlug:    process.env.RAG_KB_SLUG             || 'travel-cn-public',
    datasetVersion: process.env.RAG_DATASET_VERSION || '',
    enabled:   (process.env.RAG_ENABLED || 'true').toLowerCase() !== 'false',
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
  const baseURL = process.env.RERANK_BASE_URL || '';
  const enabled = (process.env.RERANK_ENABLED || 'false').toLowerCase() === 'true' && !!baseURL;
  return {
    enabled,
    baseURL:         baseURL || 'http://localhost:8001',
    path:            process.env.RERANK_PATH || '/rerank',
    model:           process.env.RERANK_MODEL            || 'BAAI/bge-reranker-v2-m3',
    apiKey:          process.env.RERANK_API_KEY          || '',
    candidateFactor: parseInt(process.env.RERANK_CANDIDATE_FACTOR || '3', 10),
    timeoutMs:       parseInt(process.env.RERANK_TIMEOUT_MS || '10000', 10),
  };
}
