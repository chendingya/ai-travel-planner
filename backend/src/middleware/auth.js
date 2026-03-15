const supabase = require('../supabase');

const ACCESS_TOKEN_COOKIE_NAMES = [
  process.env.AUTH_ACCESS_COOKIE_NAME || 'sb-access-token',
  process.env.AUTH_ACCESS_COOKIE_ALT_NAME || 'sb_access_token',
  'access_token',
  'token',
];

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

const parseCookieHeader = (cookieHeader) => {
  const out = {};
  const raw = pickHeaderValue(cookieHeader);
  if (!raw) return out;
  const parts = String(raw).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch (_) {
      out[name] = value;
    }
  }
  return out;
};

const jwtSegments = (token) => String(token || '').split('.').filter(Boolean).length;
const isLikelyJwt = (token) => jwtSegments(token) === 3;

const parseJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
};

const extractErrorCode = (error) => {
  const direct = typeof error?.code === 'string' ? error.code.trim() : '';
  if (direct) return direct;
  const cause = typeof error?.cause?.code === 'string' ? error.cause.code.trim() : '';
  return cause || '';
};

const isTransientAuthError = (error) => {
  const code = extractErrorCode(error).toUpperCase();
  if (code.startsWith('UND_ERR_') || code.startsWith('ECONN') || code === 'ETIMEDOUT') {
    return true;
  }
  const message = String(error?.message || '').toLowerCase();
  return message.includes('fetch failed')
    || message.includes('timeout')
    || message.includes('network');
};

const authUpstreamTimeoutMs = () => {
  const raw = Number(process.env.AUTH_UPSTREAM_TIMEOUT_MS || '10000');
  return Number.isFinite(raw) && raw > 0 ? Math.max(1000, raw) : 10000;
};

const timeoutAuthError = (timeoutMs) => {
  const err = new Error(`Auth upstream timeout after ${timeoutMs}ms`);
  err.code = 'AUTH_UPSTREAM_TIMEOUT';
  return err;
};

const withAuthTimeout = async (promiseFactory) => {
  const timeoutMs = authUpstreamTimeoutMs();
  let timer = null;
  let didTimeout = false;
  const trackedPromise = Promise.resolve()
    .then(() => promiseFactory())
    .catch((error) => {
      if (didTimeout) {
        return undefined;
      }
      throw error;
    });
  try {
    return await Promise.race([
      trackedPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          didTimeout = true;
          reject(timeoutAuthError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const normalizeClaimsObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

const claimsToUser = (claims) => {
  const payload = normalizeClaimsObject(claims);
  const id = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!id) return null;
  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : null,
    phone: typeof payload.phone === 'string' ? payload.phone : null,
    role: typeof payload.role === 'string' ? payload.role : null,
    app_metadata: normalizeClaimsObject(payload.app_metadata),
    user_metadata: normalizeClaimsObject(payload.user_metadata),
  };
};

const isJwtExpired = (claims) => {
  const exp = Number(claims?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp <= nowSec;
};

const tryBuildLocalJwtUser = (token) => {
  if (!isLikelyJwt(token)) return null;
  const claims = parseJwtPayload(token);
  if (!claims || isJwtExpired(claims)) return null;
  return claimsToUser(claims);
};

const verifyToken = async (token) => {
  if (supabase?.auth && typeof supabase.auth.getClaims === 'function') {
    const { data, error } = await withAuthTimeout(() => supabase.auth.getClaims(token));
    const user = claimsToUser(data?.claims);
    if (user) {
      return { data: { user }, error: null, source: 'claims' };
    }
    if (error) {
      return { data: { user: null }, error, source: 'claims' };
    }
  }

  const { data, error } = await withAuthTimeout(() => supabase.auth.getUser(token));
  return {
    data: { user: data?.user || null },
    error: error || null,
    source: 'getUser',
  };
};

const extractToken = (req) => {
  const parsedCookies = parseCookieHeader(req.headers?.cookie);
  const cookieToken = (() => {
    if (req.cookies && typeof req.cookies === 'object') {
      for (const name of ACCESS_TOKEN_COOKIE_NAMES) {
        const v = parseTokenFromHeaderValue(req.cookies[name]);
        if (v) return v;
      }
    }
    for (const name of ACCESS_TOKEN_COOKIE_NAMES) {
      const v = parseTokenFromHeaderValue(parsedCookies[name]);
      if (v) return v;
    }
    return '';
  })();
  const token = parseTokenFromHeaderValue(cookieToken);
  if (!token) return { token: '', source: 'none', segments: 0 };
  return { token, source: 'cookie.access_token', segments: jwtSegments(token) };
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

const runWithProviderScopes = (req, runtime, next) => {
  req.providerRuntime = runtime;
  if (req.res && req.res.locals) {
    req.res.locals.providerRuntime = runtime;
  }

  const wrappers = [];
  const langChainManager = req.app?.locals?.langChainManager;
  const ragService = req.app?.locals?.ragService;
  const ttsService = req.app?.locals?.ttsService;

  if (langChainManager && typeof langChainManager.runWithProviderContext === 'function') {
    wrappers.push((runner) => langChainManager.runWithProviderContext(runtime, runner));
  }
  if (ragService && typeof ragService.runWithProviderContext === 'function') {
    wrappers.push((runner) => ragService.runWithProviderContext(runtime, runner));
  }
  if (ttsService && typeof ttsService.runWithProviderContext === 'function') {
    wrappers.push((runner) => ttsService.runWithProviderContext(runtime, runner));
  }

  const invoke = wrappers.reduceRight((runner, wrap) => () => wrap(runner), () => next());
  return invoke();
};

const requireAuth = async (req, res, next) => {
  const extracted = extractToken(req);
  const token = extracted.token;
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌', error: '未提供认证令牌' });
  }

  const localJwtUser = tryBuildLocalJwtUser(token);
  if (localJwtUser) {
    req.user = localJwtUser;
    const providerConfigService = req.app?.locals?.providerConfigService;
    if (providerConfigService && typeof providerConfigService.getRuntimeContext === 'function') {
      const runtime = await providerConfigService.getRuntimeContext(localJwtUser.id);
      return runWithProviderScopes(req, runtime, next);
    }
    return next();
  }

  try {
    const { data, error } = await verifyToken(token);
    if (error || !data?.user) {
      if (isTransientAuthError(error)) {
        console.warn(
          `[auth] auth service unavailable source="${extracted.source}" segments=${extracted.segments} reason="${error?.message || 'unknown'}" code="${extractErrorCode(error)}"`,
        );
        return res.status(503).json({
          message: '认证服务暂时不可用，请稍后重试',
          error: '认证服务暂时不可用',
        });
      }
      const reason = error?.message || 'unknown';
      const prefix = token.slice(0, 12);
      const inputs = summarizeAuthInputs(req);
      console.warn(
        `[auth] invalid token source="${extracted.source}" segments=${extracted.segments} reason="${reason}" token_prefix="${prefix}" token_len=${token.length} inputs="${inputs}"`,
      );
      return res.status(401).json({ message: '无效的认证令牌', error: '无效的认证令牌' });
    }
    req.user = data.user;
    const providerConfigService = req.app?.locals?.providerConfigService;
    if (providerConfigService && typeof providerConfigService.getRuntimeContext === 'function') {
      const runtime = await providerConfigService.getRuntimeContext(data.user.id);
      return runWithProviderScopes(req, runtime, next);
    }
    return next();
  } catch (err) {
    if (isTransientAuthError(err)) {
      console.warn(
        `[auth] auth service unavailable source="${extracted.source}" segments=${extracted.segments} reason="${err?.message || 'unknown'}" code="${extractErrorCode(err)}"`,
      );
      return res.status(503).json({
        message: '认证服务暂时不可用，请稍后重试',
        error: '认证服务暂时不可用',
      });
    }
    return res.status(500).json({ message: '认证验证失败', error: '认证验证失败' });
  }
};

const optionalAuth = async (req, _res, next) => {
  const extracted = extractToken(req);
  const token = extracted.token;
  if (!token) {
    req.user = null;
    return next();
  }

  const localJwtUser = tryBuildLocalJwtUser(token);
  if (localJwtUser) {
    req.user = localJwtUser;
    return next();
  }

  try {
    const { data, error } = await verifyToken(token);
    if (error || !data?.user) {
      req.user = null;
      return next();
    }
    req.user = data.user;
    return next();
  } catch (_) {
    req.user = null;
    return next();
  }
};

module.exports = {
  requireAuth,
  optionalAuth,
};
