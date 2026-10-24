import { NODE_W, NODE_H } from '../../graph/layout'

/**
 * 一个类节点。方法不是节点 —— V1 的图粒度是类级，
 * 方法只会通过 citation 落在 owner 类的详情里。
 */
export default function GraphNodeCard({ node, selected, focused, hasGap, onPath, onClick, onOpen }) {
  const kind = (node.kind || 'CLASS').toLowerCase()
  const edgeCount = node.edgeCount ?? 0

  return (
    <button
      type="button"
      className={[
        'graph-node',
        `kind-${kind}`,
        selected ? 'selected' : '',
        focused ? 'focused' : '',
        hasGap ? 'has-gap' : '',
        onPath ? 'on-path' : ''
      ].join(' ')}
      style={{
        left: node.x - NODE_W / 2,
        top: node.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H
      }}
      title={`${node.uid}${node.description ? `\n${node.description}` : ''}`}
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
      <span className="gn-pkg">{node.packageName || '(默认包)'}</span>
      <span className="gn-foot">
        {edgeCount > 0 && <span className="gn-edge-count">{edgeCount} 条关系</span>}
        {node.viaFanout && <span className="gn-fanout">扇出</span>}
        {node.depth !== undefined && node.depth !== null && (
          <span className="gn-depth">第 {node.depth} 层</span>
        )}
      </span>
    </button>
  )
}
