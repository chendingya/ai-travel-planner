/**
 * 明信片服务
 * 封装明信片相关的业务逻辑
 */
class PostcardService {
  constructor(promptService, imageService) {
    this.promptService = promptService;
    this.imageService = imageService;
  }

  /**
   * 生成明信片（包含文案和图片）
   */
  async generatePostcard(imageData, imageOptions = {}) {
    try {
      const { aiMeta, ...forwardOptions } = imageOptions || {};
      // 生成文案
      const prompt = await this.promptService.generatePostcardPrompt(imageData, { aiMeta });

      // 生成图片
      const imageResult = await this.imageService.generateImage(
        `旅游明信片，目的地：${imageData.destination}。${prompt}`,
        { ...forwardOptions, aiMeta }
      );

      return {
        text: prompt,
        image: imageResult.url,
        provider: imageResult.provider,
      };
    } catch (error) {
      console.error('Generate postcard failed:', error);
      throw new Error('Failed to generate postcard');
    }
  }
}

module.exports = PostcardService;
