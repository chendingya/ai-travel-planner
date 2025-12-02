/**
 * AI 聊天路由
 * 处理 AI 对话和 MCP 工具调用
 */

const express = require("express");
const router = express.Router();
const { aiConfig } = require("../config");

/**
 * 创建聊天相关路由
 * @param {object} textGenerator 文本生成器实例
 * @param {object} mcpManager MCP 管理器实例
 * @param {object} supabaseService Supabase 服务
 */
function createChatRoutes(textGenerator, mcpManager, supabaseService) {
  const { getConversationHistory, saveConversationHistory, clearConversationHistory } =
    supabaseService;

  // 检查 AI 是否可用的中间件
  const checkAI = (req, res, next) => {
    if (!textGenerator.isAvailable()) {
      return res.status(500).json({
        error: "AI 功能当前不可用 - 未配置 API 密钥",
      });
    }
    next();
  };

  // 请求取消处理
  const handleAbort = (req) => {
    let isAborted = false;
    req.on("aborted", () => {
      if (isAborted) return;
      isAborted = true;
      console.log("🚫 客户端断开连接，请求被取消");
    });
    return () => isAborted;
  };

  /**
   * GET /api/mcp-tools
   * 获取可用的 MCP 工具列表
   */
  router.get("/mcp-tools", (req, res) => {
    res.json({
      tools: mcpManager.getToolsForOpenAI(),
      mcpConfig: mcpManager.getConfig(),
    });
  });

  /**
   * POST /api/ai-chat
   * AI 聊天接口（支持 MCP 工具调用）
   */
  router.post("/ai-chat", checkAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { message, conversation_id, reset_history, enable_tools } = req.body;
      const sessionId = conversation_id; // 兼容前端参数名

      if (!message) {
        return res.status(400).json({ error: "消息不能为空" });
      }

      console.log(`💬 收到AI对话请求: ${message.substring(0, 50)}...`);
      console.log(`📍 会话ID: ${sessionId || "anonymous"}`);

      // 如果需要重置历史
      if (reset_history && sessionId) {
        await clearConversationHistory(sessionId);
        console.log(`🔄 已重置会话历史`);
      }

      // 获取历史对话记录（仅用于上下文）
      let conversationHistory = [];
      if (sessionId) {
        const history = await getConversationHistory(sessionId);
        conversationHistory = history.slice(-aiConfig.chat.maxHistoryMessages);
      }

      // 检查是否可能需要 MCP 工具
      const messageText = message.toLowerCase();
      const hasKeywords =
        messageText.includes("火车") ||
        messageText.includes("高铁") ||
        messageText.includes("车票") ||
        messageText.includes("查询") ||
        messageText.includes("票价") ||
        messageText.includes("搜索") ||
        messageText.includes("最新") ||
        messageText.includes("今天") ||
        messageText.includes("明天") ||
        messageText.includes("新闻") ||
        messageText.includes("天气");
      
      const needsMcpTools = enable_tools === true && mcpManager.isAvailable() && hasKeywords;

      console.log(`🔧 是否启用MCP工具: ${needsMcpTools ? "是" : "否"}`);

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      // 系统提示词 - 让 LLM 根据工具的 inputSchema 自动理解参数
      const systemPrompt = `你是一个专业的湖南旅游助手，帮助用户查询和规划旅游。

你有权访问多个工具来获取实时信息。请根据用户的需求，使用合适的工具调用。

工具调用指南：
- 仔细阅读每个工具的参数定义（description 和 inputSchema）
- 确保所有必需参数都被提供
- 按照参数的数据类型（string, number, array等）正确格式化
- 如果工具调用失败，根据错误信息调整参数后重试

对于火车票查询：
- 优先调用 get-current-date 获取今天日期（用于计算相对日期）
- 然后调用 get-station-code-of-citys 获取城市站点代码
- 最后调用 get-tickets 查询票务信息

回答风格：
- 友好、热情、专业
- 清晰地展示查询结果
- 如遇到工具错误，解释原因并提供帮助`;

      // 构建消息历史
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: message },
      ];

      // 获取可用工具
      const tools = needsMcpTools ? mcpManager.getToolsForOpenAI() : [];

      if (needsMcpTools && tools.length > 0) {
        console.log(`📋 可用工具列表:`);
        tools.forEach((tool, idx) => {
          console.log(`  ${idx + 1}. ${tool.function.name}: ${tool.function.description}`);
          console.log(`     参数: ${JSON.stringify(tool.function.parameters, null, 2).split('\n').slice(0, 3).join('\n')}`);
        });
      }

      // 调用 AI
      let response;
      let toolCalls = [];
      let currentMessages = [...messages];

      if (needsMcpTools && tools.length > 0) {
        // 带工具调用的请求 - 支持多轮工具调用
        const maxIterations = 5; // 最多5轮工具调用
        let iteration = 0;

        while (iteration < maxIterations) {
          iteration++;
          console.log(`🔄 工具调用迭代 ${iteration}/${maxIterations}`);

          response = await textGenerator.generateResponseWithTools(currentMessages, tools, {
            temperature: 0.7,
          });

          // 如果没有工具调用，说明 AI 已经准备好最终回复
          if (!response.toolCalls || response.toolCalls.length === 0) {
            console.log(`✅ AI 生成最终回复`);
            break;
          }

          console.log(`🔧 需要调用 ${response.toolCalls.length} 个工具`);

          // 将 AI 的工具调用消息添加到对话历史
          currentMessages.push(response.message);

          // 执行工具调用
          for (const toolCall of response.toolCalls) {
            const toolName = toolCall.function.name;
            let args = {};
            
            try {
              let argStr = toolCall.function.arguments;
              
              // 如果 arguments 本身就是对象，直接使用
              if (typeof argStr === 'object') {
                args = argStr;
              } else if (typeof argStr === 'string') {
                // 如果是字符串，需要解析为 JSON
                argStr = argStr.trim();
                
                // 处理嵌套 JSON 字符串的情况（LLM 有时会生成 JSON 字符串作为 arguments）
                let parseAttempts = 0;
                while (typeof argStr === 'string' && parseAttempts < 3) {
                  try {
                    args = JSON.parse(argStr);
                    // 如果解析结果仍然是字符串，继续解析
                    if (typeof args === 'string') {
                      argStr = args;
                      parseAttempts++;
                    } else {
                      break;
                    }
                  } catch (e) {
                    // 解析失败，尝试修复常见的 JSON 格式问题
                    if (parseAttempts === 0) {
                      // 第一次失败时，尝试修复不完整的 JSON
                      const fixed = argStr
                        .replace(/,\s*}/, '}') // 移除多余的逗号
                        .replace(/,\s*]/, ']'); // 移除多余的逗号
                      
                      if (fixed !== argStr) {
                        argStr = fixed;
                        parseAttempts++;
                        continue;
                      }
                    }
                    throw e;
                  }
                }
                
                if (typeof args !== 'object' || args === null) {
                  args = {};
                }
              }
            } catch (e) {
              console.error(`⚠️ 参数解析失败，原始值: ${toolCall.function.arguments}`, e.message);
              console.warn(`   将使用空对象作为参数，可能导致工具调用失败`);
              args = {};
            }

            console.log(`⚙️ 调用工具: ${toolName}`, JSON.stringify(args));

            let toolResultContent;
            try {
              const result = await mcpManager.callTool(toolName, args);
              // MCP 返回的结果可能是 { content: [...] } 格式
              if (result.content && Array.isArray(result.content)) {
                toolResultContent = result.content.map(c => c.text || JSON.stringify(c)).join("\n");
              } else {
                toolResultContent = typeof result === "string" ? result : JSON.stringify(result);
              }
              console.log(`✅ 工具返回: ${toolResultContent.substring(0, 200)}...`);
              
              toolCalls.push({
                name: toolName,
                args,
                result: toolResultContent,
              });
            } catch (error) {
              console.error(`❌ 工具调用失败: ${toolName}`, error.message);
              
              // 解析错误消息，提供有针对性的反馈
              let errorMsg = error.message || '';
              let feedbackMsg = '';
              
              if (errorMsg.includes('Invalid arguments') && errorMsg.includes('undefined')) {
                // 缺少必需参数的情况
                const missingParams = [];
                if (errorMsg.includes('"date"')) missingParams.push('date');
                if (errorMsg.includes('"citys"')) missingParams.push('citys');
                if (errorMsg.includes('"fromStation"')) missingParams.push('fromStation');
                if (errorMsg.includes('"toStation"')) missingParams.push('toStation');
                feedbackMsg = `⚠️ 工具 ${toolName} 调用失败: 缺少必需参数 [${missingParams.join(', ')}]。请确保提供所有必需参数。`;
              } else if (errorMsg.includes('Expected object, received string')) {
                // 参数格式错误
                feedbackMsg = `⚠️ 工具 ${toolName} 调用失败: 参数格式错误。参数必须是 JSON 对象，而不是 JSON 字符串。`;
              } else if (errorMsg.includes('Unterminated string')) {
                // JSON 格式错误
                feedbackMsg = `⚠️ 工具 ${toolName} 调用失败: 参数 JSON 格式不完整或有语法错误。请检查引号和逗号。`;
              } else {
                feedbackMsg = `⚠️ 工具 ${toolName} 调用失败: ${errorMsg}`;
              }
              
              toolResultContent = feedbackMsg;
            }

            // 将工具结果添加到对话历史
            currentMessages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: toolResultContent,
            });
          }

          if (getAborted()) {
            return res.status(499).json({ error: "Request cancelled" });
          }
        }

        // 如果循环结束后 response 仍然有工具调用（超过最大迭代次数），强制获取文本回复
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log(`⚠️ 达到最大工具调用次数，强制生成回复`);
          response = await textGenerator.generateResponseWithTools(
            [...currentMessages, { role: "user", content: "请根据上述工具返回的信息，直接回答用户的问题。" }],
            [], // 不再提供工具
            { temperature: 0.7 }
          );
        }
      } else {
        // 普通对话请求 - 不使用工具
        console.log(`📝 发送普通文本生成请求...`);
        const aiResponse = await textGenerator.generateResponse(systemPrompt, message, {
          temperature: 0.7,
        });
        response = {
          content: aiResponse,
          message: { content: aiResponse },
          toolCalls: null,
        };
      }

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      // 提取最终回复
      const aiResponse =
        typeof response === "string" ? response : response.content || response.message?.content;

      // 保存对话历史
      if (sessionId && aiResponse) {
        await saveConversationHistory(sessionId, message, aiResponse);
      }

      console.log("✅ AI对话完成");

      res.json({
        user_message: message,
        ai_response: aiResponse,
        conversation_id: sessionId,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    } catch (error) {
      console.error("❌ AI Chat Error:", error);
      res.status(500).json({
        error: "AI对话失败",
        message: error.message || "请稍后再试",
      });
    }
  });

  /**
   * DELETE /api/ai-chat/history
   * 清除会话历史
   */
  router.delete("/ai-chat/history", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (sessionId) {
        await clearConversationHistory(sessionId);
        console.log(`🗑️ 已清除会话 ${sessionId} 的历史记录`);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("❌ 清除历史记录失败:", error);
      res.status(500).json({ error: "清除历史记录失败" });
    }
  });

  return router;
}

module.exports = createChatRoutes;
