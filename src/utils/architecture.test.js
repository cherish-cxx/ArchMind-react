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
