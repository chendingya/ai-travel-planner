/**
 * 配置管理模块
 * 集中管理所有环境变量和运行时配置
 */

require("dotenv").config();

// 服务器配置
const serverConfig = {
  port: process.env.PORT || 3001,
};

// 前端运行时配置（仅暴露允许公开的密钥）
const runtimeConfig = {
  supabaseUrl: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY || "",
  amapKey: process.env.PUBLIC_AMAP_KEY || "",
  amapSecurityCode: process.env.PUBLIC_AMAP_SECURITY_CODE || "",
  amapRestKey: process.env.PUBLIC_AMAP_REST_KEY || process.env.AMAP_REST_KEY || "",
};

// Supabase 配置
const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

// AI 配置
const aiConfig = {
  // 魔搭社区
  modelscope: {
    textApiKey: process.env.MODELSCOPE_TEXT_API_KEY || process.env.MODELSCOPE_API_KEY,
    textBaseUrl: process.env.MODELSCOPE_TEXT_BASE_URL || "https://api-inference.modelscope.cn/v1",
    textModel: process.env.MODELSCOPE_TEXT_MODEL || "deepseek-ai/DeepSeek-V3.2-Exp",
    imageApiKey: process.env.MODELSCOPE_API_KEY,
    imageBaseUrl: process.env.MODELSCOPE_BASE_URL || "https://api-inference.modelscope.cn/",
    imageModel: process.env.MODELSCOPE_IMAGE_MODEL || "Tongyi-MAI/Z-Image-Turbo",
  },
  // GitCode
  gitcode: {
    apiKey: process.env.GITCODE_API_KEY || process.env.AI_API_KEY,
    baseUrl: process.env.GITCODE_BASE_URL || process.env.AI_BASE_URL || "https://api.gitcode.com/api/v5",
    model: process.env.GITCODE_MODEL || process.env.AI_MODEL || "deepseek-ai/DeepSeek-V3.2-Exp",
  },
  // 阿里百炼 (DashScope)
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.DASHSCOPE_AI_MODEL || "qwen3-max-preview",
  },
  // 腾讯混元
  hunyuan: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  // 默认图片提供商
  defaultImageProvider: process.env.IMAGE_PROVIDER || "hunyuan",
  // AI 对话配置
  chat: {
    maxHistoryMessages: parseInt(process.env.AI_CHAT_HISTORY_LIMIT || "12"),
  },
};

// MCP 服务器配置
const mcpConfig = {
  servers: {
    "12306-mcp": {
      transport: "stdio",
      command: "npx",
      args: ["-y", "12306-mcp"],
    },
    "bing-cn-mcp-server": {
      transport: "sse",
      url: "https://mcp.api-inference.modelscope.net/23494d15514349/sse",
    },
  },
};

// 检查配置并输出警告
function checkConfig() {
  if (!aiConfig.dashscope.apiKey && !aiConfig.gitcode.apiKey && !aiConfig.modelscope.textApiKey) {
    console.warn("警告: 未配置任何 AI API 密钥，AI 功能将不可用");
  }

  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    console.warn("警告: Supabase 配置不完整，相关功能可能无法正常工作");
  }
}

module.exports = {
  serverConfig,
  runtimeConfig,
  supabaseConfig,
  aiConfig,
  mcpConfig,
  checkConfig,
};
