const OpenAI = require('openai');
const BaseImageAdapter = require('../base/BaseImageAdapter');

/**
 * OpenAI 兼容图片生成适配器
 */
class OpenAICompatibleImageAdapter extends BaseImageAdapter {
  constructor(config) {
    super(config);
    this.name = typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : 'openai-image';
    const raw = typeof config?.baseURL === 'string' ? config.baseURL.trim() : '';
    this.baseURL = raw.replace(/\/+$/, '');
  }

  requestTimeoutMs() {
    const raw = Number(process.env.AI_IMAGE_HTTP_TIMEOUT_MS || process.env.AI_CHAT_MODEL_HTTP_TIMEOUT_MS || '60000');
    return Number.isFinite(raw) && raw > 0 ? Math.max(1000, raw) : 60000;
  }

  maxRetries() {
    const raw = Number(process.env.AI_IMAGE_HTTP_MAX_RETRIES || '0');
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  normalizeSize(value) {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '1024x1024';
    return s.includes(':') ? s.replace(':', 'x') : s;
  }

  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL || undefined,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
    });
  }

  extractImageUrl(resp) {
    const first = Array.isArray(resp?.data) ? resp.data[0] : null;
    if (!first || typeof first !== 'object') return '';
    if (typeof first.url === 'string' && first.url.trim()) return first.url.trim();
    if (typeof first.b64_json === 'string' && first.b64_json.trim()) {
      return `data:image/png;base64,${first.b64_json.trim()}`;
    }
    return '';
  }

  async generateImage(prompt, options = {}) {
    const model = typeof this.model === 'string' ? this.model.trim() : '';
    if (!model) throw new Error('Image model is not configured');

    const client = this.createClient();
    const size = this.normalizeSize(options.size || options.resolution);
    const response = await client.images.generate({
      model,
      prompt: String(prompt || ''),
      size,
      n: 1,
    });

    const imageUrl = this.extractImageUrl(response);
    if (!imageUrl) {
      throw new Error('IMAGE_GENERATION_FAILED');
    }

    return {
      url: imageUrl,
      provider: this.name,
      model: this.model,
      prompt: String(prompt || ''),
    };
  }

  async testConnection() {
    await this.generateImage('test', { size: '512x512' });
    return true;
  }

  isAvailable() {
    const model = typeof this.model === 'string' ? this.model.trim() : '';
    return this.enabled && !!this.apiKey && !!model && !this.isPlaceholderCredential(this.apiKey);
  }
}

module.exports = OpenAICompatibleImageAdapter;
