/**
 * 日志中间件
 */

const { randomUUID } = require('crypto');

const buildProviderString = (meta) => {
  const providers = Array.isArray(meta?.providers) ? meta.providers : [];
  if (providers.length) {
    return providers
      .map((p) => {
        const kind = p?.kind ? `${p.kind}:` : '';
        const name = p?.provider || 'unknown';
        const model = p?.model || 'unknown';
        return `${kind}${name}/${model}`;
      })
      .join('; ');
  }
  const name = meta?.provider || 'unknown';
  const model = meta?.model || 'unknown';
  return `${name}/${model}`;
};

const formatAiMeta = (meta) => {
  const mcp = meta?.mcp === true;
  const providerInfo = buildProviderString(meta);
  return `ai=${mcp ? 'mcp' : 'nonmcp'} provider=${providerInfo}`;
};

const normalizeDebugFlag = (value) => {
  if (value === true) return true;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

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
  const debugCandidate = req.query?.debug ?? req.headers?.['x-debug'] ?? req.body?.debug;
  const debugEnabled = normalizeDebugFlag(debugCandidate);
  req.aiDebug = debugEnabled;
  res.locals.aiDebug = debugEnabled;
  const mcpService = req.app?.locals?.mcpService;
  const mcpServerCount = mcpService && mcpService.servers ? Object.keys(mcpService.servers).length : 0;
  const mcpLabel = mcpServerCount ? ` mcp_servers=${mcpServerCount}` : '';
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} (${requestId})${ua ? ` ua="${ua}"` : ''}${referer ? ` referer="${referer}"` : ''}${mcpLabel}`);

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    const aiMeta = res.locals?.aiMeta || req.aiMeta || null;
    const aiLabel = formatAiMeta(aiMeta);
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) (${requestId}) ${aiLabel}`);
  });

  next();
};

module.exports = {
  requestLogger,
};
