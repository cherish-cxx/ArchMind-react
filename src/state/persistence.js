/**
 * 每个项目一份本地快照：画布 + 对话。
 *
 * 为什么必须本地存：
 *  - 后端 `/conversations/{id}` 只给 viewport（uid 列表 + 关系）和 focus，
 *    不给节点元数据、不给坐标、也不给聊天记录；
 *  - 只靠服务端快照恢复，刷新后节点只能变成没有名字的 stub，图也会重排。
 *
 * 只存**项目相关**的状态；会话过期时保留图作为浏览态是刻意的。
 */
const VERSION = 1
const graphKey = (projectId) => `archmind:graph:${projectId}`
const chatKey = (projectId) => `archmind:chat:${projectId}`

function canStore() {
  return typeof localStorage !== 'undefined'
}

function save(key, value) {
  if (!canStore()) return
  try {
    localStorage.setItem(key, JSON.stringify({ v: VERSION, value }))
  } catch {
    // 配额满 / 隐私模式：持久化失败不能影响交互
  }
}

function load(key) {
  if (!canStore()) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== VERSION) return null
    return parsed.value
  } catch {
    return null
  }
}

export function saveGraphSnapshot(projectId, snapshot) {
  if (!projectId) return
  save(graphKey(projectId), snapshot)
}

export function loadGraphSnapshot(projectId) {
  if (!projectId) return null
  return load(graphKey(projectId))
}

export function saveChatSnapshot(projectId, snapshot) {
  if (!projectId) return
  save(chatKey(projectId), snapshot)
}

export function loadChatSnapshot(projectId) {
  if (!projectId) return null
  return load(chatKey(projectId))
}

/** 重新分析 / 删除项目后，旧图与旧会话都不再有意义。 */
export function clearProjectCache(projectId) {
  if (!projectId || !canStore()) return
  try {
    localStorage.removeItem(graphKey(projectId))
    localStorage.removeItem(chatKey(projectId))
  } catch {
    // ignore
  }
}
