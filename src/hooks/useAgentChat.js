import { useCallback, useEffect, useRef } from 'react'
import { askStream } from '../api/agent'
import {
  appendMessageStep,
  appendUserMessage,
  beginAgentMessage,
  completeAgentMessage,
  failAgentMessage,
  prepareProject,
  setConversationError,
  setPending,
  startNewConversation,
  useConversationState
} from '../state/conversationStore'

// 级联超时链里 nginx 是 90s、Java 是 70s；前端留出余量，到 95s 主动取消，
// 避免请求永远挂着、用户不知道发生了什么。
const REQUEST_TIMEOUT_MS = 95000

/**
 * 一轮问答的副作用都收在这里：请求、取消、超时、消息落库。
 *
 * **串行是硬约束**：同一会话的 Context 在 Python 侧是读改写，
 * 两轮并发会让后写的那次覆盖前一次（焦点栈/历史一起丢）。
 * 用 ref 而不是 state 做闸门，是因为两次点击可能发生在同一次 render 之前。
 */
export function useAgentChat({ projectId, getFocus, getMethodUid, onGraph, beforeSend }) {
  const conversation = useConversationState()
  const abortRef = useRef(null)
  const inFlightRef = useRef(false)
  const timedOutRef = useRef(false)
  const lastRequestRef = useRef(null)

  useEffect(() => {
    prepareProject(projectId)
  }, [projectId])

  const run = useCallback(async (message, { echo = true, focusOverride, methodUidOverride } = {}) => {
    if (!projectId || inFlightRef.current) return { ok: false, reason: 'busy' }
    const text = (message || '').trim()
    if (!text) return { ok: false, reason: 'empty' }

    inFlightRef.current = true
    setPending(true)
    setConversationError(null)

    const focus = focusOverride !== undefined ? focusOverride : (getFocus?.() || null)
    const methodUid = methodUidOverride !== undefined ? methodUidOverride : (getMethodUid?.() || null)
    lastRequestRef.current = { message: text, focus, methodUid }
    if (echo) appendUserMessage(text)

    const controller = new AbortController()
    abortRef.current = controller
    timedOutRef.current = false
    // **空闲超时**，不是总时长：每收到一个步骤就重新计时。
    // 一轮多步可能跑很久，但「很久没有任何事件」才是真的卡住了。
    let timer = null
    const armTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        timedOutRef.current = true
        controller.abort()
      }, REQUEST_TIMEOUT_MS)
    }
    armTimeout()

    const agentId = beginAgentMessage()

    try {
      // 先把当前屏幕刷给后端，避免 Python 读到的 viewport 落后于 focus。
      // 首轮还没有 cid 时 flush 是 no-op。
      try {
        await beforeSend?.()
      } catch {
        // 上报失败不阻塞问答
      }
      const response = await askStream({
        projectId,
        message: text,
        conversationId: conversation.conversationId,
        focus,
        methodUid,
        signal: controller.signal,
        onStep: (step) => {
          armTimeout()
          appendMessageStep(agentId, step)
        }
      })
      completeAgentMessage(agentId, response)
      await onGraph?.(response)
      return { ok: true, response }
    } catch (err) {
      const failure = err?.code === -1
        ? (timedOutRef.current ? '请求超时（95 秒），请重试。' : '本轮已取消。')
        : (err?.message || '请求失败')
      failAgentMessage(agentId, failure)
      if (err?.code === -1) {
        if (timedOutRef.current) setConversationError('请求超时')
      } else {
        setConversationError(err?.message || '请求失败')
      }
      return { ok: false, error: err }
    } finally {
      clearTimeout(timer)
      abortRef.current = null
      inFlightRef.current = false
      setPending(false)
    }
  }, [projectId, conversation.conversationId, getFocus, getMethodUid, onGraph, beforeSend])

  const send = useCallback((text) => run(text, { echo: true }), [run])

  /** 失败重试：不再重复插入一条用户消息，沿用失败那一轮的锚点。 */
  const retry = useCallback(() => {
    const last = lastRequestRef.current
    if (!last) return
    return run(last.message, {
      echo: false,
      focusOverride: last.focus,
      methodUidOverride: last.methodUid
    })
  }, [run])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const startNew = useCallback(() => {
    abortRef.current?.abort()
    startNewConversation()
    lastRequestRef.current = null
  }, [])

  return {
    conversation,
    send,
    retry,
    cancel,
    startNew
  }
}
