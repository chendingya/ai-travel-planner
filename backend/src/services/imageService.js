/**
 * 图片生成服务
 * 封装图片生成相关的业务逻辑
 */
class ImageService {
  constructor(langChainManager, supabase) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
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
      const enhancedPrompt = this.enhancePrompt(prompt, options.style);
      const { style: _style, ...forwardOptions } = options || {};
      const result = await this.langChainManager.generateImage(enhancedPrompt, forwardOptions);

      // 保存生成记录
      await this.saveGenerationRecord({
        prompt: enhancedPrompt,
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
