/**
 * 辅助函数
 */

/**
 * 延迟执行
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 */
async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * 安全解析 JSON
 */
function safeParseJSON(jsonString, defaultValue = null) {
  if (typeof jsonString !== 'string') return defaultValue;

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const trimmed = jsonString.trim();
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    const fromFence = tryParse(fenced[1].trim());
    if (fromFence !== undefined) return fromFence;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const fromObject = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (fromObject !== undefined) return fromObject;
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const fromArray = tryParse(trimmed.slice(firstBracket, lastBracket + 1));
    if (fromArray !== undefined) return fromArray;
  }

  return defaultValue;
}

/**
 * 格式化日期
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * 验证必填字段
 */
function validateRequired(obj, fields) {
  const missing = fields.filter(field => !obj[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * 清理敏感信息
 */
function sanitizeObject(obj, sensitiveKeys = ['password', 'apiKey', 'secretKey', 'token']) {
  const sanitized = { ...obj };
  
  sensitiveKeys.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '***';
    }
  });

  return sanitized;
}

module.exports = {
  sleep,
  retry,
  safeParseJSON,
  formatDate,
  validateRequired,
  sanitizeObject,
};
