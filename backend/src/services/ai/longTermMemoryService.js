class LongTermMemoryService {
  constructor({ supabase, langChainManager, requireUserId, truncateText }) {
    this.supabase = supabase;
    this.langChainManager = langChainManager;
    this.requireUserId = requireUserId;
    this.truncateText = truncateText;
  }

  _createBadRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
  }

  longMemoryConfig() {
    const enabledRaw = String(process.env.AI_CHAT_LONG_MEMORY_ENABLED || 'true').trim().toLowerCase();
    const enabled = !(enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'off');
    const minConfidenceRaw = Number(process.env.AI_CHAT_LONG_MEMORY_MIN_CONFIDENCE || '0.75');
    const minConfidence = Number.isFinite(minConfidenceRaw) ? Math.max(0, Math.min(1, minConfidenceRaw)) : 0.75;
    return { enabled, minConfidence };
  }

  longMemoryWhitelist() {
    return [
      'budget_preference',
      'travel_pace',
      'transport_preference',
      'accommodation_preference',
      'food_preference',
      'destination_preference',
      'taboo',
    ];
  }

  async loadLongTermMemories(userId) {
    const effectiveUserId = this.requireUserId(userId);
    const cfg = this.longMemoryConfig();
    if (!cfg.enabled) return [];
    const { data, error } = await this.supabase
      .from('ai_user_memories')
      .select('id, memory_key, memory_value, confidence, source_session_id, created_at, updated_at')
      .eq('user_id', effectiveUserId)
      .order('updated_at', { ascending: false });
    if (!error) return Array.isArray(data) ? data : [];
    if (error.code === 'PGRST205' || error.code === '42P01') return [];
    throw error;
  }

  normalizeMemoryKey(memoryKey) {
    const key = typeof memoryKey === 'string' ? memoryKey.trim() : '';
    if (!key) throw this._createBadRequest('memory_key 参数缺失');
    if (!this.longMemoryWhitelist().includes(key)) {
      throw this._createBadRequest(`不支持的记忆类型: ${key}`);
    }
    return key;
  }

  memoryValueToText(memoryValue) {
    if (typeof memoryValue === 'string') return memoryValue;
    if (memoryValue && typeof memoryValue === 'object') {
      if (typeof memoryValue.text === 'string') return memoryValue.text;
      return JSON.stringify(memoryValue);
    }
    if (memoryValue == null) return '';
    return String(memoryValue);
  }

  normalizeManagedMemoryInput({ memoryKey, memoryValue, confidence }) {
    const key = this.normalizeMemoryKey(memoryKey);
    const rawText = this.memoryValueToText(memoryValue);
    const text = rawText.replace(/\s+/g, ' ').trim();
    if (!text) throw this._createBadRequest('记忆内容不能为空');

    const confidenceRaw = Number(confidence);
    const normalizedConfidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 1;

    return {
      memory_key: key,
      memory_value: { text: this.truncateText(text, 1000) },
      confidence: normalizedConfidence,
    };
  }

  formatLongTermMemoryBlock(memories) {
    const list = Array.isArray(memories) ? memories : [];
    if (!list.length) return '';
    const lines = list
      .map((item) => {
        const key = typeof item?.memory_key === 'string' ? item.memory_key : '';
        if (!key) return '';
        let valueText = '';
        const value = item?.memory_value;
        if (typeof value === 'string') valueText = value;
        else if (value && typeof value === 'object') valueText = JSON.stringify(value);
        else valueText = String(value ?? '');
        valueText = valueText.replace(/\s+/g, ' ').trim();
        if (!valueText) return '';
        return `- ${key}: ${this.truncateText(valueText, 240)}`;
      })
      .filter(Boolean);
    if (!lines.length) return '';
    return ['以下是用户的长期偏好记忆（跨会话）：', ...lines].join('\n');
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

  normalizeMemoryCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    const whitelist = new Set(this.longMemoryWhitelist());
    const memoryKey =
      typeof candidate.memory_key === 'string'
        ? candidate.memory_key.trim()
        : typeof candidate.key === 'string'
          ? candidate.key.trim()
          : '';
    if (!memoryKey || !whitelist.has(memoryKey)) return null;

    const confidenceRaw = Number(candidate.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
    const value = candidate.memory_value ?? candidate.value;
    if (value == null) return null;
    const memoryValue = typeof value === 'object' ? value : { text: String(value) };
    return { memory_key: memoryKey, memory_value: memoryValue, confidence };
  }

  async extractLongTermMemoryCandidates({ userMessage, assistantMessage, existingMemories }) {
    const cfg = this.longMemoryConfig();
    if (!cfg.enabled) return [];
    const whitelist = this.longMemoryWhitelist();
    const prompt = [
      '请从对话中提取可长期复用的用户偏好记忆。',
      `只允许以下 memory_key: ${whitelist.join(', ')}`,
      '仅输出 JSON，格式：{"memories":[{"memory_key":"...","memory_value":{},"confidence":0-1}]}',
      '若无可提取记忆，输出 {"memories":[]}',
      '不要提取一次性问题，不要编造。',
      `已有记忆（供去重参考）：${JSON.stringify(existingMemories || [])}`,
      `用户消息：${this.truncateText(String(userMessage || ''), 2000)}`,
      `助手回复：${this.truncateText(String(assistantMessage || ''), 2000)}`,
    ].join('\n\n');

    const raw = await this.langChainManager.invokeText([
      { role: 'system', content: '你是严格的信息抽取器，只返回 JSON。' },
      { role: 'user', content: prompt },
    ]);
    const parsed = this.parseJsonLoose(raw);
    const list = Array.isArray(parsed?.memories) ? parsed.memories : Array.isArray(parsed) ? parsed : [];
    return list
      .map((item) => this.normalizeMemoryCandidate(item))
      .filter(Boolean)
      .filter((item) => item.confidence >= cfg.minConfidence);
  }

  async upsertLongTermMemories({ userId, sessionId, candidates }) {
    const effectiveUserId = this.requireUserId(userId);
    const rows = Array.isArray(candidates) ? candidates : [];
    if (!rows.length) return;
    for (const item of rows) {
      const payload = {
        user_id: effectiveUserId,
        memory_key: item.memory_key,
        memory_value: item.memory_value,
        confidence: item.confidence,
        source_session_id: sessionId,
        updated_at: new Date().toISOString(),
      };
      const { error } = await this.supabase.from('ai_user_memories').upsert(payload, { onConflict: 'user_id,memory_key' });
      if (!error) continue;
      if (error.code === 'PGRST205' || error.code === '42P01') return;
      throw error;
    }
  }

  async saveLongTermMemory({ userId, memoryKey, memoryValue, confidence = 1, sourceSessionId = 'manual' }) {
    const normalized = this.normalizeManagedMemoryInput({
      memoryKey,
      memoryValue,
      confidence,
    });
    const sessionId = typeof sourceSessionId === 'string' ? sourceSessionId.trim() : 'manual';
    await this.upsertLongTermMemories({
      userId,
      sessionId: sessionId || 'manual',
      candidates: [normalized],
    });
    return {
      ...normalized,
      source_session_id: sessionId || 'manual',
      updated_at: new Date().toISOString(),
    };
  }

  async deleteLongTermMemory(userId, memoryKey) {
    const effectiveUserId = this.requireUserId(userId);
    const key = this.normalizeMemoryKey(memoryKey);
    const { error } = await this.supabase
      .from('ai_user_memories')
      .delete()
      .eq('user_id', effectiveUserId)
      .eq('memory_key', key);
    if (!error) return true;
    if (error.code === 'PGRST205' || error.code === '42P01') return true;
    throw error;
  }

  async clearLongTermMemories(userId) {
    const effectiveUserId = this.requireUserId(userId);
    const { error } = await this.supabase.from('ai_user_memories').delete().eq('user_id', effectiveUserId);
    if (!error) return true;
    if (error.code === 'PGRST205' || error.code === '42P01') return true;
    throw error;
  }
}

module.exports = LongTermMemoryService;
