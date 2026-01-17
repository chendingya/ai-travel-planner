const crypto = require('crypto');
const BaseImageAdapter = require('../base/BaseImageAdapter');

/**
 * 腾讯混元图片生成适配器
 * 使用腾讯云混元图像生成服务
 */
class TencentImageAdapter extends BaseImageAdapter {
  constructor(config) {
    super(config);
    this.name = 'tencent';
    this.secretId = config.apiKey; // apiKey 就是 secretId
    this.secretKey = config.secretKey;
    this.region = config.region || 'ap-guangzhou';
    this.service = 'hunyuan';
    this.version = '2023-09-01';
    this.host = 'hunyuan.tencentcloudapi.com';
  }

  /**
   * 生成图片
   */
  async generateImage(prompt, options = {}) {
    try {
      const action = 'TextToImage';
      const payload = {
        Prompt: prompt,
        Resolution: options.size || '1024:1024',
        RspImgType: 'url',
      };

      const response = await this.callTencentAPI(action, payload);

      return {
        url: response.ResultUrl,
        provider: 'tencent',
        model: 'hunyuan',
        prompt: prompt,
      };
    } catch (error) {
      console.error('Tencent image generation failed:', error);
      throw error;
    }
  }

  /**
   * 调用腾讯云API
   */
  async callTencentAPI(action, payload) {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10).replace(/-/g, '');

    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${this.host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    const credentialScope = `${date}/${this.service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const secretDate = this.hmacSha256(date, this.secretKey);
    const secretService = this.hmacSha256(this.service, secretDate);
    const secretSigning = this.hmacSha256('tc3_request', secretService);
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const authorization = `TC3-HMAC-SHA256 Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = `https://${this.host}/`;
    const response = await fetch(url, {
      method: httpRequestMethod,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: this.host,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': this.version,
        'X-TC-Region': this.region,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Tencent API error: ${error}`);
    }

    const data = await response.json();
    
    if (data.Response.Error) {
      throw new Error(data.Response.Error.Message);
    }

    return data.Response;
  }

  /**
   * HMAC-SHA256
   */
  hmacSha256(key, message) {
    if (!key || !message) {
      throw new Error('Key and message are required for HMAC');
    }
    return crypto.createHmac('sha256', key).update(message).digest();
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.generateImage('test image');
      return true;
    } catch (error) {
      console.error('Tencent image connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = TencentImageAdapter;
