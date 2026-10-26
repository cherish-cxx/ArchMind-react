import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import LoginModal from './components/LoginModal'
import NewProjectModal from './components/NewProjectModal'
import Workbench from './components/Workbench'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import CodeDrawer from './components/code/CodeDrawer'
import MemoryPage from './pages/MemoryPage'
import { login as apiLogin, logout as apiLogout } from './api/auth'
import {
  analyze, listProjects, createProject, createProjectWithSource, upload, projectOverview, deleteProject
} from './api/project'
import { useSession, setLogin as storeSetLogin, clearSession } from './auth/sessionStore'
import useTaskPolling from './hooks/useTaskPolling'

const MAX_UPLOAD_MB = 500
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`

// 页面：workbench 工作台 / memory 记忆地图 / projects 我的项目 / detail 项目详情
export default function App() {
  const session = useSession()
  const loggedIn = !!session.tokens.accessToken

  const [page, setPage] = useState('workbench')
  const [loginOpen, setLoginOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  // 侧栏：收起后不在布局里占宽度，悬停最左侧临时浮出
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('archmind:sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })
  const [sidebarHover, setSidebarHover] = useState(false)
  const sidebarHideTimer = useRef(null)

  // 项目与概况
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [taskProgress, setTaskProgress] = useState(0)
  const [taskStage, setTaskStage] = useState('')
  const [uploadInfo, setUploadInfo] = useState(null)
  const [codeTarget, setCodeTarget] = useState(null)
  // 源码大纲里锁定的方法：{uid, name, signature} | null。
  // 和画布焦点是**两个锚点** —— 这个只决定「问的是哪个方法」。
  const [methodFocus, setMethodFocus] = useState(null)

  const analyzeSeq = useRef(0) // 使切换项目/退出后在途的分析请求作废
  const currentProjectRef = useRef(null)
  useEffect(() => { currentProjectRef.current = currentProject }, [currentProject])

  // 分析任务轮询：必须在使用它的 effect/callback 之前初始化（避免 TDZ）
  const {
    start: startTaskPolling,
    resume: resumeTaskPolling,
    stop: stopTaskPolling
  } = useTaskPolling()

  // 轻提示（右上角）
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const showNotice = useCallback((msg) => {
    setNotice(msg || '')
    clearTimeout(noticeTimer.current)
    if (msg) noticeTimer.current = setTimeout(() => setNotice(''), 4000)
  }, [])

  // 上传文件选择（供详情页 / 我的项目共用）
  const uploadInputRef = useRef(null)
  const uploadTargetRef = useRef(null)

  // ========== 项目列表 ==========
  const reloadProjects = useCallback(async () => {
    try {
      const list = (await listProjects()) || []
      setProjects(list)
      setCurrentProject((cur) =>
        cur && list.some((p) => p.id === cur.id)
          ? list.find((p) => p.id === cur.id)
          : cur
      )
    } catch (err) {
      showNotice(err?.message || '项目列表加载失败')
    }
  }, [showNotice])

  useEffect(() => {
    if (!loggedIn) {
      setProjects([])
      setCurrentProject(null)
      setOverview(null)
      setAnalyzeError('')
      analyzeSeq.current++
      stopTaskPolling()
      setPage('workbench')
      return
    }
    reloadProjects()
  }, [loggedIn, reloadProjects, stopTaskPolling])

  // ========== 概况读取 / 分析 ==========
  const resetOverview = useCallback(() => {
    setOverview(null)
    setOverviewLoading(false)
    setAnalyzing(false)
    setAnalyzeError('')
    setTaskProgress(0)
    setTaskStage('')
  }, [])

  // 读库概况：GET /overview；尚未分析时后端报错，静默当空处理
  const loadDbOverview = useCallback(async (projectId) => {
    if (!projectId) return
    const seq = ++analyzeSeq.current
    setOverviewLoading(true)
    setAnalyzeError('')
    try {
      const data = await projectOverview(projectId)
      if (seq !== analyzeSeq.current) return
      setOverview(data)
    } catch {
      // 尚未分析：保持 overview 为空，展示引导
    } finally {
      if (seq === analyzeSeq.current) setOverviewLoading(false)
    }
  }, [])

  // 任务成功后按 projectId 拉一次已落库的概况
  const refreshOverview = useCallback(async (projectId) => {
    if (!projectId) return
    try {
      const data = await projectOverview(projectId)
      // 任务里的 projectId 可能是数字，项目 id 已被规范为字符串
      if (String(currentProjectRef.current?.id) === String(projectId)) setOverview(data)
    } catch {
      // 概况尚未落库或读取失败：保留当前状态，可由用户重试
    }
  }, [])

  const taskHandlers = useMemo(() => ({
    onUpdate: (t) => {
      setAnalyzing(true)
      setTaskProgress(typeof t?.progress === 'number' ? t.progress : 0)
      setTaskStage(t?.currentStage || '')
    },
    onSuccess: (t) => {
      setAnalyzing(false)
      setTaskProgress(100)
      setTaskStage('')
      refreshOverview(t?.projectId)
      reloadProjects()
    },
    onFailure: (t) => {
      setAnalyzing(false)
      setTaskStage('')
      setAnalyzeError(t?.error || '项目分析失败，请稍后重试')
      reloadProjects()
    },
    onPartial: (t) => {
      setAnalyzing(false)
      setTaskStage('')
      setAnalyzeError(t?.error || '部分分析阶段失败，结果可能不完整')
      refreshOverview(t?.projectId)
      reloadProjects()
    }
  }), [refreshOverview, reloadProjects])

  // 分析（force=true 强制重跑并覆盖，用于显式「重新分析」）
  // POST /analyze 只负责投递，真正的进度由轮询跟踪；绝不再把 TaskResponse 当成 overview。
  const runAnalyze = useCallback(async (projectId, force) => {
    if (!projectId) return
    const seq = ++analyzeSeq.current
    setAnalyzeError('')
    setTaskProgress(0)
    setTaskStage('')
    setAnalyzing(true)
    try {
      const task = await analyze(projectId, force)
      if (seq !== analyzeSeq.current) return
      if (!task) {
        setAnalyzing(false)
        return
      }
      if (task.status === 'SUCCESS') {
        setAnalyzing(false)
        setTaskProgress(100)
        setTaskStage('')
        if (task.detail) setOverview(task.detail)
        else refreshOverview(projectId)
        reloadProjects()
        return
      }
      if (task.status === 'FAILED' || task.status === 'PARTIAL') {
        taskHandlers[task.status === 'FAILED' ? 'onFailure' : 'onPartial'](task)
        return
      }
      // PENDING / RUNNING：后端已异步提交，交给轮询
      startTaskPolling(task.taskId, taskHandlers)
    } catch (err) {
      if (seq !== analyzeSeq.current) return
      setAnalyzeError(err?.message || '项目分析失败，请稍后重试')
      setAnalyzing(false)
    }
  }, [refreshOverview, reloadProjects, startTaskPolling, taskHandlers])

  // ========== 页面流转 ==========
  const navigate = useCallback((p) => {
    if (p === 'detail') return
    setPage(p)
  }, [])

  // 侧栏：收起/展开、悬停浮出、移开延迟隐藏
  const openSidebar = useCallback(() => {
    clearTimeout(sidebarHideTimer.current)
    setSidebarHover(true)
  }, [])

  const scheduleSidebarHide = useCallback(() => {
    clearTimeout(sidebarHideTimer.current)
    sidebarHideTimer.current = setTimeout(() => setSidebarHover(false), 120)
  }, [])

  const toggleSidebar = useCallback(() => {
    clearTimeout(sidebarHideTimer.current)
    setSidebarHover(false)
    setSidebarCollapsed((v) => !v)
  }, [])

  const pinSidebar = useCallback(() => {
    clearTimeout(sidebarHideTimer.current)
    setSidebarHover(false)
    setSidebarCollapsed(false)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('archmind:sidebar-collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [sidebarCollapsed])

  useEffect(() => () => clearTimeout(sidebarHideTimer.current), [])

  // 打开代码浮窗：图谱节点 / 代码探索列表共用
  const handleOpenCode = useCallback((uid, simpleName) => {
    const projectId = currentProjectRef.current?.id
    if (!projectId || !uid) return
    setCodeTarget({ projectId, uid, name: simpleName })
    // 换到别的类看源码，旧的方法锁不再适用；同一个类则保留，避免反复锁同一方法
    setMethodFocus((prev) => (prev && prev.uid.split('#', 1)[0] === uid ? prev : null))
  }, [])

  const openProject = useCallback((project) => {
    analyzeSeq.current++ // 作废在途分析
    stopTaskPolling()
    setCodeTarget(null)
    setMethodFocus(null)
    setCurrentProject(project)
    resetOverview()
    setPage('detail')
    loadDbOverview(project.id)
    resumeTaskPolling(project.id, taskHandlers)
  }, [loadDbOverview, resetOverview, resumeTaskPolling, stopTaskPolling, taskHandlers])

  // 图谱页顶部切换项目：留在图谱页，只换当前项目与其概况
  const switchProject = useCallback((project) => {
    analyzeSeq.current++
    stopTaskPolling()
    setCodeTarget(null)
    setMethodFocus(null)
    setCurrentProject(project)
    resetOverview()
    loadDbOverview(project.id)
    resumeTaskPolling(project.id, taskHandlers)
  }, [loadDbOverview, resetOverview, resumeTaskPolling, stopTaskPolling, taskHandlers])

  // 列表里的「重新分析」：进入详情并强制重跑
  const analyzeProject = useCallback((project) => {
    analyzeSeq.current++
    stopTaskPolling()
    setCurrentProject(project)
    resetOverview()
    setPage('detail')
    runAnalyze(project.id, true)
  }, [resetOverview, runAnalyze, stopTaskPolling])

  // ========== 上传 ==========
  const askUpload = useCallback((project) => {
    uploadTargetRef.current = project
    uploadInputRef.current?.click()
  }, [])

  const pickUploadFile = useCallback(async (file) => {
    const project = uploadTargetRef.current
    uploadTargetRef.current = null
    if (!file || !project) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showNotice('仅支持 .zip 压缩包')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showNotice(`压缩包不能超过 ${MAX_UPLOAD_MB}MB（当前 ${formatSize(file.size)}）`)
      return
    }
    try {
      showNotice('正在上传…')
      let lastPct = -10
      const res = await upload(project.id, file, {
        onProgress: (pct) => {
          if (pct === 100 || pct - lastPct >= 10) {
            lastPct = pct
            showNotice(`上传中… ${pct}%`)
          }
        }
      })
      setUploadInfo({ fileName: res?.fileName, fileSize: res?.fileSize })
      // 上传了新源码：旧概况作废，等待重新分析
      setOverview(null)
      await reloadProjects()
      showNotice(`已上传 ${res?.fileName ?? file.name}`)
    } catch (err) {
      showNotice(err?.message || '上传失败')
    }
  }, [reloadProjects, showNotice])

  // ========== 新建（含可选上传 + 自动分析） ==========
  const handleCreate = useCallback(async (payload, onProgress) => {
    let project
    if (payload.file) {
      // 创建 + 上传是一个请求：失败整体回滚，重试复用同一个幂等键
      const res = await createProjectWithSource(
        { name: payload.name, description: payload.description, gitUrl: payload.gitUrl },
        payload.file,
        { idempotencyKey: payload.idempotencyKey, onProgress }
      )
      project = res.project
      setUploadInfo(res.upload
        ? { fileName: res.upload.fileName, fileSize: res.upload.fileSize }
        : null)
    } else {
      project = await createProject({
        name: payload.name,
        description: payload.description,
        gitUrl: payload.gitUrl
      })
      setUploadInfo(null)
    }

    await reloadProjects()
    // 进入新项目详情
    analyzeSeq.current++
    setCurrentProject(project)
    resetOverview()
    setPage('detail')

    // 按勾选自动分析；进度交给轮询（runAnalyze 内部不会阻塞弹窗关闭）
    if (payload.autoAnalyze && payload.file) {
      runAnalyze(project.id, false)
    }
    return project
  }, [reloadProjects, resetOverview, runAnalyze])

  // ========== 删除 ==========
  const handleDelete = useCallback(async (project) => {
    if (!project) return
    if (!window.confirm(`确定删除项目「${project.name}」吗？将同时删除其源码与已存分析，不可恢复。`)) return
    try {
      await deleteProject(project.id)
      showNotice('项目已删除')
      if (currentProject?.id === project.id) {
        analyzeSeq.current++
        stopTaskPolling()
        setCodeTarget(null)
        setCurrentProject(null)
        resetOverview()
      }
      if (page === 'detail') setPage('projects')
      reloadProjects()
    } catch (err) {
      showNotice(err?.message || '删除失败')
    }
  }, [currentProject, page, reloadProjects, resetOverview, showNotice, stopTaskPolling])

  // ========== 登录 / 登出 ==========
  const handleLogin = async (username, password) => {
    const data = await apiLogin(username, password)
    storeSetLogin({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: { id: data.userId, username: data.username }
    })
    setPage('workbench')
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
    } catch {
      // 登出接口失败不阻塞本地登出
    } finally {
      clearSession()
    }
  }

  const currentUser = session.user

  return (
    <div className="app">
      {sidebarCollapsed && (
        <div className="sidebar-hotzone" onMouseEnter={openSidebar}>
          <button
            className="sidebar-peek"
            onClick={pinSidebar}
            title="展开侧栏"
            aria-label="展开侧栏"
          >
            ›
          </button>
        </div>
      )}
      <Sidebar
        page={page}
        onNavigate={navigate}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onLogout={handleLogout}
        projects={projects}
        onOpenProject={openProject}
        activeProjectId={
          page === 'detail' || page === 'memory' ? currentProject?.id : null
        }
        collapsed={sidebarCollapsed}
        floating={sidebarCollapsed && sidebarHover}
        onPeek={openSidebar}
        onHoverEnd={scheduleSidebarHide}
        onToggleCollapse={toggleSidebar}
      />

      {page === 'memory' ? (
        <MemoryPage
          loggedIn={loggedIn}
          projects={projects}
          currentProject={currentProject}
          overview={overview}
          analyzing={analyzing}
          analyzeError={analyzeError}
          taskProgress={taskProgress}
          taskStage={taskStage}
          uploadInfo={uploadInfo}
          onOpenProject={switchProject}
          onAnalyze={() => runAnalyze(currentProject?.id, true)}
          onUpload={() => currentProject && askUpload(currentProject)}
          onOpenCode={handleOpenCode}
          onOpenLogin={() => setLoginOpen(true)}
          onGoProjects={() => setPage('projects')}
          methodFocus={methodFocus}
          onClearMethodFocus={() => setMethodFocus(null)}
        />
      ) : (
        <main className="main">
          {page === 'workbench' ? (
            <Workbench
              loggedIn={loggedIn}
              user={currentUser}
              projects={projects}
              onNewProject={() => setNewProjectOpen(true)}
              onOpenLogin={() => setLoginOpen(true)}
              onOpenProject={openProject}
              onGoMemory={() => setPage('memory')}
              onGoProjects={() => setPage('projects')}
            />
          ) : page === 'projects' ? (
            <ProjectList
              projects={projects}
              onOpenProject={openProject}
              onUpload={askUpload}
              onAnalyze={analyzeProject}
              onDelete={handleDelete}
            />
          ) : (
            <ProjectDetail
              project={currentProject}
              overview={overview}
              loading={overviewLoading || analyzing}
              analyzing={analyzing}
              taskProgress={taskProgress}
              taskStage={taskStage}
              error={analyzeError}
              onBack={() => setPage('projects')}
              onUpload={() => currentProject && askUpload(currentProject)}
              onAnalyze={() => runAnalyze(currentProject?.id, true)}
              onOpenCode={handleOpenCode}
              onDelete={() => handleDelete(currentProject)}
            />
          )}
        </main>
      )}

      {notice && <div className="toast">{notice}</div>}

      <input
        ref={uploadInputRef}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          pickUploadFile(file)
        }}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={handleLogin} />
      <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} onCreate={handleCreate} />
      <CodeDrawer
        open={!!codeTarget}
        projectId={codeTarget?.projectId}
        uid={codeTarget?.uid}
        name={codeTarget?.name}
        activeMethodUid={methodFocus?.uid}
        onLockMethod={(m) => setMethodFocus((prev) => (prev?.uid === m.uid ? null : m))}
        onClose={() => { setCodeTarget(null); setMethodFocus(null) }}
      />
    </div>
  )
}
