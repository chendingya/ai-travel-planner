/**
 * 图片生成控制器
 */
class ImageController {
  constructor(imageService) {
    this.imageService = imageService;
  }

  normalizeProviderId(provider) {
    const p = provider ? String(provider).trim().toLowerCase() : '';
    if (!p) return '';
    if (p === 'hunyuan') return 'tencent';
    if (p === 'tencent') return 'tencent';
    if (p === 'modelscope') return 'modelscope';
    return p;
  }

  normalizeSizeForProvider(providerName, size) {
    if (!size) return '';
    const s = String(size).trim();
    if (!s) return '';
    if (providerName === 'tencent') {
      return s.includes('x') ? s.replace('x', ':') : s;
    }
    if (providerName === 'modelscope') {
      return s.includes(':') ? s.replace(':', 'x') : s;
    }
    return s;
  }

  mapProviderToClient(providerName) {
    if (providerName === 'tencent') {
      return { id: 'hunyuan', name: '腾讯混元', icon: 'cloud' };
    }
    if (providerName === 'modelscope') {
      return { id: 'modelscope', name: '魔搭社区', icon: 'app' };
    }
    return { id: providerName, name: providerName, icon: 'cloud' };
  }

  /**
   * 生成图片
   */
  async generateImage(req, res) {
    try {
      const { prompt, style, size, resolution, provider } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: 'prompt is required', error: 'prompt is required' });
      }

      const normalizedProvider = this.normalizeProviderId(provider);
      const normalizedSize = this.normalizeSizeForProvider(
        normalizedProvider,
        size || resolution
      );

      const options = {};
      if (style) options.style = style;
      if (normalizedSize) options.size = normalizedSize;
      if (normalizedProvider) options.provider = normalizedProvider;

      const result = await this.imageService.generateImage(prompt, options);
      const clientProvider = this.mapProviderToClient(result.provider);
      res.json({
        ...result,
        imageUrl: result.url,
        provider: clientProvider.id,
      });
    } catch (error) {
      console.error('Generate image error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 获取可用提供商列表
   */
  async getProviders(req, res) {
    try {
      const providers = this.imageService.getAvailableProviders();
      const mapped = (Array.isArray(providers) ? providers : []).map((p) =>
        this.mapProviderToClient(p.name)
      );
      res.json({
        providers: mapped,
        default: mapped[0]?.id || '',
        raw: providers,
      });
    } catch (error) {
      console.error('Get providers error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 获取生成历史
   */
  async getHistory(req, res) {
    try {
      const { limit } = req.query;
      const history = await this.imageService.getGenerationHistory(
        limit ? parseInt(limit) : 20
      );
      res.json(history);
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = ImageController;
