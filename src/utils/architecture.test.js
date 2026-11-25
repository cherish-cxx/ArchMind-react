import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYER_ORDER, normalizeLayers, groupPreview, sortedEdges } from './architecture.js'

test('补齐六层并按固定顺序', () => {
  const data = { layers: [{ key: 'other', classCount: 1, groups: [] }], classCount: 1 }
  assert.deepEqual(normalizeLayers(data).layers.map((l) => l.key), LAYER_ORDER)
})

test('分组预览最多 3 个类名并给出剩余数', () => {
  const group = { classes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }
  assert.deepEqual(groupPreview(group, 3), { names: ['A', 'B', 'C'], more: 1 })
})

test('边按次数降序且同层过滤由后端保证', () => {
  const edges = [{ count: 1, fromLayer: 'entry', toLayer: 'other' },
                 { count: 9, fromLayer: 'business', toLayer: 'other' }]
  assert.deepEqual(sortedEdges(edges).map((e) => e.count), [9, 1])
})

test('分组预览按真实类数计算剩余，即使列表被截断', () => {
  const group = { classCount: 10, classes: [{ name: 'A' }, { name: 'B' }] }
  assert.deepEqual(groupPreview(group, 3), { names: ['A', 'B'], more: 8 })
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
