/**
 * 提示词生成服务
 * 封装速记卡片相关的业务逻辑
 */
class PromptService {
  constructor(langChainManager) {
    this.langChainManager = langChainManager;
  }

  sanitizeGeneratedPrompt(input, maxLen = 1500) {
    let s = typeof input === 'string' ? input : String(input ?? '');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
    if (Number.isFinite(maxLen) && maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen).trim();
    return s;
  }

  buildDailySummary(dailyItinerary) {
    const days = Array.isArray(dailyItinerary) ? dailyItinerary : [];
    if (days.length === 0) return '';

    const lines = [];
    days.slice(0, 7).forEach((day, index) => {
      const dayNum = day?.day != null ? String(day.day) : String(index + 1);
      const theme = day?.theme ? String(day.theme).trim() : '';
      const activities = Array.isArray(day?.activities) ? day.activities : [];
      const picks = activities.slice(0, 5).map((a) => {
        const time = a?.time ? String(a.time).trim() : '';
        const location = a?.location ? String(a.location).trim() : '';
        const desc = a?.description ? String(a.description).trim() : '';
        const name = a?.activity ? String(a.activity).trim() : '';
        const parts = [time, location, name || desc].filter(Boolean);
        return parts.join(' ');
      }).filter(Boolean);

      const header = [`第${dayNum}天`, theme].filter(Boolean).join('：');
      if (picks.length > 0) lines.push(`${header}；${picks.join('，')}`);
      else lines.push(header);
    });

    return lines.join('\n');
  }

  /**
   * 生成提示词（速记卡片）
   */
  async generatePrompt(notes) {
    try {
      const systemPrompt = `你是一个专业的旅行海报设计师。请根据用户的旅行计划生成一段适合 AI 绘图的提示词(Prompt)。

要求：
1) 风格：手绘水彩风格，清新明快
2) 构图：垂直分层手账风格，从上至下按日期分区
3) 色调：以蓝、绿为主，粉黄点缀
4) 元素：包含地标建筑、特色美食、自然风光等
5) 文字标注：每日主题和关键活动
6) 整体氛围：轻松活泼、有留白
7) 只输出完整提示词，不要输出解释，不要使用代码块`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(notes ?? '').trim() },
      ];

      const prompt = await this.langChainManager.invokeText(messages, { sensitiveFilterMode: 'soften' });
      return this.sanitizeGeneratedPrompt(prompt, 1500);
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
      const duration = imageData?.duration != null ? String(imageData.duration).trim() : '';
      const dailySummary = this.buildDailySummary(imageData?.dailyItinerary);
      const effectiveStyleSuffix = styleSuffix || '江南传统艺术风格（杭州元素）';

      const systemPrompt = `你是一个专业的旅游明信片设计师，精通江南文化与杭州地方艺术。请根据用户的旅行计划和指定的艺术风格生成一段中文的 AI 绘图提示词。

旅游明信片设计要求：
1) 明信片尺寸比例：4:3 的横向构图，适合明信片布局
2) 主要元素：目的地标志性景观、当地文化符号、特色建筑
3) 艺术风格：${effectiveStyleSuffix}
4) 装饰元素：邮票图案、邮戳、传统花纹、标题文字
5) 色彩风格：符合指定艺术风格的配色，协调统一
6) 整体布局：留有寄语空间，兼具美观和实用性

提示词要求：
- 使用中文描述，不用英文
- 控制在 1500 字符以内（必须）
- 详细描述每个设计元素
- 突出杭州/江南气质（如西湖、钱塘江、龙井茶、宋韵、粉墙黛瓦等可作为参考），但不要堆砌
- 避免涉及政治、战争、屠杀、恐怖主义等敏感内容

请直接返回简洁的中文绘图提示词，无需额外说明。`;

      const userParts = [
        styleName ? `请为以下旅行计划生成【${styleName}】风格的旅游明信片设计提示词：` : '请为以下旅行计划生成旅游明信片设计提示词：',
        destination ? `目的地：${destination}` : '',
        duration ? `旅行天数：${duration}天` : '',
        dailySummary ? `行程亮点：\n${dailySummary}` : '',
        effectiveStyleSuffix ? `艺术风格特点：${effectiveStyleSuffix}` : '',
        destination ? `请生成一段中文的明信片设计提示词，要体现${destination}的特色景观和风格特征。` : '',
      ].filter(Boolean);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts.join('\n') },
      ];

      const prompt = await this.langChainManager.invokeText(messages, { sensitiveFilterMode: 'soften' });
      return this.sanitizeGeneratedPrompt(prompt, 1500);
    } catch (error) {
      console.error('Generate postcard prompt failed:', error);
      throw new Error('Failed to generate postcard prompt');
    }
  }
}

module.exports = PromptService;
