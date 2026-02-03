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

  _sanitizeJsonLike(text) {
    if (typeof text !== 'string') return '';
    let s = text.trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) s = fenced[1].trim();
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      s = s.slice(firstBrace, lastBrace + 1);
    }
    s = s
      .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A\u2018\u2019\u201A\u201B\u0060\u00B4]/g, '"')
      .replace(/[，]/g, ',')
      .replace(/[：]/g, ':')
      .replace(/[、]/g, ',')
      .replace(/\r/g, '')
      .replace(/"+/g, '"')
      .replace(/\[注意[\s\S]*$/g, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z0-9_\u4e00-\u9fa5]+)\s*:/g, '$1"$2":');
    s = s.replace(/:\s*([^"\{\[\d\-][^,\}\]\n]*)/g, (match, value) => {
      const raw = String(value || '').trim();
      if (!raw) return match;
      if (/^(true|false|null)$/i.test(raw)) return `:${raw.toLowerCase()}`;
      return `:"${raw.replace(/"/g, '\\"')}"`;
    });
    return s;
  }

  _normalizePlaylist(raw, travelInfo) {
    const parsed = safeParseJSON(raw, null) || safeParseJSON(this._sanitizeJsonLike(raw), null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const songs = Array.isArray(parsed.songs) ? parsed.songs : [];
      const cleaned = songs
        .map((song) => {
          if (!song || typeof song !== 'object') return null;
          const title = String(song.title || '').trim();
          const artist = String(song.artist || '').trim();
          const genre = String(song.genre || '').trim();
          const reason = String(song.reason || '').trim();
          if (!title && !artist && !genre && !reason) return null;
          return { title, artist, genre, reason };
        })
        .filter(Boolean);
      return {
        destination: parsed.destination ?? travelInfo?.destination ?? '',
        title: parsed.title ?? `${travelInfo?.destination ?? ''} 旅行歌单`,
        description: parsed.description ?? '',
        songs: cleaned,
      };
    }
    return {
      destination: travelInfo?.destination ?? '',
      title: `${travelInfo?.destination ?? ''} 旅行歌单`,
      description: String(raw ?? '').trim(),
      songs: [],
    };
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
   * 生成歌单
   */
  async generatePlaylist(travelInfo, options = {}) {
    try {
      const systemPrompt = `你是一名音乐策划与旅行氛围顾问。请基于旅行信息生成一份专属 BGM 歌单。

要求：
1) 只输出 JSON，不要输出 Markdown，不要使用代码块
2) 输出一个对象，包含 destination、title、description、songs
3) songs 为 10 首歌曲数组，每首包含 title、artist、genre、reason
4) reason 说明这首歌为何适合本次旅行/地点/风格，简洁 1-2 句
5) 使用标准 JSON 双引号，不要使用花式引号
6) 不要输出任何多余字段`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(travelInfo ?? {}, null, 2) },
      ];

      const aiMeta = this._ensureAiMeta(options?.aiMeta);
      if (aiMeta) aiMeta.mcp = false;
      const raw = await this.langChainManager.invokeText(messages, {
        onAdapterStart: async ({ adapter }) => this._recordProvider(aiMeta, adapter, 'text'),
      });
      const playlist = this._normalizePlaylist(raw, travelInfo);

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
