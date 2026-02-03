const { AsyncLocalStorage } = require('node:async_hooks');
const OpenAICompatibleAdapter = require('./text/OpenAICompatibleAdapter');
const ModelScopeImageAdapter = require('./image/ModelScopeImageAdapter');
const sensitiveFilter = require('../../utils/sensitiveFilter');

/**
 * LangChain 管理器
 * 统一管理所有 AI 调用，提供商选择和降级
 */
class LangChainManager {
  constructor(textProviders, imageProviders) {
    // 初始化文本生成适配器
    this.textAdapters = textProviders
      .map(provider => new OpenAICompatibleAdapter(provider))
      .filter(adapter => adapter !== null && adapter.isAvailable());

    // 初始化图片生成适配器
    this.imageAdapters = imageProviders.map(provider => {
      switch (provider.name) {
        case 'modelscope':
          return new ModelScopeImageAdapter(provider);
        default:
          console.warn(`Unknown image provider: ${provider.name}`);
          return null;
      }
    }).filter(adapter => adapter !== null && adapter.isAvailable());

    this._probeCache = new Set();
    this._traceStore = new AsyncLocalStorage();

    console.log(`Initialized ${this.textAdapters.length} text providers and ${this.imageAdapters.length} image providers`);
  }

  runWithTrace(trace, runner) {
    const t = trace && typeof trace === 'object' ? { ...trace } : {};
    const fn = typeof runner === 'function' ? runner : () => runner;
    return this._traceStore.run(t, fn);
  }

  _currentTrace() {
    const t = this._traceStore.getStore();
    return t && typeof t === 'object' ? t : null;
  }

  _debugEnabled() {
    const trace = this._currentTrace();
    if (trace && trace.debug) return true;
    const v = process.env.AI_CHAT_DEBUG;
    if (!v) return false;
    return v === '1' || v.toLowerCase() === 'true';
  }

  _debug(event, data) {
    if (!this._debugEnabled()) return;
    const payload = data && typeof data === 'object' ? data : { value: data };
    const trace = this._currentTrace();
    const requestId = typeof trace?.requestId === 'string' ? trace.requestId : '';
    const merged = requestId ? { requestId, ...payload } : payload;
    const ts = new Date().toISOString();
    console.log(`[${ts}] ai-call:${event}`, JSON.stringify(merged));
  }

  _zhErrorMessage(code, fallback) {
    const map = {
      MODEL_INVOKE_TIMEOUT: '模型调用超时',
      TOOL_INVOKE_TIMEOUT: '工具调用超时',
      PLAN_TIMEOUT: '规划生成超时',
      MODEL_EMPTY_RESPONSE: '模型返回空结果',
      MODEL_INVOKE_FAILED: '模型调用失败',
      MODELSCOPE_REQUEST_LIMIT: '模型请求次数已达上限',
      TOOLCALL_PROBE_TIMEOUT: '工具调用能力探测超时',
      MCP_STARTUP_TIMEOUT: 'MCP 启动超时',
      MCP_TIMEOUT: 'MCP 调用超时',
      MCP_CALL_TIMEOUT: 'MCP 工具调用超时',
      TEXT_PROVIDER_UNAVAILABLE: '未配置可用的文本模型提供商',
      IMAGE_PROVIDER_UNAVAILABLE: '未配置可用的图片生成提供商',
      TEXT_PROVIDER_NOT_FOUND: '未找到可用的文本模型提供商',
      TEXT_PROVIDER_ALL_FAILED: '文本模型调用失败',
      IMAGE_PROVIDER_ALL_FAILED: '图片生成失败',
      TOOL_RATE_LIMIT: '工具调用过于频繁',
      TOOL_CALLS_EXCEEDED: '工具调用次数过多',
      PROVIDER_PROTOCOL_ERROR: 'AI 提供商协议错误',
      RATE_LIMIT_EXCEEDED: '请求频率已达上限',
      TOOL_SCHEMA_ERROR: '工具参数格式错误',
      SESSION_NOT_FOUND: '会话不存在',
      TTS_SERVICE_UNAVAILABLE: '语音合成服务不可用',
      IMAGE_GENERATION_FAILED: '图片生成失败',
    };
    if (code && map[code]) return map[code];
    return fallback || '未知错误';
  }

  _stringifyErrorMessage(error) {
    return String(error?.message || error || '');
  }

  _pickHeaders(headersLike) {
    const out = {};
    const allow = new Set([
      'date',
      'server',
      'via',
      'retry-after',
      'x-request-id',
      'x-requestid',
      'x-amzn-requestid',
      'x-amz-cf-id',
      'cf-ray',
      'modelscope-ratelimit-requests-limit',
      'modelscope-ratelimit-requests-remaining',
      'modelscope-ratelimit-model-requests-limit',
      'modelscope-ratelimit-model-requests-remaining',
      'x-ratelimit-limit-requests',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-reset-requests',
      'x-ratelimit-limit-tokens',
      'x-ratelimit-remaining-tokens',
      'x-ratelimit-reset-tokens',
    ]);

    const setIfOk = (k, v) => {
      const key = typeof k === 'string' ? k.toLowerCase() : '';
      if (!key) return;
      const val = typeof v === 'string' ? v : v == null ? '' : String(v);
      if (!val) return;
      if (allow.has(key) || key.startsWith('x-ratelimit-')) out[key] = val;
    };

    const h = headersLike;
    if (!h) return out;

    if (typeof h.get === 'function') {
      for (const k of allow) setIfOk(k, h.get(k));
      if (typeof h.entries === 'function') {
        let i = 0;
        for (const [k, v] of h.entries()) {
          if (i++ > 40) break;
          setIfOk(k, v);
        }
      }
      return out;
    }

    if (h && typeof h === 'object') {
      for (const [k, v] of Object.entries(h)) setIfOk(k, v);
      return out;
    }

    return out;
  }

  _summarizeProviderError(adapter, error) {
    const baseURL = typeof adapter?.baseURL === 'string' ? adapter.baseURL : '';
    const model = typeof adapter?.model === 'string' ? adapter.model : '';
    const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : Number.isFinite(Number(error?.response?.status)) ? Number(error.response.status) : null;
    const code = typeof error?.code === 'string' ? error.code : typeof error?.lc_error_code === 'string' ? error.lc_error_code : '';
    const type = typeof error?.type === 'string' ? error.type : '';
    const name = typeof error?.name === 'string' ? error.name : '';
    const message = this._stringifyErrorMessage(error);
    const zh_message = this._zhErrorMessage(code, message);
    const headers = this._pickHeaders(error?.headers || error?.response?.headers);
    const baseURLHasV1 = typeof baseURL === 'string' ? baseURL.includes('/v1') : false;
    return { provider: adapter?.name, model, baseURL, baseURLHasV1, status, code, type, name, message, zh_message, headers };
  }

  selectTextProviderByName(name) {
    if (!name) return this.selectTextProvider();
    const hit = this.textAdapters.find((a) => a && a.name === name);
    return hit || this.selectTextProvider();
  }

  createTextChatModel(options = {}) {
    const preferred = typeof options.provider === 'string' ? options.provider : '';
    const adapter = this.selectTextProviderByName(preferred);
    return adapter.createLLM();
  }

  /**
   * 选择可用的文本提供商
   * 按优先级顺序返回第一个可用的提供商
   */
  selectTextProvider() {
    if (this.textAdapters.length === 0) {
      const err = new Error('未配置可用的文本模型提供商');
      err.code = 'TEXT_PROVIDER_UNAVAILABLE';
      throw err;
    }
    return this.textAdapters[0];
  }

  /**
   * 选择可用的图片提供商
   * 按优先级顺序返回第一个可用的提供商
   */
  selectImageProvider() {
    if (this.imageAdapters.length === 0) {
      const err = new Error('未配置可用的图片生成提供商');
      err.code = 'IMAGE_PROVIDER_UNAVAILABLE';
      throw err;
    }
    return this.imageAdapters[0];
  }

  /**
   * 带降级的文本生成调用
   * 如果第一个提供商失败，自动切换到下一个
   */
  async withTextFallback(operationName, operationFn, retries = 0) {
    const maxRetries = this.textAdapters.length - 1;

    if (retries > maxRetries) {
      const err = new Error(`所有文本模型提供商均调用失败：${operationName}`);
      err.code = 'TEXT_PROVIDER_ALL_FAILED';
      throw err;
    }

    const adapter = this.textAdapters[retries];

    try {
      console.log(`Attempting ${operationName} with provider: ${adapter.name} (attempt ${retries + 1})`);
      const result = await operationFn(adapter);
      console.log(`Successfully completed ${operationName} with provider: ${adapter.name}`);
      return result;
    } catch (error) {
      console.warn(`Provider ${adapter.name} failed for ${operationName}:`, this._stringifyErrorMessage(error));
      if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, error)));
      
      if (retries < maxRetries) {
        console.log(`Falling back to next provider...`);
        return await this.withTextFallback(operationName, operationFn, retries + 1);
      }
      
      throw error;
    }
  }

  async invokeText(messages, options = {}) {
    const filteredMessages = sensitiveFilter.prepareMessages(messages, {
      mode: options?.sensitiveFilterMode,
    });

    const preferred = typeof options.provider === 'string' ? options.provider.trim() : '';
    const allowedRaw = Array.isArray(options.allowedProviders) ? options.allowedProviders : [];
    const allowedFromEnv = !allowedRaw.length && !preferred
      ? String(process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY || process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED || '').trim()
      : '';
    const allowedProviders = (allowedRaw.length ? allowedRaw : allowedFromEnv ? [allowedFromEnv] : [])
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean);

    const baseAdapters = Array.isArray(options.adapters) && options.adapters.length ? options.adapters : this.textAdapters;
    const scopedAdapters = allowedProviders.length
      ? baseAdapters.filter((a) => a && allowedProviders.includes(a.name))
      : baseAdapters;
    if (allowedProviders.length && scopedAdapters.length === 0) {
      const err = new Error(`未找到可用的文本模型提供商：${allowedProviders.join(', ')}`);
      err.code = 'TEXT_PROVIDER_NOT_FOUND';
      throw err;
    }

    const adapters = (() => {
      if (!preferred) return scopedAdapters;
      const preferredAdapter = scopedAdapters.find(a => a.name === preferred);
      if (!preferredAdapter) return scopedAdapters;
      const rest = scopedAdapters.filter(a => a !== preferredAdapter);
      return [preferredAdapter, ...rest];
    })();

    const onAdapterStart = typeof options?.onAdapterStart === 'function' ? options.onAdapterStart : null;
    let lastError = null;
    for (const adapter of adapters) {
      try {
        if (onAdapterStart) await onAdapterStart({ adapter });
        console.log(`Attempting invokeText with provider: ${adapter.name}`);
        return await adapter.invoke(filteredMessages);
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${adapter.name} failed for invokeText:`, this._stringifyErrorMessage(error));
        if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, error)));
        if (this._isProviderProtocolError(error)) {
          await this._probeOpenAIModelsEndpoint({ provider: adapter?.name, baseURL: adapter?.baseURL, apiKey: adapter?.apiKey });
          await this._probeOpenAIChatCompletionsEndpoint({
            provider: adapter?.name,
            baseURL: adapter?.baseURL,
            apiKey: adapter?.apiKey,
            model: adapter?.model,
          });
        }
      }
    }

    if (lastError) throw lastError;
    const err = new Error('文本模型调用失败');
    err.code = 'TEXT_PROVIDER_ALL_FAILED';
    throw err;
  }

  /**
   * 带降级的图片生成调用
   */
  async withImageFallback(operationName, operationFn, retries = 0) {
    const maxRetries = this.imageAdapters.length - 1;

    if (retries > maxRetries) {
      const err = new Error(`所有图片生成提供商均调用失败：${operationName}`);
      err.code = 'IMAGE_PROVIDER_ALL_FAILED';
      throw err;
    }

    const adapter = this.imageAdapters[retries];

    try {
      console.log(`Attempting ${operationName} with provider: ${adapter.name} (attempt ${retries + 1})`);
      const result = await operationFn(adapter);
      console.log(`Successfully completed ${operationName} with provider: ${adapter.name}`);
      return result;
    } catch (error) {
      console.warn(`Provider ${adapter.name} failed for ${operationName}:`, this._stringifyErrorMessage(error));
      if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, error)));
      
      if (retries < maxRetries) {
        console.log(`Falling back to next provider...`);
        return await this.withImageFallback(operationName, operationFn, retries + 1);
      }
      
      throw error;
    }
  }

  /**
   * 生成图片
   */
  async generateImage(prompt, options = {}) {
    const shouldLogPrompt = process.env.IMAGE_LOG_PROMPT === 'true';
    const { normalized: normalizedPrompt, prepared: preparedPrompt, matched } =
      sensitiveFilter.prepareImagePrompt(prompt);
    const promptToSend = preparedPrompt || normalizedPrompt;

    if (shouldLogPrompt && matched.length) {
      console.log('[image] sensitive_matched', matched.join(','));
      if (promptToSend !== normalizedPrompt) {
        console.log('[image] prompt_softened_len', promptToSend.length);
        console.log('[image] prompt_softened_sent', promptToSend);
      }
    }

    const preferred = typeof options.provider === 'string' ? options.provider : '';
    const adapters = (() => {
      if (!preferred) return this.imageAdapters;
      const preferredAdapter = this.imageAdapters.find(a => a.name === preferred);
      if (!preferredAdapter) return this.imageAdapters;
      const rest = this.imageAdapters.filter(a => a !== preferredAdapter);
      return [preferredAdapter, ...rest];
    })();

    const onAdapterStart = typeof options?.onAdapterStart === 'function' ? options.onAdapterStart : null;
    let lastError = null;
    for (const adapter of adapters) {
      try {
        if (onAdapterStart) await onAdapterStart({ adapter });
        console.log(`Attempting generateImage with provider: ${adapter.name}`);
        return await adapter.generateImage(promptToSend, options);
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${adapter.name} failed for generateImage:`, this._stringifyErrorMessage(error));
        if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, error)));

        const canRetry = sensitiveFilter.isInvalidPromptError(error);
        if (canRetry) {
          const fallbackPrompt = sensitiveFilter.soften(normalizedPrompt, 2);
          const shouldRetry = fallbackPrompt && fallbackPrompt !== promptToSend;
          if (shouldRetry) {
            if (shouldLogPrompt) {
              console.log('[image] prompt_retry_softened_len', fallbackPrompt.length);
              console.log('[image] prompt_retry_softened_sent', fallbackPrompt);
            }
            try {
              return await adapter.generateImage(fallbackPrompt, options);
            } catch (retryError) {
              lastError = retryError;
              console.warn(`Provider ${adapter.name} failed for generateImage retry:`, this._stringifyErrorMessage(retryError));
              if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, retryError)));
            }
          }
        }
      }
    }

    if (lastError) throw lastError;
    const err = new Error('图片生成失败');
    err.code = 'IMAGE_PROVIDER_ALL_FAILED';
    throw err;
  }

  _isRateLimitError(error) {
    if (!error) return false;
    if (error?.status === 429) return true;
    if (error?.lc_error_code === 'MODEL_RATE_LIMIT') return true;
    const msg = String(error?.message || error).toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('model_rate_limit');
  }

  _isTimeoutError(error) {
    if (!error) return false;
    if (error?.status === 504) return true;
    const code = typeof error?.code === 'string' ? error.code : '';
    if (code && code.toUpperCase().includes('TIMEOUT')) return true;
    const msg = String(error?.message || error).toLowerCase();
    return msg.includes('timeout');
  }

  _isToolSchemaNotSupportedError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
      msg.includes('tools') &&
      (msg.includes('unsupported') ||
        msg.includes('not supported') ||
        msg.includes('unknown') ||
        msg.includes('invalid') ||
        msg.includes('unexpected'))
    );
  }

  _isToolInteropError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes('tool_call_id') || msg.includes('tool_calls') || msg.includes('function_call')) return true;
    if (msg.includes("cannot read properties of undefined") && msg.includes("reading 'message'")) return true;
    return false;
  }

  _isProviderProtocolError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes("cannot read properties of undefined") && msg.includes("reading 'message'")) return true;
    if (msg.includes('invalid json response body')) return true;
    if (msg.includes('unexpected token') && msg.includes('json')) return true;
    return false;
  }

  async _probeOpenAIModelsEndpoint({ provider, baseURL, apiKey }) {
    if (!this._debugEnabled()) return;
    const name = typeof provider === 'string' ? provider.trim() : '';
    const rawBase = typeof baseURL === 'string' ? baseURL.trim() : '';
    const key = typeof apiKey === 'string' ? apiKey : '';
    if (!name || !rawBase || !key) return;

    const base = rawBase.replace(/\/+$/, '');
    const cacheKey = `models|${name}|${base}`;
    if (this._probeCache.has(cacheKey)) return;
    this._probeCache.add(cacheKey);

    const url = `${base}/models`;
    const abortController = new AbortController();
    const timeoutMsRaw = Number(process.env.AI_CHAT_PROVIDER_PROBE_TIMEOUT_MS || '5000');
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 5000;
    const t = setTimeout(() => abortController.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: abortController.signal,
      });
      const text = await res.text();
      const preview = text.slice(0, 400);
      console.warn('[ai-chat] provider.probe', JSON.stringify({
        provider: name,
        url,
        status: res.status,
        ok: res.ok,
        ms: Date.now() - start,
        preview,
      }));
    } catch (error) {
      console.warn('[ai-chat] provider.probe_err', JSON.stringify({
        provider: name,
        url,
        ms: Date.now() - start,
        error: this._stringifyErrorMessage(error),
      }));
    } finally {
      clearTimeout(t);
    }
  }

  async _probeOpenAIChatCompletionsEndpoint({ provider, baseURL, apiKey, model }) {
    if (!this._debugEnabled()) return;
    const name = typeof provider === 'string' ? provider.trim() : '';
    const rawBase = typeof baseURL === 'string' ? baseURL.trim() : '';
    const key = typeof apiKey === 'string' ? apiKey : '';
    const modelName = typeof model === 'string' ? model : '';
    if (!name || !rawBase || !key || !modelName) return;

    const base = rawBase.replace(/\/+$/, '');
    const cacheKey = `chat|${name}|${base}|${modelName}`;
    if (this._probeCache.has(cacheKey)) return;
    this._probeCache.add(cacheKey);

    const url = `${base}/chat/completions`;
    const abortController = new AbortController();
    const timeoutMsRaw = Number(process.env.AI_CHAT_PROVIDER_PROBE_TIMEOUT_MS || '5000');
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 5000;
    const t = setTimeout(() => abortController.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: abortController.signal,
      });
      const text = await res.text();
      const preview = text.slice(0, 400);
      console.warn('[ai-chat] provider.probe', JSON.stringify({
        provider: name,
        url,
        status: res.status,
        ok: res.ok,
        ms: Date.now() - start,
        preview,
      }));
    } catch (error) {
      console.warn('[ai-chat] provider.probe_err', JSON.stringify({
        provider: name,
        url,
        ms: Date.now() - start,
        error: this._stringifyErrorMessage(error),
      }));
    } finally {
      clearTimeout(t);
    }
  }

  _normalizeMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
          }
          return '';
        })
        .join('');
    }
    if (content && typeof content === 'object') {
      try {
        return JSON.stringify(content);
      } catch {}
    }
    if (content == null) return '';
    return String(content);
  }

  /**
   * 创建带自动降级的 Agent Runnable
   * 优先使用 createReactAgent (LangGraph)
   */
  async createAgent({ tools, systemPrompt, provider, allowedProviders, modelscopeMaxRequestsPerChat }) {
    // 经查证，@langchain/langgraph 1.x 中推荐使用 createReactAgent
    // 虽然有弃用警告说移到了 langchain，但在 LangGraph 1.x 生态中，prebuilt 依然是主要入口
    // 之前的尝试 createAgent 失败是因为参数不匹配（需要 model 而不是 llm）
    const { createReactAgent } = require('@langchain/langgraph/prebuilt');
    const { MemorySaver } = require('@langchain/langgraph');

    // 1. 筛选适配器
    const rawAdapters = this.textAdapters;
    const allowed = Array.isArray(allowedProviders) ? allowedProviders.filter(p => typeof p === 'string' && p) : [];
    const baseAdapters = allowed.length ? rawAdapters.filter(a => a && allowed.includes(a.name)) : rawAdapters;
    
    // 排序：首选 -> 其他
    const sortedAdapters = (() => {
      if (!provider) return baseAdapters;
      const hit = baseAdapters.find(a => a && a.name === provider);
      if (!hit) return baseAdapters;
      const rest = baseAdapters.filter(a => a !== hit);
      return [hit, ...rest];
    })();

    if (sortedAdapters.length === 0) {
      throw new Error('No available text providers found');
    }

    // 2. 为每个适配器创建 Agent Runnable
    const agents = [];
    for (const adapter of sortedAdapters) {
      try {
        const llm = adapter.createLLM();
        if (!llm) continue;

        // 强制包装 LLM 以注入 metadata (确保 LLM 层面也能触发回调)
        // 这样即使 createReactAgent 吞掉了顶层 metadata，LLM 执行时依然能携带
        const wrappedLLM = llm.withConfig({
           metadata: {
             provider: adapter.name,
             model: adapter.model
           }
        });

        // 手动添加 metadata 到 agent
        const agent = createReactAgent({
          llm: wrappedLLM,
          tools: tools || [],
          stateModifier: systemPrompt
        });
        
        // 使用 withConfig 包装 Runnable
        const wrappedAgent = agent.withConfig({
          metadata: {
            provider: adapter.name,
            model: adapter.model
          },
          runName: `Agent[${adapter.name}]`
        });
        
        agents.push(wrappedAgent);
      } catch (e) {
        console.warn(`Failed to create agent for provider ${adapter.name}:`, e);
      }
    }

    if (agents.length === 0) {
      throw new Error('Failed to create any agents');
    }

    // 3. 组合 Fallbacks
    const primaryAgent = agents[0];
    const fallbacks = agents.slice(1);
    const agentWithFallback = primaryAgent.withFallbacks(fallbacks);

    return agentWithFallback;
  }

  // 保留旧方法以兼容（但建议迁移）
  // async invokeToolCallingAgent(options = {}) {
  //   // 尝试使用新的 createAgent 逻辑，如果失败回退到旧逻辑
  //   // 为了稳妥，这里先保留旧逻辑，但我们在 aiChatService 中调用 createAgent
  //   // ... (Old logic omitted for brevity, keeping file content same as before for this method for now)
  //   // Actually, I will just append the new method and leave the old one as is to avoid breaking anything else
  //   // that relies on it, although user wants to "fix" it.
  //   // The user specifically complained about "Manual Chain".
  //   // So I should probably REPLACE the logic in invokeToolCallingAgent to use createAgent if I can, 
  //   // OR just use createAgent in aiChatService.
    
  //   // Let's stick to adding createAgent first.

  //   const { createReactAgent } = require('@langchain/langgraph/prebuilt');
  //   const [{ AIMessage, HumanMessage, SystemMessage, ToolMessage }] = await Promise.all([import('@langchain/core/messages')]);

  //   const messages = Array.isArray(options?.messages) ? options.messages : [];
  //   const tools = Array.isArray(options?.tools) ? options.tools : [];
  //   const prompt = typeof options?.prompt === 'string' ? options.prompt : '';
  //   const onStep = typeof options?.onStep === 'function' ? options.onStep : null;

  //   const recursionLimitRaw = Number(options?.recursionLimit);
  //   const recursionLimit = Number.isFinite(recursionLimitRaw) && recursionLimitRaw > 0 ? recursionLimitRaw : 20;

  //   const modelInvokeTimeoutMsRaw = Number(options?.modelInvokeTimeoutMs);
  //   const modelInvokeTimeoutMs =
  //     Number.isFinite(modelInvokeTimeoutMsRaw) && modelInvokeTimeoutMsRaw > 0 ? modelInvokeTimeoutMsRaw : 60000;

  //   const modelscopeMaxRequestsRaw = Number(options?.modelscopeMaxRequestsPerChat);
  //   const modelscopeMaxRequests =
  //     Number.isFinite(modelscopeMaxRequestsRaw) && modelscopeMaxRequestsRaw > 0 ? modelscopeMaxRequestsRaw : null;

  //   const preferred = typeof options?.provider === 'string' ? options.provider : '';
  //   const rawAdapters = Array.isArray(options?.adapters) && options.adapters.length ? options.adapters : this.textAdapters;
  //   const allowed = Array.isArray(options?.allowedProviders) ? options.allowedProviders.filter((p) => typeof p === 'string' && p) : [];
  //   const baseAdapters = allowed.length ? rawAdapters.filter((a) => a && allowed.includes(a.name)) : rawAdapters;
  //   const adapters = (() => {
  //     if (!preferred) return baseAdapters;
  //     const hit = baseAdapters.find((a) => a && a.name === preferred);
  //     if (!hit) return baseAdapters;
  //     const rest = baseAdapters.filter((a) => a !== hit);
  //     return [hit, ...rest];
  //   })();
  //   if (allowed.length && adapters.length === 0) {
  //     const err = new Error(`未找到可用的模型提供商：${allowed.join(', ')}`);
  //     err.code = 'TEXT_PROVIDER_NOT_FOUND';
  //     throw err;
  //   }

  //   const withTimeout = (promise, timeoutMs, code) => {
  //     const msRaw = Number(timeoutMs);
  //     const ms = Number.isFinite(msRaw) && msRaw > 0 ? msRaw : 60000;
  //     return Promise.race([
  //       Promise.resolve(promise),
  //       new Promise((_, reject) => {
  //         const t = setTimeout(() => {
  //           const err = new Error(code || 'TIMEOUT');
  //           err.message = this._zhErrorMessage(code || 'TIMEOUT', err.message);
  //           err.status = 504;
  //           err.code = code || 'TIMEOUT';
  //           reject(err);
  //         }, ms);
  //         if (t && typeof t.unref === 'function') t.unref();
  //       }),
  //     ]);
  //   };

  //   const wrapModelWithRequestLimit = (base, { limit, provider }) => {
  //     if (!base || typeof base !== 'object') return base;
  //     const max = Number(limit);
  //     if (!Number.isFinite(max) || max <= 0) return base;

  //     let used = 0;
  //     const shouldCount = (prop) => prop === 'invoke' || prop === 'batch' || prop === 'stream' || prop === 'streamEvents';
  //     const shouldWrapFactory = (prop) => prop === 'bindTools' || prop === 'bind' || prop === 'withConfig';

  //     const makeLimitError = () => {
  //       const err = new Error(this._zhErrorMessage('MODELSCOPE_REQUEST_LIMIT', 'MODELSCOPE_REQUEST_LIMIT'));
  //       err.code = 'MODELSCOPE_REQUEST_LIMIT';
  //       err.status = 429;
  //       err.meta = { provider, limit: max, used };
  //       return err;
  //     };

  //     const wrap = (target) =>
  //       new Proxy(target, {
  //         get(t, prop, receiver) {
  //           const value = Reflect.get(t, prop, receiver);
  //           if (typeof prop === 'string' && typeof value === 'function') {
  //             if (shouldCount(prop)) {
  //               return async (...args) => {
  //                 used += 1;
  //                 if (used > max) throw makeLimitError();
  //                 return await value.apply(t, args);
  //               };
  //             }
  //             if (shouldWrapFactory(prop)) {
  //               return (...args) => {
  //                 const out = value.apply(t, args);
  //                 if (out && typeof out === 'object') return wrap(out);
  //                 return out;
  //               };
  //             }
  //           }
  //           return value;
  //         },
  //       });

  //     return wrap(base);
  //   };

  //   const toolCallingCapabilityCache = this._toolCallingCapabilityCache || (this._toolCallingCapabilityCache = new Map());

  //   const msgKind = (m) => {
  //     if (!m) return '';
  //     const role =
  //       typeof m.role === 'string'
  //         ? m.role
  //         : typeof m?.kwargs?.role === 'string'
  //           ? m.kwargs.role
  //           : typeof m?.lc_kwargs?.role === 'string'
  //             ? m.lc_kwargs.role
  //             : '';
  //     const roleNorm = typeof role === 'string' ? role.trim().toLowerCase() : '';
  //     if (roleNorm === 'assistant' || roleNorm === 'ai') return 'ai';
  //     if (roleNorm === 'user' || roleNorm === 'human') return 'human';
  //     if (roleNorm === 'system') return 'system';
  //     if (roleNorm === 'tool') return 'tool';
  //     try {
  //       const t =
  //         typeof m.getType === 'function'
  //           ? m.getType()
  //           : typeof m._getType === 'function'
  //             ? m._getType()
  //             : typeof m.type === 'string'
  //               ? m.type
  //               : typeof m._type === 'string'
  //                 ? m._type
  //                 : '';
  //       const raw = typeof t === 'string' ? t.toLowerCase() : '';
  //       if (raw.includes('tool')) return 'tool';
  //       if (raw.includes('ai') || raw.includes('assistant')) return 'ai';
  //       if (raw.includes('human') || raw.includes('user')) return 'human';
  //       if (raw.includes('system')) return 'system';
  //     } catch {}
  //     const cn = typeof m?.constructor?.name === 'string' ? m.constructor.name.toLowerCase() : '';
  //     if (cn.includes('tool')) return 'tool';
  //     if (cn.includes('ai')) return 'ai';
  //     if (cn.includes('human')) return 'human';
  //     if (cn.includes('system')) return 'system';
  //     return '';
  //   };

  //   const tryParseJsonObject = (text) => {
  //     const raw = typeof text === 'string' ? text.trim() : '';
  //     if (!raw) return null;
  //     try {
  //       return JSON.parse(raw);
  //     } catch {}
  //     const m = raw.match(/\{[\s\S]*\}/);
  //     if (m && m[0]) {
  //       try {
  //         return JSON.parse(m[0]);
  //       } catch {}
  //     }
  //     return null;
  //   };

  //   const pickToolContent = (value) => {
  //     if (typeof value === 'string') return value;
  //     if (value && typeof value === 'object') {
  //       if (typeof value.content === 'string') return value.content;
  //       if (typeof value?.kwargs?.content === 'string') return value.kwargs.content;
  //       if (typeof value?.lc_kwargs?.content === 'string') return value.lc_kwargs.content;
  //     }
  //     return this._normalizeMessageContent(value);
  //   };

  //   const buildToolCallId = (name, args) => {
  //     if (!name) return '';
  //     let raw = '';
  //     if (typeof args === 'string') {
  //       raw = args;
  //     } else {
  //       try {
  //         raw = JSON.stringify(args ?? {});
  //       } catch {
  //         raw = String(args ?? '');
  //       }
  //     }
  //     return `${name}:${raw}`;
  //   };

  //   const maxToolCallsRaw = Number(options?.maxToolCalls);
  //   const maxToolCalls = Number.isFinite(maxToolCallsRaw) && maxToolCallsRaw > 0 ? Math.min(64, Math.floor(maxToolCallsRaw)) : null;
  //   let toolCallCount = 0;
  //   let toolUsed = false;
  //   const makeToolCallsExceededError = () => {
  //     const err = new Error(this._zhErrorMessage('TOOL_CALLS_EXCEEDED', '工具调用次数过多'));
  //     err.code = 'TOOL_CALLS_EXCEEDED';
  //     err.status = 429;
  //     err.meta = { limit: maxToolCalls, used: toolCallCount };
  //     return err;
  //   };
  //   const ensureToolCallAllowed = () => {
  //     if (!maxToolCalls) return;
  //     if (toolCallCount >= maxToolCalls) {
  //       toolUsed = true;
  //       throw makeToolCallsExceededError();
  //     }
  //     toolCallCount += 1;
  //   };

  //   const runCompatToolAgent = async ({ llm, providerName }) => {
  //     const maxTurnsRaw = Number(process.env.AI_CHAT_COMPAT_AGENT_MAX_TURNS || '6');
  //     const maxTurns = Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.min(30, Math.floor(maxTurnsRaw)) : 6;
  //     const toolList = tools.map((t) => (t && typeof t === 'object' ? t.name : '')).filter(Boolean).slice(0, 64);
  //     const compatPrompt = `${prompt}\n\n你可以使用工具来获取信息。\n请严格遵守以下输出格式之一：\n1) 需要调用工具时：TOOL_CALL {\"name\":\"tool_name\",\"args\":{...}}\n2) 可以直接回答时：FINAL <你的回答>\n除以上格式不要输出其他内容。\n可用工具：${toolList.join(', ')}`;
  //     const convo = [new SystemMessage(compatPrompt), ...messages];
  //     const toolMap = new Map(tools.map((t) => [t?.name, t]).filter(([k]) => typeof k === 'string' && k));

  //     for (let turn = 0; turn < maxTurns; turn++) {
  //       const ai = await withTimeout(llm.invoke(convo), modelInvokeTimeoutMs, 'MODEL_INVOKE_TIMEOUT');
  //       const aiText = this._normalizeMessageContent(ai?.content).trim();
  //       if (!aiText) return '';

  //       if (aiText.startsWith('FINAL')) {
  //         const out = aiText.replace(/^FINAL\s*/i, '').trim();
  //         if (onStep && out) {
  //           try {
  //             onStep({ role: 'ai', content: out });
  //           } catch {}
  //         }
  //         return out || '';
  //       }

  //       const idx = aiText.toUpperCase().indexOf('TOOL_CALL');
  //       if (idx >= 0) {
  //         const jsonPart = aiText.slice(idx + 'TOOL_CALL'.length).trim();
  //         const parsed = tryParseJsonObject(jsonPart);
  //         const toolName = typeof parsed?.name === 'string' ? parsed.name : typeof parsed?.tool === 'string' ? parsed.tool : '';
  //         const args = parsed?.args ?? parsed?.arguments ?? parsed?.input ?? {};
  //         const tool = toolMap.get(toolName);
  //         ensureToolCallAllowed();
  //         const toolCallId = buildToolCallId(toolName, args);
  //         toolUsed = true;
  //         if (onStep && toolName) {
  //           try {
  //             onStep({ role: 'assistant', toolCalls: JSON.stringify([{ name: toolName, args, id: toolCallId }]), toolCallId, toolName });
  //           } catch {}
  //         }
  //         if (!tool || typeof tool.invoke !== 'function') {
  //           convo.push(new AIMessage(aiText));
  //           convo.push(new HumanMessage(`TOOL_RESULT ${toolName} ERROR: unknown tool`));
  //           continue;
  //         }
  //         const toolOut = await withTimeout(tool.invoke(args), modelInvokeTimeoutMs, 'TOOL_INVOKE_TIMEOUT');
  //         const toolText = pickToolContent(toolOut);
  //         if (onStep) {
  //           try {
  //             onStep({ role: 'tool', toolResults: toolText, toolCallId, toolName });
  //           } catch {}
  //         }
  //         convo.push(new AIMessage(aiText));
  //         convo.push(new HumanMessage(`TOOL_RESULT ${toolName}:\n${toolText}`));
  //         continue;
  //       }

  //       if (onStep && aiText) {
  //         try {
  //           onStep({ role: 'ai', content: aiText });
  //         } catch {}
  //       }
  //       return aiText;
  //     }

  //     return '';
  //   };

  //   const supportsNativeTools = async (providerName, llm) => {
  //     const name = typeof providerName === 'string' ? providerName.trim().toLowerCase() : '';
  //     if (!name) return true;
  //     if (name !== 'gitcode') return true;

  //     if (toolCallingCapabilityCache.has(name)) return toolCallingCapabilityCache.get(name);

  //     const probeEnabledRaw = process.env.AI_CHAT_TOOLCALL_PROBE_ENABLED;
  //     const probeEnabled = probeEnabledRaw == null || probeEnabledRaw === '' ? true : probeEnabledRaw === '1' || probeEnabledRaw.toLowerCase() === 'true';
  //     if (!probeEnabled) {
  //       toolCallingCapabilityCache.set(name, true);
  //       return true;
  //     }

  //     const probeTimeoutMsRaw = Number(process.env.AI_CHAT_TOOLCALL_PROBE_TIMEOUT_MS || '8000');
  //     const probeTimeoutMs = Number.isFinite(probeTimeoutMsRaw) && probeTimeoutMsRaw > 0 ? probeTimeoutMsRaw : 8000;

  //     const probeRecursionLimitRaw = Number(process.env.AI_CHAT_TOOLCALL_PROBE_RECURSION_LIMIT || '8');
  //     const probeRecursionLimit =
  //       Number.isFinite(probeRecursionLimitRaw) && probeRecursionLimitRaw > 0 ? probeRecursionLimitRaw : 8;

  //     try {
  //       const { z } = require('zod');
  //       const { DynamicStructuredTool } = require('@langchain/core/tools');

  //       let called = 0;
  //       const probeTool = new DynamicStructuredTool({
  //         name: '__probe_tool_calling',
  //         description: 'Internal capability probe tool.',
  //         schema: z.object({}).passthrough(),
  //         func: async () => {
  //           called += 1;
  //           return 'OK';
  //         },
  //       });

  //       const probePrompt =
  //         'You are testing tool calling. Call the tool __probe_tool_calling exactly once. After you receive the tool result, respond with exactly: OK';

  //       const agent = createReactAgent({ llm, tools: [probeTool], prompt: probePrompt });
  //       const outState = await withTimeout(
  //         agent.invoke({ messages: [new HumanMessage('Run the tool calling probe now.')] }, { recursionLimit: probeRecursionLimit }),
  //         probeTimeoutMs,
  //         'TOOLCALL_PROBE_TIMEOUT',
  //       );

  //       const outMessages = Array.isArray(outState?.messages) ? outState.messages : [];
  //       const toolMsgs = outMessages.filter((m) => msgKind(m) === 'tool' || m instanceof ToolMessage);
  //       const lastAi = (() => {
  //         for (let i = outMessages.length - 1; i >= 0; i--) {
  //           const m = outMessages[i];
  //           if (msgKind(m) === 'ai' || m instanceof AIMessage) return m;
  //         }
  //         return null;
  //       })();

  //       const lastText = this._normalizeMessageContent(lastAi?.content).trim();
  //       const ok = lastText === 'OK' && called === 1 && toolMsgs.length >= 1;
  //       toolCallingCapabilityCache.set(name, ok);
  //       if (this._debugEnabled()) console.warn(`[ai-chat] toolcall_probe`, JSON.stringify({ provider: providerName, ok, called, toolMsgs: toolMsgs.length, lastText }));
  //       return ok;
  //     } catch {
  //       toolCallingCapabilityCache.set(name, false);
  //       if (this._debugEnabled()) console.warn(`[ai-chat] toolcall_probe`, JSON.stringify({ provider: providerName, ok: false }));
  //       return false;
  //     }
  //   };

  //   const wrapTool = (tool) => {
  //     if (!onStep || !tool || typeof tool.invoke !== 'function') return tool;
  //     const invoke = tool.invoke.bind(tool);
  //     return {
  //       ...tool,
  //       invoke: async (args) => {
  //         const name = typeof tool?.name === 'string' ? tool.name : '';
  //         const toolCallId = buildToolCallId(name, args);
  //         ensureToolCallAllowed();
  //         if (name) {
  //           toolUsed = true;
  //           try {
  //             onStep({ role: 'assistant', toolCalls: JSON.stringify([{ name, args, id: toolCallId }]), toolCallId, toolName: name });
  //           } catch {}
  //         }
  //         const out = await invoke(args);
  //         const toolText = pickToolContent(out);
  //         try {
  //           onStep({ role: 'tool', toolResults: toolText, toolCallId, toolName: name });
  //         } catch {}
  //         return out;
  //       },
  //     };
  //   };

  //   const streamingTools = onStep ? tools.map((tool) => wrapTool(tool)) : tools;

  //   let lastErr = null;
  //   for (const adapter of adapters) {
  //     if (!adapter || typeof adapter.createLLM !== 'function') continue;
  //     const providerName = typeof adapter?.name === 'string' ? adapter.name : '';
  //     const llmBase = adapter.createLLM();
  //     const llm =
  //       modelscopeMaxRequests && providerName.toLowerCase().startsWith('modelscope')
  //         ? wrapModelWithRequestLimit(llmBase, { limit: modelscopeMaxRequests, provider: providerName })
  //         : llmBase;
  //     if (!llm) continue;
  //     const nativeOk = await supportsNativeTools(providerName, llm);
  //     if (!nativeOk) {
  //       try {
  //         if (typeof options?.onAdapterStart === 'function') {
  //           await options.onAdapterStart({ adapter });
  //         }
  //         const started = Date.now();
  //         const compatText = await runCompatToolAgent({ llm, providerName });
  //         if (compatText && compatText.trim()) return { text: compatText, provider: adapter?.name || '', ms: Date.now() - started };
  //       } catch (e) {
  //         const err = e instanceof Error ? e : new Error(String(e));
  //         lastErr = err;
  //         if (typeof options?.onAdapterError === 'function') {
  //           await options.onAdapterError({ adapter, error: err });
  //         }
  //         if (toolUsed) break;
  //       }
  //       continue;
  //     }

  //     try {
  //       const started = Date.now();
  //       if (typeof options?.onAdapterStart === 'function') {
  //         await options.onAdapterStart({ adapter });
  //       }
  //       const agent = createReactAgent({ llm, tools: streamingTools, prompt });
  //       const outState = await withTimeout(agent.invoke({ messages }, { recursionLimit }), modelInvokeTimeoutMs, 'MODEL_INVOKE_TIMEOUT');
  //       const outMessages = Array.isArray(outState?.messages) ? outState.messages : [];
  //       let lastAi = null;
  //       for (let i = outMessages.length - 1; i >= 0; i--) {
  //         const m = outMessages[i];
  //         if (msgKind(m) === 'ai' || m instanceof AIMessage) {
  //           lastAi = m;
  //           break;
  //         }
  //       }
  //       const text = this._normalizeMessageContent(lastAi?.content);
  //       if (onStep && text && text.trim()) {
  //         try {
  //           onStep({ role: 'ai', content: text });
  //         } catch {}
  //       }
  //       if (text && text.trim()) return { text, provider: adapter?.name || '', ms: Date.now() - started, steps: outMessages };

  //       if (this._debugEnabled()) {
  //         const tail = outMessages.slice(-10).map((m) => {
  //           const kind = msgKind(m);
  //           const content = this._normalizeMessageContent(m?.content);
  //           const preview = typeof content === 'string' ? content.slice(0, 80) : String(content ?? '').slice(0, 80);
  //           const extra =
  //             m && typeof m === 'object'
  //               ? {
  //                   role: typeof m.role === 'string' ? m.role : typeof m?.kwargs?.role === 'string' ? m.kwargs.role : '',
  //                   hasToolCalls: !!(m?.tool_calls || m?.additional_kwargs?.tool_calls || m?.kwargs?.tool_calls),
  //                   hasFunctionCall: !!(m?.additional_kwargs?.function_call || m?.kwargs?.function_call),
  //                 }
  //               : {};
  //           return { kind, content_len: typeof content === 'string' ? content.length : String(content ?? '').length, preview, ...extra };
  //         });
  //         console.warn(`[ai-chat] agent.empty_messages`, JSON.stringify({ provider: adapter?.name || '', tail }));
  //       }

  //       const emptyErr = new Error('MODEL_EMPTY_RESPONSE');
  //       emptyErr.code = 'MODEL_EMPTY_RESPONSE';
  //       emptyErr.status = 502;
  //       emptyErr.meta = { provider: adapter?.name || '', ms: Date.now() - started };
  //       lastErr = emptyErr;
  //       if (typeof options?.onAdapterError === 'function') {
  //         await options.onAdapterError({ adapter, error: emptyErr });
  //       }
  //       if (toolUsed) break;
  //       continue;
  //     } catch (e) {
  //       const err = e instanceof Error ? e : new Error(String(e));
  //       lastErr = err;
  //       if (typeof options?.onAdapterError === 'function') {
  //         await options.onAdapterError({ adapter, error: err });
  //       }
  //       if (toolUsed) break;
  //       continue;
  //     }
  //   }

  //   if (lastErr) throw lastErr;
  //   const err = new Error(this._zhErrorMessage('MODEL_INVOKE_FAILED', '模型调用失败'));
  //   err.code = 'MODEL_INVOKE_FAILED';
  //   throw err;
  // }

  /**
   * 获取可用的文本提供商列表
   */
  getAvailableTextProviders() {
    return this.textAdapters.map(adapter => ({
      name: adapter.name,
      model: adapter.model,
      enabled: adapter.enabled,
    }));
  }

  /**
   * 获取可用的图片提供商列表
   */
  getAvailableImageProviders() {
    return this.imageAdapters.map(adapter => ({
      name: adapter.name,
      model: adapter.model,
      enabled: adapter.enabled,
    }));
  }

  /**
   * 测试所有提供商连接
   */
  async testAllConnections() {
    const results = {
      text: {},
      image: {},
    };

    for (const adapter of this.textAdapters) {
      try {
        results.text[adapter.name] = await adapter.testConnection();
      } catch (error) {
        results.text[adapter.name] = false;
      }
    }

    for (const adapter of this.imageAdapters) {
      try {
        results.image[adapter.name] = await adapter.testConnection();
      } catch (error) {
        results.image[adapter.name] = false;
      }
    }

    return results;
  }
}

module.exports = LangChainManager;
