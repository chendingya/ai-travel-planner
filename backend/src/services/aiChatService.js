/**
 * AI 对话服务
 * 封装 AI 聊天相关的业务逻辑
 */
class AIChatService {
  constructor(langChainManager, supabase) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
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
      const { data, error } = await this.supabase
        .from('chat_sessions')
        .insert([{ title: title || '新对话' }])
        .select()
        .single();

      if (error) throw error;
      return data;
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
      const { data, error } = await this.supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
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
      const { data, error } = await this.supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
    } catch (error) {
      console.error('Get session history failed:', error);
      return [];
    }
  }

  /**
   * 保存消息
   */
  async saveMessage(sessionId, userMessage, aiResponse) {
    try {
      const { error: userError } = await this.supabase
        .from('chat_messages')
        .insert([{
          session_id: sessionId,
          role: 'user',
          content: userMessage,
        }]);

      if (userError) throw userError;

      const { error: aiError } = await this.supabase
        .from('chat_messages')
        .insert([{
          session_id: sessionId,
          role: 'assistant',
          content: aiResponse,
        }]);

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
      // 先删除消息
      await this.supabase
        .from('chat_messages')
        .delete()
        .eq('session_id', sessionId);

      // 再删除会话
      const { error } = await this.supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
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
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Update session title failed:', error);
      throw new Error('Failed to update session title');
    }
  }
}

module.exports = AIChatService;
