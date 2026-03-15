/**
 * 限速 HTTP 客户端
 * - 强制每次请求间隔至少 1.5 秒，遵守 Wikimedia API 使用规范
 * - 自动重试（指数退避）
 * - 统一设置 User-Agent
 * - 支持 HTTP 代理：优先读 --proxy CLI 参数（由 index.js 写入 env），
 *   其次读环境变量 HTTPS_PROXY / HTTP_PROXY
 */

const axios = require('axios');
const { CRAWL_CONFIG } = require('../config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 懒加载代理配置 —— 第一次实际发请求时才读 env，
 * 保证 index.js 在 require() 之前写入的 --proxy 参数能被感知到。
 */
let _proxy = undefined; // undefined = 尚未初始化

function getProxy() {
  if (_proxy !== undefined) return _proxy;

  const raw = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY  || process.env.http_proxy;

  if (!raw) {
    _proxy = false;
    return _proxy;
  }

  try {
    const u = new URL(raw);
    _proxy = {
      protocol: u.protocol.replace(':', ''),
      host: u.hostname,
      port: parseInt(u.port, 10) || (u.protocol === 'https:' ? 443 : 80),
    };
    if (u.username) _proxy.auth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    console.log(`[代理] 使用代理：${_proxy.protocol}://${_proxy.host}:${_proxy.port}`);
  } catch {
    console.warn(`[代理] 无法解析代理地址：${raw}，将直连`);
    _proxy = false;
  }

  return _proxy;
}

/** 上次请求的时间戳（毫秒），用于全局限速 */
let lastRequestTime = 0;

/**
 * 发起限速 GET 请求
 * @param {string} url
 * @param {object} [params] - 查询参数
 * @returns {Promise<any>} 响应数据
 */
async function get(url, params = {}) {
  // 确保距上次请求有足够间隔
  const now = Date.now();
  const waitMs = Math.max(0, CRAWL_CONFIG.delayMs - (now - lastRequestTime));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  let lastError;

  for (let attempt = 1; attempt <= CRAWL_CONFIG.maxRetries; attempt++) {
    try {
      lastRequestTime = Date.now();
      const response = await axios.get(url, {
        params,
        timeout: CRAWL_CONFIG.timeoutMs,
        proxy: getProxy(),
        headers: {
          'User-Agent': CRAWL_CONFIG.userAgent,
          'Accept': 'application/json',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });
      return response.data;
    } catch (error) {
      lastError = error;

      const status = error.response?.status;
      // 404 不重试，直接返回
      if (status === 404) throw error;

      const isConnectError = !status || error.code === 'ECONNRESET'
        || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT'
        || (error.message || '').includes('timeout');

      // 1. 连接/超时错误（通常是网络被阻断）
      if (isConnectError && attempt === 1 && !getProxy()) {
        console.warn(`\n  ⚠️  连接失败，zh.wikivoyage.org 在国内通常需要代理。`);
        console.warn(`     请设置代理后重试：`);
        console.warn(`       PowerShell: $env:HTTPS_PROXY="http://127.0.0.1:7890"`);
        console.warn(`       bash:       export HTTPS_PROXY=http://127.0.0.1:7890\n`);
      }

      const isRetryable = isConnectError || status >= 500 || status === 429;
      if (!isRetryable || attempt === CRAWL_CONFIG.maxRetries) break;

      const backoffMs = attempt * 3000;
      console.warn(`    [重试 ${attempt}/${CRAWL_CONFIG.maxRetries}] ${error.message}，等待 ${backoffMs / 1000}s...`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

module.exports = { get };
