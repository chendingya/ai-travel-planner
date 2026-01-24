const supabase = require('../supabase');

const extractToken = (req) => {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return '';
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return '';
  return trimmed.slice(7).trim();
};

const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌', error: '未提供认证令牌' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
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
