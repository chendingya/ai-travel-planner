/**
 * AI 聊天控制器
 */
class AIChatController {
  constructor(aiChatService) {
    this.aiChatService = aiChatService;
  }

  /**
   * AI 对话
   */
  async chat(req, res) {
    try {
      const { message, sessionId, conversation_id } = req.body;

      if (!message) {
        return res.status(400).json({ message: 'message is required', error: 'message is required' });
      }

      let effectiveSessionId = sessionId || conversation_id;
      if (!effectiveSessionId) {
        const session = await this.aiChatService.createSession('新对话');
        effectiveSessionId = session?.id;
      }

      const result = await this.aiChatService.chat(message, effectiveSessionId);
      res.json({
        ...result,
        ai_response: result.message,
        conversation_id: result.sessionId,
      });
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 创建会话
   */
  async createSession(req, res) {
    try {
      const { title } = req.body;
      const session = await this.aiChatService.createSession(title);
      res.json(session);
    } catch (error) {
      console.error('Create session error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 获取会话列表
   */
  async getSessions(req, res) {
    try {
      const sessions = await this.aiChatService.getSessions();
      const mapped = (Array.isArray(sessions) ? sessions : []).map((s) => ({
        conversation_id: s.id,
        title: s.title,
        message_count: s.message_count || 0,
        updated_at: s.updated_at || s.created_at,
        created_at: s.created_at,
      }));
      res.json({ sessions: mapped });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(req, res) {
    try {
      const { id } = req.params;
      const history = await this.aiChatService.getSessionHistory(id);
      res.json({ messages: history });
    } catch (error) {
      console.error('Get session history error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(req, res) {
    try {
      const { id } = req.params;
      await this.aiChatService.deleteSession(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete session error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(req, res) {
    try {
      const { id } = req.params;
      const { title } = req.body;

      if (!title) {
        return res.status(400).json({ message: 'title is required', error: 'title is required' });
      }

      await this.aiChatService.updateSessionTitle(id, title);
      res.json({ success: true });
    } catch (error) {
      console.error('Update session title error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = AIChatController;
