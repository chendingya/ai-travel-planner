import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3002'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 8080,
    strictPort: false, // 如果端口被占用，自动尝试下一个端口
    proxy: {
      '/config.js': {
        target: backendTarget,
        changeOrigin: true
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/audio': {
        target: backendTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2022'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022'
    }
  }
})
