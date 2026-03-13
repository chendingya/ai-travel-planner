const OpenAI = require('openai');
const BaseEmbeddingAdapter = require('./BaseEmbeddingAdapter');

class OpenAICompatibleEmbeddingAdapter extends BaseEmbeddingAdapter {
  maxRetries() {
    const raw = Number(process.env.AI_EMBEDDING_HTTP_MAX_RETRIES || process.env.AI_CHAT_MODEL_HTTP_MAX_RETRIES || '0');
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  requestTimeoutMs() {
    const raw = Number(process.env.AI_EMBEDDING_HTTP_TIMEOUT_MS || this.timeoutMs || 60000);
    return Number.isFinite(raw) && raw > 0 ? Math.max(1000, raw) : 60000;
  }

  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL || undefined,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
    });
  }

  async embed(text, options = {}) {
    const input = String(text || '').trim();
    if (!input) throw new Error('Embedding 输入文本为空');

    const model = typeof options?.model === 'string' && options.model.trim() ? options.model.trim() : this.model;
    const dimensions = Number(options?.dimensions) > 0 ? Number(options.dimensions) : this.dimensions;

    const client = this.createClient();
    const response = await client.embeddings.create({
      model,
      input: [input],
      dimensions,
      encoding_format: 'float',
    });

    const vector = response?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error('Embedding 接口返回格式异常');
    }
    return vector;
  }
}

module.exports = OpenAICompatibleEmbeddingAdapter;
