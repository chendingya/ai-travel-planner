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
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
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
};
