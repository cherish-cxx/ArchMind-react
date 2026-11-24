import { useEffect, useState } from 'react'
import { statusMeta } from '../statusMeta'
import { domainMap } from '../api/domain'
import { splitAreas, totals } from '../utils/domain'
import DomainMap from './domain/DomainMap'
import ClassExplorer from './ClassExplorer'
import McpAccess from './McpAccess'
import ProjectRail from './ProjectRail'
import {
  IconArrowLeft, IconUpload, IconRefresh, IconTrash, IconX
} from '../icons'

function TechTag({ children }) {
  return <span className="tag">{children}</span>
}

// 项目详情里的领域地图摘要：读 domain-map，画一张紧凑版图；点击进入完整页面
function DomainSection({ project, onOpenMap, onAnalyze }) {
  const [areas, setAreas] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const projectId = project?.id
  const status = project?.analysisStatus

  useEffect(() => {
    let alive = true
    if (!projectId || status !== 'COMPLETED') {
      setAreas(null)
      setError('')
      return () => { alive = false }
    }
    setLoading(true)
    setError('')
    domainMap(projectId)
      .then((data) => {
        if (!alive) return
        setAreas(data?.areas || [])
      })
      .catch((err) => {
        if (!alive) return
        setAreas([])
        setError(err?.message || '领域地图读取失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [projectId, status, reloadKey])

  const { business, infrastructure } = splitAreas(areas || [])
  const count = totals(business, infrastructure)

  return (
    <div className="pd-section">
      <div className="pd-section-head">
        <h2 className="pd-section-title">领域地图</h2>
        <span className="pd-section-note">由最近一次分析生成 · 业务领域按类数分块</span>
      </div>

      {status !== 'COMPLETED' ? (
        <p className="pd-empty-note">分析完成后，这里会显示项目的业务版图。</p>
      ) : loading ? (
        <p className="pd-empty-note">正在读取领域地图…</p>
      ) : error ? (
        <p className="pd-empty-note">
          {error}
          <button className="link-retry" onClick={() => setReloadKey((n) => n + 1)}>重试</button>
        </p>
      ) : (areas || []).length === 0 ? (
        <p className="pd-empty-note">
          这次分析没有产出领域结构。重新分析后即可查看。
          <button className="link-retry" onClick={onAnalyze}>重新分析</button>
        </p>
      ) : (
        <>
          <DomainMap areas={areas || []} compact onOpen={onOpenMap} />
          <div className="dmap-detail-foot">
            <span>
              {count.areas} 个业务领域，{count.capabilities} 个能力，{count.classes} 个类
            </span>
          </div>
        </>
      )}
    </div>
  )
}

export default function ProjectDetail({
  project, overview, loading, analyzing, taskProgress = 0, taskStage = '', error,
  onBack, onUpload, onAnalyze, onOpenDomain, onOpenPage, onOpenCode, onDelete
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
          {/* 主操作归流程轨；头部只留维护性动作，避免同屏两个主按钮 */}
          {hasSource && (
            <>
              <button className="btn-ghost pd-btn" onClick={onUpload} title="上传新的 ZIP 覆盖当前源码">
                <IconUpload size={14} />
                更新源码
              </button>
              <button
                className="btn-ghost pd-btn"
                onClick={onAnalyze}
                disabled={!canAnalyze}
                title="重新分析（覆盖旧的概况结果）"
              >
                <IconRefresh size={14} />
                重新分析
              </button>
            </>
          )}
          <button className="btn-ghost pd-btn danger" onClick={onDelete}>
            <IconTrash size={14} />
            删除
          </button>
        </div>
      </div>

      <ProjectRail
        project={project}
        page="detail"
        analyzing={analyzing}
        taskProgress={taskProgress}
        onUpload={onUpload}
        onAnalyze={onAnalyze}
        onOpenPage={onOpenPage}
      />

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
              ? '运行分析后，这里会显示概况、领域结构与代码图谱。'
              : '上传 ZIP 源码后，分析会生成概况、领域结构与代码图谱。'}
          </p>
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

          <DomainSection project={project} onOpenMap={onOpenDomain} onAnalyze={onAnalyze} />

          <ClassExplorer projectId={project.id} onOpenCode={onOpenCode} />
        </>
      )}

      <McpAccess project={project} />
    </div>
  )
}
