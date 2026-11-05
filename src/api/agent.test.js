import test from 'node:test'
import assert from 'node:assert/strict'

import { askStream } from './agent.js'

const enc = new TextEncoder()

function sseResponse(chunks) {
  return new Response(
    new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)))
        c.close()
      }
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  )
}

test('askStream：读 body 阶段被取消 -> ApiError(-1)', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('event: start\ndata: {}\n\n'))
        c.error(new DOMException('aborted', 'AbortError'))
      }
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  )
  try {
    await assert.rejects(
      askStream({ projectId: '1', message: '问一句' }),
      (e) => e.code === -1
    )
  } finally {
    globalThis.fetch = original
  }
})

test('askStream：没有 answer 就结束 -> 连接中断', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => sseResponse(['event: step\ndata: {"n":1}\n\n'])
  try {
    await assert.rejects(
      askStream({ projectId: '1', message: '问一句' }),
      (e) => /连接中断/.test(e.message)
    )
  } finally {
    globalThis.fetch = original
  }
})

test('askStream：error 事件优先于缺失的 answer', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => sseResponse([
    'event: error\ndata: {"message":"对话服务暂时不可用"}\n\n'
  ])
  try {
    await assert.rejects(
      askStream({ projectId: '1', message: '问一句' }),
      (e) => e.message === '对话服务暂时不可用'
    )
  } finally {
    globalThis.fetch = original
  }
})
