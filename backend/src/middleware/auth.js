const supabase = require('../supabase');

const parseTokenFromHeaderValue = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
};

const extractToken = (req) => {
  const candidates = [
    req.headers?.authorization,
    req.headers?.['x-authorization'],
    req.headers?.['x-access-token'],
    req.headers?.['x-auth-token'],
  ];

  for (const headerValue of candidates) {
    const token = parseTokenFromHeaderValue(headerValue);
    if (token) return token;
  }
  return '';
};

const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌', error: '未提供认证令牌' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      const reason = error?.message || 'unknown';
      const prefix = token.slice(0, 12);
      console.warn(`[auth] invalid token reason="${reason}" token_prefix="${prefix}" token_len=${token.length}`);
      return res.status(401).json({ message: '无效的认证令牌', error: '无效的认证令牌' });
    }
    req.user = data.user;
    return next();
  } catch (err) {
    return res.status(500).json({ message: '认证验证失败', error: '认证验证失败' });
  }
};

module.exports = {
  requireAuth,
};
