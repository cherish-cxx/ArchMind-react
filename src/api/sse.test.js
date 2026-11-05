import test from 'node:test'
import assert from 'node:assert/strict'

import { readSseEvents } from './sse.js'

const enc = new TextEncoder()

function streamOf(chunks) {
  return new ReadableStream({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)))
      c.close()
    }
  })
}

test('readSseEvents：跨 chunk 的半行也能拼回来', async () => {
  const chunks = ['event: step\nda', 'ta: {"n":1}\n\n', 'event: answer\ndata: {}\n\n']
  const got = []

  await readSseEvents(streamOf(chunks), (e) => got.push(e))

  assert.deepEqual(got.map((e) => e.name), ['step', 'answer'])
  assert.deepEqual(JSON.parse(got[0].data), { n: 1 })
})

test('readSseEvents：忽略注释行与空帧', async () => {
  const chunks = [': keep-alive\n\n', '\n', 'event: step\ndata: 1\n\n']
  const got = []

  await readSseEvents(streamOf(chunks), (e) => got.push(e))

  assert.deepEqual(got, [{ name: 'step', data: '1' }])
})

test('readSseEvents：没有 event 字段时回落到 message', async () => {
  const got = []
  await readSseEvents(streamOf(['data: {"a":1}\n\n']), (e) => got.push(e))

  assert.deepEqual(got, [{ name: 'message', data: '{"a":1}' }])
})
