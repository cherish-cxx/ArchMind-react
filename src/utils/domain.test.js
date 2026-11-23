import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capabilityLabel,
  cellSizeClass,
  entryMethod,
  exitLinks,
  parseCapability,
  roleLabel,
  splitAreas,
  totals,
  treemap
} from './domain.js'

test('HTTP 能力拆成动词与路径', () => {
  assert.deepEqual(parseCapability('POST /orders/{id}/cancel'), {
    isHttp: true, verb: 'POST', path: '/orders/{id}/cancel', kind: null
  })
  assert.equal(parseCapability('ANY /x').verb, 'ANY')
})

test('非 HTTP 能力给中文动词与入口方法', () => {
  const parsed = parseCapability('SCHEDULED com.demo.OrderJob#run()')
  assert.equal(parsed.isHttp, false)
  assert.equal(parsed.verb, '定时')
  assert.equal(parsed.path, 'OrderJob.run()')
  assert.equal(parseCapability('MQ com.demo.Listener#onMessage()').verb, '消息')
  assert.equal(parseCapability('MANUAL com.demo.Ctl#handle()').verb, '手动')
})

test('能力名不同时优先用名字（将来模型起中文名）', () => {
  assert.equal(parseCapability('SCHEDULED a.J#run()', '关闭超时订单').path, '关闭超时订单')
})

test('入口方法取 owner 简单类名', () => {
  assert.equal(entryMethod('com.demo.controller.OrderController#createOrder()'), 'OrderController.createOrder()')
  assert.equal(entryMethod(''), '')
})

test('后端返回大写角色枚举也能映射', () => {
  assert.equal(roleLabel('ENTRY'), '入口')
  assert.equal(roleLabel('DOMAIN_MODEL'), '领域模型')
  assert.equal(roleLabel('business'), '业务')
})

test('能力标签用于面包屑', () => {
  assert.equal(capabilityLabel({ uid: 'GET /items' }), 'GET /items')
  assert.equal(capabilityLabel({ uid: 'SCHEDULED a.J#run()' }), 'J.run()')
})

test('业务领域按能力数降序，基础设施单独取出', () => {
  const areas = [
    { uid: 'infrastructure', kind: 'infrastructure', capabilities: [] },
    { uid: 'a', name: 'a', kind: 'business', capabilities: [1] },
    { uid: 'b', name: 'b', kind: 'business', capabilities: [1, 2, 3] },
    { uid: 'c', name: 'c', kind: 'business', capabilities: [] }
  ]
  const { business, infrastructure } = splitAreas(areas)
  assert.deepEqual(business.map((x) => x.uid), ['b', 'a', 'c'])
  assert.equal(infrastructure.uid, 'infrastructure')
})

test('统计把基础设施类数算进总数', () => {
  const business = [
    { capabilities: [1, 2], classCount: 10 },
    { capabilities: [3], classCount: 5 }
  ]
  assert.deepEqual(totals(business, { classCount: 7 }), { areas: 2, capabilities: 3, classes: 22 })
})

test('版图分块不重叠且覆盖整块矩形', () => {
  const items = [
    { key: 'a', value: 41 },
    { key: 'b', value: 33 },
    { key: 'c', value: 18 },
    { key: 'd', value: 14 },
    { key: 'e', value: 12 }
  ]
  const cells = treemap(items, 0, 0, 1000, 520)
  assert.equal(cells.length, 5)
  for (const cell of cells) {
    assert.ok(cell.w > 0 && cell.h > 0)
    assert.ok(cell.x >= 0 && cell.y >= 0)
    assert.ok(cell.x + cell.w <= 1000 && cell.y + cell.h <= 520)
  }
  const area = cells.reduce((sum, c) => sum + c.w * c.h, 0)
  assert.ok(Math.abs(area - 1000 * 520) <= 4000)
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i]
      const b = cells[j]
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      assert.ok(overlapX <= 0 || overlapY <= 0)
    }
  }
})

test('块尺寸分级', () => {
  assert.equal(cellSizeClass(400, 300), 'is-lg')
  assert.equal(cellSizeClass(250, 200), 'is-md')
  assert.equal(cellSizeClass(150, 100), 'is-sm')
  assert.equal(cellSizeClass(80, 60), 'is-xs')
})

test('跨域出口只保留属于当前能力的来源类', () => {
  const calls = [{ toAreaUid: 'item', toAreaName: '商品', count: 3, fromClassUids: ['a.S', 'x.Other'] }]
  const members = [{ uid: 'a.S' }, { uid: 'a.C' }]
  assert.deepEqual(exitLinks(calls, members)[0].sources, ['a.S'])
})
