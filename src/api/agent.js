import { request } from './request.js'
import { NodeRefType } from './agentTypes.js'

/**
 * Agent 公网接口（Java 网关 /api/agent/*）。
 *
 * 这一层只做两件事：
 *  1. 把前端对象整理成后端能吃的请求形状（projectId 统一字符串、focus 只留 type/uid）；
 *  2. 把响应里可能缺失的数组字段补成空数组，避免 UI 到处写 `?? []`。
 *
 * **不在这里做布局、不在这里改图 store、不在这里处理 rev** —— 那些属于状态层。
 */

const toId = (v) => (v === null || v === undefined || v === '' ? null : String(v))

function requireProjectId(projectId) {
  const id = toId(projectId)
  if (!id) throw new Error('缺少 projectId')
  return id
}

function requireConversationId(conversationId) {
  if (!conversationId) throw new Error('缺少 conversationId')
  return conversationId
}

/** 后端只认 {type, uid}；多传字段没有意义。 */
function toNodeRef(focus) {
  if (!focus || !focus.uid) return null
  return {
    type: focus.type || NodeRefType.CLASS,
    uid: focus.uid
  }
}

function toRelationRef(relation) {
  return {
    from: relation.from,
    to: relation.to,
    rel: relation.rel
  }
}

/** 后端 `graph` 可以是 null；是对象时把三个列表补齐。 */
function normalizeGraph(graph) {
  if (!graph) return null
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: (Array.isArray(graph.edges) ? graph.edges : []).map((e) => ({
      ...e,
      // Python 侧字段是 from；Java 序列化后也是 from。这里兼容一下 from_。
      from: e.from ?? e.from_,
      to: e.to,
      rel: e.rel,
      callCount: e.callCount ?? 1,
      viaFanout: Boolean(e.viaFanout)
    })),
    gaps: Array.isArray(graph.gaps) ? graph.gaps : [],
    truncated: Boolean(graph.truncated)
  }
}

function normalizeAgentResponse(data) {
  const raw = data || {}
  return {
    conversationId: raw.conversationId ?? null,
    message: raw.message ?? '',
    // R2 的结构化讲解：这两个字段是**逐段渲染和段落级引用 chip 的唯一来源**。
    // 漏掉它们，前端只能回落到整段 Markdown + 顶部一个来源列表，
    // 看起来就像「第二轮没有做 evidence 锚定」。
    headline: raw.headline ?? null,
    sections: (Array.isArray(raw.sections) ? raw.sections : []).map((s) => ({
      title: s?.title ?? '',
      body: s?.body ?? '',
      citedUids: Array.isArray(s?.citedUids) ? s.citedUids : []
    })),
    sessionExpired: Boolean(raw.sessionExpired),
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    uiCommands: Array.isArray(raw.uiCommands) ? raw.uiCommands : [],
    graph: normalizeGraph(raw.graph),
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    meta: raw.meta ?? null
  }
}

function normalizeSnapshot(data) {
  const raw = data || {}
  const viewport = raw.viewport
  return {
    exists: Boolean(raw.exists),
    reason: raw.reason ?? null,
    viewport: viewport
      ? {
          rev: Number(viewport.rev) || 0,
          visibleNodes: Array.isArray(viewport.visibleNodes) ? viewport.visibleNodes : [],
          visibleRelations: Array.isArray(viewport.visibleRelations)
            ? viewport.visibleRelations
            : [],
          focusedNode: viewport.focusedNode ?? null,
          truncated: Boolean(viewport.truncated)
        }
      : null,
    focus: raw.focus ?? null
  }
}

/**
 * 雪花 ID 在 JS 里是字符串（避免超过 Number.MAX_SAFE_INTEGER 后丢精度）。
 * 但 Java 网关的 `projectId` 字段是 `Long`，Jackson 3 不接受 JSON 字符串。
 *
 * 解法：正常 JSON.stringify 一个占位字符串，再把带引号的占位符替换成原始数字字面量。
 * **不能 `Number(projectId)`** —— 17 位以上会四舍五入，后端会查到一个不存在的项目。
 */
const PROJECT_ID_SENTINEL = '__ARCHMIND_RAW_PROJECT_ID__'

function bodyWithProjectId(projectId, fields) {
  const id = requireProjectId(projectId)
  if (!/^\d+$/.test(id)) {
    throw new Error(`projectId 必须是数字字符串，实际为 ${id}`)
  }
  return JSON.stringify({ ...fields, projectId: PROJECT_ID_SENTINEL })
    .replace(`"${PROJECT_ID_SENTINEL}"`, id)
}

/**
 * 一轮问答。
 *
 * @param {Object} params
 * @param {string|number} params.projectId
 * @param {string} params.message
 * @param {string|null} [params.conversationId] 不传 = 新会话
 * @param {import('./agentTypes.js').NodeRef|null} [params.focus]
 * @param {string|null} [params.methodUid] 源码大纲里锁定的方法（owner#signature）
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./agentTypes.js').AgentResponse>}
 */
export async function ask({ projectId, message, conversationId = null, focus = null, methodUid = null, signal }) {
  const text = (message ?? '').trim()
  if (!text) throw new Error('消息不能为空')
  const data = await request('/api/agent/ask', {
    method: 'POST',
    signal,
    body: bodyWithProjectId(projectId, {
      message: text,
      conversationId: conversationId || null,
      focus: toNodeRef(focus),
      methodUid: methodUid || null
    })
  })
  return normalizeAgentResponse(data)
}

/**
 * 点按钮导航。目前只有 BACK 真正可用；EXPAND 会拿到明确的「暂不支持」业务答复。
 *
 * @param {Object} params
 * @param {string|number} params.projectId
 * @param {string} params.conversationId
 * @param {'BACK'|'EXPAND'} [params.op]
 * @param {import('./agentTypes.js').NodeRef|null} [params.target]
 * @param {AbortSignal} [params.signal]
 */
export async function navigate({
  projectId,
  conversationId,
  op = 'BACK',
  target = null,
  signal
}) {
  const data = await request('/api/agent/navigate', {
    method: 'POST',
    signal,
    body: bodyWithProjectId(projectId, {
      conversationId: requireConversationId(conversationId),
      op,
      target: toNodeRef(target)
    })
  })
  return normalizeAgentResponse(data)
}

/**
 * 上报整屏快照。**是快照不是增量**：没传的字段在服务端会被当成「没有」。
 *
 * 路径里的 conversationId 由 Java 网关注入进 body，这里不必再放一遍。
 *
 * @param {Object} params
 * @param {string|number} params.projectId
 * @param {string} params.conversationId
 * @param {number} params.rev 必须比服务端当前 rev 大
 * @param {string[]} [params.visibleNodes]
 * @param {import('./agentTypes.js').ViewportRelation[]} [params.visibleRelations]
 * @param {import('./agentTypes.js').NodeRef|null} [params.focusedNode]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{accepted: boolean, reason: string|null, rev: number|null}>}
 */
export async function reportViewport({
  projectId,
  conversationId,
  rev,
  visibleNodes = [],
  visibleRelations = [],
  focusedNode = null,
  signal
}) {
  const cid = requireConversationId(conversationId)
  const data = await request(
    `/api/agent/conversations/${encodeURIComponent(cid)}/viewport`,
    {
      method: 'POST',
      signal,
      body: bodyWithProjectId(projectId, {
        rev,
        visibleNodes,
        visibleRelations: visibleRelations.map(toRelationRef),
        focusedNode: toNodeRef(focusedNode)
      })
    }
  )
  return {
    accepted: Boolean(data?.accepted),
    reason: data?.reason ?? null,
    rev: data?.rev ?? null
  }
}

/**
 * 读回会话：刷新页面时恢复屏幕用。
 * 不返回 history（后端有意只给屏幕快照和当前焦点）。
 *
 * @param {string} conversationId
 * @param {string|number} projectId
 * @param {AbortSignal} [signal]
 * @returns {Promise<import('./agentTypes.js').ConversationSnapshot>}
 */
export async function getConversation(conversationId, projectId, signal) {
  const cid = requireConversationId(conversationId)
  const pid = requireProjectId(projectId)
  const data = await request(
    `/api/agent/conversations/${encodeURIComponent(cid)}?projectId=${encodeURIComponent(pid)}`,
    { signal }
  )
  return normalizeSnapshot(data)
}
