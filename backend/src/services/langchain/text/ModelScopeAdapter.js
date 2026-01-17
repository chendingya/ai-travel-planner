const { ChatOpenAI } = require('@langchain/openai');
const BaseLLMAdapter = require('../base/BaseLLMAdapter');

/**
 * ModelScope 文本生成适配器
 * 使用 ModelScope 的 DeepSeek 模型
 */
class ModelScopeAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = 'modelscope';
    this.baseURL = config.baseURL;
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
      console.error('ModelScope connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = ModelScopeAdapter;
