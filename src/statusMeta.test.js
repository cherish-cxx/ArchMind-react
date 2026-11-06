import test from 'node:test'
import assert from 'node:assert/strict'
import { nextStep, needsAttention } from './statusMeta.js'

test('每个项目状态都映射到唯一主动作', () => {
  const cases = [
    ['NO_SOURCE', 'upload', '上传源码'],
    ['PENDING', 'progress', '查看进度'],
    ['COMPLETED', 'map', '继续探索'],
    ['FAILED', 'analyze', '重新分析'],
    ['PARTIAL', 'analyze', '补全分析']
  ]
  for (const [status, action, label] of cases) {
    assert.deepEqual(nextStep({ analysisStatus: status }), { action, label })
  }
})

test('未知或缺失状态回落到打开项目', () => {
  assert.deepEqual(nextStep({}), { action: 'detail', label: '打开项目' })
  assert.deepEqual(nextStep({ analysisStatus: 'WHATEVER' }), {
    action: 'detail',
    label: '打开项目'
  })
})

test('只有已完成的项目不进入待办', () => {
  assert.equal(needsAttention({ analysisStatus: 'COMPLETED' }), false)
  assert.equal(needsAttention({ analysisStatus: 'FAILED' }), true)
  assert.equal(needsAttention({ analysisStatus: 'NO_SOURCE' }), true)
  assert.equal(needsAttention(null), false)
})
