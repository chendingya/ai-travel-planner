/**
 * 分享文案服务
 * 封装分享文案相关的业务逻辑
 */
class ShareService {
  constructor(langChainManager) {
    this.langChainManager = langChainManager;
  }

  _ensureAiMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (!Array.isArray(meta.providers)) meta.providers = [];
    return meta;
  }

  _recordProvider(meta, adapter, kind = 'text') {
    const target = this._ensureAiMeta(meta);
    if (!target) return;
    const provider = typeof adapter?.name === 'string' ? adapter.name : '';
    const model = typeof adapter?.model === 'string' ? adapter.model : '';
    if (!provider && !model) return;
    const exists = target.providers.some((p) => p && p.provider === provider && p.model === model && p.kind === kind);
    if (!exists) target.providers.push({ kind, provider, model });
  }

  /**
   * 生成分享文案
   */
  async generateShareContent(shareInfo, options = {}) {
    try {
      const destination = shareInfo?.destination ? String(shareInfo.destination).trim() : '';
      const platform = shareInfo?.platform ? String(shareInfo.platform).trim() : '';
      const emotion = shareInfo?.emotion ? String(shareInfo.emotion).trim() : '';
      const highlights = Array.isArray(shareInfo?.highlights) ? shareInfo.highlights : [];
      const dailyItinerary = Array.isArray(shareInfo?.dailyItinerary) ? shareInfo.dailyItinerary : [];
      const duration = shareInfo?.duration != null ? shareInfo.duration : null;

      const systemPrompt = `你是一名擅长社交媒体内容创作的旅行博主。请根据用户的旅行计划生成一段可直接发布的分享文案。

要求：
1) 只输出文案正文，不要输出解释，不要输出 JSON，不要使用代码块
2) 语言：中文
3) 贴合平台语境与情感基调，适度使用表情符号与分段
4) 必须包含用户选择的重点地点（highlights）
5) 末尾给出 6-12 个相关话题标签（#xxx）`;

      const userPayload = {
        destination,
        duration,
        platform,
        emotion,
        highlights,
        dailyItinerary,
      };

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload, null, 2) },
      ];

      const aiMeta = this._ensureAiMeta(options?.aiMeta);
      if (aiMeta) aiMeta.mcp = false;
      const content = await this.langChainManager.invokeText(messages, {
        onAdapterStart: async ({ adapter }) => this._recordProvider(aiMeta, adapter, 'text'),
      });
      return String(content ?? '').trim();
    } catch (error) {
      console.error('Generate share content failed:', error);
      throw new Error('Failed to generate share content');
    }
  }
}

module.exports = ShareService;
