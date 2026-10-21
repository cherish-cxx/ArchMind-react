import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSearch } from '../../icons'

/**
 * 类选择器 —— V1 的「语义入口」替代品。
 *
 * 后端没有 embedding，用户必须给出一个类名才能开始问。
 * 所以这个组件不是普通搜索框：它同时承担「发现有哪些类」的职责，
 * 空查询时直接推荐有 description 的核心类。
 */
export default function ClassPicker({
  classes = [],
  onSelect,
  placeholder = '搜索类名，或从核心类开始',
  variant = 'bar',
  autoFocus = false
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const term = query.trim().toLowerCase()

  const matches = useMemo(() => {
    if (!classes.length) return []
    if (!term) {
      const core = classes.filter((c) => c.description)
      return (core.length ? core : classes).slice(0, 8)
    }
    const scored = []
    for (const c of classes) {
      const simple = (c.simpleName || '').toLowerCase()
      const full = (c.qualifiedName || '').toLowerCase()
      if (!simple.includes(term) && !full.includes(term)) continue
      const score = simple === term ? 0 : simple.startsWith(term) ? 1 : 2
      scored.push({ c, score })
    }
    scored.sort((a, b) => a.score - b.score || (a.c.simpleName || '').localeCompare(b.c.simpleName || ''))
    return scored.slice(0, 10).map((x) => x.c)
  }, [classes, term])

  const pick = (clazz) => {
    if (!clazz) return
    setQuery('')
    setOpen(false)
    onSelect?.(clazz)
  }

  return (
    <div className={`class-picker ${variant}`} ref={boxRef}>
      <div className="class-picker-input">
        <IconSearch size={14} className="class-picker-icon" />
        <input
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              e.preventDefault()
              pick(matches[0])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
      </div>

      {open && (
        <div className="class-picker-menu">
          <div className="class-picker-caption">
            {term ? `匹配 ${matches.length} 个` : '核心类'}
            <span className="class-picker-total">共 {classes.length} 个类</span>
          </div>

          {matches.length === 0 ? (
            <div className="class-picker-empty">
              {classes.length === 0
                ? '暂无类数据：项目分析完成后才有代码图。'
                : '没有匹配的类，试试包名或全限定名。'}
            </div>
          ) : (
            matches.map((c) => (
              <button
                key={c.qualifiedName}
                className="class-picker-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                title={c.qualifiedName}
              >
                <span className={`cp-kind kind-${(c.kind || 'CLASS').toLowerCase()}`}>
                  {(c.kind || 'CLASS').slice(0, 1)}
                </span>
                <span className="cp-body">
                  <span className="cp-name">{c.simpleName || c.qualifiedName}</span>
                  <span className="cp-pkg">{c.packageName || '(默认包)'}</span>
                  {c.description && <span className="cp-desc">{c.description}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
