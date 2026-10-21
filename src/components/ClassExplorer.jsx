import { useEffect, useState } from 'react'
import { listClasses, classRelations } from '../api/project'

// 类清单按包分组，点击类查看上下游关联
function groupByPackage(classes) {
  const map = new Map()
  for (const c of classes || []) {
    const pkg = c.packageName || ''
    if (!map.has(pkg)) map.set(pkg, [])
    map.get(pkg).push(c)
  }
  return [...map.entries()].map(([packageName, list]) => ({ packageName, classes: list }))
}

function kindMark(kind) {
  if (kind === 'INTERFACE') return 'I'
  if (kind === 'ENUM') return 'E'
  return 'C'
}

function RelationList({ title, items, onSelect }) {
  if (!items || items.length === 0) return null
  return (
    <div className="ce-block">
      <div className="ce-block-title">{title}</div>
      {items.map((it) => (
        <button
          key={it.clazz.qualifiedName}
          className="ce-item"
          onClick={() => onSelect(it.clazz.qualifiedName)}
          title={it.clazz.qualifiedName}
        >
          <span className="ce-item-row">
            <span className="ce-item-name">{it.clazz.simpleName}</span>
            <span className="ce-item-type">{it.relationType}</span>
            {(it.evidence || []).length > 0 && (
              <span className="ce-evidence">{(it.evidence || []).join('；')}</span>
            )}
          </span>
          {it.clazz.description && <span className="ce-desc">{it.clazz.description}</span>}
        </button>
      ))}
    </div>
  )
}

function Relations({ relations, loading, onSelect }) {
  if (loading) return <p className="ce-empty">查询关联中…</p>
  if (!relations) return <p className="ce-empty">从左侧选择一个类，查看它的上下游关联。</p>
  if (relations.error) return <p className="ce-empty">{relations.error}</p>

  const up = relations.upstream || {}
  const down = relations.downstream || {}
  const hasAny = [up.callers, up.dependents, up.subclasses, down.callees, down.dependencies, down.parents]
    .some((l) => l && l.length > 0)

  return (
    <div>
      <div className="ce-center">
        <span className="ce-center-name">{relations.center?.simpleName}</span>
        <span className="ce-center-pkg">{relations.center?.packageName}</span>
        {relations.center?.description && (
          <span className="ce-center-desc">{relations.center.description}</span>
        )}
      </div>

      <div className="ce-dir">上游 · 谁指向我</div>
      <RelationList title="被调用" items={up.callers} onSelect={onSelect} />
      <RelationList title="被依赖" items={up.dependents} onSelect={onSelect} />
      <RelationList title="被继承 / 实现" items={up.subclasses} onSelect={onSelect} />

      <div className="ce-dir">下游 · 我指向谁</div>
      <RelationList title="调用" items={down.callees} onSelect={onSelect} />
      <RelationList title="依赖" items={down.dependencies} onSelect={onSelect} />
      <RelationList title="继承 / 实现" items={down.parents} onSelect={onSelect} />

      {!hasAny && <p className="ce-empty">该类暂无项目内关联。</p>}
    </div>
  )
}

export default function ClassExplorer({ projectId }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [relations, setRelations] = useState(null)
  const [relationsLoading, setRelationsLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setLoading(true)
    setError('')
    listClasses(projectId)
      .then((list) => { if (alive) setClasses(list || []) })
      .catch((e) => { if (alive) setError(e?.message || '类清单加载失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  const selectClass = async (uid) => {
    setSelected(uid)
    setRelations(null)
    setRelationsLoading(true)
    try {
      const data = await classRelations(projectId, uid)
      setRelations(data)
    } catch (e) {
      setRelations({ error: e?.message || '关联查询失败' })
    } finally {
      setRelationsLoading(false)
    }
  }

  const groups = groupByPackage(classes)

  return (
    <div className="pd-section">
      <div className="pd-section-head">
        <h2 className="pd-section-title">代码探索</h2>
        <span className="pd-section-note">点击类查看调用 / 依赖 / 继承关系</span>
      </div>

      {loading ? (
        <p className="pd-empty-note">正在加载类清单…</p>
      ) : error ? (
        <p className="pd-empty-note">{error}</p>
      ) : classes.length === 0 ? (
        <p className="pd-empty-note">分析完成后，这里将列出项目的类，点击即可查看上下游关联。</p>
      ) : (
        <div className="ce-layout">
          <div className="ce-list">
            {groups.map((g) => (
              <div key={g.packageName} className="ce-group">
                <div className="ce-group-name">{g.packageName || '(默认包)'}</div>
                {g.classes.map((c) => (
                  <button
                    key={c.qualifiedName}
                    className={`ce-class ${selected === c.qualifiedName ? 'active' : ''}`}
                    onClick={() => selectClass(c.qualifiedName)}
                    title={c.qualifiedName}
                  >
                    <span className={`ce-kind ${c.description ? 'core' : ''}`}>{kindMark(c.kind)}</span>
                    <span className="ce-body">
                      <span className="ce-simple">{c.simpleName}</span>
                      {c.description && <span className="ce-desc">{c.description}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="ce-detail">
            <Relations relations={relations} loading={relationsLoading} onSelect={selectClass} />
          </div>
        </div>
      )}
    </div>
  )
}
