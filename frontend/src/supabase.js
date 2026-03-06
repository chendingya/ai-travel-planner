import { createClient } from '@supabase/supabase-js'
import { loadRuntimeConfig } from './runtimeConfig'

let supabaseInstance = null
let isSupabaseAvailable = false

const COOKIE_SESSION_CACHE_TTL_MS = 5000

const clearCorruptedSession = () => {
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
    console.log('🧹 已清除损坏的 session 数据')
  } catch (e) {
    console.warn('清除 session 失败:', e)
  }
}

const toPseudoSession = (user) => {
  if (!user || typeof user !== 'object' || !user.id) return null
  const username = typeof user.username === 'string' ? user.username : null
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    access_token: '__cookie_auth__',
    refresh_token: '__cookie_auth__',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    user: {
      id: user.id,
      email: user.email || null,
      user_metadata: {
        username,
      },
    },
  }
}

const fetchServerSession = async () => {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
    })
    if (!response.ok) return null
    const data = await response.json().catch(() => ({}))
    return toPseudoSession(data?.user)
  } catch (_) {
    return null
  }
}

const patchAuthForCookieMode = (client) => {
  if (!client || !client.auth) return client

  const rawAuth = client.auth
  const listeners = new Set()
  const cache = {
    fetchedAt: 0,
    session: null,
  }

  const emit = (event, session) => {
    listeners.forEach((fn) => {
      try {
        fn(event, session)
      } catch (_) {}
    })
  }

  const loadSession = async (options = {}) => {
    const force = options?.force === true
    const now = Date.now()
    if (!force && now - cache.fetchedAt < COOKIE_SESSION_CACHE_TTL_MS) {
      return cache.session
    }

    const nextSession = await fetchServerSession()
    const prevUserId = cache.session?.user?.id || ''
    const nextUserId = nextSession?.user?.id || ''
    cache.session = nextSession
    cache.fetchedAt = now

    if (prevUserId !== nextUserId) {
      emit(nextUserId ? 'SIGNED_IN' : 'SIGNED_OUT', nextSession)
    }

    return nextSession
  }

  client.auth = {
    ...rawAuth,
    getSession: async () => {
      const session = await loadSession()
      return { data: { session }, error: null }
    },
    getUser: async () => {
      const session = await loadSession()
      return { data: { user: session?.user || null }, error: null }
    },
    refreshSession: async () => {
      const session = await loadSession({ force: true })
      return { data: { session, user: session?.user || null }, error: null }
    },
    setSession: async () => ({
      data: { user: null, session: null },
      error: { message: '纯 Cookie 模式不支持前端 setSession' },
    }),
    signInWithOtp: async () => ({
      data: { user: null, session: null },
      error: { message: '请使用后端 /api/auth 接口登录（纯 Cookie 模式）' },
    }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: { message: '请使用后端 /api/auth 接口登录（纯 Cookie 模式）' },
    }),
    signUp: async () => ({
      data: { user: null, session: null },
      error: { message: '请使用后端 /api/auth 接口注册（纯 Cookie 模式）' },
    }),
    signOut: async () => {
      cache.session = null
      cache.fetchedAt = Date.now()
      emit('SIGNED_OUT', null)
      return { error: null }
    },
    onAuthStateChange: (callback) => {
      if (typeof callback === 'function') listeners.add(callback)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              if (typeof callback === 'function') listeners.delete(callback)
            },
          },
        },
      }
    },
  }

  return client
}

const createRealClient = (supabaseUrl, supabaseAnonKey) => {
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
    return patchAuthForCookieMode(client)
  } catch (error) {
    clearCorruptedSession()
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
    return patchAuthForCookieMode(client)
  }
}

const createMockClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    refreshSession: async () => ({ data: { session: null, user: null }, error: null }),
    signInWithOtp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
    setSession: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
    updateUser: async () => ({ data: { user: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } }),
    update: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } }),
    delete: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } }),
  }),
})

const initSupabase = async () => {
  try {
    const config = await loadRuntimeConfig()
    const { supabaseUrl, supabaseAnonKey } = config

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase 配置缺失')
      return createMockClient()
    }

    supabaseInstance = createRealClient(supabaseUrl, supabaseAnonKey)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
        signal: controller.signal,
        headers: {
          apikey: supabaseAnonKey,
        },
      })
      isSupabaseAvailable = response.ok
      if (response.ok) console.log('✅ Supabase 连接成功')
    } catch (connErr) {
      console.warn('⚠️ Supabase 健康检查失败（不影响 cookie 鉴权）:', connErr.message)
      isSupabaseAvailable = false
    } finally {
      clearTimeout(timeoutId)
    }

    return supabaseInstance
  } catch (error) {
    console.error('❌ Supabase 初始化失败:', error)
    return supabaseInstance || createMockClient()
  }
}

await initSupabase()

export const supabase = supabaseInstance || createMockClient()
export const checkSupabaseAvailable = () => isSupabaseAvailable
