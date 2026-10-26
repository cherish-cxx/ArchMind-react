import { NODE_W, NODE_H } from '../../graph/layout'

/**
 * 一个类节点。默认只显示「类型 + 类名」，保持画布干净；
 * 包名、描述、入/出关系数放在悬停（或键盘聚焦）后展开的详情卡里。
 *
 * 根节点是 div[role=button] 而不是 button —— 卡片里还要放一个「打开焦点视图」
 * 按钮，button 不能嵌套。
 */
export default function GraphNodeCard({
  node, degree, pending, selected, focused, hasGap, onPath, onClick, onOpen, onFocus
}) {
  const kind = (node.kind || 'CLASS').toLowerCase()
  const inbound = degree?.in ?? 0
  const outbound = degree?.out ?? 0
  const description = node.description || ''
  // 核心 / 次核心只影响左侧标记，不碰边框 —— 边框已经用来表示类型了
  const tier = node.core === true ? 'tier-core' : (description ? 'tier-secondary' : '')
  const tierLabel = node.core === true ? '核心类' : (description ? '已描述' : '')
  const name = node.name || node.uid

  return (
    <div
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
      role="button"
      tabIndex={0}
      aria-label={`${node.uid}${description ? `，${description}` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(node.uid)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen?.(node.uid)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick?.(node.uid)
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="gn-head">
        <span className="gn-kind">{(node.kind || 'CLASS').slice(0, 1)}</span>
        <span className="gn-name">{name}</span>
        {hasGap && <span className="gn-gap" title="链路在这里中断">断</span>}
      </span>

      <button
        type="button"
        className="gn-focus"
        title="打开焦点视图"
        aria-label={`打开 ${name} 的焦点视图`}
        onClick={(e) => {
          e.stopPropagation()
          onFocus?.(node.uid)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ↗
      </button>

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
    </div>
  )
}
