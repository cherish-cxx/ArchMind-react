/**
 * 画布底部状态条。存在的理由：让「图不完整」这件事一直可见。
 *  - 断点数：链路在这里停了；
 *  - 截断：后端下发的 patch 达到上限；
 *  - 锚点：下一轮提问会用到的 focus。
 */
export default function GraphStatusBar({
  nodes,
  edges,
  gaps,
  truncated,
  focusLabel,
  onRelayout
}) {
  return (
    <div className="graph-statusbar">
      <span className="gs-anchor">
        {focusLabel ? (
          <>
            锚点：<b>{focusLabel}</b>
          </>
        ) : (
          '未选择锚点 · 先点一个类'
        )}
      </span>

      <span className="gs-counts">
        节点 {nodes} · 关系 {edges} · 断点 {gaps}
      </span>

      <span className="gs-right">
        {(truncated || gaps > 0) && (
          <span className="gs-warn">
            {truncated ? '本轮图被截断，不是全部' : '存在未解析断点'}
          </span>
        )}
        {nodes > 0 && (
          <button className="gs-action" onClick={onRelayout}>重新布局</button>
        )}
      </span>
    </div>
  )
}
