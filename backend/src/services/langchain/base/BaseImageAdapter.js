/**
 * 图片生成适配器基类
 * 所有图片生成适配器都必须继承此类
 */
class BaseImageAdapter {
  constructor(config) {
    this.config = config;
    this.name = 'base';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.enabled = config.enabled;
  }

  /**
   * 生成图片
   * @param {String} prompt - 图片提示词
   * @param {Object} options - 可选参数（size、style等）
   * @returns {Promise<Object>} - 返回生成的图片信息
   */
  async generateImage(prompt, options = {}) {
    throw new Error('generateImage must be implemented by subclass');
  }

  /**
   * 测试连接
   * @returns {Promise<Boolean>} - 返回连接是否成功
   */
  async testConnection() {
    throw new Error('testConnection must be implemented by subclass');
  }

  /**
   * 检查适配器是否可用
   * @returns {Boolean}
   */
  isAvailable() {
    return this.enabled && !!this.apiKey;
  }
}

module.exports = BaseImageAdapter;
