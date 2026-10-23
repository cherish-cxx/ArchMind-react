import { URL } from 'node:url'
import {
  state, findByAccess, findByRefresh, revoke,
  issueTokens, loginResponse, buildOverview, projectResponse
} from './data.js'

// ========== 通用 Result 包装（对齐后端）==========
const ok = (data) => ({ code: 0, message: 'success', data, timestamp: Date.now() })
const fail = (code, message) => ({ code, message, data: null, timestamp: Date.now() })

// ========== 请求体收集 ==========
function readBody(req, limit = 500 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(Buffer.concat(chunks))
    }
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        done = true
        req.destroy()
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(c)
    })
    req.on('end', finish)
    req.on('error', reject)
  })
}

// multipart 轻量解析：只取第一个 file 字段的 filename，内容忽略（mock 不需要真解析）
function extractMultipartMeta(buf) {
  const raw = buf.toString('latin1')
  const m = raw.match(/filename="([^"]*)"/)
  return {
    fileName: m && m[1] ? m[1] : 'project.zip',
    fileSize: buf.byteLength
  }
}

// mock 创建+上传：从 multipart 中取文本字段（name/description/gitUrl）
function extractMultipartFields(buf) {
  const raw = buf.toString('utf8')
  const fields = {}
  const re = /name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g
  let m
  while ((m = re.exec(raw))) fields[m[1]] = m[2]
  return fields
}

// 异步任务 mock：与真实后端一样，/analyze 只投递，进度靠轮询读取
function taskStore() {
  if (!state.tasks) state.tasks = new Map()
  return state.tasks
}

function nextTaskId() {
  state.nextTaskId = (state.nextTaskId || 0) + 1
  return state.nextTaskId
}

// 代码探索 mock 数据（真实后端来自 Neo4j）
const MOCK_CLASSES = [
  ['com.example.demo.controller.OrderController', 'OrderController', 'CLASS', '订单入口'],
  ['com.example.demo.service.OrderService', 'OrderService', 'INTERFACE', '订单服务接口'],
  ['com.example.demo.service.impl.OrderServiceImpl', 'OrderServiceImpl', 'CLASS', '订单服务实现'],
  ['com.example.demo.repository.OrderRepository', 'OrderRepository', 'INTERFACE', '订单仓储']
].map(([qualifiedName, simpleName, kind, description]) => ({
  qualifiedName,
  simpleName,
  packageName: qualifiedName.split('.').slice(0, -1).join('.'),
  kind,
  description,
  filePath: `src/main/java/${qualifiedName.split('.').join('/')}.java`,
  startLine: 1,
  endLine: 12
}))

function mockSource(uid) {
  const clazz = MOCK_CLASSES.find((c) => c.qualifiedName === uid) || MOCK_CLASSES[0]
  const pkg = clazz.packageName
  const content = [
    `package ${pkg};`,
    '',
    `public ${clazz.kind === 'INTERFACE' ? 'interface' : 'class'} ${clazz.simpleName} {`,
    '    public void run() {',
    '        // mock 源码：用于验证代码抽屉、行号与高亮',
    '    }',
    '}'
  ].join('\n')
  return {
    uid: clazz.qualifiedName,
    simpleName: clazz.simpleName,
    packageName: pkg,
    filePath: clazz.filePath,
    startLine: 1,
    endLine: content.split('\n').length,
    fileLineCount: content.split('\n').length,
    content,
    truncated: false
  }
}

const bearer = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

// 从 Authorization 头识别 access 或 refresh token 并校验
function authSession(req, mode) {
  const token = bearer(req)
  if (mode === 'refresh') {
    return token && findByRefresh(token)
  }
  return token && findByAccess(token)
}

function userById(id) {
  return state.user.id === id ? state.user : null
}

// ========== 路由分发 ==========
async function dispatch(req) {
  const url = new URL(req.url, 'http://mock.local')
  const path = url.pathname
  const method = req.method.toUpperCase()

  // --- 认证 ---
  if (method === 'POST' && path === '/api/auth/login') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const { username, password } = body || {}
    const u = state.user
    if (!username || !password || username !== u.username || password !== u.password) {
      return { status: 401, json: fail(401, '用户名或密码错误') }
    }
    return { status: 200, json: ok(loginResponse(u, issueTokens(u))) }
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const { username, password } = body || {}
    if (!username || !password) return { status: 400, json: fail(400, '用户名与密码不能为空') }
    if (username === state.user.username) return { status: 400, json: fail(400, '用户名已存在') }
    return {
      status: 200,
      json: ok({ id: state.user.id, username, email: body.email || '', phone: body.phone || '', createTime: state.user.createTime })
    }
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    revoke(bearer(req), null)
    return { status: 200, json: ok(null) }
  }

  if (method === 'POST' && path === '/api/auth/refresh') {
    const session = authSession(req, 'refresh')
    if (!session) return { status: 401, json: fail(401, '刷新令牌无效或已过期') }
    const user = userById(session.userId)
    if (!user) return { status: 401, json: fail(401, '用户不存在') }
    revoke(session.accessToken, session.refreshToken)
    return { status: 200, json: ok(loginResponse(user, issueTokens(user))) }
  }

  // --- 项目:新建 / 列表 / 上传 / 分析（均需登录）---
  if (method === 'POST' && path === '/api/project') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或Token已过期') }
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    const name = (body.name ?? '').trim()
    const description = (body.description ?? '').trim()
    if (!name) return { status: 200, json: fail(3001, '项目名称不能为空') }
    if (name.length > 50) return { status: 200, json: fail(3001, '项目名称长度需在 1-50 之间') }
    if (description.length > 200) return { status: 200, json: fail(3001, '项目描述不能超过 200 字') }
    const p = {
      id: state.nextProjectId++,
      name,
      description,
      gitUrl: body.gitUrl ?? null,
      status: 'CREATED',
      analysisStatus: 'NO_SOURCE',
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sourceId: null,
      fileName: null,
      fileSize: null,
      uploadedAt: null,
      analyzedAt: null,
      overview: null
    }
    state.projects.unshift(p)
    return { status: 200, json: ok(projectResponse(p)) }
  }

  if (method === 'GET' && path === '/api/project') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或Token已过期') }
    return { status: 200, json: ok(state.projects.map(projectResponse)) }
  }

  // 创建 + 上传一体（mock 版）：失败不回滚，仅用于无后端时的 UI 联调
  if (method === 'POST' && path === '/api/project/with-source') {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const body = await readBody(req)
    const fields = extractMultipartFields(body)
    const meta = extractMultipartMeta(body)
    const name = (fields.name ?? '').trim()
    if (!name) return { status: 200, json: fail(3001, '项目名称不能为空') }
    const p = {
      id: state.nextProjectId++,
      name,
      description: (fields.description ?? '').trim(),
      gitUrl: fields.gitUrl || null,
      status: 'PENDING',
      analysisStatus: 'PENDING',
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sourceId: Date.now() % 100000,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      uploadedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      analyzedAt: null,
      overview: null
    }
    state.projects.unshift(p)
    return {
      status: 200,
      json: ok({
        project: projectResponse(p),
        upload: {
          sourceId: p.sourceId,
          projectId: p.id,
          fileName: p.fileName,
          fileSize: p.fileSize,
          status: 'PENDING',
          taskId: null
        }
      })
    }
  }

  const uploadMatch = path.match(/^\/api\/project\/(\d+)\/upload$/)
  if (method === 'POST' && uploadMatch) {

    const session = authSession(req)
    
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    
    const projectId = Number(uploadMatch[1])
    const p = state.projects.find((x) => x.id === projectId)
    
    if (!p) return { status: 200, json: fail(4000, `项目不存在: ${projectId}`) }
    
    const meta = extractMultipartMeta(await readBody(req))
    
    p.sourceId = p.sourceId ?? Date.now() % 100000
    p.fileName = meta.fileName
    p.fileSize = meta.fileSize
    p.uploadedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    p.status = 'PENDING'
    p.analysisStatus = 'PENDING'
    p.overview = null // 上传了新源码：旧概况作废

    return {
      status: 200,
      json: ok({
        sourceId: p.sourceId,
        projectId,
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        status: 'PENDING',
        taskId: null
      })
    }
  }

  const delMatch = path.match(/^\/api\/project\/(\d+)$/)
  if (method === 'DELETE' && delMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const id = Number(delMatch[1])
    const idx = state.projects.findIndex((x) => x.id === id)
    if (idx < 0) return { status: 200, json: fail(4000, '项目不存在') }
    state.projects.splice(idx, 1)
    return { status: 200, json: ok(null) }
  }

  const classesMatch = path.match(/^\/api\/project\/(\d+)\/classes$/)
  if (method === 'GET' && classesMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok(MOCK_CLASSES) }
  }

  const relationsMatch = path.match(/^\/api\/project\/(\d+)\/class\/relations$/)
  if (method === 'GET' && relationsMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const uid = url.searchParams.get('uid')
    const center = MOCK_CLASSES.find((c) => c.qualifiedName === uid) || MOCK_CLASSES[0]
    return {
      status: 200,
      json: ok({
        center,
        upstream: { callers: [], dependents: [], subclasses: [] },
        downstream: { callees: [], dependencies: [], parents: [] }
      })
    }
  }

  const sourceMatch = path.match(/^\/api\/project\/(\d+)\/class\/source$/)
  if (method === 'GET' && sourceMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    return { status: 200, json: ok(mockSource(url.searchParams.get('uid'))) }
  }

  const overviewMatch = path.match(/^\/api\/project\/(\d+)\/overview$/)
  if (method === 'GET' && overviewMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const p = state.projects.find((x) => x.id === Number(overviewMatch[1]))
    if (!p) return { status: 200, json: fail(4000, '项目不存在') }
    if (!p.overview) return { status: 200, json: fail(4000, '该项目尚未分析，请先点击分析生成概况') }
    return { status: 200, json: ok(p.overview) }
  }

  // 最近一次分析任务：刷新/换页后恢复进度
  const latestTaskMatch = path.match(/^\/api\/project\/(\d+)\/tasks\/latest$/)
  if (method === 'GET' && latestTaskMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const projectId = Number(latestTaskMatch[1])
    let latest = null
    for (const t of taskStore().values()) {
      if (t.projectId === projectId && (!latest || t.taskId > latest.taskId)) latest = t
    }
    return { status: 200, json: ok(latest) }
  }

  const taskMatch = path.match(/^\/api\/task\/(\d+)$/)
  if (method === 'GET' && taskMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const t = taskStore().get(Number(taskMatch[1]))
    if (!t) return { status: 200, json: fail(4000, '任务不存在') }
    return { status: 200, json: ok(t) }
  }

  const analyzeMatch = path.match(/^\/api\/project\/(\d+)\/analyze$/)
  if (method === 'POST' && analyzeMatch) {
    const session = authSession(req)
    if (!session) return { status: 401, json: fail(401, '未登录或登录已失效') }
    const projectId = Number(analyzeMatch[1])
    const p = state.projects.find((x) => x.id === projectId)
    if (!p) return { status: 200, json: fail(4000, `项目不存在: ${projectId}`) }
    if (!p.sourceId) return { status: 200, json: fail(4000, '该项目尚未上传源码或未完成扫描') }
    const force = url.searchParams.get('force') === 'true'

    // 快路径：非强刷且已有概况 → 合成 SUCCESS（与真实后端一致，不再直接返回 overview）
    if (!force && p.analysisStatus === 'COMPLETED' && p.overview) {
      return {
        status: 200,
        json: ok({
          taskId: null, projectId, type: 'ANALYSIS', status: 'SUCCESS',
          progress: 100, currentStage: null, detail: p.overview, error: null
        })
      }
    }

    const task = {
      taskId: nextTaskId(), projectId, type: 'ANALYSIS',
      status: 'RUNNING', progress: 0, currentStage: 'SCAN', error: null
    }
    taskStore().set(task.taskId, task)
    p.analysisStatus = 'PENDING'
    setTimeout(() => { task.progress = 40; task.currentStage = 'AST' }, 500)
    setTimeout(() => { task.progress = 75; task.currentStage = 'OVERVIEW' }, 1000)
    setTimeout(() => {
      p.overview = buildOverview(p)
      p.analysisStatus = 'COMPLETED'
      p.analyzedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
      task.status = 'SUCCESS'
      task.progress = 100
      task.currentStage = null
    }, 1600)
    return { status: 200, json: ok({ ...task }) }
  }

  return { status: 404, json: fail(404, `mock 未实现的接口: ${method} ${path}`) }
}

function send(res, { status, json }) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(json))
}

// connect 风格中间件，vite dev server 与 express server.js 共用
export function apiMiddleware(req, res, next) {
  if (!req.url.startsWith('/api')) return next()
  dispatch(req)
    .then((r) => send(res, r))
    .catch((err) => {
      if (res.headersSent) return
      send(res, { status: 500, json: fail(500, `mock 处理出错: ${err.message}`) })
    })
}
