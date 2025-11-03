import { createClient } from '@supabase/supabase-js'
import { loadRuntimeConfig } from './runtimeConfig'

const { supabaseUrl, supabaseAnonKey } = await loadRuntimeConfig()

if (!supabaseUrl || !supabaseAnonKey) {
	console.warn('Supabase 配置缺失,请在运行时注入 PUBLIC_SUPABASE_URL 与 PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)