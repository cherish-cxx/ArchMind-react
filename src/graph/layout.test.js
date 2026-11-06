import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NODE_H,
  NODE_W,
  PAD,
  layoutBfs,
  layoutDepth,
  layoutRadial,
  placeIncremental,
  shiftIntoBounds
} from './layout.js'
import { buildCumulativeModel, buildFocusModel } from './view.js'

function mkState(uids, edges = []) {
  const nodes = new Map()
  for (const uid of uids) {
    const dot = uid.lastIndexOf('.')
    nodes.set(uid, {
      uid,
      name: uid.slice(dot + 1),
      packageName: dot > 0 ? uid.slice(0, dot) : undefined
    })
  }
  const linkMap = new Map()
  for (const [from, to, rel = 'CALLS'] of edges) {
    linkMap.set(`${from}|${to}|${rel}`, { from, to, rel })
  }
  return {
    nodes,
    edges: linkMap,
    gaps: new Map(),
    pendingDescriptions: new Map()
  }
}

function setPos(state, positions) {
  for (const [uid, p] of Object.entries(positions)) {
    const node = state.nodes.get(uid)
    if (!node) continue
    node.x = p.x
    node.y = p.y
  }
}

const coordsOf = (nodes) =>
  Object.fromEntries(nodes.map((n) => [n.uid, { x: n.x, y: n.y }]))

const snapshot = (state) =>
  Object.fromEntries(
    [...state.nodes]
      .filter(([, n]) => Number.isFinite(n.x) && Number.isFinite(n.y))
      .map(([uid, n]) => [uid, { x: n.x, y: n.y }])
  )

test('layoutDepth：同一输入重复计算与节点插入顺序无关', () => {
  const a = mkState(['p.A', 'p.B', 'q.C', 'q.D'])
  const b = mkState(['q.D', 'p.B', 'q.C', 'p.A'])
  setPos(a, { 'p.A': {}, 'p.B': {} })
  a.nodes.get('p.A').depth = 0
  a.nodes.get('p.B').depth = 0
  a.nodes.get('q.C').depth = 1
  a.nodes.get('q.D').depth = 1
  b.nodes.get('p.A').depth = 0
  b.nodes.get('p.B').depth = 0
  b.nodes.get('q.C').depth = 1
  b.nodes.get('q.D').depth = 1

  const first = layoutDepth(a)
  assert.deepEqual(first, layoutDepth(a))
  assert.deepEqual(first, layoutDepth(b))
  assert.ok(first['q.C'].x > first['p.A'].x)
})

test('layoutRadial：上游在左、下游在右，重复计算一致', () => {
  const state = mkState(
    ['p.C', 'p.up1', 'p.up2', 'p.down1'],
    [
      ['p.up1', 'p.C'],
      ['p.up2', 'p.C'],
      ['p.C', 'p.down1']
    ]
  )
  setPos(state, { 'p.C': { x: 800, y: 600 } })

  const first = layoutRadial(state, 'p.C')
  assert.deepEqual(first, layoutRadial(state, 'p.C'))
  assert.deepEqual(first['p.C'], { x: 800, y: 600 })
  assert.ok(first['p.up1'].x < 800 && first['p.up2'].x < 800)
  assert.ok(first['p.down1'].x > 800)
})

test('placeIncremental：只给新节点定位，已有节点坐标不变', () => {
  const state = mkState(['p.C', 'p.a', 'p.b', 'p.d'])
  setPos(state, { 'p.C': { x: 500, y: 500 } })

  const first = placeIncremental(state, ['p.a', 'p.b'], 'p.C')
  assert.deepEqual(Object.keys(first).sort(), ['p.a', 'p.b'])
  setPos(state, first)

  const before = snapshot(state)
  const second = placeIncremental(state, ['p.a', 'p.b', 'p.d'], 'p.C')
  assert.deepEqual(Object.keys(second), ['p.d'])
  setPos(state, second)
  for (const [uid, p] of Object.entries(before)) {
    assert.deepEqual({ x: state.nodes.get(uid).x, y: state.nodes.get(uid).y }, p)
  }
})

test('placeIncremental：同样输入两次给出一致坐标', () => {
  const build = () => {
    const state = mkState(['p.C', 'p.a', 'p.b', 'p.c'])
    setPos(state, { 'p.C': { x: 420, y: 360 } })
    return state
  }
  assert.deepEqual(
    placeIncremental(build(), ['p.a', 'p.b', 'p.c'], 'p.C'),
    placeIncremental(build(), ['p.a', 'p.b', 'p.c'], 'p.C')
  )
})

test('shiftIntoBounds：全部在界内原样返回，越界时整体等比平移', () => {
  const state = mkState(['p.a', 'p.b'])
  setPos(state, { 'p.a': { x: 300, y: 300 } })

  assert.deepEqual(shiftIntoBounds(state, {}), {})

  const shifted = shiftIntoBounds(state, { 'p.b': { x: -200, y: 50 } })
  assert.deepEqual(shifted, shiftIntoBounds(state, { 'p.b': { x: -200, y: 50 } }))
  // 相对位置保持不变
  assert.equal(shifted['p.a'].x - shifted['p.b'].x, 500)
  assert.equal(shifted['p.a'].y - shifted['p.b'].y, 250)
  // 平移后整体落在 PAD 之内
  const minLeft = Math.min(shifted['p.a'].x, shifted['p.b'].x) - NODE_W / 2
  const minTop = Math.min(shifted['p.a'].y, shifted['p.b'].y) - NODE_H / 2
  assert.equal(minLeft, PAD)
  assert.equal(minTop, PAD)
})

test('layoutBfs：重复计算结果一致，根节点固定在第一列', () => {
  const state = mkState(
    ['p.r', 'p.x', 'p.y', 'p.z'],
    [
      ['p.r', 'p.x'],
      ['p.x', 'p.y'],
      ['p.y', 'p.z']
    ]
  )
  const first = layoutBfs(state, 'p.r')
  assert.deepEqual(first, layoutBfs(state, 'p.r'))
  assert.equal(first['p.r'].x, PAD + NODE_W / 2)
  assert.ok(first['p.x'].x > first['p.r'].x)
  assert.ok(first['p.y'].x > first['p.x'].x)
})

test('累积页投影：重复构建得到相同的节点坐标与框位置', () => {
  const members = Array.from({ length: 6 }, (_, i) => `p.m${i}`)
  const uids = ['p.S', ...members]
  const state = mkState(uids, members.map((m) => ['p.S', m]))
  const positions = {}
  uids.forEach((uid, i) => {
    positions[uid] = { x: 220 + (i % 4) * 340, y: 180 + Math.floor(i / 4) * 150 }
  })
  setPos(state, positions)

  const first = buildCumulativeModel(state)
  const second = buildCumulativeModel(state)

  assert.equal(first.boxes.length, 1)
  assert.equal(first.hiddenCount, 6)
  assert.deepEqual(first.boxes.map((b) => b.rect), second.boxes.map((b) => b.rect))
  assert.deepEqual(coordsOf(first.nodes), coordsOf(second.nodes))
  assert.equal(first.nodes.length, 1)
})

test('焦点页投影：重复构建坐标一致且不写回全局节点', () => {
  const state = mkState(
    ['p.C', 'p.a', 'q.b'],
    [
      ['p.C', 'p.a'],
      ['p.C', 'q.b']
    ]
  )
  setPos(state, { 'p.C': { x: 700, y: 500 } })
  const before = snapshot(state)
  const page = {
    centerUid: 'p.C',
    hops: 1,
    collapsedPackages: new Set(),
    selectedUid: null
  }

  const first = buildFocusModel(state, page)
  const second = buildFocusModel(state, page)

  assert.deepEqual(coordsOf(first.nodes), coordsOf(second.nodes))
  assert.deepEqual(snapshot(state), before)
})

test('刷新恢复：快照往返后坐标不变，增量补节只给新节点定位', async () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  }

  try {
    const { loadGraphSnapshot, saveGraphSnapshot } = await import(
      '../state/persistence.js'
    )
    const { applyPatch, deserializeGraph, serializeGraph } = await import(
      './model.js'
    )

    const state = mkState(
      ['p.C', 'p.a', 'p.b'],
      [
        ['p.a', 'p.C'],
        ['p.C', 'p.b']
      ]
    )
    setPos(state, layoutBfs(state, 'p.C'))
    const original = snapshot(state)

    saveGraphSnapshot('demo', 'c_test', serializeGraph(state))
    const reloaded = deserializeGraph(loadGraphSnapshot('demo', 'c_test'))

    assert.deepEqual(snapshot(reloaded), original)

    const patched = applyPatch(reloaded, {
      nodes: [{ uid: 'p.c', name: 'c', packageName: 'p' }]
    })
    for (const [uid, p] of Object.entries(original)) {
      assert.deepEqual(
        { x: patched.nodes.get(uid).x, y: patched.nodes.get(uid).y },
        p
      )
    }
    const added = placeIncremental(patched, ['p.c'], 'p.C')
    assert.deepEqual(Object.keys(added), ['p.c'])
    assert.deepEqual(added, placeIncremental(patched, ['p.c'], 'p.C'))
  } finally {
    delete globalThis.localStorage
  }
})
