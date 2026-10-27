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
        // 前端所有 /api 请求转发到后端服务
        // 本地媒体服务（VITE_DATA_SOURCE=local）指向 media/server.mjs 的 8788，
        // 其余情况指向演示用的 mock server（8787）；接真实后端时改对应变量即可
        '/api': {
          target:
            env.VITE_DATA_SOURCE === 'local'
              ? env.VITE_MEDIA_SERVER_URL || 'http://127.0.0.1:8788'
              : env.VITE_MOCK_SERVER_URL || 'http://127.0.0.1:8787',
          changeOrigin: true
        },
        // 扫描生成的缩略图（media-cache/）由媒体服务提供
        '/media-cache': {
          target: env.VITE_MEDIA_SERVER_URL || 'http://127.0.0.1:8788',
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
