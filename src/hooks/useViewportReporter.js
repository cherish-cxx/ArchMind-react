import { useCallback, useEffect, useRef } from 'react'
import { reportViewport } from '../api/agent'
import { getViewportSnapshot, useGraphState } from '../state/graphStore'
import {
  bumpLocalRev,
  getConversationState,
  markSessionExpired,
  setLocalRev,
  useConversationState
} from '../state/conversationStore'

const DEBOUNCE_MS = 400

/**
 * 屏幕状态上报（P3）。
 *
 * 约束来自后端契约：
 *  - **整屏快照**不是增量，所以每次都取当前全图；
 *  - `rev` 必须单调递增，旧快照会被 `STALE_REV` 拒绝；
 *  - 上报必须串行，否则两个请求乱序到达时后发的那条可能先落库。
 *
 * 触发条件只有「图/焦点变了」，平移缩放不触发 —— viewport 契约里没有相机状态。
 */
export function useViewportReporter({ projectId, enabled = true }) {
  const graph = useGraphState()
  const conversation = useConversationState()
  const queueRef = useRef(Promise.resolve())
  const timerRef = useRef(null)

  const send = useCallback(() => {
    const current = getConversationState()
    if (!projectId || !enabled || !current.conversationId || current.sessionExpired) {
      return Promise.resolve(null)
    }

    const conversationId = current.conversationId
    const task = queueRef.current.then(async () => {
      // 排队期间会话可能被清掉 / 过期，发送前再确认一次
      const latest = getConversationState()
      if (latest.sessionExpired || latest.conversationId !== conversationId) return null

      const snapshot = getViewportSnapshot()
      const rev = bumpLocalRev()
      try {
        const ack = await reportViewport({ projectId, conversationId, rev, ...snapshot })
        if (!ack.accepted) {
          if (ack.reason === 'SESSION_GONE') {
            markSessionExpired()
          } else if (ack.reason === 'STALE_REV' && Number.isFinite(ack.rev)) {
            // 采用服务端 rev，下一条自然 +1；不要继续用本地旧值重试。
            setLocalRev(ack.rev)
          }
        }
        return ack
      } catch {
        // 上报失败不影响问答；下一轮 screen 变化会再发
        return null
      }
    })

    queueRef.current = task.catch(() => {})
    return task
  }, [projectId, enabled])

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      send()
    }, DEBOUNCE_MS)
  }, [send])

  useEffect(() => {
    if (!enabled || !conversation.conversationId || conversation.sessionExpired) return
    schedule()
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [graph, conversation.conversationId, conversation.sessionExpired, enabled, schedule])

  /** 发问前把当前屏幕刷上去，保证 Python 读到的 viewport 不是更旧的。 */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return send()
  }, [send])

  return { flush }
}
