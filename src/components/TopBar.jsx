import { useEffect, useRef, useState } from 'react'
import ClassPicker from './graph/ClassPicker'
import {
  IconSearch,
  IconFilter,
  IconMinus,
  IconPlus,
  IconFullscreen
} from '../icons'

const RELS = [
  { key: 'CALLS', label: '调用' },
  { key: 'EXTENDS', label: '继承' },
  { key: 'IMPLEMENTS', label: '实现' },
  { key: 'DEPENDS', label: '依赖' }
]

/**
 * 记忆地图页的顶部栏。
 *
 * 和旧版相比，搜索源从 mapData 换成了真实类清单，并加了项目切换：
 * Agent 的锚点属于某个项目，页面上必须能看见「现在在看哪个项目」。
 */
export default function TopBar({
  projects = [],
  currentProject,
  onOpenProject,
  classes = [],
  onPickClass,
  relFilters,
  onToggleRel,
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
  onFullscreen
}) {
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilter(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <header className="topbar">
      <nav className="breadcrumb">
        <span className="crumb">记忆地图</span>
        {currentProject ? (
          <>
            <span className="crumb-sep">/</span>
            <select
              className="project-select"
              value={currentProject.id}
              onChange={(e) => {
                const p = projects.find((x) => String(x.id) === e.target.value)
                if (p) onOpenProject?.(p)
              }}
              title="切换项目"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        ) : (
          <span className="crumb-hint">先在「我的项目」里打开一个项目</span>
        )}
      </nav>

      <div className="topbar-actions">
        <ClassPicker
          classes={classes}
          onSelect={onPickClass}
          placeholder={currentProject ? '搜索类名…' : '先选择项目'}
        />

        <div className="rel-filter" ref={filterRef}>
          <button
            className={`icon-btn has-label ${showFilter ? 'active' : ''}`}
            onClick={() => setShowFilter((v) => !v)}
            title="筛选关系"
          >
            <IconFilter size={15} />
            <span>关系</span>
          </button>
          {showFilter && (
            <div className="rel-filter-panel">
              {RELS.map((r) => (
                <label key={r.key} className="rel-option">
                  <input
                    type="checkbox"
                    checked={relFilters?.[r.key] !== false}
                    onChange={() => onToggleRel?.(r.key)}
                  />
                  <span className={`rel-dot rel-${r.key.toLowerCase()}`} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="zoom-ctrl">
          <button className="icon-btn" onClick={onZoomOut} title="缩小">
            <IconMinus size={15} />
          </button>
          <span className="zoom-value">{Math.round((scale || 1) * 100)}%</span>
          <button className="icon-btn" onClick={onZoomIn} title="放大">
            <IconPlus size={15} />
          </button>
          <button className="icon-btn has-label" onClick={onFit} title="适配视图">
            <IconSearch size={14} />
            <span>适配</span>
          </button>
          <button className="icon-btn" onClick={onFullscreen} title="全屏">
            <IconFullscreen size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
