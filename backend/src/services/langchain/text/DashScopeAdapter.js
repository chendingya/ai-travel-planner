const { ChatOpenAI } = require('@langchain/openai');
const BaseLLMAdapter = require('../base/BaseLLMAdapter');

/**
 * 阿里百炼（DashScope）文本生成适配器
 * 使用通义千问模型
 */
class DashScopeAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'dashscope';
    // 阿里百炼使用特定的 baseURL
    this.baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  requestTimeoutMs() {
    const fromRequest = Number(process.env.AI_CHAT_MODEL_HTTP_TIMEOUT_MS || '');
    const fromInvoke = Number(process.env.AI_CHAT_MODEL_INVOKE_TIMEOUT_MS || '');
    const picked =
      Number.isFinite(fromRequest) && fromRequest > 0 ? fromRequest : Number.isFinite(fromInvoke) && fromInvoke > 0 ? fromInvoke : 60000;
    return Math.max(1000, picked);
  }

  maxRetries() {
    const raw = Number(process.env.AI_CHAT_MODEL_HTTP_MAX_RETRIES || '0');
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  /**
   * 创建 LLM 实例
   */
  createLLM() {
    return new ChatOpenAI({
      apiKey: this.apiKey,
      configuration: {
        baseURL: this.baseURL,
      },
      modelName: this.model,
      temperature: 0.7,
      maxTokens: 4000,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
    });
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const llm = this.createLLM();
      const result = await llm.invoke([{ role: 'user', content: 'Hello' }]);
      return !!result;
    } catch (error) {
      console.error('DashScope connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = DashScopeAdapter;
