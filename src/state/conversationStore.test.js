import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendMessageStep,
  beginAgentMessage,
  completeAgentMessage,
  failAgentMessage,
  getConversationState,
  startNewConversation
} from './conversationStore.js'

test('begin → appendStep → complete：占位被就地填满', () => {
  startNewConversation()
  const id = beginAgentMessage()

  appendMessageStep(id, { n: 1, type: 'PLAN', detail: '规划#1', ms: 120 })
  appendMessageStep(id, { n: 1, type: 'PLAN', detail: '规划#1', ms: 120 })

  let m = getConversationState().messages.at(-1)
  assert.equal(m.pending, true)
  assert.equal(m.steps.length, 1, '同一步重复到达应当替换而不是追加')

  completeAgentMessage(id, {
    message: '答',
    conversationId: 'c_1',
    steps: [{ n: 1, type: 'PLAN', detail: 'x', ms: 1 }]
  })

  m = getConversationState().messages.at(-1)
  assert.equal(m.pending, false)
  assert.equal(m.text, '答')
  assert.equal(m.steps.length, 1)
  assert.equal(getConversationState().conversationId, 'c_1')
})

test('failAgentMessage：占位变成错误消息，不插第二条', () => {
  startNewConversation()
  const id = beginAgentMessage()

  failAgentMessage(id, '连接中断')

  const messages = getConversationState().messages
  assert.equal(messages.length, 1)
  assert.equal(messages[0].error, true)
  assert.equal(messages[0].pending, false)
  assert.equal(messages[0].text, '连接中断')
})
