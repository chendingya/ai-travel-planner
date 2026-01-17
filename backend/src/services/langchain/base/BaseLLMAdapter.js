/**
 * LLM 适配器基类
 * 所有文本生成适配器都必须继承此类
 */
class BaseLLMAdapter {
  constructor(config) {
    this.config = config;
    this.name = 'base';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.enabled = config.enabled;
  }

  /**
   * 创建 LLM 实例
   */
  createLLM() {
    throw new Error('createLLM must be implemented by subclass');
  }

  /**
   * 统一文本调用入口
   * @param {Array<{role: string, content: string}>} messages
   * @returns {Promise<string>}
   */
  async invoke(messages) {
    const llm = this.createLLM();
    const result = await llm.invoke(messages);
    const content = result && typeof result === 'object' ? result.content : result;

    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
          return '';
        })
        .join('');
    }
    if (content == null) return '';
    return String(content);
  }

  /**
   * 测试连接
   * @returns {Promise<Boolean>} - 返回连接是否成功
   */
  async testConnection() {
    throw new Error('testConnection must be implemented by subclass');
  }

  /**
   * 检查适配器是否可用
   * @returns {Boolean}
   */
  isAvailable() {
    return this.enabled && !!this.apiKey;
  }
}

module.exports = BaseLLMAdapter;
