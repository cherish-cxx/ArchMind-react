/**
 * 把「类清单 / 类关系」的 REST 形状转成 GraphPatch。
 *
 * 为什么需要适配器：`/class/relations` 是 P1 的展示接口，形状是
 * `center + upstream{callers,...} + downstream{...}`；Agent 的 graph 是
 * `nodes + edges + gaps`。前端只让画布认后者，所以点类后的即时预览
 * 在**进入画布之前**先转一次。
 *
 * 这段逻辑和 Python `app/core/graph.py::_from_class_relations` 同构；
 * 两者都只是把「图里实际有什么」如实搬过来，不做取舍。
 */

import { simpleName } from './model.js'

function toNode(clazz) {
  if (!clazz?.qualifiedName) return null
  return {
    uid: clazz.qualifiedName,
    name: clazz.simpleName || simpleName(clazz.qualifiedName),
    kind: clazz.kind,
    packageName: clazz.packageName,
    description: clazz.description || undefined,
    isAbstract: clazz.isAbstract ?? undefined,
    core: clazz.core ?? undefined
  }
}

function edgeKey(e) {
  return `${e.from}|${e.to}|${e.rel}`
}

/**
 * @param {Object|null} relations `/api/project/{id}/class/relations` 的响应
 * @returns {{patch: import('../api/agentTypes.js').GraphPatch, centerUid: string, mode: 'radial'}|null}
 */
export function classRelationsToGraph(relations) {
  if (!relations || relations.error) return null
  const center = relations.center
  const centerNode = toNode(center)
  if (!centerNode) return null

  const nodes = new Map([[centerNode.uid, centerNode]])
  const edges = new Map()

  const addRelated = (item, upstream) => {
    const node = toNode(item?.clazz)
    if (!node) return
    nodes.set(node.uid, node)

    // 上游：相关类 → 中心；下游：中心 → 相关类。方向不能反，箭头靠它。
    const edge = upstream
      ? {
          from: node.uid,
          to: centerNode.uid,
          rel: item.relationType || 'CALLS',
          callCount: item.count ?? 1
        }
      : {
          from: centerNode.uid,
          to: node.uid,
          rel: item.relationType || 'CALLS',
          callCount: item.count ?? 1
        }
    edges.set(edgeKey(edge), edge)
  }

  const up = relations.upstream || {}
  const down = relations.downstream || {}
  for (const group of [up.callers, up.dependents, up.subclasses]) {
    for (const item of group || []) addRelated(item, true)
  }
  for (const group of [down.callees, down.dependencies, down.parents]) {
    for (const item of group || []) addRelated(item, false)
  }

  return {
    centerUid: centerNode.uid,
    mode: 'radial',
    patch: {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      gaps: [],
      truncated: false
    }
  }
}

/** 类清单的一行 → 图节点。ClassPicker 选中时用。 */
export function classToNode(clazz) {
  return toNode(clazz)
}
