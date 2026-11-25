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

/** 组盒只展示前几个类名；more 按真实类数算，不用已截断的列表长度。 */
export function groupPreview(group, max = 3) {
  const all = (group?.classes || []).map((c) => c.name)
  const total = group?.classCount ?? all.length
  const shown = Math.min(all.length, max)
  return { names: all.slice(0, max), more: Math.max(0, total - shown) }
}

/** 边按调用次数降序，其次按 from>to 字典序；不修改入参。 */
export function sortedEdges(edges = []) {
  return [...edges].sort((a, b) => b.count - a.count
    || `${a.fromLayer}>${a.toLayer}`.localeCompare(`${b.fromLayer}>${b.toLayer}`))
}
