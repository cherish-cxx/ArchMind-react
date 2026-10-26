const DIR_LABEL = { out: '扇出', in: '扇入' }

export default function GraphBox({ box, onToggle }) {
  const { rect, rel, direction, hidden, shared } = box
  return (
    <button
      type="button"
      className="graph-box"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.(box.key)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={`${rel} · ${DIR_LABEL[direction] || direction} · 点击展开`}
    >
      <span className="gb-head">
        <span className={`gb-rel rel-${String(rel).toLowerCase()}`}>{rel}</span>
        <span className="gb-count">{hidden.length} 个</span>
      </span>
      <span className="gb-sub">
        {DIR_LABEL[direction] || direction}
        {shared.length > 0 ? ` · 另有 ${shared.length} 个共享已单独显示` : ''}
      </span>
      <span className="gb-action">展开</span>
    </button>
  )
}

export function GraphBoxMarker({ marker, onCollapse }) {
  return (
    <button
      type="button"
      className="graph-box-marker"
      style={{ left: marker.rect.x, top: marker.rect.y }}
      onClick={(e) => {
        e.stopPropagation()
        onCollapse?.(marker.key)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="收起这个框"
    >
      已展开 · {marker.rel} · {marker.members.length} 个
    </button>
  )
}
