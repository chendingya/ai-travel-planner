/**
 * 文本生成组件
 * 支持多个 AI 提供商，按优先级顺序：魔搭社区 -> GitCode -> DashScope
 */

const OpenAI = require("openai");

// --- 策略模式实现 AI 客户端 ---

/**
 * 抽象策略基类
 */
class AIStrategy {
  constructor(name, apiKey, baseURL, model) {
    this.name = name;
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    throw new Error("Method 'generate' must be implemented.");
  }
}

/**
 * 魔搭社区 (ModelScope) 策略 - 优先级最高
 */
class ModelScopeStrategy extends AIStrategy {
  constructor(apiKey, baseURL, model) {
    super(
      "modelscope",
      apiKey,
      baseURL || "https://api-inference.modelscope.cn/v1",
      model || "deepseek-ai/DeepSeek-V3.2-Exp"
    );
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    const params = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: this.model,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 8192,
      stream: false,
    };

    try {
      console.log(`🚀 [ModelScope] 发送请求 (Model: ${this.model})...`);
      const completion = await this.client.chat.completions.create({
        ...params,
        signal: options.signal,
      });

      if (!completion || !completion.choices || completion.choices.length === 0) {
        throw new Error("ModelScope API 返回了无效的响应结构");
      }

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("❌ [ModelScope] API 调用失败:", error.message);
      throw error;
    }
  }
}

/**
 * GitCode 策略 - 优先级第二
 */
class GitCodeStrategy extends AIStrategy {
  constructor(apiKey, baseURL, model) {
    super(
      "gitcode",
      apiKey,
      baseURL || "https://api.gitcode.com/api/v5",
      model || "deepseek-ai/DeepSeek-V3.2-Exp"
    );
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    const params = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: this.model,
      temperature: options.temperature || 0.6,
      top_p: 0.95,
      frequency_penalty: 0,
      max_tokens: options.max_tokens || 8192,
      stream: false,
    };

    try {
      console.log(`🚀 [GitCode] 发送请求 (Model: ${this.model})...`);
      const completion = await this.client.chat.completions.create({
        ...params,
        signal: options.signal,
      });

      // 如果 API 返回了明确的错误码，抛出包含错误名与信息的异常
      if (completion && completion.error_code) {
        console.error("❌ [GitCode] 返回了错误响应:", completion);
        throw new Error(
          `GitCodeAPIError:${completion.error_code_name}:${completion.error_message}`
        );
      }

      if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error("❌ [GitCode] 返回了无效的响应结构:", completion);
        throw new Error("GitCode API 返回了无效的响应结构 (无 choices)");
      }

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("❌ [GitCode] API 调用失败:", error.message);
      throw error;
    }
  }
}

/**
 * 阿里百炼 (DashScope) 策略 - 优先级第三（备用）
 */
class DashScopeStrategy extends AIStrategy {
  constructor(apiKey, baseURL, model) {
    super(
      "dashscope",
      apiKey,
      baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model || "qwen3-max-preview"
    );
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    const params = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: this.model,
      temperature: options.temperature || 0.7,
    };

    try {
      console.log(`🚀 [DashScope] 发送请求 (Model: ${this.model})...`);
      const completion = await this.client.chat.completions.create({
        ...params,
        signal: options.signal,
      });

      if (!completion || !completion.choices || completion.choices.length === 0) {
        throw new Error("DashScope API 返回了无效的响应结构");
      }

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error("❌ [DashScope] API 调用失败:", error.message);
      throw error;
    }
  }
}

/**
 * 文本生成器上下文类
 * 管理多个策略并支持自动回退
 */
class TextGeneratorContext {
  constructor() {
    this.strategies = [];
    this.primaryStrategy = null;
  }

  /**
   * 注册一个策略
   * @param {AIStrategy} strategy 策略实例
   * @param {boolean} isPrimary 是否为主要策略
   */
  registerStrategy(strategy, isPrimary = false) {
    this.strategies.push(strategy);
    if (isPrimary || !this.primaryStrategy) {
      this.primaryStrategy = strategy;
    }
    console.log(`✅ 文本生成策略已注册: ${strategy.name} (${strategy.model})`);
  }

  /**
   * 获取所有可用的提供商
   */
  getAvailableProviders() {
    return this.strategies.map((s) => ({
      name: s.name,
      model: s.model,
    }));
  }

  /**
   * 获取当前主要策略
   */
  getPrimaryStrategy() {
    return this.primaryStrategy;
  }

  /**
   * 检查是否有可用策略
   */
  isAvailable() {
    return this.strategies.length > 0;
  }

  /**
   * 生成文本响应，支持自动回退
   * @param {string} systemPrompt 系统提示词
   * @param {string} userPrompt 用户提示词
   * @param {object} options 选项（temperature, signal 等）
   * @returns {Promise<string>} 生成的文本
   */
  async generateResponse(systemPrompt, userPrompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error("没有可用的文本生成策略");
    }

    const errors = [];

    // 按优先级尝试每个策略
    for (const strategy of this.strategies) {
      try {
        console.log(`📝 尝试使用 ${strategy.name} 生成文本...`);
        const result = await strategy.generate(systemPrompt, userPrompt, options);
        console.log(`✅ ${strategy.name} 生成成功`);
        return result;
      } catch (error) {
        console.warn(`⚠️ ${strategy.name} 失败: ${error.message}`);
        errors.push({ strategy: strategy.name, error: error.message });

        // 检查是否应该重试下一个策略
        const shouldRetry = this._shouldRetryWithNextStrategy(error);
        if (!shouldRetry) {
          // 如果是不可恢复的错误（如请求取消），直接抛出
          throw error;
        }
      }
    }

    // 所有策略都失败了
    const errorSummary = errors
      .map((e) => `${e.strategy}: ${e.error}`)
      .join("; ");
    throw new Error(`所有文本生成策略均失败: ${errorSummary}`);
  }

  /**
   * 判断是否应该用下一个策略重试
   */
  _shouldRetryWithNextStrategy(error) {
    const msg = error?.message || "";
    const status = error?.status || 0;

    // 这些错误应该重试下一个策略
    const retryablePatterns = [
      "CHAT_HANDLER_INPUT_AUDIT_FAIL",
      "MODEL_DO_NOT_EXIST",
      "GitCodeAPIError:",
      "Connection error",
      "fetch failed",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "无效的响应结构",
    ];

    const retryableStatuses = [500, 502, 503, 504];

    if (retryableStatuses.includes(status)) {
      return true;
    }

    for (const pattern of retryablePatterns) {
      if (msg.includes(pattern)) {
        return true;
      }
    }

    // 用户取消请求的情况不应该重试
    if (msg.includes("aborted") || msg.includes("cancelled")) {
      return false;
    }

    // 默认重试
    return true;
  }

  /**
   * 获取用于 OpenAI 兼容 API 的客户端（用于 MCP 工具调用等场景）
   */
  getOpenAIClient() {
    if (!this.primaryStrategy) {
      return null;
    }
    return {
      client: this.primaryStrategy.client,
      model: this.primaryStrategy.model,
    };
  }

  /**
   * 生成带工具调用支持的响应
   * @param {Array} messages 消息数组
   * @param {Array} tools 工具定义数组
   * @param {object} options 选项
   * @returns {Promise<object>} 响应对象，包含 content 或 toolCalls
   */
  async generateResponseWithTools(messages, tools = [], options = {}) {
    if (!this.isAvailable()) {
      throw new Error("没有可用的文本生成策略");
    }

    const clientInfo = this.getOpenAIClient();
    if (!clientInfo) {
      throw new Error("无法获取 OpenAI 兼容客户端");
    }

    const { client, model } = clientInfo;

    const params = {
      model,
      messages,
      temperature: options.temperature || 0.7,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      signal: options.signal,
    };

    try {
      console.log(`🔧 [${this.primaryStrategy.name}] 发送带工具的请求...`);
      console.log(`📨 消息数量: ${messages.length}, 工具数量: ${tools.length}`);
      
      // 调试：打印第一个工具的完整定义
      if (tools.length > 0) {
        console.log(`📋 工具示例:`, JSON.stringify(tools[0], null, 2));
      }
      
      const completion = await client.chat.completions.create(params);

      if (!completion || !completion.choices || completion.choices.length === 0) {
        throw new Error("API 返回了无效的响应结构");
      }

      const choice = completion.choices[0];
      const message = choice.message;

      // 检查是否有工具调用
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          toolCalls: message.tool_calls,
          message: message,
          content: null,
        };
      }

      return {
        toolCalls: null,
        message: message,
        content: message.content?.trim() || "",
      };
    } catch (error) {
      console.error(`❌ [${this.primaryStrategy.name}] 工具调用请求失败:`, error.message);
      // 打印更多调试信息
      if (error.status === 400) {
        console.error(`📋 请求参数:`, JSON.stringify({
          model: params.model,
          messagesCount: params.messages?.length,
          toolsCount: params.tools?.length,
          toolNames: params.tools?.map(t => t.function?.name),
        }, null, 2));
      }
      throw error;
    }
  }
}

/**
 * 初始化文本生成器
 * 按优先级顺序注册策略：魔搭社区 -> GitCode -> DashScope
 */
function initTextGenerator() {
  const context = new TextGeneratorContext();

  // 1. 魔搭社区 - 最高优先级
  if (process.env.MODELSCOPE_TEXT_API_KEY || process.env.MODELSCOPE_API_KEY) {
    const apiKey = process.env.MODELSCOPE_TEXT_API_KEY || process.env.MODELSCOPE_API_KEY;
    const baseURL = process.env.MODELSCOPE_TEXT_BASE_URL || "https://api-inference.modelscope.cn/v1";
    const model = process.env.MODELSCOPE_TEXT_MODEL || "deepseek-ai/DeepSeek-V3.2-Exp";
    context.registerStrategy(new ModelScopeStrategy(apiKey, baseURL, model), true);
  }

  // 2. GitCode - 第二优先级
  if (process.env.GITCODE_API_KEY || process.env.AI_API_KEY) {
    const baseURL = process.env.AI_BASE_URL || process.env.GITCODE_BASE_URL;
    // 只有当 baseURL 包含 gitcode 或者明确配置了 GITCODE_API_KEY 时才注册
    if (
      (baseURL && baseURL.includes("gitcode.com")) ||
      process.env.GITCODE_API_KEY
    ) {
      const apiKey = process.env.GITCODE_API_KEY || process.env.AI_API_KEY;
      const model = process.env.GITCODE_MODEL || process.env.AI_MODEL || "deepseek-ai/DeepSeek-V3.2-Exp";
      context.registerStrategy(
        new GitCodeStrategy(apiKey, baseURL || "https://api.gitcode.com/api/v5", model)
      );
    }
  }

  // 3. DashScope - 最低优先级（备用）
  if (process.env.DASHSCOPE_API_KEY) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const baseURL = process.env.DASHSCOPE_BASE_URL;
    const model = process.env.DASHSCOPE_AI_MODEL || "qwen3-max-preview";
    context.registerStrategy(new DashScopeStrategy(apiKey, baseURL, model));
  }

  // 检查是否有可用策略
  if (!context.isAvailable()) {
    console.warn("⚠️ 警告: 没有配置任何文本生成 API，文本生成功能将不可用");
    console.warn("请配置以下环境变量之一:");
    console.warn("  - MODELSCOPE_TEXT_API_KEY 或 MODELSCOPE_API_KEY (魔搭社区)");
    console.warn("  - GITCODE_API_KEY 或 AI_API_KEY + AI_BASE_URL (GitCode)");
    console.warn("  - DASHSCOPE_API_KEY (阿里百炼)");
  } else {
    const providers = context.getAvailableProviders();
    console.log(`✅ 文本生成器初始化完成，共 ${providers.length} 个提供商可用`);
    console.log(`   优先级顺序: ${providers.map((p) => p.name).join(" -> ")}`);
  }

  return context;
}

// 导出
module.exports = {
  TextGeneratorContext,
  ModelScopeStrategy,
  GitCodeStrategy,
  DashScopeStrategy,
  initTextGenerator,
};
