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
    const zh = (errLike) => {
      const e = errLike || {};
      const code = typeof e?.code === 'string' ? e.code : '';
      const msg = typeof e?.message === 'string' ? e.message.trim() : '';
      const map = {
        MODEL_INVOKE_TIMEOUT: '模型调用超时',
        TOOL_INVOKE_TIMEOUT: '工具调用超时',
        PLAN_TIMEOUT: '规划生成超时',
        MODEL_EMPTY_RESPONSE: '模型返回空结果',
        MODEL_INVOKE_FAILED: '模型调用失败',
        MODELSCOPE_REQUEST_LIMIT: '模型请求次数已达上限',
        TOOLCALL_PROBE_TIMEOUT: '工具调用能力探测超时',
        MCP_STARTUP_TIMEOUT: 'MCP 启动超时',
        TEXT_PROVIDER_UNAVAILABLE: '未配置可用的文本模型提供商',
        IMAGE_PROVIDER_UNAVAILABLE: '未配置可用的图片生成提供商',
        TEXT_PROVIDER_NOT_FOUND: '未找到可用的文本模型提供商',
        TEXT_PROVIDER_ALL_FAILED: '文本模型调用失败',
        IMAGE_PROVIDER_ALL_FAILED: '图片生成失败',
      };
      if (code && map[code]) return map[code];
      if (msg) return msg;
      return '内部服务错误';
    };
    return zh(error);
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
        return res.status(400).json({ message: 'message 参数缺失', error: 'message 参数缺失' });
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
      const debug = req.aiDebug === true;
      const aiMeta = { providers: [] };
      const trace = {
        requestId,
        route: 'ai-chat',
        sessionId: effectiveSessionId,
        client_ip,
        enableTools: !!(enable_tools ?? enableTools),
        includeAudio: !!(include_audio ?? includeAudio),
        debug,
        aiMeta,
      };

      res.locals.aiMeta = aiMeta;
      
      // 设置响应头支持流式传输
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      await this.aiChatService.runWithTrace(trace, async () => {
        const stream = await this.aiChatService.chat(message, effectiveSessionId, {
          enable_tools: enable_tools ?? enableTools,
          include_audio: include_audio ?? includeAudio,
          voice,
          language_type,
          client_ip,
        });

        // 如果返回的是字符串（非流），直接输出
        if (typeof stream === 'string') {
             res.write(stream);
             res.end();
             return;
        }

        // 迭代处理流
        for await (const chunk of stream) {
            if (res.writableEnded) break;
            // LangGraph stream 模式下，chunk 可能包含 messages 数组更新，或者是 token
            // 这里我们假设 aiChatService.chat 已经返回了处理好的 token 流或者需要我们从 chunk 中提取
            
            // 如果是 LangGraph 原始输出，通常是 { messages: [...] }
            // 我们需要提取最后一条 AI 消息的 content 增量
            // 但 createReactAgent 的 .stream 默认行为比较复杂，通常是输出状态更新
            
            // 为了简化，我们在 Service 层做转换，或者在这里判断
            // 假设 Service 层返回的是处理好的 token 字符串流
            
            // 如果 chunk 是对象，尝试提取 content
            if (typeof chunk === 'object' && chunk !== null) {
                // 处理 LangGraph 默认输出
                // 这里可能需要根据 aiChatService 的实际返回调整
                // 暂时假设 Service 返回的是包含 content 的对象或字符串
                if (chunk.content) {
                    res.write(chunk.content);
                } else if (chunk.messages && Array.isArray(chunk.messages)) {
                    // 如果是全量消息列表，我们需要计算增量（比较复杂），或者 Service 层应该返回增量流
                    // 这里的逻辑需要和 Service 层配合
                    // 临时方案：如果 Service 返回的是 Generator，我们假设它 yield 的是文本片段
                } else {
                    // 可能是直接的字符串片段
                    // console.log('Chunk:', chunk);
                }
            } else {
                // 字符串片段
                res.write(String(chunk));
            }
        }
        if (!res.writableEnded) res.end();
      });
    } catch (error) {
      console.error('AI chat error:', error);
      const msg = this.errorMessage(error);
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
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
      const debug = req.aiDebug === true;
      res.locals.aiMeta = { mcp: false, providers: [] };
      const session = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.create', debug }, () =>
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
      const debug = req.aiDebug === true;
      res.locals.aiMeta = { mcp: false, providers: [] };
      const sessions = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.list', debug }, () =>
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
      const debug = req.aiDebug === true;
      res.locals.aiMeta = { mcp: false, providers: [] };
      const history = await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/history.get', sessionId: id, debug }, () =>
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
      const debug = req.aiDebug === true;
      await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/history.delete', sessionId: id, debug }, () =>
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
        return res.status(400).json({ message: 'title 参数缺失', error: 'title 参数缺失' });
      }

      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      res.locals.aiMeta = { mcp: false, providers: [] };
      await this.aiChatService.runWithTrace({ requestId, route: 'ai-chat/sessions.patch', sessionId: id, debug }, () =>
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
      const debug = req.aiDebug === true;
      res.locals.aiMeta = { mcp: true, providers: [] };
      const status = await this.aiChatService.runWithTrace({ requestId, route: 'mcp/status', scope, debug }, () =>
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
        return res.status(400).json({ message: 'text 参数缺失', error: 'text 参数缺失' });
      }
      res.locals.aiMeta = { mcp: false, providers: [] };
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
      if (!id) return res.status(400).json({ message: 'task_id 参数缺失', error: 'task_id 参数缺失' });
      res.locals.aiMeta = { mcp: false, providers: [] };
      const status = this.aiChatService.getTtsTask(id);
      if (!status) return res.status(404).json({ message: '任务不存在', error: '任务不存在' });
      if (status.status === 'completed') return res.json({ status: 'completed', task_id: id, audio_url: status.audio_url });
      if (status.status === 'failed') return res.json({ status: 'failed', task_id: id, error: status.error || '语音合成失败' });
      return res.json({ status: 'processing', task_id: id });
    } catch (error) {
      console.error('TTS status error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }
}

module.exports = AIChatController;
