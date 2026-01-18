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
    const s = raw;
    if ((s.startsWith('`') && s.endsWith('`')) || (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1).trim();
    }
    return s;
  })();
  return unwrapped.replace(/\s+/g, '');
}

function parsePriority(value, fallback) {
  const raw = value == null ? '' : String(value).trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb > 0 ? Math.floor(fb) : 1;
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

  // 文本生成提供商配置
  textProviders: {
    modelscope: {
      enabled: process.env.MODELSCOPE_TEXT_ENABLED === 'true',
      baseURL: sanitizeUrlEnv(process.env.MODELSCOPE_TEXT_BASE_URL),
      apiKey: process.env.MODELSCOPE_TEXT_API_KEY,
      model: process.env.MODELSCOPE_TEXT_MODEL || 'deepseek-ai/DeepSeek-V3.2',
      priority: parsePriority(process.env.MODELSCOPE_TEXT_PRIORITY, 1),
    },
    gitcode: {
      enabled: process.env.GITCODE_TEXT_ENABLED === 'true',
      baseURL: sanitizeUrlEnv(process.env.GITCODE_TEXT_BASE_URL),
      apiKey: process.env.GITCODE_TEXT_API_KEY,
      model: process.env.GITCODE_TEXT_MODEL || 'deepseek-ai/DeepSeek-V3.2',
      priority: parsePriority(process.env.GITCODE_TEXT_PRIORITY, 10),
    },
    dashscope: {
      enabled: process.env.DASHSCOPE_ENABLED === 'true',
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: process.env.DASHSCOPE_MODEL || 'qwen3-max-preview',
      priority: parsePriority(process.env.DASHSCOPE_TEXT_PRIORITY, 20),
    },
  },

  // 图片生成提供商配置
  imageProviders: {
    modelscope: {
      enabled: (process.env.MODELSCOPE_IMAGE_ENABLED
        ? process.env.MODELSCOPE_IMAGE_ENABLED === 'true'
        : !!(process.env.MODELSCOPE_IMAGE_API_KEY || process.env.MODELSCOPE_API_KEY)),
      baseURL: sanitizeUrlEnv(process.env.MODELSCOPE_IMAGE_BASE_URL || process.env.MODELSCOPE_BASE_URL || 'https://api-inference.modelscope.cn/v1'),
      apiKey: process.env.MODELSCOPE_IMAGE_API_KEY || process.env.MODELSCOPE_API_KEY,
      fallbackApiKey: process.env.MODELSCOPE_TEXT_API_KEY,
      model: process.env.MODELSCOPE_IMAGE_MODEL || 'Tongyi-MAI/Z-Image-Turbo',
      priority: 1,
    },
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
  const providers = [];
  if (config.textProviders.modelscope.enabled) {
    const base = { ...config.textProviders.modelscope };
    const baseModel = base.model || 'deepseek-ai/DeepSeek-V3.2';
    const p1 = parsePriority(process.env.MODELSCOPE_TEXT_PRIORITY, base.priority);
    const p2 = parsePriority(process.env.MODELSCOPE_GLM47_PRIORITY, p1 + 1);
    const p3 = parsePriority(process.env.MODELSCOPE_QWEN3_235B_PRIORITY, p1 + 2);
    providers.push({ name: 'modelscope', ...base, model: baseModel, priority: p1 });
    providers.push({ name: 'modelscope_glm47', ...base, model: 'ZhipuAI/GLM-4.7', priority: p2 });
    providers.push({ name: 'modelscope_qwen3_235b', ...base, model: 'Qwen/Qwen3-235B-A22B-Instruct-2507', priority: p3 });
  }
  if (config.textProviders.gitcode.enabled) {
    providers.push({ name: 'gitcode', ...config.textProviders.gitcode, priority: config.textProviders.gitcode.priority });
  }
  if (config.textProviders.dashscope.enabled) {
    providers.push({ name: 'dashscope', ...config.textProviders.dashscope, priority: config.textProviders.dashscope.priority });
  }
  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * 获取启用的图片生成提供商（按优先级排序）
 */
function getEnabledImageProviders() {
  const providers = [];
  if (config.imageProviders.modelscope.enabled) {
    providers.push({ name: 'modelscope', ...config.imageProviders.modelscope });
  }
  return providers.sort((a, b) => a.priority - b.priority);
}

module.exports = {
  config,
  getEnabledTextProviders,
  getEnabledImageProviders,
};
