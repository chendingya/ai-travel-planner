/**
 * BGM歌单服务
 * 封装歌单生成相关的业务逻辑
 */
const { safeParseJSON } = require('../utils/helpers');

class PlaylistService {
  constructor(langChainManager, supabase) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
  }

  /**
   * 生成歌单
   */
  async generatePlaylist(travelInfo) {
    try {
      const systemPrompt = `你是一名音乐策划与旅行氛围顾问。请基于旅行信息生成一份专属 BGM 歌单。

要求：
1) 只输出 JSON，不要输出 Markdown，不要使用代码块
2) 输出一个对象，包含 destination、title、description、songs
3) songs 为 10 首歌曲数组，每首包含 title、artist、genre、reason
4) reason 说明这首歌为何适合本次旅行/地点/风格，简洁 1-2 句
5) 不要输出任何多余字段`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(travelInfo ?? {}, null, 2) },
      ];

      const raw = await this.langChainManager.invokeText(messages);
      const parsed = safeParseJSON(raw, null);
      const playlist = (() => {
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const songs = Array.isArray(parsed.songs) ? parsed.songs : [];
          return {
            destination: parsed.destination ?? travelInfo?.destination ?? '',
            title: parsed.title ?? `${travelInfo?.destination ?? ''} 旅行歌单`,
            description: parsed.description ?? '',
            songs,
          };
        }
        return {
          destination: travelInfo?.destination ?? '',
          title: `${travelInfo?.destination ?? ''} 旅行歌单`,
          description: String(raw ?? '').trim(),
          songs: [],
        };
      })();

      // 保存生成记录
      await this.saveGenerationRecord({
        destination: travelInfo.destination,
        playlist,
      });

      return playlist;
    } catch (error) {
      console.error('Generate playlist failed:', error);
      throw new Error('Failed to generate playlist');
    }
  }

  /**
   * 保存生成记录
   */
  async saveGenerationRecord(record) {
    try {
      await this.supabase
        .from('playlist_generations')
        .insert([record]);
    } catch (error) {
      console.error('Save playlist generation record failed:', error);
      // 不抛出错误，避免影响歌单生成
    }
  }

  /**
   * 获取生成历史
   */
  async getGenerationHistory(limit = 20) {
    try {
      const { data, error } = await this.supabase
        .from('playlist_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get playlist history failed:', error);
      return [];
    }
  }
}

module.exports = PlaylistService;
