const ModelScopeAdapter = require('./text/ModelScopeAdapter');
const GitCodeAdapter = require('./text/GitCodeAdapter');
const DashScopeAdapter = require('./text/DashScopeAdapter');
const ModelScopeImageAdapter = require('./image/ModelScopeImageAdapter');
const sensitiveFilter = require('../../utils/sensitiveFilter');

/**
 * LangChain 管理器
 * 统一管理所有 AI 调用，提供商选择和降级
 */
class LangChainManager {
  constructor(textProviders, imageProviders) {
    // 初始化文本生成适配器
    this.textAdapters = textProviders.map(provider => {
      const name = typeof provider?.name === 'string' ? provider.name : '';
      if (name === 'modelscope' || name.startsWith('modelscope_')) return new ModelScopeAdapter(provider);
      if (name === 'gitcode') return new GitCodeAdapter(provider);
      if (name === 'dashscope') return new DashScopeAdapter(provider);
      console.warn(`Unknown text provider: ${provider.name}`);
      return null;
    }).filter(adapter => adapter !== null && adapter.isAvailable());

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

    console.log(`Initialized ${this.textAdapters.length} text providers and ${this.imageAdapters.length} image providers`);
  }

  _debugEnabled() {
    const v = process.env.AI_CHAT_DEBUG;
    if (!v) return false;
    return v === '1' || v.toLowerCase() === 'true';
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
    const headers = this._pickHeaders(error?.headers || error?.response?.headers);
    const baseURLHasV1 = typeof baseURL === 'string' ? baseURL.includes('/v1') : false;
    return { provider: adapter?.name, model, baseURL, baseURLHasV1, status, code, type, name, message, headers };
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
      throw new Error('No available text providers');
    }
    return this.textAdapters[0];
  }

  /**
   * 选择可用的图片提供商
   * 按优先级顺序返回第一个可用的提供商
   */
  selectImageProvider() {
    if (this.imageAdapters.length === 0) {
      throw new Error('No available image providers');
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
      throw new Error(`All text providers failed for operation: ${operationName}`);
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

    const preferred = typeof options.provider === 'string' ? options.provider : '';
    const adapters = (() => {
      if (!preferred) return this.textAdapters;
      const preferredAdapter = this.textAdapters.find(a => a.name === preferred);
      if (!preferredAdapter) return this.textAdapters;
      const rest = this.textAdapters.filter(a => a !== preferredAdapter);
      return [preferredAdapter, ...rest];
    })();

    let lastError = null;
    for (const adapter of adapters) {
      try {
        console.log(`Attempting invokeText with provider: ${adapter.name}`);
        return await adapter.invoke(filteredMessages);
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${adapter.name} failed for invokeText:`, this._stringifyErrorMessage(error));
        if (this._debugEnabled()) console.warn(`[ai-chat] provider_error`, JSON.stringify(this._summarizeProviderError(adapter, error)));
      }
    }

    throw lastError || new Error('All text providers failed for operation: invokeText');
  }

  /**
   * 带降级的图片生成调用
   */
  async withImageFallback(operationName, operationFn, retries = 0) {
    const maxRetries = this.imageAdapters.length - 1;

    if (retries > maxRetries) {
      throw new Error(`All image providers failed for operation: ${operationName}`);
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

    let lastError = null;
    for (const adapter of adapters) {
      try {
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

    throw lastError || new Error('All image providers failed for operation: generateImage');
  }

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
