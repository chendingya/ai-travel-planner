import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import TDesignChat from '@tdesign-vue-next/chat'; // 引入chat组件
import 'tdesign-vue-next/es/style/index.css'
import App from './App.vue'
import router from './router'
import './styles/custom.css'
import { loadAmapScript } from './config/amap.js'

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const nativeFetch = window.fetch.bind(window);
  const extractBearerToken = (authorization) => {
    if (typeof authorization !== 'string') return '';
    const trimmed = authorization.trim();
    if (!trimmed) return '';
    if (trimmed.toLowerCase().startsWith('bearer ')) return trimmed.slice(7).trim();
    return trimmed;
  };

  window.fetch = (input, init = {}) => {
    try {
      const requestHeaders = input instanceof Request ? input.headers : undefined;
      const headers = new Headers(init.headers || requestHeaders);
      const authHeader = headers.get('Authorization');
      const bearerToken = extractBearerToken(authHeader);
      if (authHeader && !headers.get('X-Authorization')) {
        // 某些托管网关会过滤 Authorization，额外附带一份自定义头兜底。
        headers.set('X-Authorization', authHeader);
      }
      if (bearerToken && !headers.get('X-Supabase-Access-Token')) {
        // 网关可能覆盖标准 Authorization，优先走自定义头传递用户 JWT。
        headers.set('X-Supabase-Access-Token', bearerToken);
      }
      if (bearerToken && !headers.get('X-Access-Token')) {
        headers.set('X-Access-Token', bearerToken);
      }
      if (bearerToken && !headers.get('X-Auth-Token')) {
        headers.set('X-Auth-Token', bearerToken);
      }
      return nativeFetch(input, {
        ...init,
        headers,
      });
    } catch (_) {
      return nativeFetch(input, init);
    }
  };
}

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(TDesign)
app.use(TDesignChat)

// 先加载高德地图,再挂载应用
loadAmapScript()
  .then(() => {
    console.log('✅ 高德地图 API 准备就绪');
  })
  .catch(err => {
    console.warn('⚠️ 高德地图加载失败,地图功能可能不可用:', err.message);
  })
  .finally(() => {
    app.mount('#app');
  });
