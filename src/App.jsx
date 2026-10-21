import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import LoginModal from './components/LoginModal'
import NewProjectModal from './components/NewProjectModal'
import Workbench from './components/Workbench'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import MemoryPage from './pages/MemoryPage'
import { login as apiLogin, logout as apiLogout } from './api/auth'
import {
  analyze, listProjects, createProject, upload, projectOverview, deleteProject
} from './api/project'
import { useSession, setLogin as storeSetLogin, clearSession } from './auth/sessionStore'

// 页面：workbench 工作台 / memory 记忆地图 / projects 我的项目 / detail 项目详情
export default function App() {
  const session = useSession()
  const loggedIn = !!session.tokens.accessToken

  const [page, setPage] = useState('workbench')
  const [loginOpen, setLoginOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  // 项目与概况
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [uploadInfo, setUploadInfo] = useState(null)

  const analyzeSeq = useRef(0) // 使切换项目/退出后在途的分析请求作废

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
      setPage('workbench')
      return
    }
    reloadProjects()
  }, [loggedIn, reloadProjects])

  // ========== 概况读取 / 分析 ==========
  const resetOverview = useCallback(() => {
    setOverview(null)
    setOverviewLoading(false)
    setAnalyzing(false)
    setAnalyzeError('')
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

  // 分析（force=true 强制重跑并覆盖，用于显式「重新分析」）
  const runAnalyze = useCallback(async (projectId, force) => {
    if (!projectId) return
    const seq = ++analyzeSeq.current
    setOverview(null)
    setAnalyzing(true)
    setAnalyzeError('')
    try {
      const data = await analyze(projectId, force)
      if (seq !== analyzeSeq.current) return
      setOverview(data)
      setOverviewLoading(false)
      reloadProjects() // 刷新列表分析状态徽标
    } catch (err) {
      if (seq !== analyzeSeq.current) return
      setAnalyzeError(err?.message || '项目分析失败，请稍后重试')
      setOverviewLoading(false)
    } finally {
      if (seq === analyzeSeq.current) setAnalyzing(false)
    }
  }, [reloadProjects])

  // ========== 页面流转 ==========
  const navigate = useCallback((p) => {
    if (p === 'detail') return
    setPage(p)
  }, [])

  const openProject = useCallback((project) => {
    analyzeSeq.current++ // 作废在途分析
    setCurrentProject(project)
    resetOverview()
    setPage('detail')
    loadDbOverview(project.id)
  }, [loadDbOverview, resetOverview])

  // 图谱页顶部切换项目：留在图谱页，只换当前项目与其概况
  const switchProject = useCallback((project) => {
    analyzeSeq.current++
    setCurrentProject(project)
    resetOverview()
    loadDbOverview(project.id)
  }, [loadDbOverview, resetOverview])

  // 列表里的「重新分析」：进入详情并强制重跑
  const analyzeProject = useCallback((project) => {
    analyzeSeq.current++
    setCurrentProject(project)
    resetOverview()
    setPage('detail')
    runAnalyze(project.id, true)
  }, [resetOverview, runAnalyze])

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
    try {
      const res = await upload(project.id, file)
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
  const handleCreate = useCallback(async (payload) => {
    const project = await createProject({
      name: payload.name,
      description: payload.description,
      gitUrl: payload.gitUrl
    })
    await reloadProjects()
    // 进入新项目详情
    analyzeSeq.current++
    setCurrentProject(project)
    resetOverview()
    setPage('detail')

    // 有 zip 则上传（快速），随后按勾选自动分析（不阻塞弹窗关闭）
    if (payload.file) {
      const res = await upload(project.id, payload.file)
      setUploadInfo({ fileName: res?.fileName, fileSize: res?.fileSize })
      await reloadProjects()
      if (payload.autoAnalyze) {
        runAnalyze(project.id, false)
      }
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
        setCurrentProject(null)
        resetOverview()
      }
      if (page === 'detail') setPage('projects')
      reloadProjects()
    } catch (err) {
      showNotice(err?.message || '删除失败')
    }
  }, [currentProject, page, reloadProjects, resetOverview, showNotice])

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
      <Sidebar
        page={page}
        onNavigate={navigate}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onLogout={handleLogout}
        projects={projects}
        onOpenProject={openProject}
      />

      {page === 'memory' ? (
        <MemoryPage
          loggedIn={loggedIn}
          projects={projects}
          currentProject={currentProject}
          overview={overview}
          analyzing={analyzing}
          analyzeError={analyzeError}
          uploadInfo={uploadInfo}
          onOpenProject={switchProject}
          onAnalyze={() => runAnalyze(currentProject?.id, true)}
          onUpload={() => currentProject && askUpload(currentProject)}
          onOpenLogin={() => setLoginOpen(true)}
          onGoProjects={() => setPage('projects')}
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
              error={analyzeError}
              onBack={() => setPage('projects')}
              onUpload={() => currentProject && askUpload(currentProject)}
              onAnalyze={() => runAnalyze(currentProject?.id, true)}
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
    </div>
  )
}
