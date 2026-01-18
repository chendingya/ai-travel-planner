/**
 * AI 聊天控制器
 */
class AIChatController {
  constructor(aiChatService) {
    this.aiChatService = aiChatService;
  }

  deriveTitle(session) {
    const title = session?.title;
    if (typeof title === 'string' && title.trim()) return title.trim();
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    const firstUser = messages.find((m) => m && typeof m === 'object' && m.role === 'user' && typeof m.content === 'string' && m.content.trim());
    const raw = firstUser?.content?.trim() || '';
    if (!raw) return '新对话';
    return raw.length > 18 ? `${raw.slice(0, 18)}...` : raw;
  }

  errorMessage(error) {
    if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Internal Server Error';
  }

  /**
   * AI 对话
   */
  async chat(req, res) {
    try {
      const {
        message,
        sessionId,
        conversation_id,
        enable_tools,
        enableTools,
        include_audio,
        includeAudio,
        voice,
        language_type,
      } = req.body;

      if (!message) {
        return res.status(400).json({ message: 'message is required', error: 'message is required' });
      }

      let effectiveSessionId = sessionId || conversation_id;
      if (!effectiveSessionId) {
        const { randomUUID } = require('crypto');
        effectiveSessionId = randomUUID();
      }

      const forwarded = req.headers?.['x-forwarded-for'];
      const client_ip = typeof forwarded === 'string' && forwarded.trim()
        ? forwarded.split(',')[0].trim()
        : (typeof req.ip === 'string' ? req.ip : '');

      const requestId = req.requestId || '';
      const trace = {
        requestId,
        route: 'ai-chat',
        sessionId: effectiveSessionId,
        client_ip,
        enableTools: !!(enable_tools ?? enableTools),
        includeAudio: !!(include_audio ?? includeAudio),
      };

      const result = await this.aiChatService.runWithTrace(trace, () =>
        this.aiChatService.chat(message, effectiveSessionId, {
          enable_tools: enable_tools ?? enableTools,
          include_audio: include_audio ?? includeAudio,
          voice,
          language_type,
          client_ip,
        })
      );
      res.json({
        ...result,
        ai_response: result.message,
        conversation_id: result.sessionId,
      });
    } catch (error) {
      console.error('AI chat error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  /**
   * 创建会话
   */
  async createSession(req, res) {
    try {
      const { title } = req.body;
      const requestId = req.requestId || '';
      const session = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.create' }, () =>
        this.aiChatService.createSession(title)
      );
      res.json(session);
    } catch (error) {
      console.error('Create session error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  /**
   * 获取会话列表
   */
  async getSessions(req, res) {
    try {
      const requestId = req.requestId || '';
      const sessions = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.list' }, () =>
        this.aiChatService.getSessions()
      );
      const mapped = (Array.isArray(sessions) ? sessions : [])
        .map((s) => {
          const message_count = typeof s.message_count === 'number'
            ? s.message_count
            : Array.isArray(s.messages)
              ? s.messages.length
              : 0;
          return {
            conversation_id: s.conversation_id || s.id,
            title: this.deriveTitle(s),
            message_count,
            updated_at: s.updated_at || s.created_at,
            created_at: s.created_at,
          };
        })
        .filter((s) => typeof s.message_count === 'number' && s.message_count > 0);
      res.json({ sessions: mapped });
    } catch (error) {
      console.error('Get sessions error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(req, res) {
    try {
      const { id } = req.params;
      const requestId = req.requestId || '';
      const history = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/history.get', sessionId: id }, () =>
        this.aiChatService.getSessionHistory(id)
      );
      res.json({ messages: history });
    } catch (error) {
      console.error('Get session history error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(req, res) {
    try {
      const { id } = req.params;
      const requestId = req.requestId || '';
      await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/history.delete', sessionId: id }, () =>
        this.aiChatService.deleteSession(id)
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Delete session error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
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

      const requestId = req.requestId || '';
      await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.patch', sessionId: id }, () =>
        this.aiChatService.updateSessionTitle(id, title)
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Update session title error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  async mcpStatus(req, res) {
    try {
      const scope = typeof req.query?.scope === 'string' ? req.query.scope : 'summary';
      const requestId = req.requestId || '';
      const status = await this.aiChatService.runWithTrace({ requestId, route: 'mcp/status', scope }, () =>
        this.aiChatService.getMcpStatus(scope)
      );
      const ok = !!status?.tool_probe?.ok;
      res.status(ok ? 200 : 500).json(status);
    } catch (error) {
      console.error('MCP status error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  async tts(req, res) {
    try {
      const { text, voice } = req.body || {};
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: 'text is required', error: 'text is required' });
      }
      const created = await this.aiChatService.createTtsTask(text, voice);
      res.json({ taskId: created.taskId });
    } catch (error) {
      console.error('TTS create error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  async getTtsAudio(req, res) {
    try {
      const { task_id, taskId } = req.params || {};
      const id = task_id || taskId;
      if (!id) return res.status(400).json({ message: 'task_id is required', error: 'task_id is required' });
      const status = this.aiChatService.getTtsTask(id);
      if (!status) return res.status(404).json({ message: 'task not found', error: 'task not found' });
      if (status.status === 'completed') return res.json({ status: 'completed', task_id: id, audio_url: status.audio_url });
      if (status.status === 'failed') return res.json({ status: 'failed', task_id: id, error: status.error || 'TTS failed' });
      return res.json({ status: 'processing', task_id: id });
    } catch (error) {
      console.error('TTS status error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }
}

module.exports = AIChatController;
