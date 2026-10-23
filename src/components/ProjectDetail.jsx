import { statusMeta, stageLabel } from '../statusMeta'
import { normalizeCategory } from '../utils/techStack'
import ClassExplorer from './ClassExplorer'
import {
  IconArrowLeft, IconUpload, IconRefresh, IconTrash, IconX
} from '../icons'

function TechTag({ children }) {
  return <span className="tag">{children}</span>
}

// 领域地图预览：近期由已存概况的模块/技术栈驱动；完整代码级领域地图引擎开发中
function DomainPreview({ overview }) {
  const stack = overview?.techStack ?? []
  const arch = overview?.architecture
  const modules = overview?.modules ?? []
  return (
    <div className="pd-section">
      <div className="pd-section-head">
        <h2 className="pd-section-title">领域地图</h2>
        <span className="pd-section-note">预览 · 由项目分析概况生成，随分析更新</span>
      </div>
      {modules.length === 0 && stack.length === 0 ? (
        <p className="pd-empty-note">分析完成后，这里将基于概况绘制该项目的模块/领域结构。</p>
      ) : (
        <>
          {arch && (
            <div className="dm-arch">
              <span className="dm-arch-style">{arch.style || '架构'}</span>
              <div className="dm-arch-layers">
                {(arch.layers || []).map((l) => <span key={l} className="dm-layer">{l}</span>)}
              </div>
            </div>
          )}
          {stack.length > 0 && (
            <div className="dm-block">
              <div className="dm-label">技术栈</div>
              <div className="dm-chips">
                {stack.map((t) => (
                  <span key={t.name} className="chip">
                    {t.name}
                    {t.category ? <em className="chip-cat">{normalizeCategory(t.category)}</em> : null}
                  </span>
                ))}
              </div>
            </div>
          )}
          {modules.length > 0 && (
            <div className="dm-block">
              <div className="dm-label">核心模块</div>
              <div className="dm-grid">
                {modules.map((m) => (
                  <div key={m.name} className="dm-module">
                    <span className="dm-module-name">{m.name}</span>
                    <span className="dm-module-resp">{m.responsibility}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ProjectDetail({
  project, overview, loading, analyzing, taskProgress = 0, taskStage = '', error,
  onBack, onUpload, onAnalyze, onOpenCode, onDelete
}) {
  if (!project) {
    return (
      <div className="page page-scroll pdetail">
        <p className="pd-empty-note">项目不存在或已被删除</p>
        <button className="btn-ghost pd-back-btn" onClick={onBack}>返回</button>
      </div>
    )
  }

  const st = statusMeta(project.analysisStatus)
  const hasSource = project.analysisStatus !== 'NO_SOURCE' && project.analysisStatus !== null
  const canAnalyze = hasSource && !analyzing && !loading

  return (
    <div className="page page-scroll pdetail">
      <div className="pd-head">
        <button className="icon-btn pd-back" onClick={onBack} title="返回">
          <IconArrowLeft size={17} />
        </button>
        <div className="pd-titles">
          <div className="pd-title-row">
            <h1 className="pd-name">{project.name}</h1>
            <span className={`status-pill ${st.cls}`}>{st.label}</span>
          </div>
          <p className="pd-desc">{project.description || '暂无项目描述'}</p>
        </div>
        <div className="pd-actions">
          <button className="btn-ghost pd-btn" onClick={onUpload} title="向该项目上传 / 更新 ZIP 源码">
            <IconUpload size={14} />
            上传源码
          </button>
          <button
            className="btn-ghost pd-btn"
            onClick={onAnalyze}
            disabled={!canAnalyze}
            title={hasSource ? '重新分析（覆盖旧的概况结果）' : '需先上传源码'}
          >
            <IconRefresh size={14} />
            {analyzing ? `分析中 ${taskProgress}%` : '重新分析'}
          </button>
          <button className="btn-ghost pd-btn danger" onClick={onDelete}>
            <IconTrash size={14} />
            删除
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="pd-progress">
          <div className="pd-progress-track">
            <div className="pd-progress-bar" style={{ width: `${Math.max(taskProgress, 2)}%` }} />
          </div>
          <span className="pd-progress-text">
            {stageLabel(taskStage) || '分析中'} · {taskProgress}%
          </span>
        </div>
      )}

      {error && (
        <div className="pd-error">
          <IconX size={14} />
          <span>{error}</span>
        </div>
      )}

      {!overview && !loading ? (
        <div className="wb-empty" style={{ marginTop: 24 }}>
          <p className="wb-empty-title">该项目尚未生成概况</p>
          <p className="wb-empty-sub">
            {hasSource
              ? '点击「重新分析」生成项目概况与领域结构'
              : '先向该项目上传 ZIP 源码，再进行分析'}
          </p>
          {hasSource ? (
            <button className="btn-primary wb-empty-btn" onClick={onAnalyze}>
              <IconRefresh size={15} />
              开始分析
            </button>
          ) : (
            <button className="btn-primary wb-empty-btn" onClick={onUpload}>
              <IconUpload size={15} />
              上传源码
            </button>
          )}
        </div>
      ) : !overview && loading ? (
        <div className="pd-loading">正在读取概况…</div>
      ) : (
        <>
          <div className="pd-section pd-overview">
            <div className="pd-section-head">
              <h2 className="pd-section-title">项目概况</h2>
            </div>
            <div className="pd-ov-grid">
              <div className="pd-ov-main">
                <p className="pd-ov-summary">{overview.summary}</p>
                <p className="pd-ov-desc">{overview.description}</p>
              </div>
              <div className="pd-ov-meta">
                {overview.projectType && (
                  <span className="chip pd-type">{overview.projectType}</span>
                )}
                {(overview.techStack || []).slice(0, 8).map((t) => (
                  <TechTag key={t.name}>{t.name}</TechTag>
                ))}
              </div>
            </div>
          </div>

          <DomainPreview overview={overview} />

          <ClassExplorer projectId={project.id} onOpenCode={onOpenCode} />
        </>
      )}
    </div>
  )
}
