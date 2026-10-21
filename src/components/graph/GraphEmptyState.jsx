import { useMemo, useState } from 'react'
import ClassPicker from './ClassPicker'
import { IconRefresh, IconUpload, IconFolder } from '../../icons'

function GroupByPackage(classes) {
  const map = new Map()
  for (const c of classes) {
    const pkg = c.packageName || '(默认包)'
    if (!map.has(pkg)) map.set(pkg, [])
    map.get(pkg).push(c)
  }
  return [...map.entries()]
    .map(([pkg, list]) => ({ pkg, list }))
    .sort((a, b) => b.list.length - a.list.length || a.pkg.localeCompare(b.pkg))
}

/**
 * 首屏入口卡。只在图上没有节点时出现。
 *
 * 它的存在不是装饰：V1 的 Agent 必须有一个类作为锚点，
 * 所以首屏的任务是「让用户先选中一个类」，而不是展示一张全量图。
 */
export default function GraphEmptyState({
  loggedIn,
  currentProject,
  projectsCount,
  overview,
  classes,
  classesLoading,
  classesError,
  analyzing,
  onAnalyze,
  onUpload,
  onGoProjects,
  onOpenLogin,
  onPickClass
}) {
  const [openPkg, setOpenPkg] = useState(null)

  const groups = useMemo(() => GroupByPackage(classes || []), [classes])
  const core = useMemo(
    () => (classes || []).filter((c) => c.description).slice(0, 8),
    [classes]
  )

  if (!loggedIn) {
    return (
      <div className="graph-empty">
        <div className="ge-card">
          <h2 className="ge-title">登录后开始探索</h2>
          <p className="ge-sub">代码图谱会随着项目分析沉淀，登录后才能读取你的项目。</p>
          <button className="btn-primary ge-btn" onClick={onOpenLogin}>登录</button>
        </div>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="graph-empty">
        <div className="ge-card">
          <h2 className="ge-title">还没有打开项目</h2>
          <p className="ge-sub">
            {projectsCount > 0
              ? '从左侧打开一个已分析的项目，或先在「我的项目」里选择。'
              : '先新建项目并上传 ZIP 源码，分析完成后就能在这里从类开始探索。'}
          </p>
          <button className="btn-primary ge-btn" onClick={onGoProjects}>
            <IconFolder size={15} />
            打开我的项目
          </button>
        </div>
      </div>
    )
  }

  if (analyzing) {
    return (
      <div className="graph-empty">
        <div className="ge-card">
          <h2 className="ge-title">正在分析 {currentProject.name}</h2>
          <p className="ge-sub">分析完成后，类清单与代码关系会出现在这里。</p>
          <div className="ge-progress"><span /></div>
        </div>
      </div>
    )
  }

  if (classesLoading) {
    return (
      <div className="graph-empty">
        <div className="ge-card">
          <h2 className="ge-title">正在读取类清单…</h2>
        </div>
      </div>
    )
  }

  if (!classes || classes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="ge-card">
          <h2 className="ge-title">{currentProject.name} 还没有代码图</h2>
          <p className="ge-sub">
            {classesError || '先上传源码并完成分析，才能从类开始探索。'}
          </p>
          <div className="ge-actions">
            <button className="btn-primary ge-btn" onClick={onUpload}>
              <IconUpload size={15} />
              上传源码
            </button>
            <button className="btn-ghost ge-btn-secondary" onClick={onAnalyze}>
              <IconRefresh size={15} />
              开始分析
            </button>
          </div>
        </div>
      </div>
    )
  }

  const shown = openPkg ? groups.find((g) => g.pkg === openPkg) : null

  return (
    <div className="graph-empty">
      <div className="ge-card ge-card-wide">
        <div className="ge-eyebrow">代码探索</div>
        <h2 className="ge-title">从代码开始探索</h2>
        <p className="ge-sub">
          {overview?.summary || currentProject.description || '选择一个类作为起点，再向 Agent 提问。'}
        </p>

        <ClassPicker
          classes={classes}
          onSelect={onPickClass}
          variant="inline"
          placeholder="搜索类名，或从下面的核心类开始"
        />

        {core.length > 0 && (
          <div className="ge-block">
            <div className="ge-block-title">核心类</div>
            <div className="ge-chips">
              {core.map((c) => (
                <button
                  key={c.qualifiedName}
                  className="ge-chip"
                  onClick={() => onPickClass(c)}
                  title={c.qualifiedName}
                >
                  <span className="ge-chip-name">{c.simpleName || c.qualifiedName}</span>
                  <span className="ge-chip-pkg">{c.packageName || '(默认包)'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ge-block">
          <div className="ge-block-title">
            按包浏览
            <span className="ge-count">共 {classes.length} 个类</span>
          </div>
          <div className="ge-pkgs">
            {groups.slice(0, 8).map((g) => (
              <button
                key={g.pkg}
                className={`ge-pkg ${openPkg === g.pkg ? 'active' : ''}`}
                onClick={() => setOpenPkg(openPkg === g.pkg ? null : g.pkg)}
              >
                <span className="ge-pkg-name">{g.pkg}</span>
                <span className="ge-pkg-count">{g.list.length}</span>
              </button>
            ))}
          </div>

          {shown && (
            <div className="ge-pkg-classes">
              {shown.list.slice(0, 16).map((c) => (
                <button
                  key={c.qualifiedName}
                  className="ge-class-btn"
                  onClick={() => onPickClass(c)}
                  title={c.qualifiedName}
                >
                  {c.simpleName || c.qualifiedName}
                </button>
              ))}
              {shown.list.length > 16 && (
                <span className="ge-more">还有 {shown.list.length - 16} 个，用搜索定位</span>
              )}
            </div>
          )}
        </div>

        <p className="ge-hint">
          选中类之后，可以向 Agent 问「它的调用链是什么」「谁调用了它」。
        </p>
      </div>
    </div>
  )
}
