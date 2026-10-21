/**
 * 图状态的纯函数层：合并、去重、清空、序列化。
 *
 * **为什么单独一层**：upsert 规则（保留坐标、补 stub、边去重）是这一片最容易出 bug
 * 的地方，把它做成不依赖 React、不依赖浏览器的纯函数，才能直接跑脚本验证。
 *
 * 状态形状（Map 是为了 O(1) 去重，渲染时再取 values）：
 *   {
 *     nodes: MultiMap<uid, GraphNode>,
 *     edges: Map<"from|to|rel", GraphEdge>,
 *     gaps:  Map<"at|reason", GraphGap>,
 *     focusUid, selectedUid,
 *     truncated
 *   }
 */

/** @typedef {import('../api/agentTypes.js').GraphNode} GraphNode */
/** @typedef {import('../api/agentTypes.js').GraphEdge} GraphEdge */
/** @typedef {import('../api/agentTypes.js').GraphGap} GraphGap */
/** @typedef {import('../api/agentTypes.js').GraphPatch} GraphPatch */

const META_KEYS = [
  'name',
  'kind',
  'packageName',
  'module',
  'depth',
  'viaFanout',
  'edgeCount',
  'description',
  'x',
  'y'
]

/** 方法 uid（owner#signature）→ owner；类 uid 原样返回。 */
export function ownerUid(uid) {
  return String(uid || '').split('#')[0]
}

/**
 * V1 的图节点是类级。citations 里可能是 METHOD，聚焦时一律落到 owner 类上。
 * 这个函数是「图节点粒度」这条边界在代码里的唯一落点。
 */
export function resolveGraphUid(uid) {
  return ownerUid(uid)
}

export function simpleName(uid) {
  const owner = ownerUid(uid)
  return owner.split('.').pop() || owner
}

export function packageNameOf(uid) {
  const owner = ownerUid(uid)
  const i = owner.lastIndexOf('.')
  return i > 0 ? owner.slice(0, i) : undefined
}

export function edgeKey(edge) {
  return `${edge.from}|${edge.to}|${edge.rel}`
}

export function gapKey(gap) {
  return `${gap.at}|${gap.reason}`
}

export function createGraphState() {
  return {
    nodes: new Map(),
    edges: new Map(),
    gaps: new Map(),
    focusUid: null,
    selectedUid: null,
    // SHOW_PATH 的高亮集合。是视图状态，不进 localStorage。
    pathUids: new Set(),
    truncated: false
  }
}

/** 只把后端真正给了的字段放进来；null 不覆盖已有值。 */
function normalizeNode(raw) {
  if (!raw || !raw.uid) return null
  const node = { uid: String(raw.uid) }
  for (const key of META_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) node[key] = raw[key]
  }
  if (!node.name) node.name = simpleName(node.uid)
  return node
}

function normalizeEdge(raw) {
  if (!raw) return null
  const from = raw.from ?? raw.from_
  const to = raw.to
  if (!from || !to || !raw.rel) return null
  return {
    from: String(from),
    to: String(to),
    rel: raw.rel,
    callCount: raw.callCount ?? 1,
    viaFanout: Boolean(raw.viaFanout)
  }
}

/** 边指向了 patch 里没给的节点时补一个 stub —— 宁可少信息，不能丢边。 */
export function stubNode(rawUid) {
  const uid = resolveGraphUid(rawUid)
  return {
    uid,
    name: simpleName(uid),
    packageName: packageNameOf(uid)
  }
}

/**
 * 把一轮的 GraphPatch 合并进现有图。
 *
 * 规则：
 *  - patch 为 null → 原样返回（这轮没有图数据，不是清空）；
 *  - 节点已存在 → 元数据以新 patch 为准，**坐标保留**；
 *  - 边按 from|to|rel 去重，两端节点不在 patch 里就补 stub；
 *  - gap 按 at|reason 去重；
 *  - truncated 只反映**最新一轮**，不做累积。
 */
export function applyPatch(state, patch) {
  if (!patch) return state

  const nodes = new Map(state.nodes)
  const edges = new Map(state.edges)
  const gaps = new Map(state.gaps)
  let changed = false

  for (const raw of patch.nodes || []) {
    const node = normalizeNode(raw)
    if (!node) continue
    const old = nodes.get(node.uid)
    nodes.set(node.uid, old ? { ...old, ...node } : node)
    changed = true
  }

  for (const raw of patch.edges || []) {
    const edge = normalizeEdge(raw)
    if (!edge) continue
    for (const uid of [edge.from, edge.to]) {
      if (!nodes.has(uid)) nodes.set(uid, stubNode(uid))
    }
    edges.set(edgeKey(edge), edge)
    changed = true
  }

  for (const raw of patch.gaps || []) {
    if (!raw || !raw.at || !raw.reason) continue
    const gap = { at: String(raw.at), reason: String(raw.reason) }
    gaps.set(gapKey(gap), gap)
    changed = true
  }

  const truncated = Boolean(patch.truncated)
  if (!changed && truncated === state.truncated) return state

  // 新证据子图到达后，旧的路径高亮就过期了；SHOW_PATH 会在随后重新设置。
  return { ...state, nodes, edges, gaps, truncated, pathUids: new Set() }
}

/** 清空是 CLEAR_VIEW 的语义：数据全丢，焦点也丢。 */
export function clearGraph(state) {
  if (state.nodes.size === 0 && state.edges.size === 0 && state.gaps.size === 0) {
    if (!state.focusUid && !state.selectedUid && !state.truncated && state.pathUids.size === 0) {
      return state
    }
  }
  return createGraphState()
}

/** SHOW_PATH 的路径集合；传空数组/Set 就是清掉高亮。 */
export function setPath(state, uids) {
  const next = new Set(
    [...(uids || [])].map((uid) => resolveGraphUid(uid)).filter((uid) => state.nodes.has(uid))
  )
  if (next.size === state.pathUids.size && [...next].every((u) => state.pathUids.has(u))) {
    return state
  }
  return { ...state, pathUids: next }
}

export function setFocus(state, uid) {
  const focusUid = uid ? resolveGraphUid(uid) : null
  if (state.focusUid === focusUid) return state
  return { ...state, focusUid }
}

export function setSelected(state, uid) {
  const selectedUid = uid ? resolveGraphUid(uid) : null
  if (state.selectedUid === selectedUid) return state
  return { ...state, selectedUid }
}

/**
 * 确保节点存在（FOCUS_NODE / citation 点击时用）。
 * 已存在就只合并元数据，不动坐标。
 */
export function ensureNode(state, uid, meta = {}) {
  const target = resolveGraphUid(uid)
  if (!target) return state
  const old = state.nodes.get(target)
  if (old) {
    const next = normalizeNode({ ...old, ...meta, uid: target })
    if (!next) return state
    const merged = { ...old, ...next }
    // 没有实际变化就不换 state，避免无意义重渲染
    const same = Object.keys(merged).every((k) => merged[k] === old[k])
    if (same) return state
    const nodes = new Map(state.nodes)
    nodes.set(target, merged)
    return { ...state, nodes }
  }
  const nodes = new Map(state.nodes)
  nodes.set(target, { ...stubNode(target), ...meta, uid: target })
  return { ...state, nodes }
}

/** positions: { [uid]: {x, y} } 或 Map<uid,{x,y}>；只更新已存在的节点。 */
export function setNodePositions(state, positions) {
  const entries = positions instanceof Map ? positions.entries() : Object.entries(positions || {})
  let nodes = null
  for (const [rawUid, pos] of entries) {
    const uid = resolveGraphUid(rawUid)
    const old = state.nodes.get(uid)
    if (!old || !pos) continue
    if (old.x === pos.x && old.y === pos.y) continue
    if (!nodes) nodes = new Map(state.nodes)
    nodes.set(uid, { ...old, x: pos.x, y: pos.y })
  }
  return nodes ? { ...state, nodes } : state
}

/** 给 viewport 上报用：焦点排在最前，其余按插入顺序。 */
export function graphSnapshot(state) {
  const uids = [...state.nodes.keys()]
  const focusUid = state.focusUid && state.nodes.has(state.focusUid) ? state.focusUid : null
  const visibleNodes = focusUid ? [focusUid, ...uids.filter((u) => u !== focusUid)] : uids
  return {
    visibleNodes,
    visibleRelations: [...state.edges.values()].map(({ from, to, rel }) => ({
      from,
      to,
      rel
    })),
    focusedNode: focusUid ? { type: 'CLASS', uid: focusUid } : null,
    truncated: state.truncated
  }
}

/** localStorage 持久化用：Map 不能直接 JSON.stringify。 */
export function serializeGraph(state) {
  return {
    nodes: [...state.nodes.values()],
    edges: [...state.edges.values()],
    gaps: [...state.gaps.values()],
    focusUid: state.focusUid,
    selectedUid: state.selectedUid,
    truncated: state.truncated
  }
}

/** 与 serializeGraph 对称。坏数据按空图处理，不抛异常。 */
export function deserializeGraph(raw) {
  if (!raw || typeof raw !== 'object') return createGraphState()
  let state = applyPatch(createGraphState(), {
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    truncated: Boolean(raw.truncated)
  })
  if (raw.focusUid && state.nodes.has(raw.focusUid)) state = setFocus(state, raw.focusUid)
  if (raw.selectedUid && state.nodes.has(raw.selectedUid)) {
    state = setSelected(state, raw.selectedUid)
  }
  return state
}
