import test from 'node:test'
import assert from 'node:assert/strict'
import { NODE_H, NODE_W } from './layout.js'
import {
  buildCumulativeModel,
  buildFocusModel,
  computeRelationBoxes,
  placeBoxes,
  rectsOverlap,
  routeEdges
} from './view.js'

function mkState(nodeUids, edgeList) {
  const nodes = new Map()
  nodeUids.forEach((uid, i) => {
    const dot = uid.lastIndexOf('.')
    nodes.set(uid, {
      uid,
      name: uid.slice(dot + 1),
      packageName: dot > 0 ? uid.slice(0, dot) : undefined,
      x: 220 + (i % 4) * 340,
      y: 180 + Math.floor(i / 4) * 150
    })
  })
  const edges = new Map()
  for (const [from, to, rel = 'CALLS'] of edgeList) {
    edges.set(`${from}|${to}|${rel}`, { from, to, rel })
  }
  return {
    nodes,
    edges,
    gaps: new Map(),
    focusUid: null,
    selectedUid: null,
    pathUids: new Set(),
    truncated: false
  }
}

function fanout(source, members, rel = 'CALLS') {
  return members.map((m) => [source, m, rel])
}

const SIX = ['p.N1', 'p.N2', 'p.N3', 'p.N4', 'p.N5', 'p.N6']

test('阈值：5 条不装箱，6 条装箱', () => {
  const five = mkState(['p.C', ...SIX.slice(0, 5)], fanout('p.C', SIX.slice(0, 5)))
  assert.equal(computeRelationBoxes(five).boxes.length, 0)

  const six = mkState(['p.C', ...SIX], fanout('p.C', SIX))
  const result = computeRelationBoxes(six)
  assert.equal(result.boxes.length, 1)
  assert.deepEqual(result.boxes[0].hidden, SIX)
  assert.equal(result.boxes[0].direction, 'out')
  assert.equal(result.hiddenUids.size, 6)
})

test('同集合合并：两个源指向同一批类只出一个框', () => {
  const state = mkState(
    ['p.A', 'p.B', ...SIX],
    [...fanout('p.A', SIX), ...fanout('p.B', SIX)]
  )
  const result = computeRelationBoxes(state)
  assert.equal(result.boxes.length, 1)
  assert.deepEqual(result.boxes[0].sources, ['p.A', 'p.B'])
  assert.deepEqual(result.boxes[0].hidden, SIX)
})

test('部分重叠：共享成员保持独立，只隐藏唯一归属的', () => {
  const a = ['p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H']
  const b = ['p.E', 'p.F', 'p.G', 'p.H', 'p.I', 'p.J']
  const state = mkState(
    ['p.A', 'p.B', ...new Set([...a, ...b])],
    [...fanout('p.A', a), ...fanout('p.B', b)]
  )
  const result = computeRelationBoxes(state)
  assert.equal(result.boxes.length, 2)

  const hidden = [...result.hiddenUids].sort()
  assert.deepEqual(hidden, ['p.C', 'p.D', 'p.I', 'p.J'])

  const shared = result.boxes.flatMap((box) => box.shared).sort()
  assert.deepEqual([...new Set(shared)], ['p.E', 'p.F', 'p.G', 'p.H'])
})

test('焦点页中心为源时整组不装箱', () => {
  const state = mkState(['p.C', ...SIX], fanout('p.C', SIX))
  const result = computeRelationBoxes(state, {
    exemptSourceUids: new Set(['p.C'])
  })
  assert.equal(result.boxes.length, 0)
})

test('保护对象：选中节点不会被折进框', () => {
  const state = mkState(['p.C', ...SIX], fanout('p.C', SIX))
  const result = computeRelationBoxes(state, {
    protectedUids: new Set(['p.N3'])
  })
  assert.equal(result.boxes.length, 1)
  assert.deepEqual(result.boxes[0].hidden, ['p.N1', 'p.N2', 'p.N4', 'p.N5', 'p.N6'])
  assert.deepEqual(result.boxes[0].shared, ['p.N3'])
  assert.equal(result.hiddenUids.has('p.N3'), false)
})

test('框的源节点即使只属于一个框也不隐藏', () => {
  const state = mkState(
    ['p.A', 'p.B', 'p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H', 'p.N1', 'p.N2', 'p.N3', 'p.N4', 'p.N5'],
    [
      ...fanout('p.A', ['p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H']),
      ...fanout('p.B', ['p.A', 'p.N1', 'p.N2', 'p.N3', 'p.N4', 'p.N5'])
    ]
  )
  const result = computeRelationBoxes(state)
  assert.equal(result.hiddenUids.has('p.A'), false)

  const boxB = result.boxes.find((box) => box.sources.includes('p.B'))
  assert.ok(boxB)
  assert.deepEqual(boxB.hidden, ['p.N1', 'p.N2', 'p.N3', 'p.N4', 'p.N5'])
  assert.deepEqual(boxB.shared, ['p.A'])
})

test('唯一可隐藏成员少于 2 个时不出框', () => {
  const state = mkState(
    ['p.A', 'p.B', 'p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H', 'p.I', 'p.J'],
    [
      ...fanout('p.A', ['p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H']),
      ...fanout('p.B', ['p.C', 'p.D', 'p.E', 'p.F', 'p.G', 'p.H', 'p.I', 'p.J'])
    ]
  )
  const result = computeRelationBoxes(state)
  assert.equal(result.boxes.length, 1)
  assert.deepEqual(result.hiddenUids.has('p.C'), false)
  assert.deepEqual([...result.hiddenUids].sort(), ['p.I', 'p.J'])
})

test('placeBoxes 避开可见节点，且两次调用结果一致', () => {
  const state = mkState(['p.C', ...SIX], fanout('p.C', SIX))
  const { boxes, hiddenUids } = computeRelationBoxes(state)
  const first = placeBoxes(state, boxes, { hiddenUids })
  const second = placeBoxes(state, boxes, { hiddenUids })

  assert.deepEqual(first, second)
  assert.equal(first.length, 1)
  const rect = first[0].rect

  const visible = [...state.nodes.values()].filter((n) => !hiddenUids.has(n.uid))
  for (const n of visible) {
    const nodeRect = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, w: NODE_W, h: NODE_H }
    assert.equal(rectsOverlap(rect, nodeRect), false)
  }
})

test('routeEdges：成员边聚合到框，框内边丢弃', () => {
  const state = mkState(
    ['p.C', ...SIX],
    [...fanout('p.C', SIX), ['p.N1', 'p.N2', 'CALLS']]
  )
  const { boxes, hiddenUids } = computeRelationBoxes(state)
  const placed = placeBoxes(state, boxes, { hiddenUids })
  const nodes = [...state.nodes.values()].filter((n) => !hiddenUids.has(n.uid))
  const routes = routeEdges({
    nodes,
    boxes: placed,
    edges: [...state.edges.values()]
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].viaBox, true)
  assert.equal(routes[0].count, 6)
  assert.match(routes[0].d, /^M /)
  assert.ok(Number.isFinite(routes[0].mid.x))
})

test('buildCumulativeModel：展开的框不隐藏成员，并返回收起标记', () => {
  const state = mkState(['p.C', ...SIX], fanout('p.C', SIX))
  const { boxes } = computeRelationBoxes(state)
  const key = boxes[0].key
  const model = buildCumulativeModel(state, {
    expandedBoxes: new Map([[key, { x: 10, y: 10, w: 200, h: 64 }]])
  })

  assert.equal(model.boxes.length, 0)
  assert.equal(model.expandedMarkers.length, 1)
  assert.equal(model.hiddenCount, 0)
  assert.equal(model.nodes.length, 7)
  assert.equal(model.edges.length, 6)
  assert.equal(model.edges.every((e) => !e.viaBox), true)
})

test('buildFocusModel：中心 + 1 跳，按包分扇区', () => {
  const state = mkState(
    ['p.C', 'a.N1', 'a.N2', 'b.N3', 'c.U1', 'd.U2'],
    [
      ['p.C', 'a.N1'],
      ['p.C', 'a.N2'],
      ['p.C', 'b.N3'],
      ['c.U1', 'p.C'],
      ['d.U2', 'p.C']
    ]
  )
  const page = { centerUid: 'p.C', hops: 1, collapsedPackages: new Set() }
  const model = buildFocusModel(state, page)

  assert.equal(model.kind, 'focus')
  assert.equal(model.nodes.length, 6)
  assert.equal(model.packages.length, 4)
  assert.equal(model.pills.length, 0)
  assert.equal(model.edges.length, 5)
  assert.equal(model.center.uid, 'p.C')
  for (const node of model.nodes) {
    assert.ok(Number.isFinite(node.x))
    assert.ok(Number.isFinite(node.y))
  }
})

test('buildFocusModel：折叠包收成一个 pill，边聚合', () => {
  const state = mkState(
    ['p.C', 'a.N1', 'a.N2', 'b.N3', 'c.U1', 'd.U2'],
    [
      ['p.C', 'a.N1'],
      ['p.C', 'a.N2'],
      ['p.C', 'b.N3'],
      ['c.U1', 'p.C'],
      ['d.U2', 'p.C']
    ]
  )
  const page = {
    centerUid: 'p.C',
    hops: 1,
    collapsedPackages: new Set(['a'])
  }
  const model = buildFocusModel(state, page)

  assert.equal(model.pills.length, 1)
  assert.equal(model.pills[0].count, 2)
  assert.equal(model.nodes.length, 4)
  assert.equal(model.edges.length, 4)
  const aggregated = model.edges.find((e) => e.key.includes(':a:out:'))
  assert.ok(aggregated)
  assert.equal(aggregated.count, 2)
})

test('确定性：同样输入两次结果完全一致', () => {
  const state = mkState(
    ['p.C', ...SIX, 'p.U1', 'p.U2'],
    [
      ...fanout('p.C', SIX),
      ['p.U1', 'p.C'],
      ['p.U2', 'p.C']
    ]
  )
  const once = JSON.stringify(buildCumulativeModel(state))
  const twice = JSON.stringify(buildCumulativeModel(state))
  assert.equal(once, twice)

  const page = { centerUid: 'p.C', hops: 1, collapsedPackages: new Set() }
  assert.equal(
    JSON.stringify(buildFocusModel(state, page)),
    JSON.stringify(buildFocusModel(state, page))
  )
})
