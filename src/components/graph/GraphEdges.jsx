import { useMemo } from 'react'

const REL_COLORS = {
  CALLS: '#8b93a7',
  EXTENDS: '#4f63d2',
  IMPLEMENTS: '#3da06a',
  DEPENDS: '#b0b4bd'
}

/**
 * 所有边画在一张 SVG 里。
 *
 * 边的方向来自后端（from → to），前端只负责画箭头；
 * 双向边用曲线向两侧错开，否则两条线会完全重合，看不出方向。
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
        {Object.entries(REL_COLORS).map(([rel, color]) => (
          <marker
            key={rel}
            id={`arrow-${rel}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={color} />
          </marker>
        ))}
      </defs>

      {edges.map((e) => {
        if (filters && filters[e.rel] === false) return null
        const a = positioned.get(e.from)
        const b = positioned.get(e.to)
        if (!a || !b) return null

        const color = REL_COLORS[e.rel] || REL_COLORS.CALLS
        const width = e.rel === 'CALLS' ? Math.min(3, 1 + (e.callCount || 1) * 0.35) : 1.4
        const cls = [
          'graph-edge',
          `rel-${String(e.rel).toLowerCase()}`,
          e.viaFanout ? 'fanout' : '',
          pathUids && pathUids.has(e.from) && pathUids.has(e.to) ? 'on-path' : ''
        ].join(' ')

        let d
        if (e.from === e.to) {
          // 自环：从节点右上角绕出去，不参与节点的矩形容器。
          const x = a.x
          const y = a.y - 50
          d = `M ${x - 34} ${y + 14} C ${x - 70} ${y - 55}, ${x + 70} ${y - 55}, ${x + 34} ${y + 14}`
        } else if (directed.has(`${e.to}|${e.from}`)) {
          // 双向边：各自沿自己方向的左侧弯，合起来就是两条分开的弧。
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          const vx = b.x - a.x
          const vy = b.y - a.y
          const len = Math.hypot(vx, vy) || 1
          const px = -vy / len
          const py = vx / len
          const bend = Math.min(64, 22 + len * 0.12)
          d = `M ${a.x} ${a.y} Q ${mx + px * bend} ${my + py * bend} ${b.x} ${b.y}`
        } else {
          d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`
        }

        return (
          <path
            key={`${e.from}|${e.to}|${e.rel}`}
            d={d}
            className={cls}
            stroke={color}
            strokeWidth={width}
            fill="none"
            markerEnd={`url(#arrow-${e.rel})`}
            style={e.viaFanout ? { strokeDasharray: '6 4' } : undefined}
          >
            <title>
              {e.from} → {e.to} · {e.rel}
              {e.callCount > 1 ? ` ×${e.callCount}` : ''}
              {e.viaFanout ? '（接口扇出）' : ''}
            </title>
          </path>
        )
      })}
    </svg>
  )
}
