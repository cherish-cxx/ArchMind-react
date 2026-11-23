import { useEffect, useMemo, useRef, useState } from 'react'
import { cellSizeClass, splitAreas, treemap } from '../../utils/domain'

/**
 * 业务版图：领域按类数拼成一张连续地图，基础设施作为版图外的斜纹条。
 * 尺寸随容器变化重算；窄屏(<760)退化为单列纵向版图，保证描述可读。
 */
export default function DomainMap({ areas = [], compact = false, onOpen }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0, stacked: false })
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const stacked = w > 0 && w < 760
      let h = 0
      if (!stacked) {
        const ratio = compact ? 0.34 : 0.52
        const min = compact ? 210 : 340
        const max = compact ? 300 : 520
        h = Math.round(Math.min(max, Math.max(min, w * ratio)))
      }
      setSize({ w, h, stacked })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // 容器在隐藏面板/后台标签里可能是 0 宽，恢复可见时不一定会触发 ResizeObserver
    window.addEventListener('resize', measure)
    const onVisible = () => { if (!document.hidden) measure() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [compact])

  const { business, infrastructure } = useMemo(() => splitAreas(areas), [areas])

  const cells = useMemo(() => {
    if (!size.w) return []
    if (size.stacked) return business.map((area) => ({ area, stacked: true }))
    const items = business.map((area) => ({ key: area.uid, value: area.classCount || 0, area }))
    return treemap(items, 0, 0, size.w, size.h)
  }, [business, size])

  const captionArea = hover
  const infraClasses = infrastructure?.classCount || 0

  return (
    <div className="dmap-map-wrap">
      <div
        ref={wrapRef}
        className={`dmap-map${size.stacked ? ' is-stacked' : ''}`}
        style={size.stacked ? undefined : { height: `${size.h}px` }}
      >
        {cells.map(({ area, x, y, w, h, stacked }) => {
          const cls = stacked ? 'is-stacked-cell' : cellSizeClass(w, h)
          const showDesc = stacked || cls === 'is-lg' || cls === 'is-md'
          const capCount = area.capabilities?.length || 0
          return (
            <button
              key={area.uid}
              type="button"
              className={`dmap-cell ${cls}${hover?.uid === area.uid ? ' is-hover' : ''}`}
              style={stacked ? undefined : { left: x, top: y, width: `${w - 1}px`, height: `${h - 1}px` }}
              aria-label={`${area.name}，${capCount} 个能力，${area.classCount || 0} 个类。${area.description || ''}`}
              onMouseEnter={() => setHover(area)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(area)}
              onBlur={() => setHover(null)}
              onClick={() => onOpen?.(area)}
            >
              <span className="dmap-cell-name">{area.name}</span>
              <span className="dmap-cell-meta">{capCount} 个能力，{area.classCount || 0} 个类</span>
              {showDesc && area.description && <span className="dmap-cell-desc">{area.description}</span>}
              {showDesc && <span className="dmap-cell-open">进入这个领域</span>}
            </button>
          )
        })}
      </div>

      {!compact && (
        <p className="dmap-caption" aria-live="polite">
          {captionArea ? (
            <>
              <b>{captionArea.name}</b>
              <span className="dmap-caption-nums">
                {captionArea.capabilities?.length || 0} 个能力，{captionArea.classCount || 0} 个类
              </span>
              {captionArea.description && <span>{captionArea.description}</span>}
            </>
          ) : (
            <span>选择一个领域，查看它的能力</span>
          )}
        </p>
      )}

      {infrastructure && (
        <div className="dmap-infra">
          <span className="dmap-infra-tag">基础设施</span>
          <span>{infraClasses} 个类</span>
          <span className="dmap-sep" />
          <span className="dmap-infra-note">
            {infrastructure.description || '不产出能力，类通过调用边被业务能力使用'}
          </span>
        </div>
      )}
    </div>
  )
}
