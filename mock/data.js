import crypto from 'node:crypto'

// ========== 内存"数据库"（仅服务端 mock 使用，进程重启即清空）==========

export const DEMO_USER = {
  id: 1,
  username: 'chenxi',
  password: '123456',
  email: 'chenxi@archmind.dev',
  phone: '',
  createTime: '2026-09-01 10:00:00'
}

export const state = {
  user: { ...DEMO_USER },
  // 项目列表（对齐后端：POST /api/project 创建，GET /api/project 倒序返回）
  projects: [],
  nextProjectId: 1,
  // accessToken -> 会话
  sessions: new Map(),
  // refreshToken -> accessToken（便于按 refresh 反查）
  tokenIndex: new Map()
}

function rnd() {
  return crypto.randomUUID().replace(/-/g, '')
}

export function issueTokens(user) {
  const accessToken = 'am_at_' + rnd()
  const refreshToken = 'am_rt_' + rnd()
  const session = {
    userId: user.id,
    accessToken,
    refreshToken,
    accessExp: Date.now() + 2 * 60 * 60 * 1000,
    refreshExp: Date.now() + 7 * 24 * 60 * 60 * 1000
  }
  state.sessions.set(accessToken, session)
  state.tokenIndex.set(refreshToken, accessToken)
  return session
}

export function findByAccess(token) {
  return token ? state.sessions.get(token) : null
}

export function findByRefresh(refreshToken) {
  if (!refreshToken) return null
  const accessToken = state.tokenIndex.get(refreshToken)
  return accessToken ? state.sessions.get(accessToken) : null
}

export function revoke(accessToken, refreshToken) {
  const session = accessToken
    ? state.sessions.get(accessToken)
    : (() => {
        const at = refreshToken && state.tokenIndex.get(refreshToken)
        return at ? state.sessions.get(at) : null
      })()
  if (session) {
    state.tokenIndex.delete(session.refreshToken)
    state.sessions.delete(session.accessToken)
  }
}

// 对齐文档 2.2 登录响应：userId/username/accessToken/refreshToken/expiresIn（无 nickname）
export function loginResponse(user, session) {
  return {
    userId: user.id,
    username: user.username,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: 7200
  }
}

export function projectResponse(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    language: p.language ?? null,
    framework: p.framework ?? null,
    gitUrl: p.gitUrl ?? null,
    version: p.version ?? null,
    status: p.status,
    analysisStatus: p.analysisStatus ?? 'NO_SOURCE',
    createTime: p.createTime
  }
}

// ========== 演示项目概况（严格对齐文档 ProjectOverviewResponse 字段）==========

export function buildOverview(p) {
  return {
    projectType: '全栈应用',
    summary: '基于 React + Express 的软件工程知识地图演示项目',
    description:
      '前端以 React + Vite 构建交互式领域知识地图（核心领域 → 子领域 → 技术点三层节点），' +
      '后端 Express 提供构建产物静态托管。用于演示 ArchMind 平台对代码项目架构的智能解读。',
    techStack: [
      { name: 'React', category: '前端框架', version: '18.3', role: 'UI 渲染' },
      { name: 'Vite', category: '构建工具', version: '5.4', role: '开发构建' },
      { name: 'Express', category: 'Node 服务', version: '4.21', role: '静态托管' },
      { name: 'TypeScript', category: '语言', version: '5.x', role: '静态类型' }
    ],
    architecture: {
      style: '分层',
      layers: ['展示层', '服务层', '资源层'],
      description: '以领域地图交互为核心，前后端同仓演示、职责分离，层级清晰便于解析。'
    },
    modules: [
      { name: '领域地图', responsibility: '核心节点的坐标/层级定义与可视化布局', keyFiles: ['src/data/mapData.js', 'src/components/MapCanvas.jsx'] },
      { name: '交互面板', responsibility: '搜索、筛选、缩放与 AI 助手等旁路交互', keyFiles: ['src/components/TopBar.jsx', 'src/components/AIPanel.jsx'] },
      { name: '整体骨架', responsibility: '应用布局与导航/会话状态管理', keyFiles: ['src/App.jsx', 'src/components/Sidebar.jsx'] },
      { name: '静态托管', responsibility: '构建产物托管与 SPA 路由回退', keyFiles: ['server.js'] }
    ]
  }
}
