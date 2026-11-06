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
const DRAFT = 'draft'
const graphKey = (projectId, conversationId) =>
  `archmind:graph:${projectId}:${conversationId || DRAFT}`
const chatKey = (projectId, conversationId) =>
  `archmind:chat:${projectId}:${conversationId || DRAFT}`
const lastConversationKey = (projectId) => `archmind:last-conversation:${projectId}`

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

export function saveGraphSnapshot(projectId, conversationId, snapshot) {
  if (!projectId) return
  save(graphKey(projectId, conversationId), snapshot)
}

export function loadGraphSnapshot(projectId, conversationId) {
  if (!projectId) return null
  return load(graphKey(projectId, conversationId))
}

export function saveChatSnapshot(projectId, conversationId, snapshot) {
  if (!projectId) return
  save(chatKey(projectId, conversationId), snapshot)
}

export function loadChatSnapshot(projectId, conversationId) {
  if (!projectId) return null
  return load(chatKey(projectId, conversationId))
}

/** 记住每个项目最后打开的那个会话，刷新时能回到同一个窗口。 */
export function saveLastConversationId(projectId, conversationId) {
  if (!projectId || !canStore()) return
  try {
    if (conversationId) {
      localStorage.setItem(lastConversationKey(projectId), String(conversationId))
    } else {
      localStorage.removeItem(lastConversationKey(projectId))
    }
  } catch {
    // ignore
  }
}

export function loadLastConversationId(projectId) {
  if (!projectId || !canStore()) return null
  try {
    return localStorage.getItem(lastConversationKey(projectId)) || null
  } catch {
    return null
  }
}

/** 重新分析 / 删除项目后，旧图与旧会话都不再有意义。 */
export function clearProjectCache(projectId) {
  if (!projectId || !canStore()) return
  try {
    const prefixes = [
      `archmind:graph:${projectId}:`,
      `archmind:chat:${projectId}:`
    ]
    // 兼容旧版按项目存的单份快照
    localStorage.removeItem(`archmind:graph:${projectId}`)
    localStorage.removeItem(`archmind:chat:${projectId}`)
    localStorage.removeItem(lastConversationKey(projectId))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && prefixes.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}
