/**
 * 画布标签条：累积视图固定在最左，焦点视图按打开顺序排。
 * 这不是路由 —— 切换只换页面状态，画布组件复用。
 */
export default function GraphTabs({ pages, activeId, onActivate, onClose }) {
  const ordered = [...pages].sort((a, b) => {
    if (a.kind === 'cumulative') return -1
    if (b.kind === 'cumulative') return 1
    return a.openedSeq - b.openedSeq
  })

  return (
    <div className="graph-tabs" role="tablist" aria-label="画布页面">
      {ordered.map((page) => {
        const label =
          page.kind === 'cumulative'
            ? '累积视图'
            : String(page.centerUid || '').split('.').pop()
        return (
          <div
            key={page.id}
            className={`graph-tab${page.id === activeId ? ' active' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={page.id === activeId}
              className="gt-label"
              title={page.centerUid || '累积视图'}
              onClick={() => onActivate(page.id)}
            >
              {label}
            </button>
            {page.kind === 'focus' && (
              <button
                type="button"
                className="gt-close"
                title="关闭"
                onClick={() => onClose(page.id)}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
