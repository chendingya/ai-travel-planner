const ModelScopeAdapter = require('./text/ModelScopeAdapter');
const GitCodeAdapter = require('./text/GitCodeAdapter');
const DashScopeAdapter = require('./text/DashScopeAdapter');
const ModelScopeImageAdapter = require('./image/ModelScopeImageAdapter');
const TencentImageAdapter = require('./image/TencentImageAdapter');

/**
 * LangChain 管理器
 * 统一管理所有 AI 调用，提供商选择和降级
 */
class LangChainManager {
  constructor(textProviders, imageProviders) {
    // 初始化文本生成适配器
    this.textAdapters = textProviders.map(provider => {
      switch (provider.name) {
        case 'modelscope':
          return new ModelScopeAdapter(provider);
        case 'gitcode':
          return new GitCodeAdapter(provider);
        case 'dashscope':
          return new DashScopeAdapter(provider);
        default:
          console.warn(`Unknown text provider: ${provider.name}`);
          return null;
      }
    }).filter(adapter => adapter !== null && adapter.isAvailable());

    // 初始化图片生成适配器
    this.imageAdapters = imageProviders.map(provider => {
      switch (provider.name) {
        case 'modelscope':
          return new ModelScopeImageAdapter(provider);
        case 'tencent':
          return new TencentImageAdapter(provider);
        default:
          console.warn(`Unknown image provider: ${provider.name}`);
          return null;
      }
    }).filter(adapter => adapter !== null && adapter.isAvailable());

    console.log(`Initialized ${this.textAdapters.length} text providers and ${this.imageAdapters.length} image providers`);
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
      console.warn(`Provider ${adapter.name} failed for ${operationName}:`, error.message);
      
      if (retries < maxRetries) {
        console.log(`Falling back to next provider...`);
        return await this.withTextFallback(operationName, operationFn, retries + 1);
      }
      
      throw error;
    }
  }

  async invokeText(messages, options = {}) {
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
        return await adapter.invoke(messages);
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${adapter.name} failed for invokeText:`, error.message);
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
      console.warn(`Provider ${adapter.name} failed for ${operationName}:`, error.message);
      
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
        return await adapter.generateImage(prompt, options);
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${adapter.name} failed for generateImage:`, error.message);
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
