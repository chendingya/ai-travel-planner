/**
 * AI 对话服务
 * 封装 AI 聊天相关的业务逻辑
 */
class AIChatService {
  constructor(langChainManager, supabase) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
  }

  async tryTables(tableNames, runner) {
    let lastError = null;
    for (const tableName of tableNames) {
      const result = await runner(tableName);
      const error = result?.error || null;
      lastError = error;
      if (!error) return result;
      if (error.code === 'PGRST205') continue;
      return result;
    }
    return { data: null, error: lastError };
  }

  isTransientSupabaseError(error) {
    const msg = `${error?.message || ''}\n${error?.details || ''}`.toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('connect timeout') ||
      msg.includes('und_err_connect_timeout') ||
      msg.includes('etimedout') ||
      msg.includes('timeout')
    );
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async withRetry(operation, { retries = 2, baseDelayMs = 300 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (!this.isTransientSupabaseError(error) || attempt >= retries) break;
        await this.sleep(baseDelayMs * (attempt + 1));
      }
    }
    throw lastError;
  }

  safeTitleFromMessages(messages) {
    if (!Array.isArray(messages)) return '新对话';
    const firstUser = messages.find((m) => m && typeof m === 'object' && m.role === 'user' && typeof m.content === 'string' && m.content.trim());
    const raw = firstUser?.content?.trim() || '';
    if (!raw) return '新对话';
    return raw.length > 18 ? `${raw.slice(0, 18)}...` : raw;
  }

  async ensureAiChatSession(conversationId) {
    const { data, error } = await this.supabase
      .from('ai_chat_sessions')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (!error && data) return true;
    if (error && error.code !== 'PGRST116') throw error;

    const { error: insertError } = await this.supabase
      .from('ai_chat_sessions')
      .insert([{ conversation_id: conversationId, messages: [] }]);

    if (insertError) throw insertError;
    return true;
  }

  /**
   * AI 对话
   */
  async chat(message, sessionId) {
    try {
      // 获取历史消息（如果存在）
      const history = sessionId ? await this.getSessionHistory(sessionId) : [];

      const systemPrompt = `你是一个专业的旅行助手，擅长解答各类旅行问题。

你的职责：
1. 提供实用的旅行建议和攻略
2. 推荐热门景点和美食
3. 解答旅行中的常见问题
4. 提供旅行安全提示
5. 使用友好、专业的语气回答

请用中文回答，保持简洁明了。`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      const response = await this.langChainManager.invokeText(messages);

      // 保存对话记录
      if (sessionId) {
        await this.saveMessage(sessionId, message, response);
      }

      return {
        message: response,
        sessionId,
      };
    } catch (error) {
      console.error('AI chat failed:', error);
      throw new Error('Failed to get AI response');
    }
  }

  /**
   * 创建新的会话
   */
  async createSession(title) {
    try {
      const { randomUUID } = require('crypto');
      const conversationId = randomUUID();

      const { data, error } = await this.supabase
        .from('ai_chat_sessions')
        .insert([{ conversation_id: conversationId, messages: [] }])
        .select('*')
        .single();

      if (!error) {
        return {
          id: data.conversation_id,
          conversation_id: data.conversation_id,
          title: title || '新对话',
          message_count: Array.isArray(data.messages) ? data.messages.length : 0,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }

      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase
        .from('chat_sessions')
        .insert([{ title: title || '新对话' }])
        .select()
        .single();

      if (fallback.error) throw fallback.error;
      return fallback.data;
    } catch (error) {
      console.error('Create session failed:', error);
      throw new Error('Failed to create chat session');
    }
  }

  /**
   * 获取会话列表
   */
  async getSessions() {
    try {
      const primary = await this.supabase
        .from('ai_chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!primary.error) return primary.data;
      if (primary.error.code === '42703') {
        const fallbackOrder = await this.supabase
          .from('ai_chat_sessions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!fallbackOrder.error) return fallbackOrder.data;
        if (fallbackOrder.error.code !== 'PGRST205') throw fallbackOrder.error;
      } else if (primary.error.code !== 'PGRST205') {
        throw primary.error;
      }

      const fallback = await this.supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fallback.error) throw fallback.error;
      return fallback.data;
    } catch (error) {
      console.error('Get sessions failed:', error);
      throw new Error('Failed to get chat sessions');
    }
  }

  /**
   * 获取会话历史记录
   */
  async getSessionHistory(sessionId) {
    try {
      const { data, error } = await this.withRetry(async () => {
        const result = await this.supabase
          .from('ai_chat_sessions')
          .select('messages')
          .eq('conversation_id', sessionId)
          .maybeSingle();

        if (!result?.error) return result;

        if (result.error.code === 'PGRST205') return result;
        if (this.isTransientSupabaseError(result.error)) throw result.error;
        throw result.error;
      });

      if (!error) {
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        return messages
          .map((m) => {
            if (!m || typeof m !== 'object') return null;
            const role = m.role === 'user' || m.role === 'assistant' || m.role === 'system' ? m.role : null;
            const content = typeof m.content === 'string' ? m.content : '';
            if (!role || !content) return null;
            return { role, content };
          })
          .filter(Boolean);
      }

      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (fallback.error) throw fallback.error;
      return (fallback.data || []).map((msg) => ({ role: msg.role, content: msg.content }));
    } catch (error) {
      console.error('Get session history failed:', error);
      throw new Error('Failed to get session history');
    }
  }

  /**
   * 保存消息
   */
  async saveMessage(sessionId, userMessage, aiResponse) {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('ai_chat_sessions')
        .select('messages')
        .eq('conversation_id', sessionId)
        .maybeSingle();

      if (!error) {
        const current = Array.isArray(data?.messages) ? data.messages : [];
        const nextMessages = [
          ...current,
          { role: 'user', content: userMessage, created_at: now },
          { role: 'assistant', content: aiResponse, created_at: now },
        ];

        const { error: updateError } = await this.supabase
          .from('ai_chat_sessions')
          .update({ messages: nextMessages })
          .eq('conversation_id', sessionId);

        if (updateError) throw updateError;
        return;
      }

      if (error.code !== 'PGRST205') throw error;

      const { error: userError } = await this.supabase
        .from('chat_messages')
        .insert([{ session_id: sessionId, role: 'user', content: userMessage }]);
      if (userError) throw userError;

      const { error: aiError } = await this.supabase
        .from('chat_messages')
        .insert([{ session_id: sessionId, role: 'assistant', content: aiResponse }]);
      if (aiError) throw aiError;
    } catch (error) {
      console.error('Save message failed:', error);
      // 不抛出错误，避免影响对话
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    try {
      const { error } = await this.supabase
        .from('ai_chat_sessions')
        .delete()
        .eq('conversation_id', sessionId);

      if (!error) return;
      if (error.code !== 'PGRST205') throw error;

      await this.supabase.from('chat_messages').delete().eq('session_id', sessionId);
      const fallback = await this.supabase.from('chat_sessions').delete().eq('id', sessionId);
      if (fallback.error) throw fallback.error;
    } catch (error) {
      console.error('Delete session failed:', error);
      throw new Error('Failed to delete chat session');
    }
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId, title) {
    try {
      const { error } = await this.supabase
        .from('ai_chat_sessions')
        .update({ title })
        .eq('conversation_id', sessionId);

      if (!error) return;

      if (error.code === 'PGRST204' || error.code === '42703') return;
      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase.from('chat_sessions').update({ title }).eq('id', sessionId);
      if (fallback.error) throw fallback.error;
    } catch (error) {
      console.error('Update session title failed:', error);
      throw new Error('Failed to update session title');
    }
  }
}

module.exports = AIChatService;
