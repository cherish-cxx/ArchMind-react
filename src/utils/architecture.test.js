import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYER_ORDER, normalizeLayers, sortedEdges, buildMatrix, layerTraffic, summarize, layerShare, cellKey, topPairs } from './architecture.js'

test('补齐六层并按固定顺序', () => {
  const data = { layers: [{ key: 'other', classCount: 1, groups: [] }], classCount: 1 }
  assert.deepEqual(normalizeLayers(data).layers.map((l) => l.key), LAYER_ORDER)
})

test('边按次数降序且同层过滤由后端保证', () => {
  const edges = [{ count: 1, fromLayer: 'entry', toLayer: 'other' },
                 { count: 9, fromLayer: 'business', toLayer: 'other' }]
  assert.deepEqual(sortedEdges(edges).map((e) => e.count), [9, 1])
})

test('边次数相同按 from>to 稳定排序且不修改入参', () => {
  const edges = [
    { count: 2, fromLayer: 'entry', toLayer: 'external' },
    { count: 2, fromLayer: 'business', toLayer: 'domain-model' }
  ]
  const before = edges.map((e) => `${e.count}:${e.fromLayer}>${e.toLayer}`)

  const sorted = sortedEdges(edges)

  assert.deepEqual(sorted.map((e) => `${e.fromLayer}>${e.toLayer}`),
    ['business>domain-model', 'entry>external'])
  assert.deepEqual(edges.map((e) => `${e.count}:${e.fromLayer}>${e.toLayer}`), before)
})

test('空数据补齐六层，部分数据保留后端层名', () => {
  const empty = normalizeLayers(null)
  assert.equal(empty.layers.length, 6)
  assert.deepEqual(empty.edges, [])
  assert.equal(empty.classCount, 0)

  const partial = normalizeLayers({
    layers: [{ key: 'business', name: '业务自定义', classCount: 5, groups: [] }],
    classCount: 5
  })
  assert.equal(partial.layers.find((l) => l.key === 'business').name, '业务自定义')
  assert.equal(partial.classCount, 5)
})

test('矩阵只收跨层边，并给出最大次数', () => {
  const matrix = buildMatrix([
    { fromLayer: 'entry', toLayer: 'business', count: 12 },
    { fromLayer: 'business', toLayer: 'infrastructure', count: 24 },
    { fromLayer: 'business', toLayer: 'business', count: 99 }
  ])
  assert.equal(matrix.max, 24)
  assert.equal(matrix.cells.size, 2)
  assert.equal(matrix.cells.get('business>infrastructure').count, 24)
  assert.equal(matrix.cells.get('business>business'), undefined)
  assert.deepEqual(matrix.keys, LAYER_ORDER)
})

test('空边时矩阵最大值为 0，不产生 NaN', () => {
  const matrix = buildMatrix()
  assert.equal(matrix.max, 0)
  assert.equal(matrix.cells.size, 0)
})

test('layerTraffic 分别累计调出与被调用，并保留各自的边', () => {
  const model = normalizeLayers({
    classCount: 10,
    layers: [],
    edges: [
      { fromLayer: 'entry', toLayer: 'business', count: 3 },
      { fromLayer: 'business', toLayer: 'infrastructure', count: 7 },
      { fromLayer: 'business', toLayer: 'external', count: 2 }
    ]
  })
  const traffic = layerTraffic(model)
  assert.equal(traffic.get('business').out, 9)
  assert.equal(traffic.get('business').in, 3)
  assert.equal(traffic.get('business').outEdges.length, 2)
  assert.equal(traffic.get('infrastructure').inEdges[0].fromLayer, 'business')
  assert.equal(traffic.get('other').out, 0)
})

test('summarize 取最重的层和最密集的跨层边', () => {
  const model = normalizeLayers({
    classCount: 30,
    layers: [
      { key: 'entry', name: '用户入口层', classCount: 8, groups: [] },
      { key: 'business', name: '业务层', classCount: 18, groups: [] },
      { key: 'other', classCount: 4, groups: [] }
    ],
    edges: [
      { fromLayer: 'entry', toLayer: 'business', count: 12 },
      { fromLayer: 'business', toLayer: 'infrastructure', count: 24 }
    ]
  })
  const summary = summarize(model)
  assert.equal(summary.total, 30)
  assert.equal(summary.activeLayers, 3)
  assert.equal(summary.calls, 36)
  assert.equal(summary.topLayer.key, 'business')
  assert.equal(cellKey(summary.topEdge), 'business>infrastructure')
})

test('没有任何层时 topLayer 为 null', () => {
  const summary = summarize(normalizeLayers({ layers: [], edges: [], classCount: 0 }))
  assert.equal(summary.topLayer, null)
  assert.equal(summary.topEdge, null)
  assert.equal(summary.activeLayers, 0)
})

test('占比按四舍五入，总数为 0 时返回 0', () => {
  assert.equal(layerShare(8, 62), 13)
  assert.equal(layerShare(3, 3), 100)
  assert.equal(layerShare(5, 0), 0)
})

test('topPairs 按次数降序取前 N 个类对，并带上所在层', () => {
  const model = normalizeLayers({
    classCount: 9,
    layers: [],
    edges: [
      { fromLayer: 'entry', toLayer: 'business', count: 9, samples: [
        { fromUid: 'a.A', toUid: 'b.B', count: 2 },
        { fromUid: 'a.C', toUid: 'b.D', count: 7 }
      ] },
      { fromLayer: 'business', toLayer: 'infrastructure', count: 5, samples: [
        { fromUid: 'b.B', toUid: 'c.E', count: 5 }
      ] }
    ]
  })
  const pairs = topPairs(model, 2)
  assert.equal(pairs.length, 2)
  assert.deepEqual(pairs.map((p) => p.count), [7, 5])
  assert.equal(pairs[0].fromLayer, 'entry')
  assert.equal(pairs[1].toLayer, 'infrastructure')
})

test('topPairs 没有样本时返回空数组', () => {
  assert.deepEqual(topPairs(normalizeLayers({ layers: [], edges: [] })), [])
})
