import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar from '../components/TopBar'
import ProjectInfo from '../components/ProjectInfo'
import GraphCanvas from '../components/graph/GraphCanvas'
import GraphEmptyState from '../components/graph/GraphEmptyState'
import GraphStatusBar from '../components/graph/GraphStatusBar'
import GraphTabs from '../components/graph/GraphTabs'
import AgentPanel from '../components/agent/AgentPanel'
import { listClasses, classRelations } from '../api/project'
import { getConversation as apiGetConversation, navigate as apiNavigate } from '../api/agent'
import { classRelationsToGraph, classToNode } from '../graph/adapters'
import { buildCumulativeModel, buildFocusModel, pageSnapshot } from '../graph/view'
import {
  activatePage,
  closeAllFocusPages,
  closeFocusPage,
  getPagesState,
  openFocusPage,
  resetPages,
  setPageSelected,
  setPageView,
  togglePackage,
  usePagesState
} from '../state/pagesStore'
import {
  layoutBfs,
  layoutDepth,
  layoutRadial,
  placeIncremental,
  shiftIntoBounds
} from '../graph/layout'
import { ownerUid, simpleName } from '../graph/model'
import {
  applyGraphPatch,
  applyNodePositions,
  ensureGraphNode,
  getGraphPersistSnapshot,
  getGraphState,
  resetGraph,
  restoreGraph,
  setGraphFocus,
  setGraphPath,
  setGraphSelected,
  useGraphState
} from '../state/graphStore'
import {
  appendAgentMessage,
  appendErrorMessage,
  getConversationPersistSnapshot,
  getConversationState,
  hydrateConversation,
  markSessionExpired,
  prepareProject,
  setLocalRev,
  setSessionExpired,
  startNewConversation
} from '../state/conversationStore'
import {
  clearProjectCache,
  loadChatSnapshot,
  loadGraphSnapshot,
  saveChatSnapshot,
  saveGraphSnapshot
} from '../state/persistence'
import { useViewportReporter } from '../hooks/useViewportReporter'
import { useAgentChat } from '../hooks/useAgentChat'
import { useClassDescriptions } from '../hooks/useClassDescriptions'

/**
 * Agent 的图 patch 没有中心标记。类关系形状天然是星形（所有边都连着中心），
 * 用度数就能判断；调用链有 depth，会先走 depth 布局，不会落到这里。
 */
function inferStarCenter(patch) {
  const edges = patch?.edges || []
  if (edges.length < 2) return null
  const degree = new Map()
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1)
    degree.set(e.to, (degree.get(e.to) || 0) + 1)
  }
  let best = null
  for (const [uid, d] of degree) {
    if (!best || d > best[1]) best = [uid, d]
  }
  return best && best[1] === edges.length ? best[0] : null
}

function hasRelation(state, uid) {
  for (const e of state.edges.values()) {
    if (e.from === uid || e.to === uid) return true
  }
  return false
}

/** 焦点页只画 1 跳：目标是不是中心或它的直接邻居。 */
function isDirectNeighbor(centerUid, uid) {
  if (!centerUid || !uid) return false
  if (centerUid === uid) return true
  for (const e of getGraphState().edges.values()) {
    if ((e.from === centerUid && e.to === uid) || (e.to === centerUid && e.from === uid)) {
      return true
    }
  }
  return false
}

/**
 * 类清单缓存放在模块级，而不是组件 ref 里：
 * React StrictMode 在开发环境会卸载重挂组件，ref 会跟着重置，
 * 只靠 ref 去重仍会发两次请求。分析开始/结束时清掉对应项目的缓存。
 */
const classesCache = new Map()

/**
 * 记忆地图页（P1 版本）。
 *
 * 这一页的职责边界：
 *  - 它负责「选项目 → 选类 → 把图和锚点摆好」；
 *  - 它持有 AgentPanel 与 useAgentChat，因为 Agent 返回的图 patch 必须落进同一张画布；
 *  - 它不自己请求 Agent 的图数据 —— /classes 与 /class/relations 只服务入口预览。
 */
export default function MemoryPage({
  loggedIn,
  projects = [],
  currentProject,
  overview,
  analyzing,
  analyzeError,
  taskProgress = 0,
  taskStage = '',
  uploadInfo,
  onOpenProject,
  onAnalyze,
  onUpload,
  onOpenCode,
  onOpenLogin,
  onGoProjects,
  methodFocus,
  onClearMethodFocus
}) {
  const graph = useGraphState()
  const projectId = currentProject?.id || null

  const [classes, setClasses] = useState([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classesError, setClassesError] = useState('')
  const [classesRefresh, setClassesRefresh] = useState(0)

  const pages = usePagesState()
  const activePage = pages.pages.find((p) => p.id === pages.activeId) || pages.pages[0]
  const view = activePage.view
  // 走 getPagesState() 而不是闭包里的 activePage：CLEAR_VIEW 先关焦点页再重置视图，
  // 同一帧里 activeId 已经变了，闭包会指到已经删掉的页。
  const setView = useCallback(
    (updater) => setPageView(getPagesState().activeId, updater),
    []
  )
  const [fitSignal, setFitSignal] = useState(0)
  // 窄屏（例如桌面应用的预览分栏）默认收起 Agent 面板，
  // 否则 232px 侧栏 + 340px 面板会把画布挤到不可用宽度。
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900
  )
  const [panelWidth, setPanelWidth] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1400
    return Math.max(280, Math.min(380, Math.round(w * 0.26)))
  })
  const [relFilters, setRelFilters] = useState({
    CALLS: true,
    EXTENDS: true,
    IMPLEMENTS: true,
    DEPENDS: true
  })
  // 已展开的框：key -> 展开时的矩形。只影响累积页的投影，不写回节点坐标。
  const [expandedBoxes, setExpandedBoxes] = useState(() => new Map())

  const canvasWrapRef = useRef(null)
  const selectSeq = useRef(0)
  const classesSeq = useRef(0)
  const prevClassesAnalyzingRef = useRef(analyzing)
  const prevAnalyzingRef = useRef(analyzing)
  const [navigating, setNavigating] = useState(false)

  // 焦点页中心列表只在「打开/关闭/替换」时变；用字符串 key 避免平移缩放也重算模型。
  const focusCenterKey = pages.pages
    .filter((p) => p.kind === 'focus' && p.centerUid)
    .map((p) => p.centerUid)
    .join('|')
  const activeFocusCenters = useMemo(
    () => new Set(focusCenterKey ? focusCenterKey.split('|') : []),
    [focusCenterKey]
  )

  const cumulativeModel = useMemo(() => {
    const protectedUids = new Set(activeFocusCenters)
    if (graph.focusUid) protectedUids.add(graph.focusUid)
    if (graph.selectedUid) protectedUids.add(graph.selectedUid)
    for (const uid of graph.pathUids || []) protectedUids.add(uid)
    return buildCumulativeModel(graph, {
      filters: relFilters,
      protectedUids,
      exemptSourceUids: activeFocusCenters,
      expandedBoxes
    })
  }, [graph, relFilters, expandedBoxes, activeFocusCenters])

  const activeModel = useMemo(() => {
    if (activePage.kind === 'focus') {
      return buildFocusModel(graph, activePage, { filters: relFilters })
    }
    return cumulativeModel
  }, [
    activePage.kind,
    activePage.id,
    activePage.centerUid,
    activePage.selectedUid,
    activePage.collapsedPackages,
    graph,
    relFilters,
    cumulativeModel
  ])

  // 切页后自动适配一次；每页各自保留自己的 view，节点坐标互不影响。
  useEffect(() => {
    setFitSignal((n) => n + 1)
  }, [pages.activeId])

  /**
   * 项目切换 / 刷新恢复。
   *
   * 顺序很重要：
   *  1. 先 prepareProject（让 conversationStore 的 projectId 对齐，后续 hydrate 才认）；
   *  2. 本地图/对话快照先恢复，保证刷新后不是白屏；
   *  3. 再用服务端会话校准 rev/focus/可见节点 —— 服务端说会话没了就置过期，不静默重开。
   */
  useEffect(() => {
    let alive = true
    selectSeq.current++
    resetPages()
    setFitSignal((n) => n + 1)
    setNavigating(false)
    setExpandedBoxes(new Map())

    if (!loggedIn || !projectId) {
      resetGraph()
      prepareProject(null)
      return () => { alive = false }
    }

    prepareProject(projectId)

    const rawGraph = loadGraphSnapshot(projectId)
    if (rawGraph) restoreGraph(rawGraph)
    else resetGraph()
    setFitSignal((n) => n + 1)

    const rawChat = loadChatSnapshot(projectId)
    if (rawChat) hydrateConversation(rawChat)
    else startNewConversation()

    const cid = getConversationState().conversationId
    if (!cid) return () => { alive = false }

    apiGetConversation(cid, projectId)
      .then((snap) => {
        if (!alive) return
        if (!snap.exists) {
          markSessionExpired()
          return
        }

        // 服务端说会话还在，本地「过期」标记以服务端为准
        setSessionExpired(false)
        if (snap.viewport) setLocalRev(snap.viewport.rev)

        if (snap.focus?.uid) {
          ensureGraphNode(snap.focus.uid)
          setGraphFocus(snap.focus.uid)
        }

        // 本地快照缺失时，用服务端 viewport 的 uid/关系重建（节点只能是 stub）
        const state = getGraphState()
        const missing = (snap.viewport?.visibleNodes || [])
          .map((uid) => ownerUid(uid))
          .filter((uid) => !state.nodes.has(uid))
        const relations = snap.viewport?.visibleRelations || []
        if (missing.length > 0 || (state.edges.size === 0 && relations.length > 0)) {
          const wasEmpty = state.nodes.size === 0
          applyGraphPatch({
            nodes: missing.map((uid) => ({ uid, name: simpleName(uid) })),
            edges: relations,
            gaps: [],
            truncated: false
          })
          if (wasEmpty) {
            const after = getGraphState()
            applyNodePositions(layoutBfs(after, snap.focus?.uid || after.focusUid))
          }
          setFitSignal((n) => n + 1)
        }
      })
      .catch(() => {})

    return () => { alive = false }
  }, [projectId, loggedIn])

  // 刚开始一次新的分析：旧图与旧会话都不再可信，直接清掉本地缓存。
  // 初始 mount 时 analyzing 可能已经是 true，所以用 ref 判断「从 false 变 true」。
  useEffect(() => {
    const was = prevAnalyzingRef.current
    prevAnalyzingRef.current = analyzing
    if (!projectId || !analyzing || was) return
    clearProjectCache(projectId)
    resetGraph()
    startNewConversation()
    resetPages()
    setExpandedBoxes(new Map())
    setFitSignal((n) => n + 1)
  }, [analyzing, projectId])

  /**
   * 类清单加载。
   *
   * StrictMode 会把 effect 跑两遍，简单实现会发两次请求；这里用同 key 的
   * in-flight promise 去重。项目变化或分析结束会清掉缓存，强制重读。
   */
  const loadClasses = useCallback(() => {
    if (!loggedIn || !projectId) return Promise.resolve([])
    const key = String(projectId)
    const cached = classesCache.get(key)
    if (cached) return cached
    const promise = listClasses(projectId).catch((err) => {
      if (classesCache.get(key) === promise) classesCache.delete(key)
      throw err
    })
    classesCache.set(key, promise)
    return promise
  }, [projectId, loggedIn])

  useEffect(() => {
    let alive = true
    const seq = ++classesSeq.current
    if (!loggedIn || !projectId) {
      setClasses([])
      setClassesError('')
      setClassesLoading(false)
      return () => { alive = false }
    }

    setClassesLoading(true)
    setClassesError('')
    loadClasses()
      .then((list) => {
        if (alive && seq === classesSeq.current) setClasses(list || [])
      })
      .catch((err) => {
        if (alive && seq === classesSeq.current) {
          setClasses([])
          setClassesError(err?.message || '类清单加载失败')
        }
      })
      .finally(() => {
        if (alive && seq === classesSeq.current) setClassesLoading(false)
      })

    return () => { alive = false }
  }, [loadClasses, loggedIn, projectId, classesRefresh])

  // 分析开始：旧清单作废；分析结束：强制重读一次。
  useEffect(() => {
    const was = prevClassesAnalyzingRef.current
    prevClassesAnalyzingRef.current = analyzing
    if (analyzing) {
      classesCache.delete(String(projectId))
    } else if (was) {
      classesCache.delete(String(projectId))
      setClassesRefresh((n) => n + 1)
    }
  }, [analyzing, projectId])

  const centerOnNode = useCallback((uid, minScale = 1) => {
    const el = canvasWrapRef.current
    const node = getGraphState().nodes.get(uid)
    if (!el || !node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return
    const w = el.clientWidth
    const h = el.clientHeight
    setView((v) => {
      const scale = Math.max(v.scale, minScale)
      return { scale, x: w / 2 - node.x * scale, y: h / 2 - node.y * scale }
    })
  }, [])

  /** 类关系 → patch → 星形布局。selectClass 与 EXPAND_NODE 共用。 */
  const mergeRelations = useCallback((relations) => {
    const converted = classRelationsToGraph(relations)
    if (!converted) return false
    applyGraphPatch(converted.patch)
    const after = getGraphState()
    const patchUids = converted.patch.nodes.map((n) => n.uid)
    const positions = layoutRadial(after, converted.centerUid, patchUids)
    applyNodePositions(shiftIntoBounds(after, positions))
    return true
  }, [])

  /** 本地展开：后端 `/navigate` 目前不产生 EXPAND_NODE，前端自己补一跳。 */
  const expandNode = useCallback(async (uid) => {
    if (!projectId || !uid) return false
    try {
      const relations = await classRelations(projectId, uid)
      if (!mergeRelations(relations)) return false
      ensureGraphNode(uid)
      setGraphFocus(uid)
      setGraphSelected(uid)
      setGraphPath([])
      centerOnNode(uid)
      setFitSignal((n) => n + 1)
      return true
    } catch {
      return false
    }
  }, [projectId, mergeRelations, centerOnNode])

  /**
   * 选一个类作为锚点。
   *
   * 第一次选中时顺手拉 1-hop：后端没有 embedding，单节点画布对用户没有信息量。
   * 已有边的节点不重复拉，避免在图上点一下就重排一次。
   */
  const selectClass = useCallback(async (clazz) => {
    const uid = clazz?.qualifiedName || clazz?.uid
    if (!uid || !projectId) return

    // 换到别的类时，旧的方法锁已过期 —— 否则会出现「问 A 类、拿 B 的方法答」
    if (methodFocus && methodFocus.uid.split('#', 1)[0] !== uid) {
      onClearMethodFocus?.()
    }

    const seq = ++selectSeq.current
    const before = getGraphState()
    // 原生双击必然先触发两次 click：已聚焦且有关系的节点不重复拉取、不重复布局
    const settled = before.focusUid === uid
      && before.selectedUid === uid
      && hasRelation(before, uid)
    const meta = classToNode(clazz) || {
      uid,
      name: clazz?.simpleName || simpleName(uid)
    }

    ensureGraphNode(uid, meta)
    setGraphFocus(uid)
    setGraphSelected(uid)

    if (settled) {
      centerOnNode(uid)
      return
    }

    let state = getGraphState()
    if (!Number.isFinite(state.nodes.get(uid)?.x)) {
      const positions = placeIncremental(state, [uid], before.focusUid)
      applyNodePositions(shiftIntoBounds(state, positions))
      state = getGraphState()
    }
    centerOnNode(uid)

    const hasEdge = [...state.edges.values()].some((e) => e.from === uid || e.to === uid)
    if (hasEdge) return

    try {
      const relations = await classRelations(projectId, uid)
      if (seq !== selectSeq.current) return
      if (mergeRelations(relations)) setFitSignal((n) => n + 1)
    } catch {
      // 关系查询失败时保留单节点：选类本身仍然成立，不弹错打断探索。
    }
  }, [projectId, centerOnNode, mergeRelations, methodFocus, onClearMethodFocus])

  const handleNodeClick = useCallback((uid) => {
    // 焦点页单击只选中，不重定中心；要换中心就点另一个节点的焦点按钮。
    if (activePage.kind === 'focus') {
      setPageSelected(activePage.id, uid)
      return
    }
    const clazz = classes.find((c) => c.qualifiedName === uid)
    selectClass(clazz || { qualifiedName: uid, simpleName: simpleName(uid) })
  }, [activePage, classes, selectClass])

  const handleBackgroundClick = useCallback(() => {
    if (activePage.kind === 'focus') setPageSelected(activePage.id, null)
    else setGraphSelected(null)
  }, [activePage])

  // 双击才看源码。单击已经把节点设为焦点，这里只负责打开窗口。
  const handleNodeOpen = useCallback((uid) => {
    const clazz = classes.find((c) => c.qualifiedName === uid)
    onOpenCode?.(uid, clazz?.simpleName)
  }, [classes, onOpenCode])

  /** 焦点页打开时的 1 跳：只给没有坐标的新节点找位置，已有节点一律不动。 */
  const mergeRelationsIncremental = useCallback((converted) => {
    if (!converted) return
    const before = getGraphState()
    applyGraphPatch(converted.patch)
    const after = getGraphState()
    const newUids = (converted.patch.nodes || [])
      .map((n) => n.uid)
      .filter((uid) => !Number.isFinite(before.nodes.get(uid)?.x))
    if (newUids.length === 0) return
    const positions = placeIncremental(after, newUids, after.focusUid || converted.centerUid)
    applyNodePositions(shiftIntoBounds(after, positions))
  }, [])

  const openFocusTab = useCallback(async (uid) => {
    if (!uid) return
    const current = getPagesState()
    const existed = current.pages.some(
      (p) => p.kind === 'focus' && p.centerUid === uid
    )
    const page = openFocusPage(uid)
    if (!page || existed) return

    setFitSignal((n) => n + 1)
    if (!projectId) return

    try {
      const relations = await classRelations(projectId, uid)
      mergeRelationsIncremental(classRelationsToGraph(relations))
      if (getPagesState().activeId === page.id) setFitSignal((n) => n + 1)
    } catch {
      // 关系拉不到就只显示中心，焦点页仍然可用
    }
  }, [projectId, mergeRelationsIncremental])

  const handleNodeFocus = useCallback((uid) => {
    openFocusTab(uid)
  }, [openFocusTab])

  const handlePackageToggle = useCallback((name) => {
    const current = getPagesState()
    const page = current.pages.find((p) => p.id === current.activeId)
    if (page?.kind === 'focus') togglePackage(page.id, name)
  }, [])

  const handlePickClass = useCallback((clazz) => {
    const current = getPagesState()
    const page = current.pages.find((p) => p.id === current.activeId)
    if (page?.kind === 'focus') {
      const uid = clazz?.qualifiedName || clazz?.uid
      if (uid) openFocusTab(uid)
      return
    }
    selectClass(clazz)
  }, [selectClass, openFocusTab])

  const handleRelayout = useCallback(() => {
    const current = getPagesState()
    const page = current.pages.find((p) => p.id === current.activeId)
    // 焦点页的中心固定、节点按环排；「重新布局」只服务累积页。
    if (page?.kind === 'focus') return
    const state = getGraphState()
    if (state.nodes.size === 0) return
    const positions = layoutBfs(state, state.focusUid)
    applyNodePositions(shiftIntoBounds(state, positions))
    setFitSignal((n) => n + 1)
  }, [])

  const handleBoxToggle = useCallback((key) => {
    setExpandedBoxes((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
        return next
      }
      const box = cumulativeModel.boxes.find((b) => b.key === key)
      if (!box) return prev
      next.set(key, box.rect)
      return next
    })
  }, [cumulativeModel])

  const handleBoxCollapse = useCallback((key) => {
    setExpandedBoxes((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  // 图变化后成员集合可能变了，旧 key 不再对应任何框，顺手清掉。
  useEffect(() => {
    setExpandedBoxes((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map()
      for (const [key, rect] of prev) {
        if (cumulativeModel.allBoxKeys.has(key)) next.set(key, rect)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [cumulativeModel])

  const handleZoomBy = (factor) => {
    const el = canvasWrapRef.current
    setView((v) => {
      const next = Math.min(2.5, Math.max(0.25, v.scale * factor))
      const k = next / v.scale
      const cx = el ? el.clientWidth / 2 : 0
      const cy = el ? el.clientHeight / 2 : 0
      return { scale: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }

  const handleFullscreen = () => {
    const el = canvasWrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  /**
   * 执行后端下发的视图命令。
   *
   * rev 语义：命令基于旧屏幕时（cmd.rev < localRev）**丢弃** ——
   * 否则一条为旧图算出的 FOCUS 会把用户刚看的新图拉回去。
   */
  const executeCommands = useCallback(async (commands) => {
    if (!commands || commands.length === 0) return false
    let applied = false
    const localRev = getConversationState().localRev

    for (const cmd of commands) {
      const rev = Number(cmd?.rev)
      if (Number.isFinite(rev) && rev < localRev) continue

      const current = getPagesState()
      const page = current.pages.find((p) => p.id === current.activeId)
      const onFocusPage = page?.kind === 'focus'

      if (cmd.op === 'CLEAR_VIEW') {
        closeAllFocusPages()
        resetGraph()
        setView({ scale: 1, x: 0, y: 0 })
        setFitSignal((n) => n + 1)
        applied = true
        continue
      }

      const target = cmd?.target?.uid ? ownerUid(cmd.target.uid) : null
      if (!target) continue

      if (onFocusPage) {
        // 焦点页只画 1 跳：能选的选中，其余命令不在这里执行，也不自动切页。
        if (cmd.op === 'FOCUS_NODE' && isDirectNeighbor(page.centerUid, target)) {
          setPageSelected(page.id, target)
          applied = true
        }
        continue
      }

      if (cmd.op === 'FOCUS_NODE') {
        if (!getGraphState().nodes.has(target)) {
          const clazz = classes.find((c) => c.qualifiedName === target)
          await selectClass(clazz || { qualifiedName: target, simpleName: simpleName(target) })
        } else {
          ensureGraphNode(target)
          setGraphFocus(target)
          setGraphSelected(target)
          centerOnNode(target)
        }
        setGraphPath([])
        applied = true
      } else if (cmd.op === 'SHOW_PATH') {
        ensureGraphNode(target)
        setGraphFocus(target)
        setGraphSelected(target)
        const state = getGraphState()
        // 起点（call-chain 的 start）没有 depth；不放进去的话，
        // 所有「起点 → 下游」的边两端不会同时命中高亮。
        const path = [target, ...state.nodes.values()
          .filter((n) => Number.isFinite(n.depth) && n.uid !== target)
          .map((n) => n.uid)]
        if (path.length > 0) {
          setGraphPath(path)
          applyNodePositions(shiftIntoBounds(state, layoutDepth(state, path)))
        }
        setFitSignal((n) => n + 1)
        applied = true
      } else if (cmd.op === 'EXPAND_NODE') {
        applied = (await expandNode(target)) || applied
      }
    }

    return applied
  }, [classes, selectClass, expandNode, centerOnNode])

  /**
   * 一轮响应：先合并证据子图（含布局），再执行视图命令。
   * 命令必须在 patch 之后 —— FOCUS / SHOW_PATH 指向的节点可能刚由 patch 加进来。
   */
  const applyAgentResponse = useCallback(async (response) => {
    const patch = response?.graph

    if (patch) {
      const before = getGraphState()
      applyGraphPatch(patch)
      const after = getGraphState()

      const patchUids = (patch.nodes || []).map((n) => n.uid)
      if (patchUids.length > 0) {
        let positions = {}
        const current = getPagesState()
        const page = current.pages.find((p) => p.id === current.activeId)
        if (page?.kind === 'focus') {
          // 焦点页不重排累积图：只给新节点找位置，已有坐标一律不动。
          const newUids = patchUids.filter(
            (uid) => !Number.isFinite(before.nodes.get(uid)?.x)
          )
          if (newUids.length > 0) {
            positions = placeIncremental(after, newUids, page.centerUid || after.focusUid)
          }
        } else if ((patch.nodes || []).some((n) => Number.isFinite(n.depth))) {
          positions = layoutDepth(after, patchUids)
        } else {
          const center = inferStarCenter(patch)
          if (center) {
            positions = layoutRadial(after, center, patchUids)
          } else {
            const newUids = patchUids.filter((uid) => !before.nodes.has(uid))
            if (newUids.length > 0) {
              positions = placeIncremental(after, newUids, after.focusUid)
            }
          }
        }

        if (Object.keys(positions).length > 0) {
          applyNodePositions(shiftIntoBounds(after, positions))
        }
      }
    }

    await executeCommands(response?.uiCommands)
    if (patch) setFitSignal((n) => n + 1)
  }, [executeCommands])

  const getFocus = useCallback(() => {
    if (activePage.kind === 'focus' && activePage.centerUid) {
      return { type: 'CLASS', uid: activePage.selectedUid || activePage.centerUid }
    }
    return graph.focusUid ? { type: 'CLASS', uid: graph.focusUid } : null
  }, [activePage, graph.focusUid])

  // 方法锁是独立锚点：画布仍停在类上，提问时额外带上方法 uid
  const getMethodUid = useCallback(() => methodFocus?.uid || null, [methodFocus])

  // 图/焦点变化后 400ms 上报整屏快照；flush 在发问前把屏幕先刷上去。
  const { flush: flushViewport } = useViewportReporter({
    projectId,
    enabled: loggedIn && !!projectId,
    getSnapshot: () => pageSnapshot(activeModel),
    revision: activeModel
  })

  // 切页立即把新屏幕刷上去：为旧页面算出的 uiCommands 会被 rev 守卫丢掉。
  useEffect(() => {
    if (!loggedIn || !projectId) return
    flushViewport()
  }, [pages.activeId, loggedIn, projectId, flushViewport])

  // 节点进入画布且没有描述时按需补齐；不阻塞渲染，失败了就保持无描述。
  useClassDescriptions({
    projectId,
    enabled: loggedIn && !!projectId && !analyzing
  })

  const {
    conversation,
    send,
    retry,
    cancel,
    startNew
  } = useAgentChat({
    projectId,
    getFocus,
    getMethodUid,
    onGraph: applyAgentResponse,
    beforeSend: flushViewport
  })

  // 本地快照：图与对话各存一份。刷新后先恢复，再由服务端会话校准。
  useEffect(() => {
    if (!projectId) return
    const timer = setTimeout(() => {
      saveGraphSnapshot(projectId, getGraphPersistSnapshot())
    }, 250)
    return () => clearTimeout(timer)
  }, [graph, projectId])

  useEffect(() => {
    if (!projectId) return
    const timer = setTimeout(() => {
      saveChatSnapshot(projectId, getConversationPersistSnapshot())
    }, 250)
    return () => clearTimeout(timer)
  }, [conversation, projectId])

  // 刷新/离开页面时同步落盘，避免 250ms 防抖还没跑完。
  useEffect(() => {
    if (!projectId) return
    const saveNow = () => {
      saveGraphSnapshot(projectId, getGraphPersistSnapshot())
      saveChatSnapshot(projectId, getConversationPersistSnapshot())
    }
    window.addEventListener('pagehide', saveNow)
    return () => {
      window.removeEventListener('pagehide', saveNow)
      saveNow()
    }
  }, [projectId])

  /** 退回去：前端直接声明意图，后端出栈，零 LLM。 */
  const handleBack = useCallback(async () => {
    const cid = getConversationState().conversationId
    if (!projectId || !cid || conversation.pending || conversation.sessionExpired || navigating) {
      return
    }
    setNavigating(true)
    try {
      const response = await apiNavigate({ projectId, conversationId: cid, op: 'BACK' })
      appendAgentMessage(response)
      await applyAgentResponse(response)
    } catch (err) {
      appendErrorMessage(err?.message || '退回失败')
    } finally {
      setNavigating(false)
    }
  }, [projectId, conversation.pending, conversation.sessionExpired, navigating, applyAgentResponse])

  const canBack =
    !!conversation.conversationId &&
    !conversation.pending &&
    !conversation.sessionExpired &&
    !navigating

  // citation 可能是方法级，图节点是类级：落到 owner 类上再聚焦。
  const handleCitation = useCallback((uid) => {
    const owner = ownerUid(uid)
    const current = getPagesState()
    const page = current.pages.find((p) => p.id === current.activeId)
    if (page?.kind === 'focus') {
      if (isDirectNeighbor(page.centerUid, owner)) setPageSelected(page.id, owner)
      else openFocusTab(owner)
      return
    }
    const clazz = classes.find((c) => c.qualifiedName === owner)
    selectClass(clazz || { qualifiedName: owner, simpleName: simpleName(owner) })
  }, [classes, selectClass, openFocusTab])

  const handleClearFocus = useCallback(() => {
    const current = getPagesState()
    const page = current.pages.find((p) => p.id === current.activeId)
    if (page?.kind === 'focus') {
      setPageSelected(page.id, null)
      return
    }
    setGraphFocus(null)
    setGraphSelected(null)
  }, [])

  const handlePanelResize = useCallback((clientX) => {
    const w = Math.min(560, Math.max(300, window.innerWidth - clientX))
    setPanelWidth(w)
  }, [])

  const activeFocusUid =
    activePage.kind === 'focus'
      ? activePage.selectedUid || activePage.centerUid
      : graph.focusUid
  const focusNode = activeFocusUid ? graph.nodes.get(activeFocusUid) : null
  const focusLabel = focusNode?.name || (activeFocusUid ? simpleName(activeFocusUid) : '')

  return (
    <main className="main memory-main">
      <div className="memory-left">
        <TopBar
          projects={projects}
          currentProject={currentProject}
          onOpenProject={onOpenProject}
          classes={classes}
          onPickClass={handlePickClass}
          relFilters={relFilters}
          onToggleRel={(rel) => setRelFilters((f) => ({ ...f, [rel]: !f[rel] }))}
          scale={view.scale}
          onZoomIn={() => handleZoomBy(1.2)}
          onZoomOut={() => handleZoomBy(1 / 1.2)}
          onFit={() => setFitSignal((n) => n + 1)}
          onFullscreen={handleFullscreen}
        />

        <ProjectInfo
          loggedIn={loggedIn}
          currentProject={currentProject}
          hasProjects={projects.length > 0}
          uploadInfo={uploadInfo}
          overview={overview}
          analyzing={analyzing}
          taskProgress={taskProgress}
          taskStage={taskStage}
          error={analyzeError}
          onAnalyze={onAnalyze}
        />

        <GraphTabs
          pages={pages.pages}
          activeId={pages.activeId}
          onActivate={activatePage}
          onClose={closeFocusPage}
        />

        <div className="canvas-wrap" ref={canvasWrapRef}>
          <GraphCanvas
            model={activeModel}
            filters={relFilters}
            view={view}
            setView={setView}
            fitSignal={fitSignal}
            onNodeClick={handleNodeClick}
            onNodeOpen={handleNodeOpen}
            onNodeFocus={handleNodeFocus}
            onBoxToggle={handleBoxToggle}
            onBoxCollapse={handleBoxCollapse}
            onPackageToggle={handlePackageToggle}
            onBackgroundClick={handleBackgroundClick}
          />

          {graph.nodes.size === 0 && (
            <GraphEmptyState
              loggedIn={loggedIn}
              currentProject={currentProject}
              projectsCount={projects.length}
              overview={overview}
              classes={classes}
              classesLoading={classesLoading}
              classesError={classesError}
              analyzing={analyzing}
              onAnalyze={onAnalyze}
              onUpload={onUpload}
              onGoProjects={onGoProjects}
              onOpenLogin={onOpenLogin}
              onPickClass={selectClass}
            />
          )}

          <GraphStatusBar
            nodes={activeModel.nodes.length}
            edges={activeModel.edges.length}
            gaps={activeModel.gaps.length}
            hiddenCount={activeModel.hiddenCount}
            truncated={activeModel.truncated}
            focusLabel={focusLabel}
            canRelayout={activePage.kind !== 'focus'}
            onRelayout={handleRelayout}
          />
        </div>
      </div>

      <AgentPanel
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed((v) => !v)}
        width={panelWidth}
        onResize={handlePanelResize}
        projectId={projectId}
        messages={conversation.messages}
        pending={conversation.pending}
        sessionExpired={conversation.sessionExpired}
        focusLabel={focusLabel}
        onSend={send}
        onCancel={cancel}
        onRetry={retry}
        onNewConversation={startNew}
        onBack={handleBack}
        canBack={canBack}
        navigating={navigating}
        onCitation={handleCitation}
        onClearFocus={handleClearFocus}
        methodFocus={methodFocus}
        onClearMethodFocus={onClearMethodFocus}
      />
    </main>
  )
}
