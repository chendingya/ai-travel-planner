const BaseImageAdapter = require('../base/BaseImageAdapter');

/**
 * ModelScope 图片生成适配器
 * 使用 ModelScope 的 Z-Image-Turbo 模型
 */
class ModelScopeImageAdapter extends BaseImageAdapter {
  constructor(config) {
    super(config);
    this.name = 'modelscope';
    this.baseURL = config.baseURL;
    this.fallbackApiKey = config.fallbackApiKey;
  }

  normalizedBaseURL() {
    const raw = typeof this.baseURL === 'string' ? this.baseURL.trim() : '';
    return raw.replace(/\/+$/, '');
  }

  normalizedApiKey(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    return v;
  }

  buildUrl(path) {
    const baseURL = this.normalizedBaseURL();
    const normalizedPath = typeof path === 'string' ? path.trim() : '';
    const fullBase = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
    const fullPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return `${fullBase}${fullPath}`;
  }

  buildHeaders(apiKey, extra = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extra,
    };
  }

  async postJson(url, body, apiKey, extraHeaders = {}) {
    return fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(apiKey, extraHeaders),
      },
      body: JSON.stringify(body),
    });
  }

  async getJson(url, apiKey, extraHeaders = {}) {
    return fetch(url, {
      method: 'GET',
      headers: {
        ...this.buildHeaders(apiKey, extraHeaders),
      },
    });
  }

  extractImageUrlFromResult(data) {
    if (!data) return null;
    if (Array.isArray(data.output_images) && data.output_images[0]) return data.output_images[0];
    if (data.images && data.images[0]) return data.images[0].url || data.images[0];
    if (data.output && data.output.image && data.output.image[0]) return data.output.image[0];
    if (data.url) return data.url;
    return null;
  }

  async pollTask(taskId, apiKey, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120000;
    const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 2000;
    const startAt = Date.now();
    const url = this.buildUrl(`/tasks/${taskId}`);

    while (true) {
      if (Date.now() - startAt > timeoutMs) {
        throw new Error(`ModelScope task timeout: ${taskId}`);
      }

      const res = await this.getJson(url, apiKey, {
        'X-ModelScope-Task-Type': 'image_generation',
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ModelScope task API error: ${text}`);
      }

      const data = await res.json();
      const status = typeof data.task_status === 'string' ? data.task_status : '';

      if (status === 'SUCCEED') {
        const imageUrl = this.extractImageUrlFromResult(data);
        return { imageUrl, raw: data };
      }
      if (status === 'FAILED') {
        throw new Error(`ModelScope task failed: ${JSON.stringify(data)}`);
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  /**
   * 生成图片
   */
  async generateImage(prompt, options = {}) {
    try {
      const url = this.buildUrl('/images/generations');

      const primaryKey = this.normalizedApiKey(this.apiKey);
      const fallbackKey = this.normalizedApiKey(this.fallbackApiKey);

      const requestBody = { model: this.model, prompt };

      if (options.size) requestBody.size = options.size;
      if (options.loras) requestBody.loras = options.loras;
      if (options.negative_prompt) requestBody.negative_prompt = options.negative_prompt;
      if (options.steps) requestBody.steps = options.steps;
      if (options.guidance_scale) requestBody.guidance_scale = options.guidance_scale;

      const asyncMode = options.asyncMode !== false;
      const asyncHeaders = asyncMode ? { 'X-ModelScope-Async-Mode': 'true' } : {};

      let response = await this.postJson(url, requestBody, primaryKey, asyncHeaders);
      let usedApiKey = primaryKey;

      if (!response.ok) {
        const errorText = await response.text();
        const isAuthError = errorText.toLowerCase().includes('authentication failed');
        const canFallback = isAuthError && fallbackKey && fallbackKey !== primaryKey;

        if (canFallback) {
          response = await this.postJson(url, requestBody, fallbackKey, asyncHeaders);
          usedApiKey = fallbackKey;
          if (!response.ok) {
            const fallbackText = await response.text();
            throw new Error(`ModelScope API error: ${fallbackText}`);
          }
        } else {
          const hint = isAuthError
            ? 'ModelScope token 无效或已过期，请更新 MODELSCOPE_IMAGE_API_KEY（或清空它让其回退到 MODELSCOPE_TEXT_API_KEY）'
            : '';
          throw new Error(`ModelScope API error: ${errorText}${hint ? `; ${hint}` : ''}`);
        }
      }

      const data = await response.json();

      let imageUrl = null;
      if (asyncMode && data && typeof data.task_id === 'string' && data.task_id.trim()) {
        const taskId = data.task_id.trim();
        const polled = await this.pollTask(taskId, usedApiKey, {
          timeoutMs: options.timeoutMs,
          intervalMs: options.intervalMs,
        });
        imageUrl = polled.imageUrl;
      } else {
        imageUrl = this.extractImageUrlFromResult(data);
      }

      return {
        url: imageUrl,
        provider: 'modelscope',
        model: this.model,
        prompt: prompt,
      };
    } catch (error) {
      console.error('ModelScope image generation failed:', error);
      throw error;
    }
  }

  isAvailable() {
    const baseURL = this.normalizedBaseURL();
    const primaryKey = this.normalizedApiKey(this.apiKey);
    const fallbackKey = this.normalizedApiKey(this.fallbackApiKey);
    return this.enabled && !!baseURL && (!!primaryKey || !!fallbackKey);
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.generateImage('test image', { steps: 10 });
      return true;
    } catch (error) {
      console.error('ModelScope image connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = ModelScopeImageAdapter;
