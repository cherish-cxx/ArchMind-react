import { NODE_W, NODE_H } from '../../graph/layout'

/**
 * 一个类节点。默认只显示「类型 + 类名」，保持画布干净；
 * 包名、描述、入/出关系数放在悬停（或键盘聚焦）后展开的详情卡里。
 *
 * 方法不是节点 —— V1 的图粒度是类级，方法只会通过 citation 落在 owner 类的详情里。
 */
export default function GraphNodeCard({
  node, degree, pending, selected, focused, hasGap, onPath, onClick, onOpen
}) {
  const kind = (node.kind || 'CLASS').toLowerCase()
  const inbound = degree?.in ?? 0
  const outbound = degree?.out ?? 0
  const description = node.description || ''
  // 核心 / 次核心只影响左侧标记，不碰边框 —— 边框已经用来表示类型了
  const tier = node.core === true ? 'tier-core' : (description ? 'tier-secondary' : '')
  const tierLabel = node.core === true ? '核心类' : (description ? '已描述' : '')

  return (
    <button
      type="button"
      className={[
        'graph-node',
        `kind-${kind}`,
        tier,
        selected ? 'selected' : '',
        focused ? 'focused' : '',
        hasGap ? 'has-gap' : '',
        onPath ? 'on-path' : ''
      ].filter(Boolean).join(' ')}
      style={{
        left: node.x - NODE_W / 2,
        top: node.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H
      }}
      aria-label={`${node.uid}${description ? `，${description}` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(node.uid)
        // 键盘触发的 click 没有 detail，双击事件也不会来，直接开窗兜底
        if (e.detail === 0) onOpen?.(node.uid)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen?.(node.uid)
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="gn-head">
        <span className="gn-kind">{(node.kind || 'CLASS').slice(0, 1)}</span>
        <span className="gn-name">{node.name || node.uid}</span>
        {hasGap && <span className="gn-gap" title="链路在这里中断">断</span>}
      </span>

      <span className="gn-detail" role="tooltip">
        <span className="gn-detail-head">
          <span className="gn-detail-name">{node.uid}</span>
          {tierLabel && <span className={`gn-tier-label ${node.core === true ? 'is-core' : ''}`}>{tierLabel}</span>}
        </span>
        <span className="gn-pkg">{node.packageName || '(默认包)'}</span>
        <span className={`gn-desc${description ? '' : ' is-empty'}`}>
          {description || (pending ? '描述生成中…' : '暂无描述')}
        </span>
        <span className="gn-foot">
          <span className="gn-degree">入 {inbound} · 出 {outbound}</span>
          {node.viaFanout && <span className="gn-fanout">扇出</span>}
          {node.depth !== undefined && node.depth !== null && (
            <span className="gn-depth">第 {node.depth} 层</span>
          )}
        </span>
      </span>
    </button>
  )
}
