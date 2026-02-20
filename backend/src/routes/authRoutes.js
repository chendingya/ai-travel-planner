const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;
const USER_SCAN_PAGE_SIZE = 200;
const USER_SCAN_MAX_PAGES = 20;

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || supabaseServiceKey;

const authConfigReady = Boolean(supabaseUrl && supabaseServiceKey && supabaseAnonKey);

const adminSupabase = authConfigReady
  ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const authSupabase = authConfigReady
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
  if (authConfigReady) return true;
  res.status(500).json({ error: '认证服务未配置完成，请联系管理员' });
  return false;
};

const findUserByUsername = async (username) => {
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
    session,
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
    if (!ensureAuthConfig(res)) return;

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

      return res.status(201).json({
        message: '注册并登录成功',
        ...toAuthPayload(signInData, username),
      });
    } catch (error) {
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

      return res.json({
        message: '登录成功',
        ...toAuthPayload(data, username),
      });
    } catch (error) {
      return res.status(500).json({ error: '登录失败，请稍后重试' });
    }
  });

  return router;
};
