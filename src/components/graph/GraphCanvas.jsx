import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NODE_H, NODE_W, PAD } from '../../graph/layout'
import { boundsOfRects } from '../../graph/view'
import { ownerUid } from '../../graph/model'
import GraphBox, { GraphBoxMarker } from './GraphBox'
import GraphEdges from './GraphEdges'
import GraphNodeCard from './GraphNodeCard'

const hasPos = (n) => Number.isFinite(n?.x) && Number.isFinite(n?.y)
const EMPTY = []

/**
 * 画布：平移、缩放、适配，节点、框、包块与边。
 *
 * 输入是视图层算好的 pageModel，不再自己读 store ——
 * 观察/焦点两种页面共用这一份渲染代码，只换 model。
 */
export default function GraphCanvas({
  model,
  filters,
  view,
  setView,
  fitSignal = 0,
  onNodeClick,
  onNodeOpen,
  onNodeFocus,
  onBoxToggle,
  onBoxCollapse,
  onPackageToggle,
  onBackgroundClick
}) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const dragRef = useRef(null)
  const lastFitRef = useRef(-1)
  const prevCountRef = useRef(0)
  const prevSizeRef = useRef({ w: 0, h: 0 })

  const nodes = model?.nodes || EMPTY
  const positioned = useMemo(() => nodes.filter(hasPos), [nodes])
  const boxes = model?.boxes || EMPTY
  const markers = model?.expandedMarkers || EMPTY
  const pills = model?.pills || EMPTY
  const packages = model?.packages || EMPTY
  const gaps = model?.gaps || EMPTY
  const edges = model?.edges || EMPTY
  const bounds = model?.bounds || boundsOfRects(EMPTY)
  const nodeUids = useMemo(() => new Set(nodes.map((n) => n.uid)), [nodes])
  const gapOwners = useMemo(() => new Set(gaps.map((g) => ownerUid(g.at))), [gaps])

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
    const b = bounds
    // 底部 34px 是状态条，适配时把它让出来，否则节点会被压在状态条下面。
    const usableH = Math.max(120, h - 34)
    const scale = Math.max(
      0.25,
      Math.min(1.2, Math.min((w - 40) / b.width, (usableH - 32) / b.height))
    )
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    setView({ scale, x: w / 2 - cx * scale, y: usableH / 2 - cy * scale })
  }, [positioned, bounds, setView])

  // 容器尺寸变化（拖 Agent 面板、窗口缩放）时保持视口中心不跳。
  useEffect(() => {
    const prev = prevSizeRef.current
    prevSizeRef.current = size
    if (!prev.w || !prev.h || !size.w || !size.h) return
    const dx = (size.w - prev.w) / 2
    const dy = (size.h - prev.h) / 2
    if (dx === 0 && dy === 0) return
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [size.w, size.h, setView])

  // 外部请求适配（工具栏 / SHOW_PATH / 重新布局 / 切页）
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
    if (
      e.target.closest('.graph-node') ||
      e.target.closest('.graph-gap-node') ||
      e.target.closest('.graph-box') ||
      e.target.closest('.graph-box-marker') ||
      e.target.closest('.graph-pill') ||
      e.target.closest('.graph-package-label')
    ) {
      return
    }
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
  }

  // 没有子节点的断点：画在已定位节点的下方，避免丢掉「未解析」这个事实
  const orphanGaps = gaps.filter((g) => !nodeUids.has(ownerUid(g.at)))
  const ghostBaseX = positioned.length ? bounds.minX + PAD : PAD + NODE_W / 2
  const ghostBaseY = positioned.length ? bounds.maxY - PAD + 40 : PAD + NODE_H / 2

  return (
    <div className="graph-canvas" ref={containerRef} onMouseDown={handleMouseDown}>
      <div
        className="graph-world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {packages.length > 0 && (
          <svg
            className="graph-edges-svg graph-bands-svg"
            style={{ left: bounds.minX, top: bounds.minY }}
            width={bounds.width}
            height={bounds.height}
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          >
            {packages.map((pkg) => (
              <path
                key={`band:${pkg.side}:${pkg.name}`}
                d={pkg.band}
                className={`graph-package-band${pkg.collapsed ? ' is-collapsed' : ''}`}
              />
            ))}
          </svg>
        )}

        <GraphEdges
          nodes={positioned}
          edges={edges}
          bounds={bounds}
          filters={filters}
          pathUids={model?.pathUids}
        />

        {boxes.map((box) => (
          <GraphBox key={box.key} box={box} onToggle={onBoxToggle} />
        ))}

        {markers.map((marker) => (
          <GraphBoxMarker key={marker.key} marker={marker} onCollapse={onBoxCollapse} />
        ))}

        {positioned.map((n) => (
          <GraphNodeCard
            key={n.uid}
            node={n}
            degree={model?.degree?.get(n.uid)}
            pending={model?.pending?.has(n.uid)}
            selected={model?.selectedUid === n.uid}
            focused={model?.focusUid === n.uid}
            hasGap={gapOwners.has(n.uid)}
            onPath={model?.pathUids?.has(n.uid)}
            onClick={onNodeClick}
            onOpen={onNodeOpen}
            onFocus={onNodeFocus}
          />
        ))}

        {pills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            className="graph-pill"
            style={{
              left: pill.rect.x,
              top: pill.rect.y,
              width: pill.rect.w,
              height: pill.rect.h
            }}
            title={`${pill.name} · ${pill.count} 个类 · 点击展开`}
            onClick={(e) => {
              e.stopPropagation()
              onPackageToggle?.(pill.name)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="gp-name">{pill.name}</span>
            <span className="gp-count">{pill.count}</span>
          </button>
        ))}

        {packages.map((pkg) =>
          pkg.labelAt ? (
            <button
              key={`label:${pkg.side}:${pkg.name}`}
              type="button"
              className={`graph-package-label${pkg.collapsed ? ' is-collapsed' : ''}`}
              style={{ left: pkg.labelAt.x, top: pkg.labelAt.y }}
              title={pkg.collapsed ? '展开这个包' : '折叠这个包'}
              onClick={(e) => {
                e.stopPropagation()
                onPackageToggle?.(pkg.name)
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {pkg.name}
            </button>
          ) : null
        )}

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

      <div className="graph-canvas-hint">拖动平移 · 滚轮缩放 · 双击节点看源码</div>
    </div>
  )
}
