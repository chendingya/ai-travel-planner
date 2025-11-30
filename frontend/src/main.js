import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import TDesignChat from '@tdesign-vue-next/chat'
import 'tdesign-vue-next/es/style/index.css'
import '@tdesign-vue-next/chat/es/style/index.css'
import App from './App.vue'
import router from './router'
import './styles/custom.css'
import { loadAmapScript } from './config/amap.js'

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
