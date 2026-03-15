class BaseRerankAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = typeof config?.name === 'string' ? config.name.trim() : 'rerank';
    this.baseURL = typeof config?.baseURL === 'string' ? config.baseURL.trim().replace(/\/+$/, '') : '';
    this.path = typeof config?.path === 'string' && config.path.trim() ? config.path.trim() : '/rerank';
    this.model = typeof config?.model === 'string' ? config.model.trim() : '';
    this.apiKey = typeof config?.apiKey === 'string' ? config.apiKey.trim() : '';
    this.enabled = config?.enabled !== false;
    this.timeoutMs = Number(config?.timeoutMs) > 0 ? Number(config.timeoutMs) : 10000;
  }

  isAvailable() {
    return this.enabled && !!this.baseURL;
  }

  async rerank(_query, _documents) {
    throw new Error('rerank must be implemented by subclass');
  }

  async testConnection() {
    const result = await this.rerank('ping', ['ping']);
    return Array.isArray(result) && result.length > 0;
  }
}

module.exports = BaseRerankAdapter;
