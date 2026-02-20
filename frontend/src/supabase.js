import { createClient } from '@supabase/supabase-js'
import { loadRuntimeConfig } from './runtimeConfig'

let supabaseInstance = null
let isSupabaseAvailable = false

// 清除损坏的 session 数据
const clearCorruptedSession = () => {
	try {
		// 清除所有 Supabase 相关的 localStorage
		const keysToRemove = []
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (key && (key.includes('supabase') || key.includes('sb-'))) {
				keysToRemove.push(key)
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key))
		console.log('🧹 已清除损坏的 session 数据')
	} catch (e) {
		console.warn('清除 session 失败:', e)
	}
}

const createRealClient = (supabaseUrl, supabaseAnonKey) => {
	try {
		return createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				autoRefreshToken: true,
				persistSession: true,
				detectSessionInUrl: false
			}
		})
	} catch (error) {
		clearCorruptedSession()
		return createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				autoRefreshToken: true,
				persistSession: true,
				detectSessionInUrl: false
			}
		})
	}
}

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
					apikey: supabaseAnonKey
				}
			})
			isSupabaseAvailable = response.ok
			if (response.ok) console.log('✅ Supabase 连接成功')
		} catch (connErr) {
			console.warn('⚠️ Supabase 健康检查失败（不影响已缓存登录态）:', connErr.message)
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

// 创建一个 mock client 用于离线模式
const createMockClient = () => ({
	auth: {
		getSession: async () => ({ data: { session: null }, error: null }),
		signInWithOtp: async () => ({ error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
		signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
		signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
		setSession: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase 服务暂不可用，请稍后再试' } }),
		signOut: async () => ({ error: null }),
		onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
	},
	from: () => ({
		select: () => Promise.resolve({ data: [], error: null }),
		insert: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } }),
		update: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } }),
		delete: () => Promise.resolve({ data: null, error: { message: 'Supabase 服务暂不可用' } })
	})
})

// 初始化并导出
await initSupabase()

export const supabase = supabaseInstance || createMockClient()
export const checkSupabaseAvailable = () => isSupabaseAvailable
