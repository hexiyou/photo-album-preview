import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        // 前端所有 /api 请求转发到后端服务。
        // 演示阶段指向本地 mock server（npm run mock:api）；
        // 接入真实后端时，改 VITE_MOCK_SERVER_URL 或直接改这里的 target 即可。
        '/api': {
          target: env.VITE_MOCK_SERVER_URL || 'http://127.0.0.1:8787',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      chunkSizeWarningLimit: 900
    }
  }
})
