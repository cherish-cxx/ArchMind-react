import { useCallback, useEffect, useRef } from 'react'
import { describeClasses } from '../api/project'
import {
  applyNodeDescriptions,
  getGraphState,
  setGraphDescriptionsPending,
  useGraphState
} from '../state/graphStore'

const BATCH_SIZE = 20
const DEBOUNCE_MS = 400
/** 一次最多发多少批：剩下的等下一轮 state 变化自然接上，避免瞬间打满 */
const MAX_BATCHES_PER_TICK = 4
/** busy 不是「已处理」：服务端在分析中/被别的批次占用时返回它，要有限次重试 */
const MAX_RETRIES = 3
const DEFAULT_RETRY_MS = 1500

/**
 * 描述只在「节点进入画布且没有描述」时补，不因点击触发。
 *
 * 覆盖范围：
 *  - 非抽象实现类（接口 / 枚举 / 抽象类由服务端过滤，前端已知的就不再请求）；
 *  - 画布中心节点例外：用户正看着它，接口也要有一句描述（force）。
 *
 * 幂等依靠两层：前端 requested 集合（本次会话不再重复请求）+ 服务端已有描述即跳过。
 * 服务端返回 busy（分析中 / 批次占用 / 冷却）时会移出 requested 并重试，
 * 因此「批量补齐正好在描述这个类」不会让画布永久留白。
 */
export function useClassDescriptions({ projectId, enabled = true }) {
  const graph = useGraphState()
  const requested = useRef(new Set())
  const retries = useRef(new Map())
  const queue = useRef(Promise.resolve())
  const timer = useRef(null)
  const retryTimer = useRef(null)
  const projectRef = useRef(projectId)
  const runRef = useRef(null)

  useEffect(() => {
    if (projectRef.current === projectId) return
    projectRef.current = projectId
    requested.current = new Set()
    retries.current = new Map()
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }, [projectId])

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

  const collect = useCallback(() => {
    const state = getGraphState()
    const centerUid = state.focusUid && state.nodes.has(state.focusUid) ? state.focusUid : null
    const center = centerUid ? state.nodes.get(centerUid) : null
    const needCenter = Boolean(center && !center.description && !requested.current.has(center.uid))

    const pending = []
    for (const node of state.nodes.values()) {
      if (requested.current.has(node.uid)) continue
      if (!node.uid || node.uid === centerUid) continue
      if (node.description) continue
      if (node.isAbstract === true) continue
      if (node.kind === 'ENUM' || node.kind === 'INTERFACE') continue
      pending.push(node.uid)
    }
    return { pending, centerUid: needCenter ? centerUid : null }
  }, [])

  const scheduleRetry = useCallback((delay) => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null
      runRef.current?.()
    }, Math.max(300, delay || DEFAULT_RETRY_MS))
  }, [])

  /** busy / 网络错误：移出 requested 换取下一次机会，超过次数就留在集合里不再请求 */
  const releaseForRetry = useCallback((uids, delay) => {
    let shouldRetry = false
    uids.forEach((uid) => {
      const n = (retries.current.get(uid) || 0) + 1
      retries.current.set(uid, n)
      if (n <= MAX_RETRIES) {
        requested.current.delete(uid)
        shouldRetry = true
      }
    })
    if (shouldRetry) scheduleRetry(delay)
  }, [scheduleRetry])

  const run = useCallback(() => {
    if (!projectId || !enabled) return
    const { pending, centerUid } = collect()
    if (pending.length === 0 && !centerUid) return

    const batches = []
    // 中心先发：它已经有请求上限，且 force 只作用于这一条
    if (centerUid) batches.push({ uids: [centerUid], force: true })
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      batches.push({ uids: pending.slice(i, i + BATCH_SIZE), force: false })
    }
    const todo = batches.slice(0, MAX_BATCHES_PER_TICK)

    // 先占位再发请求：期间 state 变化不会重复收集同一批节点
    for (const batch of todo) {
      batch.uids.forEach((uid) => requested.current.add(uid))
      setGraphDescriptionsPending(batch.uids, true)
    }

    const task = queue.current.then(async () => {
      for (const batch of todo) {
        try {
          const res = await describeClasses(projectId, batch.uids, batch.force)
          if (res?.items?.length) applyNodeDescriptions(res.items)

          if (res?.busy) {
            releaseForRetry(batch.uids, res.retryAfterMs)
          } else {
            batch.uids.forEach((uid) => retries.current.delete(uid))
          }
        } catch {
          // 网络或服务错误：同样给有限次重试，避免一次抖动让节点永久留白
          releaseForRetry(batch.uids, 2000)
        } finally {
          setGraphDescriptionsPending(batch.uids, false)
        }
      }
    })
    queue.current = task.catch(() => {})
  }, [projectId, enabled, collect, releaseForRetry])

  runRef.current = run

  useEffect(() => {
    if (!enabled || !projectId || graph.nodes.size === 0) return
    const { pending, centerUid } = collect()
    if (pending.length === 0 && !centerUid) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      run()
    }, DEBOUNCE_MS)

    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [graph, enabled, projectId, collect, run])
}
