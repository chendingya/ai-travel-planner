class ProviderConfigController {
  constructor(providerConfigService) {
    this.providerConfigService = providerConfigService;
  }

  _errorPayload(error, fallback = '内部服务错误') {
    const message = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : fallback;
    return {
      message,
      error: message,
      code: typeof error?.code === 'string' ? error.code : '',
      details: Array.isArray(error?.details) ? error.details : [],
      results: Array.isArray(error?.results) ? error.results : [],
    };
  }

  async getConfig(req, res) {
    try {
      res.locals.aiMeta = { mcp: false, providers: [] };
      const config = await this.providerConfigService.getConfig();
      res.json(config);
    } catch (error) {
      console.error('Get provider config error:', error);
      const payload = this._errorPayload(error, '获取配置失败');
      res.status(error?.status || 500).json(payload);
    }
  }

  async testProvider(req, res) {
    try {
      res.locals.aiMeta = { mcp: false, providers: [] };
      const result = await this.providerConfigService.testSingle(req.body || {});
      res.json(result);
    } catch (error) {
      console.error('Test provider config error:', error);
      const payload = this._errorPayload(error, '提供商测试失败');
      res.status(error?.status || 500).json(payload);
    }
  }

  async updateConfig(req, res) {
    try {
      res.locals.aiMeta = { mcp: false, providers: [] };
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const saved = await this.providerConfigService.updateConfig(req.body || {}, userId);
      res.json(saved);
    } catch (error) {
      console.error('Update provider config error:', error);
      const payload = this._errorPayload(error, '保存配置失败');
      res.status(error?.status || 500).json(payload);
    }
  }
}

module.exports = ProviderConfigController;
