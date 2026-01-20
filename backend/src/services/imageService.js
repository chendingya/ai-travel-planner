/**
 * 图片生成服务
 * 封装图片生成相关的业务逻辑
 */
class ImageService {
  constructor(langChainManager, supabase) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
  }

  _ensureAiMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (!Array.isArray(meta.providers)) meta.providers = [];
    return meta;
  }

  _recordProvider(meta, adapter, kind = 'image') {
    const target = this._ensureAiMeta(meta);
    if (!target) return;
    const provider = typeof adapter?.name === 'string' ? adapter.name : '';
    const model = typeof adapter?.model === 'string' ? adapter.model : '';
    if (!provider && !model) return;
    const exists = target.providers.some((p) => p && p.provider === provider && p.model === model && p.kind === kind);
    if (!exists) target.providers.push({ kind, provider, model });
  }

  sanitizePrompt(input) {
    let s = '';
    if (input === null || input === undefined) s = '';
    else s = typeof input === 'string' ? input : String(input);

    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
    return s;
  }

  limitPrompt(prompt, maxLen) {
    const s = typeof prompt === 'string' ? prompt : String(prompt ?? '');
    if (!maxLen || maxLen <= 0) return s;
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen).trim();
  }

  enhancePrompt(originalPrompt, style) {
    const styleMap = {
      realistic: ', photorealistic, 8K, ultra detailed, professional photography',
      artistic: ', artistic painting, vibrant colors, digital art, detailed',
      cartoon: ', cartoon style, cute, vibrant, colorful, stylized',
      watercolor: ', watercolor painting, soft colors, artistic, flowing',
      sketch: ', pencil sketch, hand drawn, detailed lines, black and white',
    };

    const stylePrompt = styleMap[style] || '';
    return stylePrompt ? `${originalPrompt}${stylePrompt}` : originalPrompt;
  }

  /**
   * 生成图片
   */
  async generateImage(prompt, options = {}) {
    try {
      const shouldLogPrompt = process.env.IMAGE_LOG_PROMPT === 'true';
      const basePrompt = this.sanitizePrompt(prompt);
      const { style: _style, aiMeta: aiMetaRaw, ...forwardOptions } = options || {};

      const buildSentPrompt = (p) =>
        this.limitPrompt(this.enhancePrompt(p, options.style), 2000);

      const enhancedPrompt = buildSentPrompt(basePrompt);

      if (!enhancedPrompt) {
        throw new Error('prompt is invalid');
      }

      if (shouldLogPrompt) {
        const originalLen = typeof prompt === 'string' ? prompt.length : String(prompt ?? '').length;
        console.log('[image] prompt_len', originalLen, 'sanitized_len', basePrompt.length, 'sent_len', enhancedPrompt.length);
        console.log('[image] prompt_sent', enhancedPrompt);
      }

      const aiMeta = this._ensureAiMeta(aiMetaRaw);
      if (aiMeta) aiMeta.mcp = false;
      const result = await this.langChainManager.generateImage(enhancedPrompt, {
        ...forwardOptions,
        onAdapterStart: async ({ adapter }) => this._recordProvider(aiMeta, adapter, 'image'),
      });
      const promptUsed = typeof result?.prompt === 'string' && result.prompt.trim()
        ? result.prompt.trim()
        : enhancedPrompt;

      // 保存生成记录
      await this.saveGenerationRecord({
        prompt: promptUsed,
        provider: result.provider,
        model: result.model,
        url: result.url,
        options: forwardOptions,
      });

      return result;
    } catch (error) {
      console.error('Generate image failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to generate image');
    }
  }

  /**
   * 获取可用的图片提供商列表
   */
  getAvailableProviders() {
    return this.langChainManager.getAvailableImageProviders();
  }

  /**
   * 保存生成记录
   */
  async saveGenerationRecord(record) {
    try {
      await this.supabase
        .from('image_generations')
        .insert([record]);
    } catch (error) {
      console.error('Save image generation record failed:', error);
      // 不抛出错误，避免影响图片生成
    }
  }

  /**
   * 获取生成历史
   */
  async getGenerationHistory(limit = 20) {
    try {
      const { data, error } = await this.supabase
        .from('image_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get generation history failed:', error);
      return [];
    }
  }
}

module.exports = ImageService;
