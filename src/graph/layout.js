/**
 * 图布局 —— 确定性算法，不用力导向。
 *
 * 为什么必须确定：
 *  - patch 是增量的，每次重算坐标会让用户刚看清的图跳走；
 *  - 刷新后要能恢复同一张图；
 *  - 力导向还会引入随机抖动，演示时不可复现。
 *
 * 三种布局对应三种真实输入：
 *  - depth：call-chain，节点自带 depth；
 *  - radial：class-relations，一个中心 + 一圈邻居；
 *  - incremental：其他 patch，新节点围着锚点找空位。
 *
 * 所有函数只返回 `{ uid: {x, y} }`，不直接改 store。
 */

export const NODE_W = 188
export const NODE_H = 72
export const PAD = 80
export const COL_GAP = 260
export const ROW_GAP = 92
export const RING_R = 300

const hasPos = (n) => Number.isFinite(n?.x) && Number.isFinite(n?.y)
const labelOf = (n) => n?.name || n?.uid || ''

function sortByLabel(nodes) {
  return [...nodes].sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
}

/**
 * 节点占用的矩形范围。minX/maxX 已含 PAD，用于 SVG viewBox 与适配视图。
 */
export function boundsOf(nodes) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const n of nodes) {
    if (!hasPos(n)) continue
    left = Math.min(left, n.x - NODE_W / 2)
    top = Math.min(top, n.y - NODE_H / 2)
    right = Math.max(right, n.x + NODE_W / 2)
    bottom = Math.max(bottom, n.y + NODE_H / 2)
  }

  if (left === Infinity) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 }
  }

  const minX = left - PAD
  const minY = top - PAD
  const maxX = right + PAD
  const maxY = bottom + PAD
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * 调用链布局：按 depth 分列。没有 depth 的节点（通常是链的起点）按 0 处理。
 */
export function layoutDepth(state, uids) {
  const selected = uids ? new Set(uids) : null
  const nodes = [...state.nodes.values()].filter((n) => !selected || selected.has(n.uid))
  if (nodes.length === 0) return {}

  const depthOf = (n) => (Number.isFinite(n.depth) ? n.depth : 0)
  const depths = [...new Set(nodes.map(depthOf))].sort((a, b) => a - b)
  const columnOf = new Map(depths.map((d, i) => [d, i]))

  const groups = new Map()
  for (const n of nodes) {
    const d = depthOf(n)
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(n)
  }
  const maxRows = Math.max(...[...groups.values()].map((g) => g.length))

  const positions = {}
  for (const [depth, group] of groups) {
    const sorted = sortByLabel(group)
    const offset = (maxRows - sorted.length) / 2
    sorted.forEach((n, i) => {
      positions[n.uid] = {
        x: PAD + NODE_W / 2 + columnOf.get(depth) * COL_GAP,
        y: PAD + NODE_H / 2 + (offset + i) * ROW_GAP
      }
    })
  }
  return positions
}

/**
 * 星形布局：中心在中间，上游排左半圆、下游排右半圆。
 *
 * 方向来自边本身，不靠关系类型的名字猜 —— 和 Python graph.py 的
 * `_from_class_relations` 用同一套约定。
 */
export function layoutRadial(state, centerUid, uids) {
  const center = state.nodes.get(centerUid)
  if (!center) return {}

  const candidates = (uids ? [...uids] : [...state.nodes.keys()]).filter(
    (uid) => uid !== centerUid && state.nodes.has(uid)
  )
  const upstream = []
  const downstream = []
  const other = []

  for (const uid of candidates) {
    const isUp = [...state.edges.values()].some((e) => e.to === centerUid && e.from === uid)
    const isDown = [...state.edges.values()].some((e) => e.from === centerUid && e.to === uid)
    if (isUp) upstream.push(uid)
    else if (isDown) downstream.push(uid)
    else other.push(uid)
  }

  const centerPos = hasPos(center)
    ? { x: center.x, y: center.y }
    : { x: PAD + NODE_W / 2 + RING_R, y: PAD + NODE_H / 2 + RING_R }

  const positions = { [centerUid]: centerPos }

  const placeArc = (list, startDeg, endDeg) => {
    if (list.length === 0) return
    const sorted = [...list].sort((a, b) =>
      labelOf(state.nodes.get(a)).localeCompare(labelOf(state.nodes.get(b)))
    )
    const span = ((endDeg - startDeg) * Math.PI) / 180
    // 弧长至少容纳每个节点；节点多时自动把半径撑开。
    const radius = Math.max(RING_R, (list.length * (NODE_H + 20)) / Math.max(0.7, Math.abs(span)))
    sorted.forEach((uid, i) => {
      const deg =
        sorted.length === 1 ? (startDeg + endDeg) / 2 : startDeg + (endDeg - startDeg) * ((i + 0.5) / sorted.length)
      const angle = (deg * Math.PI) / 180
      positions[uid] = {
        x: centerPos.x + radius * Math.cos(angle),
        y: centerPos.y + radius * Math.sin(angle)
      }
    })
  }

  // 屏幕坐标：0° = 右，90° = 下，180° = 左，270° = 上。
  placeArc(upstream, 115, 245)
  placeArc(downstream, -65, 65)
  placeArc(other, 70, 110)
  return positions
}

function overlaps(a, b) {
  return Math.abs(a.x - b.x) < NODE_W + 40 && Math.abs(a.y - b.y) < NODE_H + 36
}

/**
 * 增量放置：只给没有坐标的新节点找位置，已有节点一律不动。
 *
 * 以锚点为中心按固定角度顺序试位；角度顺序固定，结果就可复现。
 */
export function placeIncremental(state, uids, anchorUid) {
  const placed = new Map()
  for (const n of state.nodes.values()) {
    if (hasPos(n)) placed.set(n.uid, { x: n.x, y: n.y })
  }

  const anchorNode = anchorUid ? state.nodes.get(anchorUid) : null
  const anchor = hasPos(anchorNode)
    ? { x: anchorNode.x, y: anchorNode.y }
    : { x: PAD + NODE_W / 2 + RING_R, y: PAD + NODE_H / 2 + RING_R }

  const targets = [...(uids || [])]
    .filter((uid) => state.nodes.has(uid) && !placed.has(uid))
    .sort((a, b) =>
      labelOf(state.nodes.get(a)).localeCompare(labelOf(state.nodes.get(b)))
    )

  const angles = []
  for (let i = 0; i < 12; i++) angles.push(-90 + i * 30)
  const radii = [240, 340, 460]

  const positions = {}
  for (const uid of targets) {
    let found = null
    for (const radius of radii) {
      for (const deg of angles) {
        const a = (deg * Math.PI) / 180
        const p = { x: anchor.x + radius * Math.cos(a), y: anchor.y + radius * Math.sin(a) }
        if ([...placed.values()].every((q) => !overlaps(p, q))) {
          found = p
          break
        }
      }
      if (found) break
    }
    if (!found) {
      // 极端情况：按黄金角向外扩，保证一定收敛且确定。
      const count = Object.keys(positions).length
      const a = (count * 137.5 * Math.PI) / 180
      const radius = 520 + count * 60
      found = { x: anchor.x + radius * Math.cos(a), y: anchor.y + radius * Math.sin(a) }
    }
    positions[uid] = found
    placed.set(uid, found)
  }
  return positions
}

/**
 * 把坐标整体平移成正数区域。
 *
 * 布局算法以锚点/中心为原点，容易算出负坐标。节点 div 能画负坐标，
 * 但 SVG viewBox 和“适配视图”会变复杂；统一平移到 PAD 之后只需要一套坐标。
 * 一旦平移，返回的是**所有**已定位节点的新坐标，不只是新节点。
 */
export function shiftIntoBounds(state, positions = {}) {
  const all = new Map()
  for (const n of state.nodes.values()) {
    if (hasPos(n)) all.set(n.uid, { x: n.x, y: n.y })
  }
  for (const [uid, p] of Object.entries(positions || {})) {
    if (p) all.set(uid, { x: p.x, y: p.y })
  }
  if (all.size === 0) return positions || {}

  let minLeft = Infinity
  let minTop = Infinity
  for (const p of all.values()) {
    minLeft = Math.min(minLeft, p.x - NODE_W / 2)
    minTop = Math.min(minTop, p.y - NODE_H / 2)
  }
  const dx = minLeft < PAD ? PAD - minLeft : 0
  const dy = minTop < PAD ? PAD - minTop : 0
  if (dx === 0 && dy === 0) return positions || {}

  const shifted = {}
  for (const [uid, p] of all) {
    shifted[uid] = { x: p.x + dx, y: p.y + dy }
  }
  return shifted
}

/**
 * 整图重新布局：以焦点为根做 BFS 分层；没有焦点就按 uid 排序选第一个根。
 * 用于工具栏「重新布局」—— 只改坐标，不增删节点。
 */
export function layoutBfs(state, focusUid) {
  const nodeIds = [...state.nodes.keys()].sort()
  if (nodeIds.length === 0) return {}

  const adj = new Map(nodeIds.map((uid) => [uid, new Set()]))
  for (const e of state.edges.values()) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue
    adj.get(e.from).add(e.to)
    adj.get(e.to).add(e.from)
  }

  const seen = new Set()
  const components = []
  const rootOrder = focusUid && adj.has(focusUid) ? [focusUid, ...nodeIds] : nodeIds

  for (const root of rootOrder) {
    if (seen.has(root)) continue
    const queue = [root]
    seen.add(root)
    const comp = []
    while (queue.length) {
      const uid = queue.shift()
      comp.push(uid)
      for (const next of [...adj.get(uid)].sort()) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    components.push(comp)
  }

  const positions = {}
  let yOffset = PAD

  for (const comp of components) {
    const root = focusUid && comp.includes(focusUid) ? focusUid : [...comp].sort()[0]
    const depth = new Map([[root, 0]])
    const queue = [root]
    while (queue.length) {
      const uid = queue.shift()
      const d = depth.get(uid)
      for (const next of [...adj.get(uid)].sort()) {
        if (!depth.has(next)) {
          depth.set(next, d + 1)
          queue.push(next)
        }
      }
    }

    const groups = new Map()
    for (const uid of comp) {
      const d = depth.get(uid) ?? 0
      if (!groups.has(d)) groups.set(d, [])
      groups.get(d).push(uid)
    }
    const maxRows = Math.max(...[...groups.values()].map((g) => g.length))

    for (const [d, group] of groups) {
      const sorted = [...group].sort((a, b) =>
        labelOf(state.nodes.get(a)).localeCompare(labelOf(state.nodes.get(b)))
      )
      const offset = (maxRows - sorted.length) / 2
      sorted.forEach((uid, i) => {
        positions[uid] = {
          x: PAD + NODE_W / 2 + d * COL_GAP,
          y: yOffset + NODE_H / 2 + (offset + i) * ROW_GAP
        }
      })
    }
    yOffset += maxRows * ROW_GAP + 160
  }

  return positions
}
