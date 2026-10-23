import { useCallback, useEffect, useRef, useState } from 'react'
import { getTask, latestTask } from '../api/project'

const FIRST_DELAY = 1500
const MID_DELAY = 3000
const LATE_DELAY = 5000
const MID_AFTER_MS = 20_000
const LATE_AFTER_MS = 60_000
const TIMEOUT_MS = 15 * 60 * 1000

// 分析是后端异步任务：POST /analyze 只负责投递。
// 这里负责轮询、退避、终态分发，以及换页后通过 tasks/latest 找回仍在跑的任务。
export default function useTaskPolling() {
  const [task, setTask] = useState(null)
  const timerRef = useRef(null)
  const seqRef = useRef(0)
  const startedAtRef = useRef(0)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const stop = useCallback(() => {
    seqRef.current++
    clearTimer()
    setTask(null)
  }, [])

  const poll = useCallback(async (taskId, handlers) => {
    const seq = seqRef.current
    if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
      clearTimer()
      handlers.onFailure?.({ status: 'FAILED', error: '分析超时，请稍后重试' })
      return
    }

    try {
      const t = await getTask(taskId)
      if (seq !== seqRef.current) return
      setTask(t)
      handlers.onUpdate?.(t)

      if (t?.status === 'SUCCESS') {
        clearTimer()
        handlers.onSuccess?.(t)
        return
      }
      if (t?.status === 'PARTIAL') {
        clearTimer()
        handlers.onPartial?.(t)
        return
      }
      if (t?.status === 'FAILED') {
        clearTimer()
        handlers.onFailure?.(t)
        return
      }
    } catch {
      // 网络抖动不终止轮询：继续退避，直到超时
      if (seq !== seqRef.current) return
    }

    if (seq !== seqRef.current) return
    const elapsed = Date.now() - startedAtRef.current
    const delay = elapsed < MID_AFTER_MS ? FIRST_DELAY
      : elapsed < LATE_AFTER_MS ? MID_DELAY : LATE_DELAY
    timerRef.current = setTimeout(() => poll(taskId, handlers), delay)
  }, [])

  const start = useCallback((taskId, handlers = {}) => {
    clearTimer()
    seqRef.current++
    startedAtRef.current = Date.now()
    if (!taskId) {
      handlers.onFailure?.({ status: 'FAILED', error: '分析任务创建失败，请重试' })
      return
    }
    poll(taskId, handlers)
  }, [poll])

  /**
   * 打开项目 / 换页回来后调用：拉最近一次任务。
   * 只有 PENDING/RUNNING 才继续轮询；终态交给调用方按需处理。
   */
  const resume = useCallback(async (projectId, handlers = {}) => {
    if (!projectId) return null
    try {
      const latest = await latestTask(projectId)
      if (!latest) return null
      if (latest.status === 'PENDING' || latest.status === 'RUNNING') {
        handlers.onUpdate?.(latest)
        start(latest.taskId, handlers)
      }
      return latest
    } catch {
      return null
    }
  }, [start])

  useEffect(() => stop, [stop])

  return { start, resume, stop, task }
}
