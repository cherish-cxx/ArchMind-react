import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  architectureLayers as fetchArchitectureLayers,
  capability as fetchCapability,
  domainMap as fetchDomainMap
} from '../api/domain'
import DomainMap from '../components/domain/DomainMap'
import CapabilityGrid from '../components/domain/CapabilityGrid'
import ChainGraph from '../components/domain/ChainGraph'
import ArchitectureLayers from '../components/architecture/ArchitectureLayers'
import ProjectRail from '../components/ProjectRail'
import { capabilityLabel, parseCapability, splitAreas, totals } from '../utils/domain'
import { stageLabel } from '../statusMeta'
import { IconArrowLeft, IconMap, IconRefresh, IconUpload } from '../icons'
import '../components/domain/domain.css'

const BASE_CRUMB = { type: 'areas', label: '领域地图' }

const emptyCopy = (status) => {
  switch (status) {
    case 'NO_SOURCE':
      return { title: '还没有源码', text: '先上传 ZIP 源码并完成分析，才能生成领域地图。', action: 'upload' }
    case 'FAILED':
      return { title: '分析未完成', text: '上一次分析失败，重新分析后即可生成领域结构。', action: 'analyze' }
    case 'PENDING':
    case 'PARTIAL':
      return { title: '领域结构还没生成', text: '分析完成后再回到这里，就能看到项目的业务版图。', action: 'analyze' }
    default:
      return {
        title: '这次分析没有产出领域结构',
        text: 'R8 之前的分析结果不含业务领域，重新分析后即可查看。',
        action: 'analyze'
      }
  }
}

/**
 * 领域地图：领域版图 → 该领域能力 → 能力链路，逐层下钻。
 * 每层独立取数：domain-map 一次，capability 按 uid 懒加载并缓存。
 */
export default function DomainMapPage({
  loggedIn,
  projects = [],
  currentProject,
  analyzing,
  analyzeError,
  taskProgress = 0,
  taskStage = '',
  onOpenProject,
  onAnalyze,
  onUpload,
  onOpenLogin,
  onGoProjects,
  onOpenCode,
  onOpenPage
}) {
  const projectId = currentProject?.id || null
  const scrollRef = useRef(null)

  const [areas, setAreas] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [stack, setStack] = useState([BASE_CRUMB])
  const [detail, setDetail] = useState({ status: 'idle', data: null, error: '' })
  const [viewMode, setViewMode] = useState('map')
  const [layerData, setLayerData] = useState({ status: 'idle', data: null, error: '' })

  const mapSeq = useRef(0)
  const detailSeq = useRef(0)
  const layerSeq = useRef(0)
  const cacheRef = useRef(new Map())
  const prevAnalyzing = useRef(analyzing)

  const loadMap = useCallback(async (pid) => {
    const seq = ++mapSeq.current
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchDomainMap(pid)
      if (seq !== mapSeq.current) return
      setAreas(data?.areas || [])
    } catch (err) {
      if (seq !== mapSeq.current) return
      setAreas([])
      setLoadError(err?.message || '领域地图读取失败')
    } finally {
      if (seq === mapSeq.current) setLoading(false)
    }
  }, [])

  const loadLayers = useCallback(async (pid) => {
    const seq = ++layerSeq.current
    setLayerData({ status: 'loading', data: null, error: '' })
    try {
      const data = await fetchArchitectureLayers(pid)
      if (seq !== layerSeq.current) return
      setLayerData({ status: 'ready', data, error: '' })
    } catch (err) {
      if (seq !== layerSeq.current) return
      setLayerData({ status: 'error', data: null, error: err?.message || '架构分层读取失败' })
    }
  }, [])

  const loadDetail = useCallback(async (cap, force = false) => {
    if (!projectId || !cap) return
    if (!force) {
      const cached = cacheRef.current.get(cap.uid)
      if (cached) {
        setDetail({ status: 'ready', data: cached, error: '' })
        return
      }
    }
    const seq = ++detailSeq.current
    setDetail({ status: 'loading', data: null, error: '' })
    try {
      const data = await fetchCapability(projectId, cap.uid)
      if (seq !== detailSeq.current) return
      cacheRef.current.set(cap.uid, data)
      setDetail({ status: 'ready', data, error: '' })
    } catch (err) {
      if (seq !== detailSeq.current) return
      setDetail({ status: 'error', data: null, error: err?.message || '能力读取失败' })
    }
  }, [projectId])

  // 切项目 / 登录态变化：回到一级，清空缓存与链路
  useEffect(() => {
    mapSeq.current++
    detailSeq.current++
    layerSeq.current++
    cacheRef.current.clear()
    setStack([BASE_CRUMB])
    setDetail({ status: 'idle', data: null, error: '' })
    setAreas(null)
    setLoadError('')
    setViewMode('map')
    setLayerData({ status: 'idle', data: null, error: '' })
    if (loggedIn && projectId) loadMap(projectId)
  }, [loggedIn, projectId, loadMap])

  // 分层视图按需取数：只在切到分层且已有项目时请求
  useEffect(() => {
    if (viewMode === 'layers' && projectId) loadLayers(projectId)
  }, [viewMode, projectId, loadLayers])

  // 分析从进行中变为结束：领域结构可能刚生成，重新取一次
  useEffect(() => {
    const was = prevAnalyzing.current
    prevAnalyzing.current = analyzing
    if (was && !analyzing && loggedIn && projectId) {
      cacheRef.current.clear()
      setDetail({ status: 'idle', data: null, error: '' })
      loadMap(projectId)
      // 停在分层视图时，分析结束同样要刷新六层数据
      if (viewMode === 'layers') loadLayers(projectId)
    }
  }, [analyzing, loggedIn, projectId, viewMode, loadMap, loadLayers])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [stack.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openArea = useCallback((area) => {
    // 进入领域始终看业务视角，分层只在项目一级展示
    setViewMode('map')
    setStack([BASE_CRUMB, { type: 'caps', area, label: area.name }])
  }, [])

  const openCapability = useCallback((area, cap) => {
    setStack([BASE_CRUMB, { type: 'caps', area, label: area.name },
      { type: 'chain', area, cap, label: capabilityLabel(cap) }])
    loadDetail(cap)
  }, [loadDetail])

  const openAreaByUid = useCallback((uid) => {
    const target = (areas || []).find((area) => area.uid === uid)
    if (!target) return
    // 保留来源链路作为上一级，返回时回到刚才的能力
    setStack((s) => [...s, { type: 'caps', area: target, label: target.name }])
  }, [areas])

  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  const level = stack[stack.length - 1]
  const { business, infrastructure } = splitAreas(areas || [])
  const count = totals(business, infrastructure)
  const current = level.type === 'areas'
    ? null
    : (business.find((a) => a.uid === level.area.uid) || level.area)

  const crumbs = (
    <div className="dmap-crumbs">
      {stack.length > 1 && (
        <button type="button" className="dmap-back" onClick={back}>
          <IconArrowLeft size={13} />
          返回
        </button>
      )}
      {stack.map((item, index) => (
        <Fragment key={`${item.type}-${item.label}-${index}`}>
          {index > 0 && <span className="dmap-crumb-sep" aria-hidden="true">/</span>}
          <button
            type="button"
            className={`dmap-crumb${index === stack.length - 1 ? ' is-current' : ''}`}
            onClick={() => index < stack.length - 1 && setStack(stack.slice(0, index + 1))}
          >
            {item.label}
          </button>
        </Fragment>
      ))}
    </div>
  )

  const projectOptions = projects.map((p) => (
    <option key={p.id} value={String(p.id)}>{p.name}</option>
  ))

  const emptyState = () => {
    const copy = emptyCopy(currentProject?.analysisStatus)
    if (analyzeError) {
      return (
        <div className="dmap-empty">
          <p className="dmap-empty-title">领域地图读取失败</p>
          <p className="dmap-empty-text">{analyzeError}</p>
          <button type="button" className="btn-ghost dmap-empty-btn" onClick={onAnalyze}>
            <IconRefresh size={14} />
            重新分析
          </button>
        </div>
      )
    }
    return (
      <div className="dmap-empty">
        <p className="dmap-empty-title">{copy.title}</p>
        <p className="dmap-empty-text">{copy.text}</p>
        {copy.action === 'upload' ? (
          <button type="button" className="btn-ghost dmap-empty-btn" onClick={onUpload}>
            <IconUpload size={14} />
            上传源码
          </button>
        ) : (
          <button type="button" className="btn-ghost dmap-empty-btn" onClick={onAnalyze}>
            <IconRefresh size={14} />
            重新分析
          </button>
        )}
      </div>
    )
  }

  const onTabKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = viewMode === 'map' ? 'layers' : 'map'
    setViewMode(next)
    event.currentTarget.parentElement
      ?.querySelector(`[data-view="${next}"]`)
      ?.focus()
  }

  const renderAreas = () => {
    if (loading && areas === null) return <p className="dmap-loading">正在读取领域地图…</p>
    if (loadError) {
      return (
        <div className="dmap-empty">
          <p className="dmap-empty-title">领域地图读取失败</p>
          <p className="dmap-empty-text">{loadError}</p>
          <button type="button" className="btn-ghost dmap-empty-btn" onClick={() => loadMap(projectId)}>
            重试
          </button>
        </div>
      )
    }
    if (analyzing && (areas || []).length === 0) {
      return (
        <div className="dmap-empty">
          <p className="dmap-empty-title">正在建模业务领域</p>
          <p className="dmap-empty-text">
            {stageLabel(taskStage) || '分析进行中'} · {taskProgress}%
          </p>
          <div className="dmap-progress-track">
            <div className="dmap-progress-bar" style={{ width: `${Math.max(taskProgress, 2)}%` }} />
          </div>
        </div>
      )
    }
    if ((areas || []).length === 0) return emptyState()

    return (
      <>
        <header className="dmap-head">
          <div>
            <h1>领域地图</h1>
            <p className="dmap-sub">
              <span className="dmap-lead">{currentProject?.name}</span>
              <span className="dmap-sep" />
              <span>{count.areas} 个业务领域</span>
              <span className="dmap-sep" />
              <span>{count.capabilities} 个能力</span>
              <span className="dmap-sep" />
              <span>{count.classes} 个类</span>
            </p>
          </div>
          {projects.length > 1 && (
            <select
              className="dmap-project"
              value={String(projectId)}
              onChange={(e) => {
                const project = projects.find((p) => String(p.id) === e.target.value)
                if (project) onOpenProject?.(project)
              }}
              aria-label="切换项目"
            >
              {projectOptions}
            </select>
          )}
        </header>
        <div className="dmap-tabs" role="tablist" aria-label="项目视图">
          <button
            type="button"
            role="tab"
            id="dmap-tab-map"
            data-view="map"
            aria-selected={viewMode === 'map'}
            aria-controls="dmap-tabpanel"
            tabIndex={viewMode === 'map' ? 0 : -1}
            className={`dmap-tab${viewMode === 'map' ? ' is-active' : ''}`}
            onClick={() => setViewMode('map')}
            onKeyDown={onTabKeyDown}
          >
            业务版图
          </button>
          <button
            type="button"
            role="tab"
            id="dmap-tab-layers"
            data-view="layers"
            aria-selected={viewMode === 'layers'}
            aria-controls="dmap-tabpanel"
            tabIndex={viewMode === 'layers' ? 0 : -1}
            className={`dmap-tab${viewMode === 'layers' ? ' is-active' : ''}`}
            onClick={() => setViewMode('layers')}
            onKeyDown={onTabKeyDown}
          >
            架构分层
          </button>
        </div>
        <div
          className="dmap-tabpanel"
          id="dmap-tabpanel"
          role="tabpanel"
          aria-labelledby={`dmap-tab-${viewMode}`}
        >
          {viewMode === 'layers' ? (
            <ArchitectureLayers
              data={layerData.data}
              loading={layerData.status === 'idle' || layerData.status === 'loading'}
              error={layerData.status === 'error' ? layerData.error : ''}
              onRetry={() => projectId && loadLayers(projectId)}
              onOpenCode={onOpenCode}
            />
          ) : (
            <DomainMap areas={areas || []} onOpen={openArea} />
          )}
        </div>
      </>
    )
  }

  const renderCaps = () => {
    const area = current
    const capCount = area?.capabilities?.length || 0
    return (
      <>
        <header className="dmap-head">
          <div>
            <h1>{area?.name}</h1>
            <p className="dmap-sub">
              <span>{capCount} 个能力</span>
              <span className="dmap-sep" />
              <span>{area?.classCount || 0} 个类</span>
            </p>
            {area?.description && <p className="dmap-desc">{area.description}</p>}
          </div>
        </header>
        <CapabilityGrid area={area} onOpen={(cap) => openCapability(area, cap)} />
      </>
    )
  }

  const renderChain = () => {
    const area = current
    const cap = level.cap
    const parsed = parseCapability(cap.uid, cap.name)
    const data = detail.status === 'ready' ? detail.data : null
    const memberCount = data?.members?.length ?? cap.memberCount
    const exitCount = data?.areaCalls?.length ?? 0
    const description = data?.capability?.description || cap.description
    return (
      <>
        <header className="dmap-head">
          <div>
            <h1 className="dmap-chain-title">
              <span className={`dmap-verb${parsed.isHttp ? '' : ' is-kind'}`}>{parsed.verb}</span>
              <span>{parsed.path}</span>
            </h1>
            <p className="dmap-sub">
              <span>{area?.name}</span>
              <span className="dmap-sep" />
              <span>{memberCount} 个类</span>
              {exitCount > 0 && (
                <>
                  <span className="dmap-sep" />
                  <span>{exitCount} 处跨领域调用</span>
                </>
              )}
            </p>
            {description && <p className="dmap-desc">{description}</p>}
          </div>
        </header>

        {detail.status === 'loading' && <p className="dmap-loading">正在读取链路…</p>}
        {detail.status === 'error' && (
          <div className="dmap-empty">
            <p className="dmap-empty-title">能力链路读取失败</p>
            <p className="dmap-empty-text">{detail.error}</p>
            <button type="button" className="btn-ghost dmap-empty-btn" onClick={() => loadDetail(cap, true)}>
              重试
            </button>
          </div>
        )}
        {detail.status === 'ready' && (
          <ChainGraph
            members={data.members || []}
            edges={data.edges || []}
            areaCalls={data.areaCalls || []}
            onOpenCode={onOpenCode}
            onOpenArea={openAreaByUid}
          />
        )}
      </>
    )
  }

  return (
    <main className="page page-scroll dmap-page" ref={scrollRef}>
      <ProjectRail
        project={currentProject}
        page="domain"
        analyzing={analyzing}
        taskProgress={taskProgress}
        onUpload={onUpload}
        onAnalyze={onAnalyze}
        onOpenPage={onOpenPage}
      />
      {crumbs}

      {!loggedIn ? (
        <div className="dmap-empty">
          <p className="dmap-empty-title">登录后查看领域地图</p>
          <p className="dmap-empty-text">领域版图随着项目分析生成，登录后才能读取你的项目。</p>
          <button type="button" className="btn-primary dmap-empty-btn" onClick={onOpenLogin}>登录</button>
        </div>
      ) : !currentProject ? (
        <div className="dmap-empty">
          <p className="dmap-empty-title">先打开一个项目</p>
          <p className="dmap-empty-text">
            {projects.length > 0 ? '从项目列表进入，或在顶部切换项目。' : '新建项目并上传源码后，分析会生成领域结构。'}
          </p>
          <button type="button" className="btn-primary dmap-empty-btn" onClick={onGoProjects}>
            <IconMap size={14} />
            去我的项目
          </button>
        </div>
      ) : level.type === 'areas' ? (
        renderAreas()
      ) : level.type === 'caps' ? (
        renderCaps()
      ) : (
        renderChain()
      )}
    </main>
  )
}
