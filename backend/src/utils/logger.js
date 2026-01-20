/**
 * 日志工具
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const colors = {
  error: '\x1b[31m', // red
  warn: '\x1b[33m',  // yellow
  info: '\x1b[36m',  // cyan
  debug: '\x1b[90m', // gray
  reset: '\x1b[0m',
};

/**
 * 格式化日志
 */
function formatLog(level, message, data) {
  const timestamp = new Date().toISOString();
  const color = colors[level];
  const reset = colors.reset;
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}]${reset}`;

  if (data) {
    return `${prefix} ${message}\n${JSON.stringify(data, null, 2)}`;
  }
  return `${prefix} ${message}`;
}

/**
 * 日志函数
 */
const logger = {
  error: (message, data) => {
    console.error(formatLog('error', message, data));
  },
  warn: (message, data) => {
    console.warn(formatLog('warn', message, data));
  },
  info: (message, data) => {
    console.info(formatLog('info', message, data));
  },
  debug: (message, data) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog('debug', message, data));
    }
  },
};

module.exports = logger;
