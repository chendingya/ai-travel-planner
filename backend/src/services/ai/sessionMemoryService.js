const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');

class SessionMemoryService {
  constructor({ supabase, langChainManager, requireUserId, normalizeMessageContent, truncateText }) {
    this.supabase = supabase;
    this.langChainManager = langChainManager;
    this.requireUserId = requireUserId;
    this.normalizeMessageContent = normalizeMessageContent;
    this.truncateText = truncateText;
  }

  shortMemoryConfig() {
    const enabledRaw = String(process.env.AI_CHAT_SHORT_MEMORY_ENABLED || 'true').trim().toLowerCase();
    const enabled = !(enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'off');
    const maxMessagesRaw = Number(process.env.AI_CHAT_SHORT_MEMORY_MAX_MESSAGES || '12');
    const tokenBudgetRaw = Number(process.env.AI_CHAT_SHORT_MEMORY_TOKEN_BUDGET || '6000');
    const summaryTriggerRaw = Number(process.env.AI_CHAT_SESSION_SUMMARY_TRIGGER_MESSAGES || '24');
    const maxMessages = Number.isFinite(maxMessagesRaw) && maxMessagesRaw > 0 ? Math.floor(maxMessagesRaw) : 12;
    const tokenBudget = Number.isFinite(tokenBudgetRaw) && tokenBudgetRaw > 0 ? Math.floor(tokenBudgetRaw) : 6000;
    const summaryTrigger = Number.isFinite(summaryTriggerRaw) && summaryTriggerRaw > 0 ? Math.floor(summaryTriggerRaw) : 24;
    return { enabled, maxMessages, tokenBudget, summaryTrigger };
  }

  estimateTokenCount(text) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    const normalized = raw.trim();
    if (!normalized) return 0;

    const cjkMatches = normalized.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) || [];
    const emojiMatches = normalized.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    const wordMatches = normalized.match(/[A-Za-z0-9]+/g) || [];
    const whitespaceMatches = normalized.match(/\s+/g) || [];

    const cjkTokens = cjkMatches.length;
    const emojiTokens = emojiMatches.length * 2;
    const wordTokens = wordMatches.reduce((sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)), 0);

    const consumedChars = cjkMatches.join('').length
      + emojiMatches.join('').length
      + wordMatches.join('').length
      + whitespaceMatches.join('').length;
    const punctuationChars = Math.max(0, normalized.length - consumedChars);
    const punctuationTokens = Math.ceil(punctuationChars / 2);

    const total = cjkTokens + emojiTokens + wordTokens + punctuationTokens;
    return Math.max(1, total);
  }

  estimateMessagesTokenCount(messages) {
    const list = Array.isArray(messages) ? messages : [];
    return list.reduce((sum, msg) => sum + this.estimateTokenCount(this.extractTextFromMessage(msg)), 0);
  }

  extractTextFromMessage(message) {
    if (!message) return '';
    if (typeof message === 'string') return message;
    if (typeof message === 'object') return this.normalizeMessageContent(message.content);
    return String(message);
  }

  messageRoleName(message) {
    if (!message || typeof message !== 'object') return 'unknown';
    if (typeof message.role === 'string' && message.role) return message.role;
    if (typeof message.getType === 'function') {
      const t = message.getType();
      if (t === 'human') return 'user';
      if (t === 'ai') return 'assistant';
      if (t === 'system') return 'system';
      if (t === 'tool') return 'tool';
      return t || 'unknown';
    }
    return 'unknown';
  }

  formatMessagesTranscript(messages, maxChars = 12000) {
    const lines = (Array.isArray(messages) ? messages : [])
      .map((m) => {
        const role = this.messageRoleName(m);
        const text = this.extractTextFromMessage(m).replace(/\s+/g, ' ').trim();
        if (!text) return '';
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');
    return this.truncateText(lines, maxChars);
  }

  trimMessagesByTokenBudget(messages, tokenBudget, preservedPrefixCount = 0) {
    const list = Array.isArray(messages) ? [...messages] : [];
    const budgetRaw = Number(tokenBudget);
    const budget = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.floor(budgetRaw) : 6000;
    const safePrefix = Number.isFinite(Number(preservedPrefixCount)) ? Math.max(0, Math.floor(preservedPrefixCount)) : 0;
    const totalTokens = () => list.reduce((sum, msg) => sum + this.estimateTokenCount(this.extractTextFromMessage(msg)), 0);
    while (list.length > safePrefix + 1 && totalTokens() > budget) {
      list.splice(safePrefix, 1);
    }
    return list;
  }

  buildShortMemoryMessages(storedMessages, sessionSummary = '') {
    return this.buildShortMemoryWithMetrics(storedMessages, sessionSummary).messages;
  }

  buildShortMemoryWithMetrics(storedMessages, sessionSummary = '') {
    const cfg = this.shortMemoryConfig();
    const history = Array.isArray(storedMessages) ? storedMessages : [];
    const trimmedSummary = typeof sessionSummary === 'string' ? sessionSummary.trim() : '';
    const historyMessagesTotal = history.length;
    const historyTokensTotalEstimate = this.estimateMessagesTokenCount(history);

    if (!cfg.enabled) {
      const selectedMessages = !trimmedSummary
        ? history
        : [new SystemMessage(`以下是当前会话已累积的摘要：\n${trimmedSummary}`), ...history];
      return {
        messages: selectedMessages,
        metrics: {
          enabled: false,
          summary_included: !!trimmedSummary,
          history_messages_total: historyMessagesTotal,
          selected_messages_total: selectedMessages.length,
          history_tokens_estimate: historyTokensTotalEstimate,
          selected_tokens_estimate: this.estimateMessagesTokenCount(selectedMessages),
          max_messages: cfg.maxMessages,
          token_budget: cfg.tokenBudget,
          compressed: false,
          compression_reason: '',
        },
      };
    }

    const tail = history.slice(Math.max(0, history.length - cfg.maxMessages));
    const prefix = trimmedSummary ? [new SystemMessage(`以下是当前会话已累积的摘要：\n${trimmedSummary}`)] : [];
    const mergedBeforeBudget = [...prefix, ...tail];
    const mergedBeforeBudgetTokens = this.estimateMessagesTokenCount(mergedBeforeBudget);
    const merged = this.trimMessagesByTokenBudget(mergedBeforeBudget, cfg.tokenBudget, prefix.length);
    const selectedTokensEstimate = this.estimateMessagesTokenCount(merged);
    const windowCompressed = tail.length < history.length;
    const tokenCompressed = merged.length < mergedBeforeBudget.length || selectedTokensEstimate < mergedBeforeBudgetTokens;
    const compressionReason = [windowCompressed ? 'window' : '', tokenCompressed ? 'token_budget' : '']
      .filter(Boolean)
      .join(',');
    return {
      messages: merged,
      metrics: {
        enabled: true,
        summary_included: !!trimmedSummary,
        history_messages_total: historyMessagesTotal,
        selected_messages_total: merged.length,
        history_tokens_estimate: historyTokensTotalEstimate,
        selected_tokens_estimate: selectedTokensEstimate,
        max_messages: cfg.maxMessages,
        token_budget: cfg.tokenBudget,
        compressed: windowCompressed || tokenCompressed,
        compression_reason: compressionReason,
      },
    };
  }

  rawMessagesToLangChain(rawMessages) {
    const rows = Array.isArray(rawMessages) ? rawMessages : [];
    return rows.map((m) => {
      const role = m?.role;
      const content = this.normalizeMessageContent(m?.content);
      if (role === 'assistant') return new AIMessage(content);
      if (role === 'system') return new SystemMessage(content);
      return new HumanMessage(content);
    });
  }

  async loadSessionState(sessionId, userId) {
    const effectiveUserId = this.requireUserId(userId);
    const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!sid) return { rawMessages: [], messages: [], summary: '' };

    const querySession = (columns) =>
      this.supabase
        .from('ai_chat_sessions')
        .select(columns)
        .eq('conversation_id', sid)
        .eq('user_id', effectiveUserId)
        .maybeSingle();

    let result = await querySession('messages, summary, summary_updated_at');
    if (result?.error && (result.error.code === '42703' || result.error.code === 'PGRST204')) {
      result = await querySession('messages');
    }
    const error = result?.error || null;
    if (error && error.code !== 'PGRST116') throw error;
    const data = result?.data || null;
    const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
    const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
    return {
      rawMessages,
      messages: this.rawMessagesToLangChain(rawMessages),
      summary,
    };
  }

  async updateSessionSummary(sessionId, userId, summary) {
    const effectiveUserId = this.requireUserId(userId);
    const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!sid) return;
    const nextSummary = typeof summary === 'string' ? summary.trim() : '';
    const payload = {
      summary: nextSummary,
      summary_updated_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('ai_chat_sessions')
      .update(payload)
      .eq('conversation_id', sid)
      .eq('user_id', effectiveUserId);
    if (!error) return;
    if (error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205') return;
    throw error;
  }

  async generateSessionSummary({ previousSummary, messages }) {
    const prior = typeof previousSummary === 'string' ? previousSummary.trim() : '';
    const transcript = this.formatMessagesTranscript(messages, 16000);
    if (!transcript) return prior;
    const prompt = [
      '你是聊天摘要助手。请将对话摘要为结构化中文要点，供后续对话记忆使用。',
      '要求：',
      '1) 聚焦用户偏好、约束、已确认事实与待办，不要展开解释。',
      '2) 输出 6-12 条要点，每条一行，简洁。',
      '3) 不要编造，不要包含无关寒暄。',
      prior ? `已有历史摘要：\n${prior}` : '',
      `需融合的新对话内容：\n${transcript}`,
      '直接输出摘要正文，不要输出 JSON。',
    ]
      .filter(Boolean)
      .join('\n\n');

    const summary = await this.langChainManager.invokeText([
      { role: 'system', content: '你是严格的对话摘要器。' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = String(summary || '').trim();
    if (!cleaned) return prior;
    return this.truncateText(cleaned, 2400);
  }

  async maybeRefreshSessionSummary({ sessionId, userId, previousSummary, allMessages }) {
    const cfg = this.shortMemoryConfig();
    if (!cfg.enabled) return;
    const rows = Array.isArray(allMessages) ? allMessages : [];
    if (rows.length < cfg.summaryTrigger) return;
    const keepTail = Math.min(cfg.maxMessages, Math.floor(rows.length / 2));
    const toSummarize = rows.slice(0, Math.max(0, rows.length - keepTail));
    if (toSummarize.length < Math.max(8, Math.floor(cfg.summaryTrigger / 2))) return;
    try {
      const nextSummary = await this.generateSessionSummary({
        previousSummary,
        messages: this.rawMessagesToLangChain(toSummarize),
      });
      await this.updateSessionSummary(sessionId, userId, nextSummary);
    } catch (error) {
      console.warn('Refresh session summary failed:', error?.message || error);
    }
  }
}

module.exports = SessionMemoryService;
