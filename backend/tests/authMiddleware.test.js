const test = require('node:test');
const assert = require('node:assert/strict');

const authModulePath = require.resolve('../src/middleware/auth');
const supabaseModulePath = require.resolve('../src/supabase');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toBase64Url = (value) => Buffer.from(value).toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const createUnsignedJwt = (payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  return `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}.signature`;
};

const loadAuthMiddleware = (supabaseMock) => {
  const previousAuthModule = require.cache[authModulePath];
  const previousSupabaseModule = require.cache[supabaseModulePath];

  delete require.cache[authModulePath];
  require.cache[supabaseModulePath] = {
    id: supabaseModulePath,
    filename: supabaseModulePath,
    loaded: true,
    exports: supabaseMock,
  };

  const loaded = require(authModulePath);

  return {
    ...loaded,
    restore() {
      delete require.cache[authModulePath];
      if (previousAuthModule) {
        require.cache[authModulePath] = previousAuthModule;
      }
      if (previousSupabaseModule) {
        require.cache[supabaseModulePath] = previousSupabaseModule;
      } else {
        delete require.cache[supabaseModulePath];
      }
    },
  };
};

const createReq = (cookieHeader = 'sb-access-token=test-token') => ({
  headers: {
    cookie: cookieHeader,
  },
  cookies: {},
  app: { locals: {} },
  res: { locals: {} },
});

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

const invokeMiddleware = async (middleware, req, res) => await new Promise((resolve, reject) => {
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const result = originalJson(payload);
    finish({ type: 'response', statusCode: res.statusCode, body: payload });
    return result;
  };

  Promise.resolve(middleware(req, res, (error) => {
    if (error) {
      reject(error);
      return;
    }
    finish({ type: 'next' });
  })).catch(reject);
});

test('requireAuth authenticates with local claims data before falling back to getUser', async () => {
  let getUserCalls = 0;
  const auth = loadAuthMiddleware({
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: 'user-123',
            email: 'traveler@example.com',
            role: 'authenticated',
            user_metadata: { username: 'traveler' },
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: null }, error: null };
      },
    },
  });

  try {
    const req = createReq();
    const res = createRes();
    const result = await invokeMiddleware(auth.requireAuth, req, res);

    assert.deepEqual(result, { type: 'next' });
    assert.equal(getUserCalls, 0);
    assert.equal(req.user?.id, 'user-123');
    assert.equal(req.user?.email, 'traveler@example.com');
    assert.equal(req.user?.user_metadata?.username, 'traveler');
  } finally {
    auth.restore();
  }
});

test('requireAuth uses local JWT payload without upstream auth calls', async () => {
  let getClaimsCalls = 0;
  let getUserCalls = 0;
  const token = createUnsignedJwt({
    sub: 'local-jwt-user-1',
    email: 'local-jwt@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    user_metadata: { username: 'local-jwt-user' },
  });

  const auth = loadAuthMiddleware({
    auth: {
      getClaims: async () => {
        getClaimsCalls += 1;
        return { data: null, error: null };
      },
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: null }, error: null };
      },
    },
  });

  try {
    const req = createReq(`sb-access-token=${token}`);
    const res = createRes();
    const result = await invokeMiddleware(auth.requireAuth, req, res);

    assert.deepEqual(result, { type: 'next' });
    assert.equal(getClaimsCalls, 0);
    assert.equal(getUserCalls, 0);
    assert.equal(req.user?.id, 'local-jwt-user-1');
    assert.equal(req.user?.email, 'local-jwt@example.com');
    assert.equal(req.user?.user_metadata?.username, 'local-jwt-user');
  } finally {
    auth.restore();
  }
});

test('optionalAuth swallows late upstream rejection after timeout', async () => {
  const previousTimeout = process.env.AUTH_UPSTREAM_TIMEOUT_MS;
  process.env.AUTH_UPSTREAM_TIMEOUT_MS = '5';

  const auth = loadAuthMiddleware({
    auth: {
      getClaims: async () => await new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error('fetch failed');
          error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
          reject(error);
        }, 25);
      }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  });

  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const req = createReq();
    const res = createRes();
    const result = await invokeMiddleware(auth.optionalAuth, req, res);

    assert.deepEqual(result, { type: 'next' });
    assert.equal(req.user, null);

    await wait(40);
    assert.equal(unhandledRejections.length, 0);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
    auth.restore();
    if (previousTimeout == null) {
      delete process.env.AUTH_UPSTREAM_TIMEOUT_MS;
    } else {
      process.env.AUTH_UPSTREAM_TIMEOUT_MS = previousTimeout;
    }
  }
});

test('optionalAuth uses local JWT payload for session probing without upstream call', async () => {
  let getClaimsCalls = 0;
  const token = createUnsignedJwt({
    sub: 'session-user-1',
    email: 'session@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    user_metadata: { username: 'session-user' },
  });

  const auth = loadAuthMiddleware({
    auth: {
      getClaims: async () => {
        getClaimsCalls += 1;
        return { data: null, error: null };
      },
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  });

  try {
    const req = createReq(`sb-access-token=${token}`);
    const res = createRes();
    const result = await invokeMiddleware(auth.optionalAuth, req, res);

    assert.deepEqual(result, { type: 'next' });
    assert.equal(getClaimsCalls, 0);
    assert.equal(req.user?.id, 'session-user-1');
    assert.equal(req.user?.email, 'session@example.com');
    assert.equal(req.user?.user_metadata?.username, 'session-user');
  } finally {
    auth.restore();
  }
});
