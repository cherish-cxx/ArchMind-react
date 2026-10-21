import { useSyncExternalStore } from 'react'

/**
 * conversationStore：会话「说过什么」与屏幕版本。
 *
 * 和后端的对应关系：
 *  - conversationId 只来自 /ask 响应，前端不自己生成；
 *  - localRev 是前端自己的 viewport 版本，上报时单调递增；
 *  - localRev 与 meta.graphRev **不是一回事**：前者是屏幕版本，后者是代码图版本。
 *
 * 消息只保存在内存；localStorage 持久化在 P3 接。
 */

let seq = 0
const nextId = () => `m_${Date.now().toString(36)}_${++seq}`

function initialState(projectId = null) {
  return {
    projectId: projectId === null ? null : String(projectId),
    conversationId: null,
    messages: [],
    localRev: 0,
    pending: false,
    sessionExpired: false,
    error: null
  }
}

let state = initialState()
const listeners = new Set()

function commit(next) {
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

export const getConversationState = () => state

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useConversationState() {
  return useSyncExternalStore(subscribe, getConversationState, getConversationState)
}

/**
 * 进入某个项目时调用。换了项目才重置，同一项目重复调用是 no-op
 * —— 否则每次渲染都会把对话清空。
 */
export function prepareProject(projectId) {
  const id = projectId === null || projectId === undefined ? null : String(projectId)
  if (state.projectId === id) return
  commit(initialState(id))
}

/** 显式「新对话」：保留项目，丢掉 cid / 消息 / rev / 过期标记。 */
export function startNewConversation() {
  commit(initialState(state.projectId))
}

/** 刷新恢复时，直接把服务端的 rev 作为起点。 */
export function setLocalRev(rev) {
  const next = Number(rev) || 0
  if (next === state.localRev) return
  commit({ ...state, localRev: next })
}

/** 上报前自增；返回的就是这一条要发的 rev。 */
export function bumpLocalRev() {
  const next = state.localRev + 1
  commit({ ...state, localRev: next })
  return next
}

export function appendUserMessage(text) {
  const message = {
    id: nextId(),
    role: 'user',
    text: String(text || ''),
    citations: [],
    suggestions: [],
    steps: [],
    meta: null,
    error: null,
    createdAt: Date.now()
  }
  commit({ ...state, messages: [...state.messages, message], error: null })
  return message.id
}

/** 把一轮 /ask 响应映射成一条 agent 消息。 */
export function appendAgentMessage(response) {
  const message = {
    id: nextId(),
    role: 'agent',
    text: response?.message ?? '',
    citations: response?.citations ?? [],
    suggestions: response?.suggestions ?? [],
    steps: response?.steps ?? [],
    meta: response?.meta ?? null,
    error: null,
    sessionExpired: Boolean(response?.sessionExpired),
    createdAt: Date.now()
  }
  const conversationId = response?.conversationId || state.conversationId
  commit({
    ...state,
    conversationId,
    messages: [...state.messages, message],
    sessionExpired: state.sessionExpired || message.sessionExpired
  })
  return message.id
}

/** 传输层失败（超时、断网、500）：不伪装成 agent 回答。 */
export function appendErrorMessage(text) {
  const message = {
    id: nextId(),
    role: 'agent',
    text: String(text || '请求失败'),
    citations: [],
    suggestions: [],
    steps: [],
    meta: null,
    error: true,
    createdAt: Date.now()
  }
  commit({ ...state, messages: [...state.messages, message] })
  return message.id
}

/** 本地系统提示（取消、会话过期说明等）。不是 LLM 的回答。 */
export function appendSystemMessage(text) {
  const message = {
    id: nextId(),
    role: 'system',
    text: String(text || ''),
    citations: [],
    suggestions: [],
    steps: [],
    meta: null,
    error: false,
    createdAt: Date.now()
  }
  commit({ ...state, messages: [...state.messages, message] })
  return message.id
}

export function setPending(pending) {
  const next = Boolean(pending)
  if (next === state.pending) return
  commit({ ...state, pending: next })
}

export function setConversationError(error) {
  commit({ ...state, error: error || null })
}

/** 过期是主路径，不是异常：所有入口（ask / navigate / viewport / 读回）都汇到这里。 */
export function setSessionExpired(expired) {
  const next = Boolean(expired)
  if (next === state.sessionExpired) return
  commit({ ...state, sessionExpired: next })
}

export function markSessionExpired() {
  setSessionExpired(true)
}

/**
 * 从本地快照恢复会话（P3）。
 * 调用方必须先 `prepareProject(projectId)`，否则 projectId 对不上会直接忽略。
 */
export function hydrateConversation(raw) {
  if (!raw || typeof raw !== 'object') return
  if (raw.projectId && String(raw.projectId) !== state.projectId) return
  commit({
    ...state,
    conversationId: raw.conversationId || null,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    localRev: Number(raw.localRev) || 0,
    sessionExpired: Boolean(raw.sessionExpired),
    pending: false,
    error: null
  })
}

/** 给 localStorage 用。 */
export function getConversationPersistSnapshot() {
  return {
    projectId: state.projectId,
    conversationId: state.conversationId,
    messages: state.messages,
    localRev: state.localRev,
    sessionExpired: state.sessionExpired
  }
}
