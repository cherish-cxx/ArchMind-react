import { useMemo } from 'react'
import { statusMeta, nextStep, needsAttention } from '../statusMeta'
import { groupConversations } from '../utils/conversationGroups'
import ConversationGroups from './conversations/ConversationGroups'
import { IconPlus } from '../icons'

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtRelative(value) {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  return fmtDate(value)
}

export default function Workbench({
  loggedIn, user, projects = [], conversations = [],
  onNewProject, onOpenLogin, onOpenProject, onOpenConversation, onOpenMap,
  onUpload, onAnalyze, onGoProjects
}) {
  const name = user?.nickname || user?.username || ''
  const primary = () => (loggedIn ? onNewProject() : onOpenLogin())

  const conversationGroups = useMemo(
    () => groupConversations(conversations, projects),
    [conversations, projects]
  )

  const latestConversation = useMemo(() => {
    let latest = null
    for (const c of conversations) {
      if (!latest || new Date(c.updatedAt || 0) > new Date(latest.updatedAt || 0)) latest = c
    }
    return latest
  }, [conversations])

  const latestProject = latestConversation
    ? projects.find((p) => String(p.id) === String(latestConversation.projectId))
    : null

  // 项目台账按“最近活动”排，而不是创建时间：刚探索过的项目应该在最上面。
  const activityByProject = useMemo(() => {
    const map = new Map()
    for (const c of conversations) {
      const pid = String(c.projectId)
      const t = new Date(c.updatedAt || 0).getTime()
      const prev = map.get(pid)
      if (!prev || t > prev.time) map.set(pid, { time: t, at: c.updatedAt })
    }
    return map
  }, [conversations])

  const orderedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const delta = (activityByProject.get(String(b.id))?.time || 0)
        - (activityByProject.get(String(a.id))?.time || 0)
      if (delta !== 0) return delta
      return new Date(b.createTime || 0) - new Date(a.createTime || 0)
    })
  }, [projects, activityByProject])

  const todos = useMemo(
    () => orderedProjects.filter(needsAttention).slice(0, 4),
    [orderedProjects]
  )

  const runStep = (project, step) => {
    if (step.action === 'upload') return onUpload?.(project)
    if (step.action === 'analyze') return onAnalyze?.(project)
    if (step.action === 'map') return onOpenMap?.(project)
    return onOpenProject?.(project)
  }

  const projectActivity = (project) => {
    const activity = activityByProject.get(String(project.id))
    return activity?.at ? fmtRelative(activity.at) : fmtDate(project.createTime)
  }

  return (
    <div className="page page-scroll wb">
      <header className="wb-hero">
        <div className="wb-hero-copy">
          <h1 className="wb-title">{loggedIn ? `你好，${name}` : '欢迎使用 ArchMind'}</h1>
          <p className="wb-sub">
            上传项目 ZIP 源码并一键分析，生成项目概况与领域结构；分析过的项目会逐步沉淀成你的「记忆地图」。
          </p>
        </div>
        <button className="btn-primary wb-new" onClick={primary}>
          <IconPlus size={15} />
          <span>新建项目</span>
        </button>
      </header>

      {!loggedIn ? (
        <div className="wb-empty wb-empty-wide">
          <p className="wb-empty-title">登录后即可管理项目</p>
          <p className="wb-empty-sub">新建项目 → 上传 ZIP 源码 → 自动生成项目概况与领域地图</p>
          <button className="btn-primary wb-empty-btn" onClick={primary}>
            <IconPlus size={15} />
            <span>登录 / 新建项目</span>
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="wb-empty wb-empty-wide">
          <p className="wb-empty-title">还没有项目</p>
          <p className="wb-empty-sub">新建项目 → 上传 ZIP 源码 → 自动生成项目概况与领域地图</p>
          <button className="btn-primary wb-empty-btn" onClick={primary}>
            <IconPlus size={15} />
            <span>新建项目</span>
          </button>
        </div>
      ) : (
        <>
          {latestConversation && latestProject && (
            <section className="wb-resume">
              <div className="wb-resume-body">
                <span className="wb-resume-label">继续上次</span>
                <h2 className="wb-resume-title">{latestConversation.title || '新会话'}</h2>
                <p className="wb-resume-meta">
                  {latestProject.name}
                  {latestConversation.turnCount > 0 ? ` · ${latestConversation.turnCount} 轮` : ''}
                  {latestConversation.updatedAt ? ` · ${fmtRelative(latestConversation.updatedAt)}` : ''}
                </p>
              </div>
              <button
                className="btn-primary wb-resume-btn"
                onClick={() => onOpenConversation?.(latestConversation)}
              >
                继续探索
              </button>
            </section>
          )}

          <div className="wb-desk">
            <section className="wb-desk-main">
              <div className="wb-section-head">
                <h2 className="wb-section-title">项目</h2>
                <div className="wb-section-tools">
                  <span className="wb-section-note">{projects.length} 个</span>
                  <button className="link-more" onClick={onGoProjects}>全部项目</button>
                </div>
              </div>

              <ul className="wb-ledger">
                {orderedProjects.slice(0, 8).map((p) => {
                  const st = statusMeta(p.analysisStatus)
                  const step = nextStep(p)
                  return (
                    <li className="wb-ledger-row" key={p.id}>
                      <button className="wb-ledger-main" onClick={() => onOpenProject?.(p)}>
                        <span className="wb-ledger-name">{p.name}</span>
                        <span className="wb-ledger-desc">{p.description || '暂无项目描述'}</span>
                      </button>
                      <span className={`status-pill ${st.cls}`}>{st.label}</span>
                      <span className="wb-ledger-time">{projectActivity(p)}</span>
                      <button
                        type="button"
                        className={`wb-step${step.action === 'map' ? ' is-primary' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          runStep(p, step)
                        }}
                      >
                        {step.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <aside className="wb-desk-side">
              <div className="wb-section-head">
                <h2 className="wb-section-title">待办</h2>
                {todos.length > 0 && <span className="wb-section-note">{todos.length}</span>}
              </div>

              {todos.length > 0 ? (
                <ul className="wb-todo-list">
                  {todos.map((p) => {
                    const step = nextStep(p)
                    return (
                      <li className="wb-todo-row" key={p.id}>
                        <span className="wb-todo-name" title={p.name}>{p.name}</span>
                        <span className="wb-todo-state">{statusMeta(p.analysisStatus).label}</span>
                        <button
                          type="button"
                          className="wb-step"
                          onClick={() => runStep(p, step)}
                        >
                          {step.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="wb-quiet">全部项目都已分析完成。</p>
              )}

              <div className="wb-section-head wb-side-head">
                <h2 className="wb-section-title">最近会话</h2>
              </div>

              {conversationGroups.length > 0 ? (
                <ConversationGroups
                  groups={conversationGroups}
                  onOpenConversation={onOpenConversation}
                  variant="workbench"
                  persistKey="workbench"
                  defaultExpanded="all"
                  maxGroups={3}
                  maxPerGroup={3}
                />
              ) : (
                <p className="wb-quiet">还没有会话，打开一个项目开始探索。</p>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
