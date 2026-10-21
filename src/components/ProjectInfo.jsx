import { IconRefresh } from '../icons'

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const SKELETON_CELLS = ['开发语言', '技术栈', '模块数量', '同步状态']

function Cell({ label, children }) {
  return (
    <div className="pi-module">
      <span className="pi-label">{label}</span>
      <span className="pi-value">{children}</span>
    </div>
  )
}

export default function ProjectInfo({
  loggedIn, currentProject, hasProjects, uploadInfo, overview, analyzing, error, onAnalyze
}) {
  if (!loggedIn) {
    return (
      <section className="project-info">
        <div className="pi-main">
          <h1 className="pi-name">ArchMind</h1>
          <p className="pi-desc">登录后可新建项目并分析概况 · 记忆地图从你分析的项目开始</p>
        </div>
        <Cell label="状态">
          <span className="pi-value sync">
            <span className="dot-off" />
            未登录
          </span>
        </Cell>
      </section>
    )
  }

  const projectName = currentProject?.name
  const canAnalyze = !!currentProject

  // 概况字段对齐后端 ProjectOverviewResponse（无 projectName / source 字段）
  const lang = overview?.techStack?.find((t) => t.category === '语言')
  const stack = overview?.techStack?.filter((t) => t.category !== '语言').slice(0, 4) ?? []

  if (error) {
    return (
      <section className="project-info">
        <div className="pi-main">
          <h1 className="pi-name">{projectName ?? 'ArchMind'}</h1>
          <p className="pi-desc">智能分析未能完成，请稍后重试</p>
        </div>
        <div className="pi-module pi-error">
          <span className="pi-label">分析失败</span>
          <span className="pi-value">
            <span className="pi-error-msg">{error}</span>
            <button className="link-retry" onClick={onAnalyze}>重试</button>
          </span>
        </div>
      </section>
    )
  }

  // 未选中项目：区分「无项目可选」与「有项目待点击选择」
  if (!currentProject) {
    return (
      <section className="project-info">
        <div className="pi-main">
          <h1 className="pi-name">ArchMind</h1>
          <p className="pi-desc">
            {hasProjects
              ? '从左侧「最近项目」或「我的项目」打开一个项目，查看其概况'
              : '点击「新建项目」→ 上传 ZIP 源码 → 自动生成项目概况'}
          </p>
        </div>
        <Cell label="状态">
          <span className="pi-value sync">
            <span className="dot-off" />
            {hasProjects ? '待选择项目' : '待新建项目'}
          </span>
        </Cell>
      </section>
    )
  }

  // 分析中且无旧数据：骨架屏
  if (analyzing && !overview) {
    return (
      <section className="project-info">
        <div className="pi-main">
          <div className="skl skl-name" />
          <div className="skl skl-line" style={{ width: '46%' }} />
        </div>
        {SKELETON_CELLS.map((label, i) => (
          <div className="pi-module" key={label}>
            <span className="pi-label">{label}</span>
            <span className="pi-value"><span className="skl" style={{ width: `${[64, 110, 40, 96][i]}px` }} /></span>
          </div>
        ))}
      </section>
    )
  }

  // 已有项目但未分析（未上传或未触发生成）：引导上传
  if (!overview) {
    return (
      <section className="project-info">
        <div className="pi-main">
          <h1 className="pi-name">{projectName}</h1>
          <p className="pi-desc">{currentProject.description || '上传项目源码后，将自动生成项目概况'}</p>
        </div>
        <Cell label="状态">
          <span className="pi-value sync">
            <span className="dot-off" />
            待上传源码
          </span>
        </Cell>
      </section>
    )
  }

  // 同步状态：优先展示最近一次上传的来源文件（分析响应中无 source 字段）
  const syncedText = uploadInfo?.fileName
    ? `${uploadInfo.fileName}${uploadInfo.fileSize ? ` · ${fmtSize(uploadInfo.fileSize)}` : ''}`
    : '已分析'

  return (
    <section className="project-info">
      <div className="pi-main">
        <h1 className="pi-name">{projectName}</h1>
        <p className="pi-desc">{overview.summary}</p>
      </div>

      <Cell label="开发语言">{lang?.name ?? '—'}</Cell>

      <div className="pi-module">
        <span className="pi-label">技术栈</span>
        <span className="pi-value tags">
          {stack.map((t) => <span key={t.name} className="tag">{t.name}</span>)}
        </span>
      </div>

      <Cell label="模块数量">{overview.modules?.length ?? '—'}</Cell>

      <div className="pi-module">
        <span className="pi-label">同步状态</span>
        <span className="pi-value sync">
          <span className={analyzing ? 'dot-busy' : 'dot-success'} />
          {analyzing ? '分析中…' : syncedText}
        </span>
      </div>

      <button className="btn-analyze" onClick={onAnalyze} disabled={analyzing || !canAnalyze} title="重新分析项目概况">
        <IconRefresh size={13} />
        <span>{analyzing ? '分析中' : '重新分析'}</span>
      </button>
    </section>
  )
}
