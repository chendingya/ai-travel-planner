/**
 * 提示词生成服务
 * 封装速记卡片相关的业务逻辑
 */
class PromptService {
  constructor(langChainManager) {
    this.langChainManager = langChainManager;
  }

  /**
   * 生成提示词（速记卡片）
   */
  async generatePrompt(notes) {
    try {
      const systemPrompt = `你是一名擅长提示词工程的插画与摄影指导。请把用户提供的旅行速记整理为适合图像生成模型的提示词。

要求：
1) 只输出一段提示词，不要输出解释，不要使用代码块
2) 以英文为主，必要时可以夹带少量中文专有名词
3) 保持画面信息清晰：主体、场景、光线、色彩、构图、质感
4) 避免出现任何 JSON`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(notes ?? '').trim() },
      ];

      const prompt = await this.langChainManager.invokeText(messages);
      return String(prompt ?? '').trim();
    } catch (error) {
      console.error('Generate prompt failed:', error);
      throw new Error('Failed to generate prompt');
    }
  }

  /**
   * 生成明信片文案
   */
  async generatePostcardPrompt(imageData) {
    try {
      const destination = imageData?.destination ? String(imageData.destination).trim() : '';
      const styleName = imageData?.styleName ? String(imageData.styleName).trim() : '';
      const styleSuffix = imageData?.styleSuffix ? String(imageData.styleSuffix).trim() : '';

      const systemPrompt = `你是一名专业的旅行明信片文案与画面创作助手。请为图像生成模型输出一段高质量提示词，用于生成旅行明信片插画/照片风格画面。

要求：
1) 只输出一段提示词，不要输出解释，不要使用代码块
2) 以英文为主，必要时可以夹带少量中文地名
3) 提示词要包含：明信片构图、目的地标志性元素、氛围、光影、细节
4) 不要输出 JSON`;

      const userParts = [
        destination ? `Destination: ${destination}` : '',
        styleName ? `Style: ${styleName}` : '',
        styleSuffix ? `Style suffix: ${styleSuffix}` : '',
        imageData?.duration != null ? `Duration(days): ${imageData.duration}` : '',
        Array.isArray(imageData?.dailyItinerary) ? `Daily itinerary: ${JSON.stringify(imageData.dailyItinerary).slice(0, 2000)}` : '',
      ].filter(Boolean);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts.join('\n') },
      ];

      const prompt = await this.langChainManager.invokeText(messages);
      return String(prompt ?? '').trim();
    } catch (error) {
      console.error('Generate postcard prompt failed:', error);
      throw new Error('Failed to generate postcard prompt');
    }
  }
}

module.exports = PromptService;
