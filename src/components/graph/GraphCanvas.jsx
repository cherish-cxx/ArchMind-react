import { useCallback, useEffect, useRef, useState } from 'react'
import { boundsOf, NODE_H, NODE_W, PAD } from '../../graph/layout'
import { ownerUid } from '../../graph/model'
import GraphEdges from './GraphEdges'
import GraphNodeCard from './GraphNodeCard'

const hasPos = (n) => Number.isFinite(n?.x) && Number.isFinite(n?.y)

/**
 * 画布：平移、缩放、适配，节点与边。
 *
 * 视图变换沿用旧 MapCanvas 的做法（transform: translate + scale），
 * 但数据源换成了 graphStore，并且没有任何演示数据。
 */
export default function GraphCanvas({
  graph,
  filters,
  view,
  setView,
  fitSignal = 0,
  onNodeClick,
  onBackgroundClick
}) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const dragRef = useRef(null)
  const lastFitRef = useRef(-1)
  const prevCountRef = useRef(0)
  const prevSizeRef = useRef({ w: 0, h: 0 })

  const nodes = [...graph.nodes.values()]
  const positioned = nodes.filter(hasPos)
  const bounds = boundsOf(positioned)
  const gaps = [...graph.gaps.values()]
  const gapOwners = new Set(gaps.map((g) => ownerUid(g.at)))
  const edges = [...graph.edges.values()]

  // 尺寸监听：适配视图和缩放都依赖它
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el || positioned.length === 0) {
      setView({ scale: 1, x: 0, y: 0 })
      return
    }
    const w = el.clientWidth
    const h = el.clientHeight
    const b = boundsOf(positioned)
    // 底部 34px 是状态条，适配时把它让出来，否则节点会被压在状态条下面。
    const usableH = Math.max(120, h - 34)
    const scale = Math.max(0.25, Math.min(1.2, Math.min((w - 40) / b.width, (usableH - 32) / b.height)))
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    setView({ scale, x: w / 2 - cx * scale, y: usableH / 2 - cy * scale })
  }, [positioned, setView])

  // 容器尺寸变化（拖 Agent 面板、窗口缩放）时保持视口中心不跳。
  // 放在 fitSignal 的 effect 之前：同一帧里如果既要 resize 又要 fit，fit 应该赢。
  useEffect(() => {
    const prev = prevSizeRef.current
    prevSizeRef.current = size
    if (!prev.w || !prev.h || !size.w || !size.h) return
    const dx = (size.w - prev.w) / 2
    const dy = (size.h - prev.h) / 2
    if (dx === 0 && dy === 0) return
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [size.w, size.h, setView])

  // 外部请求适配（工具栏 / SHOW_PATH / 重新布局）
  useEffect(() => {
    if (fitSignal === lastFitRef.current) return
    lastFitRef.current = fitSignal
    fitView()
  }, [fitSignal, fitView])

  // 图从空变有：自动适配一次；后续增量不打扰
  useEffect(() => {
    if (prevCountRef.current === 0 && positioned.length > 0 && size.w > 0) fitView()
    prevCountRef.current = positioned.length
  }, [positioned.length, size.w, fitView])

  // 滚轮缩放：以指针为中心
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView((v) => {
        const next = Math.min(2.5, Math.max(0.25, v.scale * (e.deltaY < 0 ? 1.1 : 0.9)))
        const k = next / v.scale
        return { scale: next, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView])

  // 拖拽平移；没拖动就算点击空白
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }))
    }
    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      if (d && !d.moved) onBackgroundClick?.()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setView, onBackgroundClick])

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('.graph-node') || e.target.closest('.graph-gap-node')) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
  }

  // 没有子节点的断点：画在已定位节点的下方，避免丢掉「未解析」这个事实
  const orphanGaps = gaps.filter((g) => !graph.nodes.has(ownerUid(g.at)))
  const ghostBaseX = positioned.length ? bounds.minX + PAD : PAD + NODE_W / 2
  const ghostBaseY = positioned.length ? bounds.maxY - PAD + 40 : PAD + NODE_H / 2

  return (
    <div className="graph-canvas" ref={containerRef} onMouseDown={handleMouseDown}>
      <div
        className="graph-world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <GraphEdges
          nodes={positioned}
          edges={edges}
          bounds={bounds}
          filters={filters}
          pathUids={graph.pathUids}
        />

        {positioned.map((n) => (
          <GraphNodeCard
            key={n.uid}
            node={n}
            selected={graph.selectedUid === n.uid}
            focused={graph.focusUid === n.uid}
            hasGap={gapOwners.has(n.uid)}
            onPath={graph.pathUids?.has(n.uid)}
            onClick={onNodeClick}
          />
        ))}

        {orphanGaps.map((g, i) => (
          <div
            key={`${g.at}|${g.reason}`}
            className="graph-gap-node"
            style={{
              left: ghostBaseX + (i % 3) * (NODE_W + 24),
              top: ghostBaseY + Math.floor(i / 3) * (NODE_H + 24)
            }}
            title={`${g.at}\n${g.reason}`}
          >
            <span className="gg-title">未解析</span>
            <span className="gg-at">{g.at}</span>
            <span className="gg-reason">{g.reason}</span>
          </div>
        ))}
      </div>

      <div className="graph-canvas-hint">拖动平移 · 滚轮缩放</div>
    </div>
  )
}
