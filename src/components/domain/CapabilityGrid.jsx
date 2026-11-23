import { entryMethod, parseCapability } from '../../utils/domain'

/** 二级：当前领域的全部能力块，每块必须有描述。 */
export default function CapabilityGrid({ area, onOpen }) {
  const capabilities = area?.capabilities || []

  if (capabilities.length === 0) {
    return <p className="dmap-empty-note">这个领域没有可识别的入口能力。</p>
  }

  return (
    <div className="dmap-cap-grid">
      {capabilities.map((cap) => {
        const parsed = parseCapability(cap.uid, cap.name)
        return (
          <button
            key={cap.uid}
            type="button"
            className="dmap-cap"
            onClick={() => onOpen?.(cap)}
          >
            <span className="dmap-cap-title">
              <span className={`dmap-verb${parsed.isHttp ? '' : ' is-kind'}`}>{parsed.verb}</span>
              <span className="dmap-cap-path">{parsed.path}</span>
            </span>
            <span className="dmap-cap-desc">{cap.description || '暂无描述'}</span>
            <span className="dmap-cap-foot">
              <span>{cap.memberCount} 个类</span>
              {cap.entryUid && <span className="dmap-cap-entry">{entryMethod(cap.entryUid)}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
