import { useCallback, useEffect, useRef, useState } from 'react'

const GUTTER = 16
// 右侧 Agent 面板的预留宽度：浮窗默认落在画布区，不压住对话入口
const PANEL_RESERVE = 400
const DRAG_THRESHOLD = 3

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

function viewport() {
  if (typeof window === 'undefined') return { vw: 1280, vh: 800 }
  return { vw: window.innerWidth, vh: window.innerHeight }
}

function fitRect(rect, minW, minH) {
  const { vw, vh } = viewport()
  const maxW = Math.max(240, vw - GUTTER * 2)
  const maxH = Math.max(200, vh - GUTTER * 2)
  const w = Math.round(clamp(rect.w, Math.min(minW, maxW), maxW))
  const h = Math.round(clamp(rect.h, Math.min(minH, maxH), maxH))
  return {
    x: Math.round(clamp(rect.x, GUTTER, Math.max(GUTTER, vw - w - GUTTER))),
    y: Math.round(clamp(rect.y, GUTTER, Math.max(GUTTER, vh - h - GUTTER))),
    w,
    h
  }
}

export function defaultWindowRect() {
  const { vw, vh } = viewport()
  const wide = vw >= 900
  const availW = wide ? vw - PANEL_RESERVE : vw - GUTTER * 2
  const w = wide ? clamp(Math.round(availW * 0.8), 480, 760) : vw - GUTTER * 2
  const h = clamp(Math.round(vh * 0.7), 360, 820)
  return fitRect({
    w,
    h,
    x: wide ? availW - w - GUTTER : GUTTER,
    y: Math.max(72, Math.round((vh - h) / 2))
  }, 420, 320)
}

function loadRect(storageKey, minW, minH) {
  if (!storageKey) return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed) return null
    const nums = [parsed.x, parsed.y, parsed.w, parsed.h]
    if (!nums.every((n) => Number.isFinite(n))) return null
    return fitRect(parsed, minW, minH)
  } catch {
    return null
  }
}

/**
 * 一个固定定位浮窗的几何状态：拖动、缩放、最大化、视口裁剪、localStorage 记忆。
 *
 * 指针事件统一挂在 window 上（和 AgentPanel 的拖拽实现同一套路），
 * 而不是 setPointerCapture —— 窗口在拖动中卸载时不会残留捕获。
 */
export default function useFloatingWindow({
  storageKey = '',
  open = true,
  minW = 420,
  minH = 320
} = {}) {
  const [rect, setRect] = useState(() => loadRect(storageKey, minW, minH) || defaultWindowRect())
  const [dragging, setDragging] = useState(false)
  const [maximized, setMaximized] = useState(false)

  const rectRef = useRef(rect)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const restoreRef = useRef(null)
  const detachRef = useRef({ move: null, up: null })
  rectRef.current = rect

  const persist = useCallback(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(rectRef.current))
    } catch {
      // 隐私模式/配额不足时不阻塞使用
    }
  }, [storageKey])

  const endGesture = useCallback(() => {
    const { move, up } = detachRef.current
    if (move) window.removeEventListener('pointermove', move)
    if (up) {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    detachRef.current = { move: null, up: null }
    dragRef.current = null
    resizeRef.current = null
    setDragging(false)
    document.body.classList.remove('is-window-dragging')
  }, [])

  const beginGesture = useCallback((move, up) => {
    detachRef.current = { move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [])

  useEffect(() => endGesture, [endGesture])

  // 打开时按当前视口重新裁剪：换显示器、缩放过页面之后几何可能已经越界
  useEffect(() => {
    if (!open) return
    setRect((r) => fitRect(r, minW, minH))
  }, [open, minW, minH])

  useEffect(() => {
    const onResize = () => setRect((r) => fitRect(r, minW, minH))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [minW, minH])

  const toggleMaximize = useCallback(() => {
    const { vw, vh } = viewport()
    if (maximized) {
      setRect(fitRect(restoreRef.current || defaultWindowRect(), minW, minH))
      setMaximized(false)
      return
    }
    restoreRef.current = rectRef.current
    setRect({ x: GUTTER, y: GUTTER, w: vw - GUTTER * 2, h: vh - GUTTER * 2 })
    setMaximized(true)
  }, [maximized, minW, minH])

  const onDragPointerDown = useCallback((e) => {
    if (e.button !== 0 || maximized) return
    if (e.target.closest('button, a, input, textarea, select')) return
    e.preventDefault()

    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      ox: rectRef.current.x, oy: rectRef.current.y,
      moved: false
    }

    const move = (ev) => {
      const d = dragRef.current
      if (!d) return
      const dx = ev.clientX - d.sx
      const dy = ev.clientY - d.sy
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      if (!d.moved) {
        d.moved = true
        setDragging(true)
        document.body.classList.add('is-window-dragging')
      }
      const { vw, vh } = viewport()
      const { w, h } = rectRef.current
      setRect({
        x: Math.round(clamp(d.ox + dx, GUTTER, Math.max(GUTTER, vw - w - GUTTER))),
        y: Math.round(clamp(d.oy + dy, GUTTER, Math.max(GUTTER, vh - h - GUTTER))),
        w,
        h
      })
    }

    const up = () => {
      const moved = dragRef.current?.moved
      endGesture()
      if (moved) persist()
    }

    beginGesture(move, up)
  }, [beginGesture, endGesture, maximized, persist])

  const resizeProps = useCallback((kind) => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || maximized) return
      e.preventDefault()
      e.stopPropagation()
      resizeRef.current = {
        kind, sx: e.clientX, sy: e.clientY,
        ow: rectRef.current.w, oh: rectRef.current.h,
        moved: false
      }

      const move = (ev) => {
        const d = resizeRef.current
        if (!d) return
        const { vw, vh } = viewport()
        const maxW = Math.max(240, vw - rectRef.current.x - GUTTER)
        const maxH = Math.max(200, vh - rectRef.current.y - GUTTER)
        const w = d.kind.includes('r')
          ? clamp(d.ow + ev.clientX - d.sx, Math.min(minW, maxW), maxW)
          : rectRef.current.w
        const h = d.kind.includes('b')
          ? clamp(d.oh + ev.clientY - d.sy, Math.min(minH, maxH), maxH)
          : rectRef.current.h
        if (!d.moved && Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) < DRAG_THRESHOLD) return
        d.moved = true
        setRect({
          x: rectRef.current.x,
          y: rectRef.current.y,
          w: Math.round(w),
          h: Math.round(h)
        })
      }

      const up = () => {
        const moved = resizeRef.current?.moved
        endGesture()
        if (moved) persist()
      }

      beginGesture(move, up)
    }
  }), [beginGesture, endGesture, maximized, minW, minH, persist])

  return {
    rect,
    dragging,
    maximized,
    dragProps: { onPointerDown: onDragPointerDown, onDoubleClick: toggleMaximize },
    resizeProps,
    toggleMaximize
  }
}
