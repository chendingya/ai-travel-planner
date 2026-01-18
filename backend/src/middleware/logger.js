/**
 * 日志中间件
 */

const { randomUUID } = require('crypto');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const headerId = req.headers?.['x-request-id'];
  const requestId = (typeof headerId === 'string' && headerId.trim()) ? headerId.trim() : randomUUID();
  req.requestId = requestId;
  try {
    res.setHeader('X-Request-Id', requestId);
  } catch {}

  // 记录请求
  const ua = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const referer = typeof req.headers?.referer === 'string' ? req.headers.referer : '';
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} (${requestId})${ua ? ` ua="${ua}"` : ''}${referer ? ` referer="${referer}"` : ''}`);

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) (${requestId})`);
  });

  next();
};

module.exports = {
  requestLogger,
};
