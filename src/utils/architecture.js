// 系统架构分层的纯函数：补齐六层、分组预览、跨层边排序。
// 组件只负责渲染，这些逻辑独立可测。

export const LAYER_ORDER = ['entry', 'business', 'domain-model', 'infrastructure', 'external', 'other']

export const LAYER_LABELS = {
  entry: '用户入口层',
  business: '业务层',
  'domain-model': '领域模块层',
  infrastructure: '基础设施',
  external: '外部依赖',
  other: '未归类'
}

/** 后端只返回有内容的层时，补齐六层并按固定顺序排列。 */
export function normalizeLayers(data) {
  const byKey = new Map((data?.layers || []).map((l) => [l.key, l]))
  return {
    layers: LAYER_ORDER.map((key) => byKey.get(key) || {
      key, name: LAYER_LABELS[key], classCount: 0, groups: []
    }),
    edges: data?.edges || [],
    classCount: data?.classCount || 0
  }
}

/** 边按调用次数降序，其次按 from>to 字典序；不修改入参。 */
export function sortedEdges(edges = []) {
  return [...edges].sort((a, b) => {
    const ka = `${a.fromLayer}>${a.toLayer}`
    const kb = `${b.fromLayer}>${b.toLayer}`
    return b.count - a.count || (ka < kb ? -1 : ka > kb ? 1 : 0)
  })
}

/** 矩阵表头用的短标签：六列塞得进一屏。 */
export const LAYER_SHORT = {
  entry: '入口',
  business: '业务',
  'domain-model': '领域',
  infrastructure: '基础',
  external: '外部',
  other: '未归类'
}

export const cellKey = (edge) => `${edge.fromLayer}>${edge.toLayer}`

/** 六层 × 六层的跨层调用矩阵；同层与未知层的边不进矩阵。 */
export function buildMatrix(edges = []) {
  const cells = new Map()
  for (const edge of edges) {
    if (!LAYER_ORDER.includes(edge.fromLayer) || !LAYER_ORDER.includes(edge.toLayer)) continue
    if (edge.fromLayer === edge.toLayer) continue
    cells.set(cellKey(edge), edge)
  }
  const max = cells.size === 0 ? 0 : Math.max(...[...cells.values()].map((e) => e.count || 0))
  return { keys: LAYER_ORDER, cells, max }
}

/** 每一层的进出：层名点开后先看总量，再顺藤摸到具体边。 */
export function layerTraffic(model) {
  const byKey = new Map(LAYER_ORDER.map((key) => [key, { in: 0, out: 0, inEdges: [], outEdges: [] }]))
  for (const edge of sortedEdges(model.edges)) {
    const count = edge.count || 0
    const from = byKey.get(edge.fromLayer)
    if (from) {
      from.out += count
      from.outEdges.push(edge)
    }
    const to = byKey.get(edge.toLayer)
    if (to) {
      to.in += count
      to.inEdges.push(edge)
    }
  }
  return byKey
}

/** 一句话结论：类数、有内容的层、最重的一层、最密集的跨层调用。 */
export function summarize(model) {
  const layers = model.layers || []
  const total = model.classCount || layers.reduce((sum, layer) => sum + (layer.classCount || 0), 0)
  const active = layers.filter((layer) => (layer.classCount || 0) > 0)
  const edges = sortedEdges(model.edges)
  const calls = edges.reduce((sum, edge) => sum + (edge.count || 0), 0)
  const topLayer = active.length
    ? [...active].sort((a, b) => (b.classCount || 0) - (a.classCount || 0))[0]
    : null
  return {
    total,
    activeLayers: active.length,
    calls,
    topLayer,
    topEdge: edges[0] || null
  }
}

/** 类占这一层之外的全部类的比例，用于行内百分比。 */
export function layerShare(count = 0, total = 0) {
  if (!total) return 0
  return Math.round((count / total) * 100)
}

/** 跨层调用里最频繁的具体类对，用于默认状态的内容列表。 */
export function topPairs(model, limit = 5) {
  const pairs = []
  for (const edge of model.edges || []) {
    for (const sample of edge.samples || []) {
      pairs.push({
        ...sample,
        count: sample.count || 0,
        fromLayer: edge.fromLayer,
        toLayer: edge.toLayer
      })
    }
  }
  return pairs.sort((a, b) => b.count - a.count).slice(0, limit)
}
