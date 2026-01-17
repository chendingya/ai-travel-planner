/**
 * 错误处理中间件
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // 默认错误响应
  let statusCode = err && err.statusCode ? err.statusCode : 500;
  let message = err && err.message ? err.message : 'Internal Server Error';

  // 处理特定类型的错误
  if (err && err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err && err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err && err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource not found';
  }

  const response = {
    error: message,
  };

  // 只在开发环境包含堆栈信息，并且确保 err 存在
  if (process.env.NODE_ENV === 'development' && err && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 处理中间件
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
