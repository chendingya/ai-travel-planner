const supabase = require('../supabase');

const pickHeaderValue = (value) => {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim());
    return first || '';
  }
  return typeof value === 'string' ? value : '';
};

const parseTokenFromHeaderValue = (value) => {
  const raw = pickHeaderValue(value);
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
};

const jwtSegments = (token) => String(token || '').split('.').filter(Boolean).length;
const isLikelyJwt = (token) => jwtSegments(token) === 3;

const extractToken = (req) => {
  const candidates = [
    { name: 'x-supabase-access-token', value: req.headers?.['x-supabase-access-token'] },
    { name: 'authorization', value: req.headers?.authorization },
    { name: 'x-authorization', value: req.headers?.['x-authorization'] },
    { name: 'x-access-token', value: req.headers?.['x-access-token'] },
    { name: 'x-auth-token', value: req.headers?.['x-auth-token'] },
    { name: 'body.access_token', value: req.body?.access_token },
    { name: 'body.token', value: req.body?.token },
  ];

  for (const [name, value] of Object.entries(req.headers || {})) {
    if (!/auth|token/i.test(name)) continue;
    if (candidates.some((item) => item.name === name)) continue;
    candidates.push({ name, value });
  }

  let fallback = null;
  for (const item of candidates) {
    const token = parseTokenFromHeaderValue(item?.value);
    if (!token) continue;
    if (isLikelyJwt(token)) {
      return { token, source: item.name, segments: jwtSegments(token) };
    }
    if (!fallback) {
      fallback = { token, source: item.name, segments: jwtSegments(token) };
    }
  }
  return fallback || { token: '', source: 'none', segments: 0 };
};

const summarizeAuthInputs = (req) => {
  const pairs = Object.entries(req.headers || {}).filter(([name]) => /auth|token/i.test(name));
  return pairs
    .map(([name, value]) => {
      const token = parseTokenFromHeaderValue(value);
      if (!token) return `${name}:empty`;
      return `${name}:${jwtSegments(token)}seg/${token.length}`;
    })
    .join(', ');
};

const requireAuth = async (req, res, next) => {
  const extracted = extractToken(req);
  const token = extracted.token;
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌', error: '未提供认证令牌' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      const reason = error?.message || 'unknown';
      const prefix = token.slice(0, 12);
      const inputs = summarizeAuthInputs(req);
      console.warn(
        `[auth] invalid token source="${extracted.source}" segments=${extracted.segments} reason="${reason}" token_prefix="${prefix}" token_len=${token.length} inputs="${inputs}"`,
      );
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
