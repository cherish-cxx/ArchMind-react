import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import archmindMock from './mock/vite-plugin.js'

// 用配置文件自身所在目录，而不是 process.cwd()：
// 从别的目录启动（例如桌面应用的预览器传入 root 参数）时，cwd 不是本项目，
// 会把 .env.local 读漏，导致 VITE_ENABLE_MOCK 判断错误、误开 mock 后端。
const ROOT = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, '')
  const mockEnabled = env.VITE_ENABLE_MOCK !== 'false'
  return {
    plugins: [react(), archmindMock()],
    server: {
      port: 5173,
      open: true,
      // mock 关闭时(接真实 Spring Boot)，把 /api 代理到后端
      proxy: mockEnabled ? undefined : {
        '/api': { target: 'http://localhost:8080', changeOrigin: true }
      }
    }
  }
})
