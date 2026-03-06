const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;
const USER_SCAN_PAGE_SIZE = 200;
const USER_SCAN_MAX_PAGES = 20;
const ACCESS_TOKEN_COOKIE_NAME = process.env.AUTH_ACCESS_COOKIE_NAME || 'sb-access-token';
const REFRESH_TOKEN_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME || 'sb-refresh-token';
const REFRESH_TOKEN_COOKIE_ALT_NAME = process.env.AUTH_REFRESH_COOKIE_ALT_NAME || 'sb_refresh_token';
const REFRESH_TOKEN_COOKIE_NAMES = Array.from(new Set([
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_ALT_NAME,
  'refresh_token',
]));
const COOKIE_SAMESITE = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
const COOKIE_PATH = process.env.AUTH_COOKIE_PATH || '/';
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || '';
const COOKIE_SECURE = (() => {
  const raw = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase();
  if (!raw) return process.env.NODE_ENV === 'production';
  return raw === '1' || raw === 'true' || raw === 'yes';
})();
const HIDE_SESSION_IN_RESPONSE = (() => {
  const raw = String(process.env.AUTH_HIDE_SESSION_IN_RESPONSE || '').trim().toLowerCase();
  if (!raw) return true;
  return raw === '1' || raw === 'true' || raw === 'yes';
})();

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || supabaseServiceKey;

const baseAuthConfigReady = Boolean(supabaseUrl && supabaseAnonKey);
const adminAuthConfigReady = Boolean(supabaseUrl && supabaseServiceKey);

const decodeJwtRole = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return '';
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return typeof parsed.role === 'string' ? parsed.role : '';
  } catch (error) {
    return '';
  }
};

const isServiceRoleKey = decodeJwtRole(supabaseServiceKey) === 'service_role';
const serviceRoleConfigReady = Boolean(adminAuthConfigReady && isServiceRoleKey);

const adminSupabase = serviceRoleConfigReady
  ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const authSupabase = baseAuthConfigReady
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeUsername = (username) => String(username || '').trim();
const isEmail = (value) => EMAIL_REGEX.test(String(value || '').trim());

const extractUsername = (user) => {
  const metadata = user?.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : user?.raw_user_meta_data && typeof user.raw_user_meta_data === 'object'
      ? user.raw_user_meta_data
      : {};
  return normalizeUsername(metadata.username || '');
};

const ensureAuthConfig = (res) => {
  if (baseAuthConfigReady) return true;
  res.status(503).json({ error: '认证服务未配置完成，请联系管理员' });
  return false;
};

const ensureServiceRoleConfig = (res) => {
  if (!baseAuthConfigReady) {
    res.status(503).json({ error: '认证服务未配置完成，请联系管理员' });
    return false;
  }
  if (!adminAuthConfigReady) {
    res.status(503).json({
      error: '后端缺少 Supabase service_role 密钥，无法执行该操作',
    });
    return false;
  }
  if (!serviceRoleConfigReady) {
    res.status(503).json({
      error: '后端缺少 Supabase service_role 密钥，无法执行该操作',
    });
    return false;
  }
  return true;
};

const normalizeOptionalText = (value) => {
  if (value == null) return '';
  return String(value).trim();
};

const pickHeaderValue = (value) => {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim());
    return first || '';
  }
  return typeof value === 'string' ? value : '';
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

const readCookieToken = (req, cookieNames = []) => {
  const names = Array.isArray(cookieNames) ? cookieNames : [];
  if (!names.length) return '';
  const parsedCookies = parseCookieHeader(req.headers?.cookie);

  if (req.cookies && typeof req.cookies === 'object') {
    for (const name of names) {
      const value = req.cookies[name];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  for (const name of names) {
    const value = parsedCookies[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
};

const cookieBaseOptions = () => {
  const opts = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: COOKIE_PATH || '/',
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  return opts;
};

const setAuthCookies = (res, session) => {
  const accessToken = String(session?.access_token || '').trim();
  const refreshToken = String(session?.refresh_token || '').trim();
  if (!accessToken) return;

  const accessExpiresInSecRaw = Number(session?.expires_in);
  const accessMaxAge = Number.isFinite(accessExpiresInSecRaw) && accessExpiresInSecRaw > 0
    ? Math.floor(accessExpiresInSecRaw * 1000)
    : 60 * 60 * 1000;
  const refreshMaxAge = 7 * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    ...cookieBaseOptions(),
    maxAge: accessMaxAge,
  });

  if (refreshToken) {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      ...cookieBaseOptions(),
      maxAge: refreshMaxAge,
    });
  }
};

const clearAuthCookies = (res) => {
  const clearOptions = cookieBaseOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, clearOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearOptions);
};

const findUserByUsername = async (username) => {
  if (!adminSupabase) return null;
  const target = normalizeUsername(username).toLowerCase();
  if (!target) return null;

  for (let page = 1; page <= USER_SCAN_MAX_PAGES; page += 1) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: USER_SCAN_PAGE_SIZE,
    });

    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const matched = users.find((user) => extractUsername(user).toLowerCase() === target);
    if (matched) return matched;

    if (users.length < USER_SCAN_PAGE_SIZE) break;
  }

  return null;
};

const toAuthPayload = (data, fallbackUsername = '') => {
  const session = data?.session || null;
  const user = data?.user || session?.user || null;
  const usernameFromUser = user ? extractUsername(user) : '';

  return {
    session: HIDE_SESSION_IN_RESPONSE ? null : session,
    user: user
      ? {
        id: user.id,
        email: user.email || null,
        username: usernameFromUser || normalizeUsername(fallbackUsername) || null,
      }
      : null,
  };
};

const mapAuthErrorStatus = (error) => {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 401;
  if (message.includes('already') || message.includes('exists') || message.includes('duplicate')) return 409;
  return 400;
};

module.exports = () => {
  router.post('/auth/register', async (req, res) => {
    if (!ensureServiceRoleConfig(res)) return;

    const username = normalizeUsername(req.body?.username);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写账号、邮箱和密码' });
    }

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: '账号仅支持 3-32 位字母、数字或下划线' });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `密码长度不能少于 ${MIN_PASSWORD_LENGTH} 位` });
    }

    try {
      const usernameUser = await findUserByUsername(username);
      if (usernameUser) {
        return res.status(409).json({ error: '该账号已被占用' });
      }

      const { error: createError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
        },
      });

      if (createError) {
        return res.status(mapAuthErrorStatus(createError)).json({
          error: createError.message || '注册失败，请稍后重试',
        });
      }

      const { data: signInData, error: signInError } = await authSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        return res.status(201).json({
          message: '注册成功，请使用账号密码登录',
          ...toAuthPayload(null, username),
        });
      }
      setAuthCookies(res, signInData?.session);

      return res.status(201).json({
        message: '注册并登录成功',
        ...toAuthPayload(signInData, username),
      });
    } catch (error) {
      console.error('[auth/register] failed:', error?.message || error);
      return res.status(500).json({ error: '注册失败，请稍后重试' });
    }
  });

  router.post('/auth/login', async (req, res) => {
    if (!ensureAuthConfig(res)) return;

    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: '请输入账号/邮箱和密码' });
    }

    let email = '';
    let username = '';

    try {
      if (isEmail(identifier)) {
        email = normalizeEmail(identifier);
      } else {
        if (!adminSupabase) {
          return res.status(400).json({
            error: '当前仅支持邮箱登录，请联系管理员配置 Supabase service_role 以启用账号登录',
          });
        }
        username = normalizeUsername(identifier);
        const matchedUser = await findUserByUsername(username);
        if (!matchedUser?.email) {
          return res.status(401).json({ error: '账号或密码错误' });
        }
        email = normalizeEmail(matchedUser.email);
      }

      const { data, error } = await authSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.session) {
        return res.status(401).json({ error: '账号或密码错误' });
      }
      setAuthCookies(res, data?.session);

      return res.json({
        message: '登录成功',
        ...toAuthPayload(data, username),
      });
    } catch (error) {
      console.error('[auth/login] failed:', error?.message || error);
      return res.status(500).json({ error: '登录失败，请稍后重试' });
    }
  });

  router.patch('/auth/profile', requireAuth, async (req, res) => {
    if (!ensureServiceRoleConfig(res)) return;

    const nextUsername = normalizeUsername(req.body?.username);
    const currentPassword = String(req.body?.currentPassword || '');
    const nextPassword = String(req.body?.newPassword || '');
    const hasUsernameUpdate = normalizeOptionalText(req.body?.username) !== '';
    const hasPasswordUpdate = normalizeOptionalText(req.body?.newPassword) !== '';

    if (!hasUsernameUpdate && !hasPasswordUpdate) {
      return res.status(400).json({ error: '请至少填写一个要更新的字段' });
    }

    if (hasUsernameUpdate && !USERNAME_REGEX.test(nextUsername)) {
      return res.status(400).json({ error: '账号仅支持 3-32 位字母、数字或下划线' });
    }

    if (hasPasswordUpdate) {
      if (!currentPassword) {
        return res.status(400).json({ error: '修改密码时必须填写当前密码' });
      }
      if (nextPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `新密码长度不能少于 ${MIN_PASSWORD_LENGTH} 位` });
      }
    }

    try {
      const userId = req.user?.id;
      const currentEmail = normalizeEmail(req.user?.email);
      if (!userId || !currentEmail) {
        return res.status(401).json({ error: '登录状态无效，请重新登录' });
      }

      if (hasUsernameUpdate) {
        const sameUserName = normalizeUsername(req.user?.user_metadata?.username).toLowerCase();
        if (nextUsername.toLowerCase() !== sameUserName) {
          const usernameUser = await findUserByUsername(nextUsername);
          if (usernameUser && usernameUser.id !== userId) {
            return res.status(409).json({ error: '该账号已被占用' });
          }
        }
      }

      if (hasPasswordUpdate) {
        const { error: verifyError } = await authSupabase.auth.signInWithPassword({
          email: currentEmail,
          password: currentPassword,
        });
        if (verifyError) {
          return res.status(401).json({ error: '当前密码错误' });
        }
      }

      const updatePayload = {};
      if (hasUsernameUpdate) {
        updatePayload.user_metadata = {
          ...(req.user?.user_metadata || {}),
          username: nextUsername,
        };
      }
      if (hasPasswordUpdate) {
        updatePayload.password = nextPassword;
      }

      const { data, error } = await adminSupabase.auth.admin.updateUserById(userId, updatePayload);
      if (error) {
        return res.status(mapAuthErrorStatus(error)).json({
          error: error.message || '更新失败，请稍后重试',
        });
      }

      const updatedUser = data?.user || null;
      const username = updatedUser
        ? extractUsername(updatedUser)
        : hasUsernameUpdate
          ? nextUsername
          : extractUsername(req.user);

      return res.json({
        message: '账号信息更新成功',
        user: {
          id: userId,
          email: currentEmail,
          username: username || null,
        },
        passwordUpdated: hasPasswordUpdate,
      });
    } catch (error) {
      console.error('[auth/profile] failed:', error?.message || error);
      return res.status(500).json({ error: '更新失败，请稍后重试' });
    }
  });

  router.get('/auth/session', optionalAuth, async (req, res) => {
    try {
      let currentUser = req.user || null;
      if (!currentUser?.id) {
        const refreshToken = readCookieToken(req, REFRESH_TOKEN_COOKIE_NAMES);
        if (refreshToken && authSupabase) {
          const { data, error } = await authSupabase.auth.refreshSession({
            refresh_token: refreshToken,
          });
          if (!error && data?.session?.access_token) {
            setAuthCookies(res, data.session);
            currentUser = data?.user || data?.session?.user || null;
          }
        }
      }
      if (!currentUser?.id) {
        return res.json({ authenticated: false, user: null });
      }
      return res.json({
        authenticated: true,
        user: {
          id: currentUser.id,
          email: currentUser.email || null,
          username: extractUsername(currentUser) || null,
        },
      });
    } catch (error) {
      console.error('[auth/session] failed:', error?.message || error);
      return res.status(500).json({ error: '获取会话失败，请稍后重试' });
    }
  });

  router.post('/auth/logout', async (_req, res) => {
    clearAuthCookies(res);
    return res.json({ message: '已退出登录' });
  });

  return router;
};
