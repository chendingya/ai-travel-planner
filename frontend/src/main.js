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

  const resolveUrl = (input) => {
    try {
      if (input instanceof Request) {
        return new URL(input.url, window.location.origin);
      }
      if (typeof input === 'string') {
        return new URL(input, window.location.origin);
      }
      if (input instanceof URL) {
        return input;
      }
    } catch (_) {}
    return null;
  };

  const shouldAttachAuth = (url) => {
    if (!url) return false;
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  };

  window.fetch = async (input, init = {}) => {
    try {
      const url = resolveUrl(input);
      const requestHeaders = input instanceof Request ? input.headers : undefined;
      const headers = new Headers(requestHeaders);
      if (init.headers) {
        const initHeaders = new Headers(init.headers);
        initHeaders.forEach((value, key) => headers.set(key, value));
      }

      if (shouldAttachAuth(url)) {
        // 纯 Cookie 模式：禁用前端 token 头注入，仅依赖 HttpOnly Cookie。
        headers.delete('Authorization');
        headers.delete('X-Authorization');
        headers.delete('X-Supabase-Access-Token');
        headers.delete('X-Access-Token');
        headers.delete('X-Auth-Token');
      }

      return nativeFetch(input, {
        ...init,
        credentials: shouldAttachAuth(url) ? 'include' : init.credentials,
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
