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
  }

  normalizedBaseURL() {
    const raw = typeof this.baseURL === 'string' ? this.baseURL.trim() : '';
    return raw.replace(/\/+$/, '');
  }

  /**
   * 生成图片
   */
  async generateImage(prompt, options = {}) {
    try {
      const baseURL = this.normalizedBaseURL();
      const url = baseURL.endsWith('/v1')
        ? `${baseURL}/images/generations`
        : `${baseURL}/v1/images/generations`;

      const requestBody = {
        model: this.model,
        input: {
          prompt,
        },
      };

      // 添加可选参数
      if (options.negative_prompt) {
        requestBody.input.negative_prompt = options.negative_prompt;
      }
      if (options.steps) {
        requestBody.input.num_inference_steps = options.steps;
      }
      if (options.guidance_scale) {
        requestBody.input.guidance_scale = options.guidance_scale;
      }
      if (options.size) {
        requestBody.parameters = { size: options.size };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ModelScope API error: ${error}`);
      }

      const data = await response.json();

      // ModelScope 返回格式
      let imageUrl = null;
      if (data.images && data.images[0]) {
        imageUrl = data.images[0].url;
      } else if (data.output && data.output.image && data.output.image[0]) {
        imageUrl = data.output.image[0];
      } else if (data.url) {
        imageUrl = data.url;
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
    return this.enabled && !!this.apiKey && !!this.normalizedBaseURL();
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
