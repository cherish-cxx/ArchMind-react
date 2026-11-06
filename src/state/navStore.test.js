import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV_KEY, readNav, writeNav } from './navStore.js'

function installStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  }
  return store
}

test('writeNav / readNav：页面与项目号往返一致', () => {
  const store = installStorage()
  try {
    writeNav({ page: 'memory', projectId: 12 })
    assert.deepEqual(readNav(), { page: 'memory', projectId: '12' })
    assert.equal(store.has(NAV_KEY), true)
  } finally {
    delete globalThis.localStorage
  }
})

test('readNav：未知页面与坏 JSON 按无快照处理', () => {
  const store = installStorage({ [NAV_KEY]: '{"page":"nowhere"}' })
  try {
    assert.equal(readNav(), null)
    store.set(NAV_KEY, '{oops')
    assert.equal(readNav(), null)
    store.delete(NAV_KEY)
    assert.equal(readNav(), null)
  } finally {
    delete globalThis.localStorage
  }
})

test('writeNav：非法页面回落工作台', () => {
  const store = installStorage()
  try {
    writeNav({ page: 'nope', projectId: null })
    assert.deepEqual(readNav(), { page: 'workbench', projectId: null })
    assert.deepEqual(JSON.parse(store.get(NAV_KEY)), {
      page: 'workbench',
      projectId: null
    })
  } finally {
    delete globalThis.localStorage
  }
})

test('没有 localStorage 时读写都不抛错', () => {
  assert.equal(readNav(), null)
  assert.doesNotThrow(() => writeNav({ page: 'projects' }))
})
