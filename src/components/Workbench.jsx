import { statusMeta } from '../statusMeta'
import { IconMap, IconPlus } from '../icons'

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Workbench({
  loggedIn, user, projects = [],
  onNewProject, onOpenLogin, onOpenProject, onGoMemory, onGoProjects
}) {
  const name = user?.nickname || user?.username || ''
  const analyzed = projects.filter((p) => p.analysisStatus === 'COMPLETED').length

  const primary = () => (loggedIn ? onNewProject() : onOpenLogin())

  return (
    <div className="page page-scroll wb">
      <div className="wb-hero">
        <div>
          <h1 className="wb-title">{loggedIn ? `你好，${name}` : '欢迎使用 ArchMind'}</h1>
          <p className="wb-sub">
            上传项目 ZIP 源码并一键分析，生成项目概况与领域结构；分析过的项目会逐步沉淀成你的「记忆地图」。
          </p>
        </div>
        <div className="wb-actions">
          <button className="btn-primary wb-new" onClick={primary}>
            <IconPlus size={15} />
            <span>新建项目</span>
          </button>
        </div>
      </div>

      <div className="wb-stats">
        <div className="wb-stat">
          <span className="wb-num">{projects.length}</span>
          <span className="wb-stat-label">项目总数</span>
        </div>
        <div className="wb-stat">
          <span className="wb-num">{analyzed}</span>
          <span className="wb-stat-label">已完成分析</span>
        </div>
      </div>

      <div className="wb-section-head">
        <h2 className="wb-section-title">最近项目</h2>
        {projects.length > 0 && (
          <button className="link-more" onClick={onGoProjects}>查看全部</button>
        )}
      </div>

      {projects.length > 0 ? (
        <div className="proj-grid">
          {projects.slice(0, 6).map((p) => {
            const st = statusMeta(p.analysisStatus)
            return (
              <button
                key={p.id}
                className="wb-proj-card"
                onClick={() => onOpenProject(p)}
              >
                <div className="wb-proj-top">
                  <span className="wb-proj-name">{p.name}</span>
                  <span className={`status-pill ${st.cls}`}>{st.label}</span>
                </div>
                <p className="wb-proj-desc">{p.description || '暂无项目描述'}</p>
                <span className="wb-proj-date">创建于 {fmtDate(p.createTime)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="wb-empty">
          <p className="wb-empty-title">
            {loggedIn ? '还没有项目' : '登录后即可管理项目'}
          </p>
          <p className="wb-empty-sub">
            新建项目 → 上传 ZIP 源码 → 自动生成项目概况与领域地图
          </p>
          <button className="btn-primary wb-empty-btn" onClick={primary}>
            <IconPlus size={15} />
            <span>新建项目</span>
          </button>
        </div>
      )}

      <div className="wb-section-head" style={{ marginTop: 28 }}>
        <h2 className="wb-section-title">知识沉淀</h2>
      </div>
      <button className="wb-memory" onClick={onGoMemory}>
        <div className="wb-memory-icon"><IconMap size={20} /></div>
        <div className="wb-memory-body">
          <span className="wb-memory-title">进入记忆地图</span>
          <span className="wb-memory-sub">从项目里的类开始探索，Agent 会沿着调用关系逐步讲解</span>
        </div>
        <span className="wb-memory-arrow">→</span>
      </button>
    </div>
  )
}
