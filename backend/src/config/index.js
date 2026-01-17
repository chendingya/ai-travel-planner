/**
 * 配置管理
 * 集中管理所有环境变量和配置
 */
require('dotenv').config();

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
      baseURL: process.env.MODELSCOPE_TEXT_BASE_URL,
      apiKey: process.env.MODELSCOPE_TEXT_API_KEY,
      model: process.env.MODELSCOPE_TEXT_MODEL || 'deepseek-ai/DeepSeek-V3.2',
      priority: 1,
    },
    gitcode: {
      enabled: process.env.GITCODE_TEXT_ENABLED === 'true',
      baseURL: process.env.GITCODE_TEXT_BASE_URL,
      apiKey: process.env.GITCODE_TEXT_API_KEY,
      model: process.env.GITCODE_TEXT_MODEL || 'deepseek-ai/DeepSeek-V3.2',
      priority: 2,
    },
    dashscope: {
      enabled: process.env.DASHSCOPE_ENABLED === 'true',
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: process.env.DASHSCOPE_MODEL || 'qwen3-max-preview',
      priority: 3,
    },
  },

  // 图片生成提供商配置
  imageProviders: {
    modelscope: {
      enabled: (process.env.MODELSCOPE_IMAGE_ENABLED
        ? process.env.MODELSCOPE_IMAGE_ENABLED === 'true'
        : !!(process.env.MODELSCOPE_IMAGE_API_KEY || process.env.MODELSCOPE_API_KEY)),
      baseURL: process.env.MODELSCOPE_IMAGE_BASE_URL || process.env.MODELSCOPE_BASE_URL || 'https://api-inference.modelscope.cn/v1',
      apiKey: process.env.MODELSCOPE_IMAGE_API_KEY || process.env.MODELSCOPE_API_KEY,
      model: process.env.MODELSCOPE_IMAGE_MODEL || 'Z-Image-Turbo',
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
    providers.push({ name: 'modelscope', ...config.textProviders.modelscope });
  }
  if (config.textProviders.gitcode.enabled) {
    providers.push({ name: 'gitcode', ...config.textProviders.gitcode });
  }
  if (config.textProviders.dashscope.enabled) {
    providers.push({ name: 'dashscope', ...config.textProviders.dashscope });
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
