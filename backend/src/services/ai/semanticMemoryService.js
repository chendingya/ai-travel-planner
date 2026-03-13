const crypto = require('crypto');
const OpenAI = require('openai');

const ALLOWED_MEMORY_TYPES = ['preference', 'constraint', 'experience', 'interest'];
const EMBEDDING_DIM = 4000;
const DEFAULT_BASE_URL = 'https://api-inference.modelscope.cn/v1';
const DEFAULT_MODEL = 'Qwen/Qwen3-Embedding-8B';

class SemanticMemoryService {
  constructor({ supabase, langChainManager, requireUserId, truncateText }) {
    this.supabase = supabase;
    this.langChainManager = langChainManager;
    this.requireUserId = requireUserId;
    this.truncateText = truncateText;
    this._embeddingClientCache = new Map();
  }

  semanticMemoryConfig() {
    const enabledRaw = String(process.env.AI_CHAT_SEMANTIC_MEMORY_ENABLED || 'true').trim().toLowerCase();
    const enabled = !(enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'off');
    const topKRaw = Number(process.env.AI_CHAT_SEMANTIC_MEMORY_TOP_K || '4');
    const minSimilarityRaw = Number(process.env.AI_CHAT_SEMANTIC_MEMORY_MIN_SIMILARITY || '0.65');
    const maxItemsRaw = Number(process.env.AI_CHAT_SEMANTIC_MEMORY_MAX_ITEMS_PER_TURN || '3');
    const minConfidenceRaw = Number(
      process.env.AI_CHAT_SEMANTIC_MEMORY_MIN_CONFIDENCE || process.env.AI_CHAT_LONG_MEMORY_MIN_CONFIDENCE || '0.75'
    );

    return {
      enabled,
      topK: Number.isFinite(topKRaw) && topKRaw > 0 ? Math.min(8, Math.floor(topKRaw)) : 4,
      minSimilarity: Number.isFinite(minSimilarityRaw) ? Math.max(0, Math.min(1, minSimilarityRaw)) : 0.65,
      maxItemsPerTurn: Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? Math.min(8, Math.floor(maxItemsRaw)) : 3,
      minConfidence: Number.isFinite(minConfidenceRaw) ? Math.max(0, Math.min(1, minConfidenceRaw)) : 0.75,
      embeddingBaseURL: this._sanitizeUrl(process.env.AI_EMBEDDING_BASE_URL || DEFAULT_BASE_URL),
      embeddingModel: String(process.env.AI_EMBEDDING_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      embeddingApiKey: String(process.env.AI_EMBEDDING_API_KEY || '').trim(),
      embeddingDim: (() => {
        const raw = Number(process.env.AI_EMBEDDING_DIM || EMBEDDING_DIM);
        if (!Number.isFinite(raw)) return EMBEDDING_DIM;
        return Math.max(32, Math.min(4000, Math.floor(raw)));
      })(),
    };
  }

  _sanitizeUrl(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    return raw.replace(/[`"']/g, '').replace(/\s+/g, '').replace(/\/+$/, '');
  }

  _isMissingTableError(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    return code === '42P01' || code === 'PGRST205';
  }

  _isMissingRpcError(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    return code === '42883' || code === 'PGRST202' || code === 'PGRST205';
  }

  _normalizeText(value, maxChars = 1000) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return this.truncateText(text, maxChars);
  }

  _normalizeTag(tag) {
    const value = this._normalizeText(tag, 24);
    if (!value) return '';
    return value;
  }

  _normalizeTags(tags) {
    const list = Array.isArray(tags)
      ? tags
      : typeof tags === 'string'
        ? tags.split(/[，,、|/]/g)
        : [];
    const normalized = [];
    const seen = new Set();
    for (const item of list) {
      const value = this._normalizeTag(item);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(value);
    }
    return normalized.slice(0, 6);
  }

  _normalizeMemoryType(value) {
    const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ALLOWED_MEMORY_TYPES.includes(type) ? type : '';
  }

  _fingerprint(text) {
    const normalized = this._normalizeText(text, 2000).toLowerCase();
    if (!normalized) return '';
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  parseJsonLoose(text) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {}
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match?.[0]) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  _pickEmbeddingProvider(config) {
    if (config.embeddingApiKey) {
      return {
        apiKey: config.embeddingApiKey,
        baseURL: config.embeddingBaseURL,
        model: config.embeddingModel,
      };
    }

    const targetBaseURL = this._sanitizeUrl(config.embeddingBaseURL || DEFAULT_BASE_URL);
    const adapters = Array.isArray(this.langChainManager?.textAdapters) ? this.langChainManager.textAdapters : [];
    const exact = adapters.find((adapter) => {
      const apiKey = typeof adapter?.apiKey === 'string' ? adapter.apiKey.trim() : '';
      const baseURL = this._sanitizeUrl(adapter?.baseURL || '');
      return !!apiKey && baseURL === targetBaseURL;
    });
    if (exact) {
      return {
        apiKey: exact.apiKey,
        baseURL: exact.baseURL || targetBaseURL,
        model: config.embeddingModel,
      };
    }

    const fallback = adapters.find((adapter) => {
      const apiKey = typeof adapter?.apiKey === 'string' ? adapter.apiKey.trim() : '';
      const baseURL = this._sanitizeUrl(adapter?.baseURL || '');
      return !!apiKey && baseURL.includes('api-inference.modelscope.cn');
    });
    if (!fallback) return null;
    return {
      apiKey: fallback.apiKey,
      baseURL: fallback.baseURL || targetBaseURL,
      model: config.embeddingModel,
    };
  }

  isAvailable() {
    const config = this.semanticMemoryConfig();
    if (!config.enabled) return false;
    return !!this._pickEmbeddingProvider(config);
  }

  _embeddingClient(provider) {
    const key = `${provider.baseURL}|${provider.model}|${provider.apiKey}`;
    if (this._embeddingClientCache.has(key)) return this._embeddingClientCache.get(key);
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL || undefined,
      timeout: Number(process.env.AI_CHAT_MODEL_HTTP_TIMEOUT_MS || '60000'),
      maxRetries: 0,
    });
    this._embeddingClientCache.set(key, client);
    return client;
  }

  async createEmbedding(text) {
    const normalized = this._normalizeText(text, 4000);
    if (!normalized) throw new Error('semantic memory text is empty');
    const config = this.semanticMemoryConfig();
    const provider = this._pickEmbeddingProvider(config);
    if (!provider) {
      const err = new Error('SEMANTIC_MEMORY_EMBEDDING_UNAVAILABLE');
      err.code = 'SEMANTIC_MEMORY_EMBEDDING_UNAVAILABLE';
      throw err;
    }
    const client = this._embeddingClient(provider);
    const response = await client.embeddings.create({
      model: provider.model,
      input: normalized,
      encoding_format: 'float',
      dimensions: config.embeddingDim,
    });
    const vector = Array.isArray(response?.data) ? response.data[0]?.embedding : null;
    if (!Array.isArray(vector) || vector.length !== config.embeddingDim) {
      const err = new Error(`Unexpected embedding dimension: ${Array.isArray(vector) ? vector.length : 'unknown'}`);
      err.code = 'SEMANTIC_MEMORY_EMBEDDING_DIMENSION_INVALID';
      throw err;
    }
    return vector;
  }

  normalizeSemanticCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    const memoryType = this._normalizeMemoryType(candidate.memory_type || candidate.type);
    const memoryText = this._normalizeText(
      candidate.memory_text || candidate.text || candidate.memory || candidate.value,
      800
    );
    if (!memoryType || !memoryText) return null;

    const confidenceRaw = Number(candidate.confidence);
    const salienceRaw = Number(candidate.salience);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
    const salience = Number.isFinite(salienceRaw) ? Math.max(0, Math.min(1, salienceRaw)) : confidence || 0.7;
    const tags = this._normalizeTags(candidate.tags);
    const memoryFingerprint = this._fingerprint(memoryText);
    if (!memoryFingerprint) return null;

    return {
      memory_text: memoryText,
      memory_type: memoryType,
      tags,
      confidence,
      salience,
      memory_fingerprint: memoryFingerprint,
      metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
    };
  }

  async extractSemanticMemoryCandidates({ userMessage, assistantMessage, structuredMemories }) {
    const config = this.semanticMemoryConfig();
    if (!config.enabled) return [];
    const provider = this._pickEmbeddingProvider(config);
    if (!provider) return [];

    const structured = Array.isArray(structuredMemories)
      ? structuredMemories
          .map((item) => {
            const key = typeof item?.memory_key === 'string' ? item.memory_key : '';
            const raw = item?.memory_value?.text ?? item?.memory_value;
            const value = this._normalizeText(raw, 160);
            if (!key || !value) return '';
            return `${key}: ${value}`;
          })
          .filter(Boolean)
      : [];

    const prompt = [
      '请从本轮对话中提取适合长期保存的用户语义画像记忆。',
      `只允许 memory_type 为: ${ALLOWED_MEMORY_TYPES.join(', ')}`,
      `最多输出 ${config.maxItemsPerTurn} 条。`,
      '只保留跨会话稳定、可复用的信息，不要提取一次性任务、当前临时安排、工具执行结果。',
      '标签 tags 应简短，适合用于画像聚类。',
      '仅输出 JSON，格式：{"memories":[{"memory_text":"...","memory_type":"preference","tags":["..."],"confidence":0-1,"salience":0-1}]}',
      structured.length ? `已有结构化长期记忆：${JSON.stringify(structured)}` : '已有结构化长期记忆：[]',
      `用户消息：${this._normalizeText(userMessage, 2000)}`,
      `助手回复：${this._normalizeText(assistantMessage, 2000)}`,
    ].join('\n\n');

    const raw = await this.langChainManager.invokeText([
      { role: 'system', content: '你是严格的信息抽取器，只返回 JSON。' },
      { role: 'user', content: prompt },
    ]);
    const parsed = this.parseJsonLoose(raw);
    const list = Array.isArray(parsed?.memories) ? parsed.memories : Array.isArray(parsed) ? parsed : [];
    const dedup = new Map();
    for (const item of list) {
      const normalized = this.normalizeSemanticCandidate(item);
      if (!normalized) continue;
      if (normalized.confidence < config.minConfidence) continue;
      if (!dedup.has(normalized.memory_fingerprint)) dedup.set(normalized.memory_fingerprint, normalized);
    }
    return Array.from(dedup.values()).slice(0, config.maxItemsPerTurn);
  }

  async upsertSemanticMemories({ userId, sessionId, candidates }) {
    const effectiveUserId = this.requireUserId(userId);
    const rows = Array.isArray(candidates) ? candidates : [];
    if (!rows.length) return 0;

    let successCount = 0;
    for (const item of rows) {
      try {
        const embedding = await this.createEmbedding(item.memory_text);
        const payload = {
          user_id: effectiveUserId,
          memory_text: item.memory_text,
          memory_type: item.memory_type,
          tags: item.tags,
          confidence: item.confidence,
          salience: item.salience,
          source_session_id: typeof sessionId === 'string' ? sessionId : '',
          memory_fingerprint: item.memory_fingerprint,
          metadata: item.metadata || {},
          embedding,
          updated_at: new Date().toISOString(),
        };
        const { error } = await this.supabase
          .from('ai_user_semantic_memories')
          .upsert(payload, { onConflict: 'user_id,memory_fingerprint' });
        if (!error) {
          successCount += 1;
          continue;
        }
        if (this._isMissingTableError(error)) return successCount;
        throw error;
      } catch (error) {
        console.warn('Upsert semantic memory failed:', error?.message || error);
      }
    }
    return successCount;
  }

  async _countSemanticMemories(userId) {
    try {
      const { count, error } = await this.supabase
        .from('ai_user_semantic_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) {
        if (this._isMissingTableError(error)) return 0;
        throw error;
      }
      return Number.isFinite(Number(count)) ? Number(count) : 0;
    } catch (_) {
      return 0;
    }
  }

  async _markRecalled(userId, memories) {
    const effectiveUserId = this.requireUserId(userId);
    const rows = Array.isArray(memories) ? memories : [];
    const now = new Date().toISOString();
    await Promise.all(
      rows
        .filter((item) => item && item.id)
        .map(async (item) => {
          const currentRecallCount = Number(item.recall_count);
          const nextRecallCount = Number.isFinite(currentRecallCount) ? currentRecallCount + 1 : 1;
          try {
            const { error } = await this.supabase
              .from('ai_user_semantic_memories')
              .update({
                recall_count: nextRecallCount,
                last_recalled_at: now,
              })
              .eq('user_id', effectiveUserId)
              .eq('id', item.id);
            if (error && !this._isMissingTableError(error)) throw error;
          } catch (error) {
            console.warn('Mark semantic memory recalled failed:', error?.message || error);
          }
        })
    );
  }

  formatSemanticMemoryBlock(memories) {
    const list = Array.isArray(memories) ? memories : [];
    if (!list.length) return '';
    const lines = list
      .map((item) => {
        const text = this._normalizeText(item?.memory_text, 240);
        if (!text) return '';
        const type = this._normalizeMemoryType(item?.memory_type) || 'preference';
        const tags = this._normalizeTags(item?.tags);
        const tagsText = tags.length ? ` [标签: ${tags.join(' / ')}]` : '';
        return `- (${type}) ${text}${tagsText}`;
      })
      .filter(Boolean);
    if (!lines.length) return '';
    return ['以下是与当前问题相关的用户语义画像记忆（跨会话检索）：', ...lines].join('\n');
  }

  async searchRelevantMemories({ userId, queryText }) {
    const effectiveUserId = this.requireUserId(userId);
    const config = this.semanticMemoryConfig();
    const normalizedQuery = this._normalizeText(queryText, 2000);
    if (!config.enabled || !normalizedQuery) {
      return { memories: [], totalCount: 0, available: false };
    }

    const provider = this._pickEmbeddingProvider(config);
    if (!provider) {
      return { memories: [], totalCount: 0, available: false };
    }

    try {
      const queryEmbedding = await this.createEmbedding(normalizedQuery);
      const { data, error } = await this.supabase.rpc('match_ai_user_semantic_memories', {
        query_embedding: queryEmbedding,
        query_user_id: effectiveUserId,
        match_count: config.topK,
        min_similarity: config.minSimilarity,
      });
      if (error) {
        if (this._isMissingRpcError(error) || this._isMissingTableError(error)) {
          return { memories: [], totalCount: 0, available: false };
        }
        throw error;
      }
      const memories = Array.isArray(data)
        ? data.map((item) => ({
            id: item.id,
            memory_text: this._normalizeText(item.memory_text, 800),
            memory_type: this._normalizeMemoryType(item.memory_type) || 'preference',
            tags: this._normalizeTags(item.tags),
            confidence: Number(item.confidence || 0),
            salience: Number(item.salience || 0),
            similarity: Number(item.similarity || 0),
            recall_count: Number(item.recall_count || 0),
            last_recalled_at: item.last_recalled_at || '',
            updated_at: item.updated_at || '',
          }))
        : [];
      await this._markRecalled(effectiveUserId, memories);
      const totalCount = await this._countSemanticMemories(effectiveUserId);
      return { memories, totalCount, available: true };
    } catch (error) {
      console.warn('Search semantic memories failed:', error?.message || error);
      return { memories: [], totalCount: 0, available: false };
    }
  }

  async loadAllSemanticMemories(userId) {
    const effectiveUserId = this.requireUserId(userId);
    const config = this.semanticMemoryConfig();
    if (!config.enabled) return [];
    const { data, error } = await this.supabase
      .from('ai_user_semantic_memories')
      .select(
        'id, memory_text, memory_type, tags, confidence, salience, recall_count, last_recalled_at, updated_at, created_at'
      )
      .eq('user_id', effectiveUserId)
      .order('salience', { ascending: false })
      .order('updated_at', { ascending: false });
    if (!error) return Array.isArray(data) ? data : [];
    if (this._isMissingTableError(error)) return [];
    throw error;
  }

  buildProfileSummary(structuredMemories, semanticMemories) {
    const structured = Array.isArray(structuredMemories) ? structuredMemories : [];
    const semantic = Array.isArray(semanticMemories) ? semanticMemories : [];
    if (!structured.length && !semantic.length) return '暂未形成语义画像记忆。';

    const summaryParts = [];
    const structuredText = structured
      .map((item) => {
        const key = typeof item?.memory_key === 'string' ? item.memory_key : '';
        const value = this._normalizeText(item?.memory_value?.text ?? item?.memory_value, 80);
        if (!key || !value) return '';
        return `${key}: ${value}`;
      })
      .filter(Boolean)
      .slice(0, 3);
    if (structuredText.length) {
      summaryParts.push(`结构化偏好集中在 ${structuredText.join('；')}`);
    }

    const highlights = semantic
      .map((item) => this._normalizeText(item?.memory_text, 90))
      .filter(Boolean)
      .slice(0, 3);
    if (highlights.length) {
      summaryParts.push(`语义画像显示用户长期关注 ${highlights.join('；')}`);
    }

    return summaryParts.join('。') || '暂未形成语义画像记忆。';
  }

  async getSemanticProfile(userId, structuredMemories = []) {
    const memories = await this.loadAllSemanticMemories(userId);
    const tagCounter = new Map();
    let recalledLast30d = 0;
    const now = Date.now();

    for (const item of memories) {
      const tags = this._normalizeTags(item?.tags);
      for (const tag of tags) {
        tagCounter.set(tag, (tagCounter.get(tag) || 0) + 1);
      }
      const recalledAt = item?.last_recalled_at ? new Date(item.last_recalled_at).getTime() : NaN;
      if (Number.isFinite(recalledAt) && now - recalledAt <= 30 * 24 * 60 * 60 * 1000) {
        recalledLast30d += 1;
      }
    }

    const tags = Array.from(tagCounter.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([tag]) => tag)
      .slice(0, 10);

    const highlights = memories
      .slice()
      .sort((a, b) => Number(b?.salience || 0) - Number(a?.salience || 0))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        memory_text: this._normalizeText(item.memory_text, 180),
        memory_type: this._normalizeMemoryType(item.memory_type) || 'preference',
        tags: this._normalizeTags(item.tags),
        salience: Number(item.salience || 0),
        updated_at: item.updated_at || '',
      }));

    const recentMemories = memories
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a?.last_recalled_at || a?.updated_at || 0).getTime();
        const bTime = new Date(b?.last_recalled_at || b?.updated_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        memory_text: this._normalizeText(item.memory_text, 160),
        last_recalled_at: item.last_recalled_at || '',
        recall_count: Number(item.recall_count || 0),
      }));

    return {
      summary: this.buildProfileSummary(structuredMemories, memories),
      tags,
      highlights,
      recent_memories: recentMemories,
      stats: {
        total_memories: memories.length,
        active_tags: tags.length,
        recalled_last_30d: recalledLast30d,
      },
    };
  }
}

module.exports = SemanticMemoryService;
