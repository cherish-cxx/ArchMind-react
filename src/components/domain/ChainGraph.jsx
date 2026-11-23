import { useEffect, useMemo, useRef, useState } from 'react'
import { exitLinks, normalizeRole, roleLabel } from '../../utils/domain'

const NODE_W = 190
const NODE_H = 52
const COL_W = 290
const ROW_GAP = 18
const TOP = 46
const EXIT_W = 220

function simpleName(uid) {
  return String(uid || '').split('.').pop()
}

function curve(a, b, dashed) {
  // 同列边：从右侧绕一段小弧回到目标右缘，避免路径向左回折
  if (Math.abs(a.x - b.x) < 0.5) {
    const edgeX = a.x + NODE_W
    const down = b.y > a.y
    const y1 = a.y + NODE_H * (down ? 0.65 : 0.35)
    const y2 = b.y + NODE_H * (down ? 0.35 : 0.65)
    const bow = 34
    return {
      d: `M${edgeX},${y1} C${edgeX + bow},${y1} ${edgeX + bow},${y2} ${edgeX},${y2}`,
      dashed
    }
  }
  const x1 = a.x + NODE_W
  const y1 = a.y + NODE_H / 2
  const x2 = b.x - 6
  const y2 = b.y + NODE_H / 2
  // 控制点不越过中点，避免长连线回折
  const run = Math.max(48, x2 - x1)
  const bend = Math.min(run * 0.42, 120)
  return {
    d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`,
    dashed
  }
}

/**
 * 三级：能力链路。列按调用深度排，边只画后端返回的真实类间调用；
 * 跨领域出口只从属于当前能力的来源类连出（虚线）。
 */
export default function ChainGraph({ members = [], edges = [], areaCalls = [], onOpenCode, onOpenArea }) {
  const scrollRef = useRef(null)
  const [overflow, setOverflow] = useState(false)

  const layout = useMemo(() => {
    const columns = new Map()
    members.forEach((member) => {
      const depth = Number.isFinite(member.depth) ? member.depth : 0
      if (!columns.has(depth)) columns.set(depth, [])
      columns.get(depth).push(member)
    })
    const maxDepth = columns.size ? Math.max(...columns.keys()) : 0

    const exits = exitLinks(areaCalls, members)
    const exitCount = exits.length

    let maxColHeight = 0
    columns.forEach((nodes) => {
      maxColHeight = Math.max(maxColHeight, nodes.length * NODE_H + (nodes.length - 1) * ROW_GAP)
    })
    const exitHeight = exitCount * NODE_H + Math.max(0, exitCount - 1) * ROW_GAP
    maxColHeight = Math.max(maxColHeight, exitHeight)

    const positions = new Map()
    const nodes = []
    columns.forEach((columnMembers, depth) => {
      const colHeight = columnMembers.length * NODE_H + (columnMembers.length - 1) * ROW_GAP
      const offset = TOP + (maxColHeight - colHeight) / 2
      columnMembers.forEach((member, index) => {
        const x = depth * COL_W + (COL_W - NODE_W) / 2
        const y = offset + index * (NODE_H + ROW_GAP)
        positions.set(member.uid, { x, y })
        nodes.push({ ...member, x, y })
      })
    })

    const exitNodes = []
    if (exitCount > 0) {
      const x = (maxDepth + 1) * COL_W + 10
      const offset = TOP + (maxColHeight - exitHeight) / 2
      exits.forEach((exit, index) => {
        const y = offset + index * (NODE_H + ROW_GAP)
        positions.set(`exit:${exit.toAreaUid}`, { x, y })
        exitNodes.push({ ...exit, x, y })
      })
    }

    const memberUids = new Set(members.map((m) => m.uid))
    const lines = edges
      .filter((edge) => memberUids.has(edge.fromUid) && memberUids.has(edge.toUid))
      .map((edge) => ({ ...curve(positions.get(edge.fromUid), positions.get(edge.toUid), false), key: `${edge.fromUid}>${edge.toUid}` }))
      .filter((line) => line.d)

    exits.forEach((exit) => {
      const target = positions.get(`exit:${exit.toAreaUid}`)
      exit.sources.forEach((sourceUid) => {
        const from = positions.get(sourceUid)
        if (!from || !target) return
        lines.push({
          ...curve(from, target, true),
          key: `exit:${sourceUid}>${exit.toAreaUid}`
        })
      })
    })

    const width = (maxDepth + 1) * COL_W + (exitCount > 0 ? EXIT_W + 24 : 0)
    const height = TOP + maxColHeight + 18
    return { nodes, exitNodes, lines, width, height, maxDepth, exits: exitCount > 0 }
  }, [members, edges, areaCalls])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 4)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [layout.width])

  if (members.length === 0) {
    return <p className="dmap-empty-note">这个能力没有可展示的成员类。</p>
  }

  const { nodes, exitNodes, lines, width, height, maxDepth, exits } = layout

  return (
    <>
      <div className="dmap-chain-wrap">
        <div className="dmap-chain-scroll" ref={scrollRef}>
          <div className="dmap-chain" style={{ width, height }}>
            <span className="dmap-chain-axis" aria-hidden="true" />
            {Array.from({ length: maxDepth + 1 }, (_, depth) => (
              <span
                key={`label-${depth}`}
                className="dmap-col-label"
                style={{ left: depth * COL_W + 10 }}
              >
                <b>{depth === 0 ? '入口' : `第 ${depth} 跳`}</b>
              </span>
            ))}
            {exits && (
              <span className="dmap-col-label" style={{ left: (maxDepth + 1) * COL_W + 10 }}>
                <b>跨领域</b>
              </span>
            )}

            <svg width={width} height={height} aria-hidden="true">
              <defs>
                <marker id="dmap-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--ink-4)' }} />
                </marker>
                <marker id="dmap-arrow-exit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--measure-border)' }} />
                </marker>
              </defs>
              {lines.map((line) => (
                <path
                  key={line.key}
                  d={line.d}
                  fill="none"
                  className={`dmap-edge${line.dashed ? ' is-exit' : ''}`}
                  markerEnd={`url(#${line.dashed ? 'dmap-arrow-exit' : 'dmap-arrow'})`}
                />
              ))}
            </svg>

            {nodes.map((node) => (
              <button
                key={node.uid}
                type="button"
                className={`dmap-node${normalizeRole(node.role) === 'entry' ? ' is-entry' : ''}`}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                onClick={() => onOpenCode?.(node.uid, node.name || simpleName(node.uid))}
                title={`打开 ${node.uid} 的源码`}
              >
                <span className="dmap-node-name">{node.name || simpleName(node.uid)}</span>
                <span className="dmap-node-sub">
                  <span>{roleLabel(node.role)}</span>
                </span>
              </button>
            ))}

            {exitNodes.map((exit) => (
              <button
                key={`exit-${exit.toAreaUid}`}
                type="button"
                className="dmap-node is-exit"
                style={{ left: exit.x, top: exit.y, width: EXIT_W - 20, height: NODE_H }}
                onClick={() => onOpenArea?.(exit.toAreaUid)}
                title={`进入 ${exit.toAreaName} 领域`}
              >
                <span className="dmap-node-name">{exit.toAreaName || exit.toAreaUid}</span>
                <span className="dmap-node-sub">跨领域调用 {exit.count} 次</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="dmap-chain-note">
        <span>列按调用深度排；节点上的文字是类在系统中的角色。点类看源码，点跨领域节点进入那个领域。</span>
        {overflow && <span className="dmap-scroll-hint">链路比屏幕宽，左右滚动查看完整调用链</span>}
      </p>
    </>
  )
}
