import { useMemo } from 'react'
import { NODE_H, NODE_W } from '../../graph/layout'

/**
 * 关系视觉编码：颜色 + 线型 + 箭头形状三重区分，灰度下也能辨认。
 *
 * 为什么不再用虚线表示扇出：虚线已经让给 DEPENDS，两个语义叠在同一个通道上
 * 会分不清。扇出改用线上的菱形标记。
 */
const REL_STYLE = {
  CALLS: { color: '#6b7280', width: 1.4, dash: undefined, hollow: false },
  DEPENDS: { color: '#9333ea', width: 1.4, dash: '8 5', hollow: false },
  EXTENDS: { color: '#2563eb', width: 2.6, dash: undefined, hollow: true },
  IMPLEMENTS: { color: '#059669', width: 1.6, dash: '2 4', hollow: true }
}

const FALLBACK = REL_STYLE.CALLS

/** 从节点中心沿指向方向走到矩形边界 —— 线不再压在卡片下面。 */
function boundary(node, toward) {
  const dx = toward.x - node.x
  const dy = toward.y - node.y
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y }
  const halfW = NODE_W / 2 + 2
  const halfH = NODE_H / 2 + 2
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
  const t = Math.min(tx, ty)
  return { x: node.x + dx * t, y: node.y + dy * t }
}

function midOf(a, b, control) {
  if (!control) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return {
    x: 0.25 * a.x + 0.5 * control.x + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * control.y + 0.25 * b.y
  }
}

function diamond(p, r = 4) {
  return `${p.x},${p.y - r} ${p.x + r},${p.y} ${p.x},${p.y + r} ${p.x - r},${p.y}`
}

/**
 * 所有边画在一张 SVG 里。
 *
 * 视图层已经把隐藏成员折算到框、聚合了重复边，并算好了 d/mid；
 * 这里优先用路由结果，只有旧调用方没给 d 时才退回本地几何。
 */
export default function GraphEdges({ nodes, edges, bounds, filters, pathUids }) {
  const positioned = useMemo(() => {
    const map = new Map()
    for (const n of nodes) {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) map.set(n.uid, n)
    }
    return map
  }, [nodes])

  const directed = useMemo(
    () => new Set(edges.map((e) => `${e.from}|${e.to}`)),
    [edges]
  )

  return (
    <svg
      className="graph-edges-svg"
      style={{ left: bounds.minX, top: bounds.minY }}
      width={bounds.width}
      height={bounds.height}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
    >
      <defs>
        {Object.entries(REL_STYLE).map(([rel, style]) => (
          <marker
            key={rel}
            id={`arrow-${rel}`}
            viewBox="0 0 9 9"
            refX="8"
            refY="4.5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path
              d="M0,0 L9,4.5 L0,9 z"
              fill={style.hollow ? 'none' : style.color}
              stroke={style.color}
              strokeWidth={style.hollow ? 1.4 : 0}
            />
          </marker>
        ))}
      </defs>

      {edges.map((e) => {
        if (filters && filters[e.rel] === false) return null

        const style = REL_STYLE[e.rel] || FALLBACK
        const relKey = REL_STYLE[e.rel] ? e.rel : 'CALLS'
        const count = e.count || e.callCount || 1
        const width = e.rel === 'CALLS'
          ? Math.min(3, 1 + count * 0.35)
          : style.width
        const cls = [
          'graph-edge',
          `rel-${String(e.rel).toLowerCase()}`,
          e.viaFanout ? 'fanout' : '',
          pathUids && pathUids.has(e.from) && pathUids.has(e.to) ? 'on-path' : ''
        ].filter(Boolean).join(' ')

        let d = e.d
        let mid = e.mid

        if (!d) {
          const a = positioned.get(e.from)
          const b = positioned.get(e.to)
          if (!a || !b) return null

          if (e.from === e.to) {
            const x = a.x
            const y = a.y - NODE_H / 2
            d = `M ${x - 34} ${y + 14} C ${x - 70} ${y - 55}, ${x + 70} ${y - 55}, ${x + 34} ${y + 14}`
            mid = { x, y: y - 26 }
          } else if (directed.has(`${e.to}|${e.from}`)) {
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            const vx = b.x - a.x
            const vy = b.y - a.y
            const len = Math.hypot(vx, vy) || 1
            const px = -vy / len
            const py = vx / len
            const bend = Math.min(72, 26 + len * 0.12)
            const control = { x: mx + px * bend, y: my + py * bend }
            const start = boundary(a, control)
            const end = boundary(b, control)
            d = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
            mid = midOf(a, b, control)
          } else {
            const start = boundary(a, b)
            const end = boundary(b, a)
            d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
            mid = midOf(a, b)
          }
        }

        return (
          <g key={e.key || `${e.from}|${e.to}|${e.rel}`}>
            <path
              d={d}
              className={cls}
              stroke={style.color}
              strokeWidth={width}
              strokeDasharray={style.dash}
              strokeLinecap="round"
              fill="none"
              markerEnd={`url(#arrow-${relKey})`}
            >
              <title>
                {e.from} → {e.to} · {e.rel}
                {count > 1 ? ` ×${count}` : ''}
                {e.viaFanout ? '（接口扇出）' : ''}
                {e.viaBox ? '（已折叠）' : ''}
              </title>
            </path>
            {e.viaFanout && (
              <polygon
                points={diamond(mid)}
                fill={style.color}
                opacity="0.9"
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
