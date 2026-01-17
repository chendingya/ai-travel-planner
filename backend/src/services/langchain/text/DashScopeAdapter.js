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
