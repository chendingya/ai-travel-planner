const { ChatOpenAI } = require('@langchain/openai');
const BaseLLMAdapter = require('../base/BaseLLMAdapter');

/**
 * OpenAI 兼容文本生成适配器
 */
class OpenAICompatibleAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    this.name = typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : 'openai';
    const raw = typeof config?.baseURL === 'string' ? config.baseURL.trim() : '';
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
    this.baseURL = unwrapped.replace(/\s+/g, '').replace(/[`"']/g, '');
  }

  isAvailable() {
    return this.enabled && !!this.apiKey;
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
      configuration: this.baseURL ? { baseURL: this.baseURL } : undefined,
      modelName: this.model,
      temperature: 0.7,
      maxTokens: 4000,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
      streaming: true,
    });
  }

  _isProviderProtocolError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes("cannot read properties of undefined") && msg.includes("reading 'message'")) return true;
    if (msg.includes('invalid json response body')) return true;
    if (msg.includes('unexpected token') && msg.includes('json')) return true;
    return false;
  }

  async _invokeViaOpenAI(messages) {
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL || undefined,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
    });
    const resp = await client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    });
    const choice = Array.isArray(resp?.choices) ? resp.choices[0] : null;
    const normalizeContent = (value) => {
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) {
        return value
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
              if (typeof part.text === 'string') return part.text;
              if (typeof part.content === 'string') return part.content;
              if (typeof part.value === 'string') return part.value;
            }
            return '';
          })
          .join('');
      }
      if (value && typeof value === 'object') {
        if (typeof value.content === 'string') return value.content;
        if (typeof value.text === 'string') return value.text;
      }
      return '';
    };
    const content =
      normalizeContent(choice?.message?.content) ||
      normalizeContent(choice?.delta?.content) ||
      (choice && typeof choice.text === 'string' ? choice.text : '') ||
      (typeof resp?.output_text === 'string' ? resp.output_text : '');
    if (content && content.trim()) return content;
    const streamed = await this._invokeViaOpenAIStream({ client, messages });
    if (streamed && streamed.trim()) return streamed;
    throw new Error('MODEL_EMPTY_RESPONSE');
  }

  async _invokeViaOpenAIStream({ client, messages }) {
    const stream = await client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    });
    let text = '';
    for await (const chunk of stream) {
      const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : null;
      const delta = choice?.delta;
      const piece = (delta && typeof delta.content === 'string' ? delta.content : '') ||
        (choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '');
      if (piece) text += piece;
    }
    return text;
  }

  async invoke(messages) {
    try {
      return await super.invoke(messages);
    } catch (error) {
      if (!this._isProviderProtocolError(error)) throw error;
      return await this._invokeViaOpenAI(messages);
    }
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
      console.error('Provider connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = OpenAICompatibleAdapter;
