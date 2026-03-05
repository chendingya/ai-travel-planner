const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase 客户端
 */
const { config } = require('./config');

const OFFLINE_ERROR_MESSAGE = 'Supabase 未配置或不可用，请先检查后端 .env 中的 Supabase 配置';

const parseProjectRefFromUrl = (url) => {
  try {
    const host = new URL(String(url || '')).hostname || '';
    const m = host.match(/^([^.]+)\.supabase\.co$/i);
    return m ? m[1] : '';
  } catch (_) {
    return '';
  }
};

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

if (config.supabase.url && config.supabase.key) {
  const payload = parseJwtPayload(config.supabase.key);
  const keyRole = payload?.role || 'unknown';
  const keyRef = payload?.ref || '';
  const urlRef = parseProjectRefFromUrl(config.supabase.url);
  console.log(`[supabase] key_role=${keyRole} key_ref=${keyRef || 'unknown'} url_ref=${urlRef || 'unknown'}`);
  if (keyRef && urlRef && keyRef !== urlRef) {
    console.warn('[supabase] key_ref and url_ref mismatch, this can cause "invalid token" errors.');
  }
}

const createMockError = (message = OFFLINE_ERROR_MESSAGE) => ({ message });

const createThenableQueryBuilder = (resultFactory) => {
  const getResult = typeof resultFactory === 'function'
    ? resultFactory
    : () => ({ data: null, error: createMockError() });

  const target = {};
  const handler = {
    get(_obj, prop) {
      if (prop === 'then') {
        return (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject);
      }
      if (prop === 'catch') {
        return (onRejected) => Promise.resolve(getResult()).catch(onRejected);
      }
      if (prop === 'finally') {
        return (onFinally) => Promise.resolve(getResult()).finally(onFinally);
      }
      return () => proxy;
    },
  };

  const proxy = new Proxy(target, handler);
  return proxy;
};

const createMockSupabaseClient = () => {
  const queryBuilder = () => createThenableQueryBuilder(() => ({
    data: [],
    error: createMockError(),
  }));

  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: createMockError() }),
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: createMockError() }),
        createUser: async () => ({ data: { user: null }, error: createMockError() }),
        updateUserById: async () => ({ data: { user: null }, error: createMockError() }),
      },
    },
    from: () => queryBuilder(),
    rpc: () => queryBuilder(),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: createMockError() }),
        download: async () => ({ data: null, error: createMockError() }),
        remove: async () => ({ data: null, error: createMockError() }),
      }),
    },
  };
};

const createSupabaseClient = () => {
  if (!config.supabase.url || !config.supabase.key) {
    console.warn('Supabase configuration is missing. Falling back to mock client.');
    return createMockSupabaseClient();
  }

  try {
    return createClient(config.supabase.url, config.supabase.key);
  } catch (error) {
    console.error('Failed to initialize Supabase client, fallback to mock client:', error?.message || error);
    return createMockSupabaseClient();
  }
};

const supabase = createSupabaseClient();

module.exports = supabase;
