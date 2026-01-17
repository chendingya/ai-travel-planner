/**
 * 日志中间件
 */

const requestLogger = (req, res, next) => {
  const start = Date.now();

  // 记录请求
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};

module.exports = {
  requestLogger,
};
