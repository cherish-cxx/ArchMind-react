import { NODE_H, NODE_W, PAD } from './layout.js'
import { packageNameOf, simpleName } from './model.js'

/**
 * 视图层纯函数：输入图状态与页面状态，输出「这一页画什么」。
 *
 * 这里不写 store、不碰 React、不发请求。装箱与焦点页的坐标都是渲染期投影，
 * 节点自己的 x/y 永远不动 —— 这是「增量不跳」和「焦点页不串坐标」的前提。
 */

export const GROUP_THRESHOLD = 5
export const MIN_HIDDEN = 2
export const BOX_W = 200
export const BOX_H = 64
export const BOX_MARGIN = 24
export const PILL_W = 168
export const PILL_H = 52
const PORT_STEP = 7

const hasPos = (n) => Number.isFinite(n?.x) && Number.isFinite(n?.y)
const labelOf = (n) => n?.name || n?.uid || ''
const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const nodeRect = (n) => ({ x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, w: NODE_W, h: NODE_H })

export function rectsOverlap(a, b, margin = 0) {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  )
}

/** 从矩形中心沿 toward 方向走到边界，线不压在卡片里。 */
export function boundaryOf(rect, toward) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const tx = dx === 0 ? Infinity : (rect.w / 2 + 2) / Math.abs(dx)
  const ty = dy === 0 ? Infinity : (rect.h / 2 + 2) / Math.abs(dy)
  const t = Math.min(tx, ty)
  return { x: cx + dx * t, y: cy + dy * t }
}

/** Liang–Barsky：线段是否与矩形（可加 pad）相交。 */
export function segmentIntersectsRect(p, q, rect, pad = 0) {
  const xmin = rect.x - pad
  const ymin = rect.y - pad
  const xmax = rect.x + rect.w + pad
  const ymax = rect.y + rect.h + pad
  const dx = q.x - p.x
  const dy = q.y - p.y
  let t0 = 0
  let t1 = 1
  const test = (pv, qv) => {
    if (pv === 0) return qv >= 0
    const r = qv / pv
    if (pv < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  return (
    test(-dx, p.x - xmin) &&
    test(dx, xmax - p.x) &&
    test(-dy, p.y - ymin) &&
    test(dy, ymax - p.y)
  )
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function quadPoint(p0, control, p1, t) {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y
  }
}

function pathHits(p0, p1, control, obstacles) {
  const points = []
  if (!control) {
    points.push(p0, p1)
  } else {
    for (let i = 0; i <= 4; i++) points.push(quadPoint(p0, control, p1, i / 4))
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (const rect of obstacles) {
      if (segmentIntersectsRect(points[i], points[i + 1], rect, 8)) return true
    }
  }
  return false
}

/** 同一侧端口按边 key 做固定偏移，避免所有线挤在一个点。 */
function portPoint(rect, toward, seed) {
  const c = centerOf(rect)
  const p = boundaryOf(rect, toward)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  const tx = dx === 0 ? Infinity : (rect.w / 2 + 2) / Math.abs(dx)
  const ty = dy === 0 ? Infinity : (rect.h / 2 + 2) / Math.abs(dy)
  const off = ((hashStr(seed) % 5) - 2) * PORT_STEP
  if (tx < ty) {
    const lim = rect.h / 2 - 12
    return { x: p.x, y: p.y + Math.max(-lim, Math.min(lim, off)) }
  }
  const lim = rect.w / 2 - 14
  return { x: p.x + Math.max(-lim, Math.min(lim, off)), y: p.y }
}

/**
 * 关系装箱。
 *
 * 分组键是（源节点 × 关系 × 方向），成员集合完全相同的组共用一个框。
 * 隐藏规则：只属于一个框、且不在保护集合里。保护集合 = 焦点页中心 ∪ 选中 ∪ 框源节点。
 * 以焦点页中心为源的分组直接不装箱（exemptSourceUids）。
 */
export function computeRelationBoxes(state, options = {}) {
  const threshold = options.threshold ?? GROUP_THRESHOLD
  const minHidden = options.minHidden ?? MIN_HIDDEN
  const protectedUids = options.protectedUids || new Set()
  const exemptSourceUids = options.exemptSourceUids || new Set()

  const groups = new Map()
  const push = (rel, dir, source, member) => {
    const key = `${rel}|${dir}|${source}`
    let set = groups.get(key)
    if (!set) {
      set = new Set()
      groups.set(key, set)
    }
    set.add(member)
  }

  for (const e of state.edges.values()) {
    if (e.from === e.to) continue
    const a = state.nodes.get(e.from)
    const b = state.nodes.get(e.to)
    if (!a || !b || !hasPos(a) || !hasPos(b)) continue
    push(e.rel, 'out', e.from, e.to)
    push(e.rel, 'in', e.to, e.from)
  }

  const bySet = new Map()
  for (const [gkey, members] of groups) {
    if (members.size <= threshold) continue
    const i = gkey.indexOf('|')
    const j = gkey.indexOf('|', i + 1)
    const rel = gkey.slice(0, i)
    const dir = gkey.slice(i + 1, j)
    const source = gkey.slice(j + 1)
    if (exemptSourceUids.has(source)) continue

    const list = [...members].sort()
    const key = `${rel}|${dir}|${list.join('\u0000')}`
    let box = bySet.get(key)
    if (!box) {
      box = { key, rel, direction: dir, members: list, sources: [] }
      bySet.set(key, box)
    }
    box.sources.push(source)
  }

  const counts = new Map()
  for (const box of bySet.values()) {
    for (const uid of box.members) counts.set(uid, (counts.get(uid) || 0) + 1)
  }

  const protectedSet = new Set(protectedUids)
  for (const box of bySet.values()) {
    for (const source of box.sources) protectedSet.add(source)
  }

  const boxes = []
  for (const box of bySet.values()) {
    const hidden = box.members.filter((uid) => counts.get(uid) === 1 && !protectedSet.has(uid))
    if (hidden.length < minHidden) continue
    const hiddenSet = new Set(hidden)
    boxes.push({
      ...box,
      sources: [...box.sources].sort(),
      hidden,
      shared: box.members.filter((uid) => !hiddenSet.has(uid))
    })
  }
  boxes.sort((a, b) => a.key.localeCompare(b.key))

  const hiddenUids = new Set()
  const boxByUid = new Map()
  for (const box of boxes) {
    for (const uid of box.hidden) {
      hiddenUids.add(uid)
      boxByUid.set(uid, box)
    }
  }
  return { boxes, hiddenUids, boxByUid }
}

function findFreeRect(cx, cy, occupied) {
  const angles = []
  for (let i = 0; i < 12; i++) angles.push(i * 30)
  let last = { x: cx - BOX_W / 2, y: cy - BOX_H / 2, w: BOX_W, h: BOX_H }
  for (let r = 0; r <= 2400; r += 80) {
    for (const deg of angles) {
      if (r === 0 && deg !== 0) continue
      const a = (deg * Math.PI) / 180
      const rect = {
        x: cx + r * Math.cos(a) - BOX_W / 2,
        y: cy + r * Math.sin(a) - BOX_H / 2,
        w: BOX_W,
        h: BOX_H
      }
      last = rect
      if (occupied.every((o) => !rectsOverlap(rect, o, BOX_MARGIN))) return rect
    }
  }
  return last
}

/**
 * 给框找位置：从隐藏成员的重心出发，按固定角度/半径向外搜，
 * 避开可见节点和其他框。找不到就继续外扩，绝不放弃装箱。
 */
export function placeBoxes(state, boxes, options = {}) {
  const hiddenUids = options.hiddenUids || new Set()
  const occupied = []
  for (const n of state.nodes.values()) {
    if (!hasPos(n) || hiddenUids.has(n.uid)) continue
    occupied.push(nodeRect(n))
  }

  const placed = []
  for (const box of [...boxes].sort((a, b) => a.key.localeCompare(b.key))) {
    let sx = 0
    let sy = 0
    let count = 0
    const anchors = box.hidden.length > 0 ? box.hidden : box.sources
    for (const uid of anchors) {
      const n = state.nodes.get(uid)
      if (!hasPos(n)) continue
      sx += n.x
      sy += n.y
      count++
    }
    const rect = findFreeRect(count ? sx / count : 0, count ? sy / count : 0, occupied)
    occupied.push(rect)
    placed.push({ ...box, rect })
  }
  return placed
}

/**
 * 边路由：隐藏成员先折算到框，再按（起点, 终点, 关系）聚合。
 * 直线会穿过其他卡片时，试固定偏移的二次贝塞尔。
 */
export function routeEdges({ nodes, boxes, edges, filters }) {
  const nodeByUid = new Map()
  for (const n of nodes) if (hasPos(n)) nodeByUid.set(n.uid, n)

  const boxByUid = new Map()
  for (const b of boxes) for (const uid of b.hidden) boxByUid.set(uid, b)

  const obstacles = []
  for (const n of nodes) {
    if (!hasPos(n)) continue
    obstacles.push({ ...nodeRect(n), key: `n:${n.uid}` })
  }
  for (const b of boxes) obstacles.push({ ...b.rect, key: `b:${b.key}` })

  const resolve = (uid) => {
    const box = boxByUid.get(uid)
    if (box) return { kind: 'box', key: `b:${box.key}`, id: box.key, rect: box.rect }
    const node = nodeByUid.get(uid)
    if (!node) return null
    return { kind: 'node', key: `n:${uid}`, id: uid, rect: nodeRect(node) }
  }

  const agg = new Map()
  const selfLoops = []
  for (const e of edges) {
    if (filters && filters[e.rel] === false) continue
    if (e.from === e.to) {
      const node = nodeByUid.get(e.from)
      if (node) selfLoops.push({ edge: e, node })
      continue
    }
    const a = resolve(e.from)
    const b = resolve(e.to)
    if (!a || !b) continue
    if (a.kind === 'box' && b.kind === 'box' && a.id === b.id) continue

    const key = `${a.key}|${b.key}|${e.rel}`
    const prev = agg.get(key)
    if (prev) {
      prev.count += e.callCount || 1
      prev.viaFanout = prev.viaFanout || Boolean(e.viaFanout)
    } else {
      agg.set(key, {
        key,
        a,
        b,
        rel: e.rel,
        from: e.from,
        to: e.to,
        count: e.callCount || 1,
        viaFanout: Boolean(e.viaFanout)
      })
    }
  }

  const directed = new Set([...agg.values()].map((x) => `${x.a.key}|${x.b.key}|${x.rel}`))
  const routes = []

  for (const item of [...agg.values()].sort((x, y) => x.key.localeCompare(y.key))) {
    const { a, b, rel } = item
    const twoWay = directed.has(`${b.key}|${a.key}|${rel}`)
    const ac = centerOf(a.rect)
    const bc = centerOf(b.rect)
    let start
    let end
    let control = null

    if (twoWay) {
      const mx = (ac.x + bc.x) / 2
      const my = (ac.y + bc.y) / 2
      const vx = bc.x - ac.x
      const vy = bc.y - ac.y
      const len = Math.hypot(vx, vy) || 1
      const bend = Math.min(72, 26 + len * 0.12)
      control = { x: mx - (vy / len) * bend, y: my + (vx / len) * bend }
      start = boundaryOf(a.rect, control)
      end = boundaryOf(b.rect, control)
    } else {
      start = a.kind === 'node' ? portPoint(a.rect, bc, `${item.key}|s`) : boundaryOf(a.rect, bc)
      end = b.kind === 'node' ? portPoint(b.rect, ac, `${item.key}|e`) : boundaryOf(b.rect, ac)
      const others = obstacles.filter((r) => r.key !== a.key && r.key !== b.key)
      if (pathHits(start, end, null, others)) {
        const dx = end.x - start.x
        const dy = end.y - start.y
        const len = Math.hypot(dx, dy) || 1
        const px = -dy / len
        const py = dx / len
        const sign = hashStr(item.key) % 2 === 0 ? 1 : -1
        for (const dist of [48, 96, 144, 192]) {
          for (const s of [sign, -sign]) {
            const c = {
              x: (start.x + end.x) / 2 + px * dist * s,
              y: (start.y + end.y) / 2 + py * dist * s
            }
            if (!pathHits(start, end, c, others)) {
              control = c
              break
            }
          }
          if (control) break
        }
      }
    }

    const d = control
      ? `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} L ${end.x} ${end.y}`
    const mid = control
      ? quadPoint(start, control, end, 0.5)
      : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

    routes.push({
      ...item,
      start,
      end,
      control,
      d,
      mid,
      viaBox: a.kind === 'box' || b.kind === 'box'
    })
  }

  for (const { edge, node } of selfLoops) {
    const rect = nodeRect(node)
    const x = rect.x + rect.w / 2
    const y = rect.y
    const d = `M ${x - 34} ${y + 14} C ${x - 70} ${y - 55}, ${x + 70} ${y - 55}, ${x + 34} ${y + 14}`
    routes.push({
      key: `self:${edge.from}|${edge.rel}`,
      from: edge.from,
      to: edge.to,
      rel: edge.rel,
      count: edge.callCount || 1,
      viaFanout: Boolean(edge.viaFanout),
      viaBox: false,
      start: { x, y },
      end: { x, y },
      control: null,
      d,
      mid: { x, y: y - 26 }
    })
  }

  return routes
}

export function boundsOfRects(rects) {
  if (!rects || rects.length === 0) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 }
  }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.w)
    bottom = Math.max(bottom, r.y + r.h)
  }
  const minX = left - PAD
  const minY = top - PAD
  const maxX = right + PAD
  const maxY = bottom + PAD
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function buildCumulativeModel(state, options = {}) {
  const all = computeRelationBoxes(state, options)
  const expanded = options.expandedBoxes instanceof Map ? options.expandedBoxes : new Map()

  const collapsed = []
  const expandedMarkers = []
  const hiddenUids = new Set()
  for (const box of all.boxes) {
    if (expanded.has(box.key)) {
      expandedMarkers.push({ ...box, rect: expanded.get(box.key) })
    } else {
      collapsed.push(box)
      for (const uid of box.hidden) hiddenUids.add(uid)
    }
  }

  const placed = placeBoxes(state, collapsed, { hiddenUids })
  const nodes = [...state.nodes.values()].filter((n) => hasPos(n) && !hiddenUids.has(n.uid))
  const edges = routeEdges({
    nodes,
    boxes: placed,
    edges: [...state.edges.values()],
    filters: options.filters
  })

  const degree = new Map()
  for (const e of state.edges.values()) {
    const from = degree.get(e.from) || { in: 0, out: 0 }
    from.out += 1
    degree.set(e.from, from)
    const to = degree.get(e.to) || { in: 0, out: 0 }
    to.in += 1
    degree.set(e.to, to)
  }

  const rects = nodes.map(nodeRect).concat(placed.map((box) => box.rect))
  return {
    kind: 'cumulative',
    centerUid: null,
    nodes,
    boxes: placed,
    expandedMarkers,
    allBoxKeys: new Set(all.boxes.map((box) => box.key)),
    edges,
    gaps: [...state.gaps.values()],
    hiddenCount: hiddenUids.size,
    degree,
    selectedUid: state.selectedUid,
    focusUid: state.focusUid,
    pathUids: state.pathUids,
    pending: state.pendingDescriptions,
    bounds: boundsOfRects(rects),
    truncated: Boolean(state.truncated)
  }
}

/** 当前页面的屏幕快照：只报真正画出来的节点，以及两端都可见的边。 */
export function pageSnapshot(model) {
  const visible = new Set(model.nodes.map((n) => n.uid))
  const ordered = []
  const added = new Set()
  const push = (uid) => {
    if (!uid || !visible.has(uid) || added.has(uid)) return
    added.add(uid)
    ordered.push(uid)
  }

  if (model.kind === 'focus') {
    push(model.centerUid)
    push(model.selectedUid)
  } else {
    push(model.focusUid)
    push(model.selectedUid)
  }
  for (const n of model.nodes) push(n.uid)

  const relations = []
  const seen = new Set()
  for (const e of model.edges) {
    if (!visible.has(e.from) || !visible.has(e.to)) continue
    const key = `${e.from}|${e.to}|${e.rel}`
    if (seen.has(key)) continue
    seen.add(key)
    relations.push({ from: e.from, to: e.to, rel: e.rel })
  }

  const focusedUid =
    model.kind === 'focus'
      ? model.selectedUid || model.centerUid
      : model.focusUid || model.selectedUid

  return {
    mode: model.kind === 'focus' ? 'focus' : 'cumulative',
    centerUid: model.centerUid || null,
    hops: model.kind === 'focus' ? 1 : 0,
    foldedCount: model.hiddenCount || 0,
    visibleNodes: ordered,
    visibleRelations: relations,
    focusedNode: focusedUid ? { type: 'CLASS', uid: focusedUid } : null,
    truncated: Boolean(model.truncated)
  }
}

function groupByPackage(uids, metaOf) {
  const map = new Map()
  for (const uid of uids) {
    const pkg = metaOf(uid).packageName || '(默认包)'
    if (!map.has(pkg)) map.set(pkg, [])
    map.get(pkg).push(uid)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({
      name,
      uids: list.sort((x, y) => labelOf(metaOf(x)).localeCompare(labelOf(metaOf(y))))
    }))
}

function arcBandPath(cx, cy, r, startDeg, endDeg) {
  const span = Math.min(359, Math.max(0.01, endDeg - startDeg))
  const s = (startDeg * Math.PI) / 180
  const e = ((startDeg + span) * Math.PI) / 180
  const ri = Math.max(60, r - NODE_H / 2 - 16)
  const ro = r + NODE_H / 2 + 16
  const large = span > 180 ? 1 : 0
  const pt = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`
  return `M ${pt(ri, s)} L ${pt(ro, s)} A ${ro} ${ro} 0 ${large} 1 ${pt(ro, e)} L ${pt(ri, e)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, s)} Z`
}

function focusRoute(key, fromRect, toRect, edge, twoWay) {
  const ac = centerOf(fromRect)
  const bc = centerOf(toRect)
  let start
  let end
  let control = null

  if (twoWay) {
    const mx = (ac.x + bc.x) / 2
    const my = (ac.y + bc.y) / 2
    const vx = bc.x - ac.x
    const vy = bc.y - ac.y
    const len = Math.hypot(vx, vy) || 1
    const bend = Math.min(72, 26 + len * 0.12)
    control = { x: mx - (vy / len) * bend, y: my + (vx / len) * bend }
    start = boundaryOf(fromRect, control)
    end = boundaryOf(toRect, control)
  } else {
    start = boundaryOf(fromRect, bc)
    end = boundaryOf(toRect, ac)
  }

  const d = control
    ? `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`

  return {
    key,
    from: edge.from,
    to: edge.to,
    rel: edge.rel,
    count: edge.count || edge.callCount || 1,
    viaFanout: Boolean(edge.viaFanout),
    viaBox: false,
    start,
    end,
    control,
    d,
    mid: control
      ? quadPoint(start, control, end, 0.5)
      : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  }
}

function addNeighborEdges(routes, uid, centerRect, rect, down, up) {
  const downList = down.get(uid) || []
  const upList = up.get(uid) || []
  for (const e of downList) {
    const twoWay = upList.some((x) => x.rel === e.rel)
    routes.push(focusRoute(`f:${uid}:${e.rel}:out`, centerRect, rect, e, twoWay))
  }
  for (const e of upList) {
    const twoWay = downList.some((x) => x.rel === e.rel)
    routes.push(focusRoute(`f:${uid}:${e.rel}:in`, rect, centerRect, e, twoWay))
  }
}

function addCollapsedEdges(routes, sideKey, pkg, centerRect, pillRect, down, up) {
  const out = new Map()
  const incoming = new Map()
  const add = (map, e) => {
    const prev = map.get(e.rel)
    if (prev) {
      prev.count += e.callCount || 1
      prev.viaFanout = prev.viaFanout || Boolean(e.viaFanout)
    } else {
      map.set(e.rel, { ...e, count: e.callCount || 1 })
    }
  }
  for (const uid of pkg.uids) {
    for (const e of down.get(uid) || []) add(out, e)
    for (const e of up.get(uid) || []) add(incoming, e)
  }

  const outRels = new Set(out.keys())
  const inRels = new Set(incoming.keys())
  for (const [rel, e] of [...out.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    routes.push(focusRoute(`f:${sideKey}:${pkg.name}:out:${rel}`, centerRect, pillRect, e, inRels.has(rel)))
  }
  for (const [rel, e] of [...incoming.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    routes.push(focusRoute(`f:${sideKey}:${pkg.name}:in:${rel}`, pillRect, centerRect, e, outRels.has(rel)))
  }
}

/**
 * 焦点页模型：中心 + 1 跳，按包分扇区。坐标只属于返回值，不写回节点。
 * 下游在右半环、上游在左半环；一侧为空时另一侧占满整环。
 */
export function buildFocusModel(state, page, options = {}) {
  const filters = options.filters
  const centerUid = page?.centerUid
  const centerNode = centerUid ? state.nodes.get(centerUid) : null
  const empty = {
    kind: 'focus',
    centerUid,
    hops: 1,
    center: null,
    nodes: [],
    pills: [],
    packages: [],
    edges: [],
    gaps: [],
    hiddenCount: 0,
    truncated: false
  }
  if (!centerNode) return empty

  const down = new Map()
  const up = new Map()
  const add = (map, uid, e) => {
    if (!map.has(uid)) map.set(uid, [])
    map.get(uid).push(e)
  }
  for (const e of state.edges.values()) {
    if (filters && filters[e.rel] === false) continue
    if (e.from === centerUid && e.to !== centerUid) add(down, e.to, e)
    else if (e.to === centerUid && e.from !== centerUid) add(up, e.from, e)
  }

  const all = new Set([...down.keys(), ...up.keys()])
  if (all.size === 0) {
    const r = 320
    const cx = r + PAD + NODE_W / 2
    const cy = r + PAD + NODE_H / 2
    const center = { ...centerNode, x: cx, y: cy }
    return {
      ...empty,
      center,
      nodes: [center],
      degree: new Map(),
      selectedUid: page.selectedUid || null,
      focusUid: centerUid,
      pathUids: new Set(),
      pending: state.pendingDescriptions,
      bounds: boundsOfRects([nodeRect(center)])
    }
  }

  const metaOf = (uid) => state.nodes.get(uid) || {
    uid,
    name: simpleName(uid),
    packageName: packageNameOf(uid)
  }
  const collapsed = page.collapsedPackages || new Set()

  const downOnly = [...down.keys()].filter((u) => !up.has(u))
  const upOnly = [...up.keys()].filter((u) => !down.has(u))
  const both = [...down.keys()].filter((u) => up.has(u))

  const sides = []
  if (down.size > 0 && up.size > 0) {
    sides.push({ key: 'down', start: -72, end: 72, uids: [...downOnly, ...both] })
    sides.push({ key: 'up', start: 108, end: 252, uids: upOnly })
  } else {
    const list = down.size > 0 ? [...downOnly, ...both] : [...upOnly, ...both]
    sides.push({ key: 'full', start: -90, end: 270, uids: list })
  }

  for (const side of sides) {
    side.packages = groupByPackage(side.uids, metaOf)
    side.slots = side.packages.reduce(
      (n, p) => n + (collapsed.has(p.name) ? 1 : p.uids.length),
      0
    )
  }
  const totalSlots = sides.reduce((n, s) => n + s.slots, 0) || 1
  const r = Math.max(320, (totalSlots * (NODE_W + 30)) / (2 * Math.PI))
  const cx = r + PAD + NODE_W / 2
  const cy = r + PAD + NODE_H / 2

  const center = { ...centerNode, x: cx, y: cy }
  const centerRect = { x: cx - NODE_W / 2, y: cy - NODE_H / 2, w: NODE_W, h: NODE_H }
  const nodes = [center]
  const pills = []
  const packages = []
  const routes = []
  let folded = 0

  for (const side of sides) {
    const span = side.end - side.start
    const slots = side.slots || 1
    let slot = 0
    for (const pkg of side.packages) {
      const isCollapsed = collapsed.has(pkg.name)
      const count = isCollapsed ? 1 : pkg.uids.length
      const startAngle = side.start + (slot / slots) * span
      const endAngle = side.start + ((slot + count) / slots) * span

      const midAngle = (startAngle + endAngle) / 2
      const labelAngle = (midAngle * Math.PI) / 180
      packages.push({
        name: pkg.name,
        side: side.key,
        collapsed: isCollapsed,
        startAngle,
        endAngle,
        band: arcBandPath(cx, cy, r, startAngle, endAngle),
        memberCount: pkg.uids.length,
        labelAt: {
          x: cx + (r + NODE_H / 2 + 34) * Math.cos(labelAngle),
          y: cy + (r + NODE_H / 2 + 34) * Math.sin(labelAngle)
        }
      })

      if (isCollapsed) {
        folded += pkg.uids.length
        const mid = (startAngle + endAngle) / 2
        const a = (mid * Math.PI) / 180
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        const rect = { x: x - PILL_W / 2, y: y - PILL_H / 2, w: PILL_W, h: PILL_H }
        pills.push({
          id: `pkg:${side.key}:${pkg.name}`,
          name: pkg.name,
          count: pkg.uids.length,
          side: side.key,
          x,
          y,
          rect
        })
        addCollapsedEdges(routes, side.key, pkg, centerRect, rect, down, up)
      } else {
        pkg.uids.forEach((uid, i) => {
          const angle = side.start + ((slot + i + 0.5) / slots) * span
          const a = (angle * Math.PI) / 180
          const x = cx + r * Math.cos(a)
          const y = cy + r * Math.sin(a)
          nodes.push({ ...metaOf(uid), x, y })
          const rect = { x: x - NODE_W / 2, y: y - NODE_H / 2, w: NODE_W, h: NODE_H }
          addNeighborEdges(routes, uid, centerRect, rect, down, up)
        })
      }
      slot += count
    }
  }

  const degree = new Map()
  for (const e of state.edges.values()) {
    const hasFrom = all.has(e.from) || e.from === centerUid
    const hasTo = all.has(e.to) || e.to === centerUid
    if (!hasFrom || !hasTo) continue
    const from = degree.get(e.from) || { in: 0, out: 0 }
    from.out += 1
    degree.set(e.from, from)
    const to = degree.get(e.to) || { in: 0, out: 0 }
    to.in += 1
    degree.set(e.to, to)
  }

  const rects = nodes.map(nodeRect).concat(pills.map((pill) => pill.rect))
  return {
    ...empty,
    center,
    nodes,
    pills,
    packages,
    edges: routes,
    degree,
    hiddenCount: folded,
    selectedUid: page.selectedUid || null,
    focusUid: centerUid,
    pathUids: new Set(),
    pending: state.pendingDescriptions,
    bounds: boundsOfRects(rects)
  }
}
