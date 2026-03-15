class BaseEmbeddingAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = typeof config?.name === 'string' ? config.name.trim() : 'embedding';
    this.baseURL = typeof config?.baseURL === 'string' ? config.baseURL.trim().replace(/\/+$/, '') : '';
    this.model = typeof config?.model === 'string' ? config.model.trim() : '';
    this.apiKey = typeof config?.apiKey === 'string' ? config.apiKey.trim() : '';
    this.enabled = config?.enabled !== false;
    this.dimensions = Number(config?.dimensions) > 0 ? Number(config.dimensions) : 1024;
    this.timeoutMs = Number(config?.timeoutMs) > 0 ? Number(config.timeoutMs) : 60000;
  }

  isAvailable() {
    return this.enabled && !!this.baseURL && !!this.apiKey;
  }

  async embed(_text, _options = {}) {
    throw new Error('embed must be implemented by subclass');
  }

  async testConnection() {
    const vec = await this.embed('ping');
    return Array.isArray(vec) && vec.length > 0;
  }
}

module.exports = BaseEmbeddingAdapter;
