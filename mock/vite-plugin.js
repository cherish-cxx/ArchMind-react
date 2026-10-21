import { loadEnv } from 'vite'
import { apiMiddleware } from './apiMiddleware.js'

// 把 /api 请求在 dev server 里转给共享 mock 处理器。
// VITE_ENABLE_MOCK=false 时禁用（此时改由 vite server.proxy 转发到真实后端）。
export default function archmindMock() {
  let enabled = true
  return {
    name: 'archmind-mock',
    config(config, { mode }) {
      // 用 Vite 解析出的 root；从别的目录启动时 process.cwd() 不是本项目。
      const env = loadEnv(mode, config.root || process.cwd(), '')
      enabled = env.VITE_ENABLE_MOCK !== 'false'
    },
    configureServer(server) {
      if (!enabled) return
      server.middlewares.use(apiMiddleware)
    }
  }
}
