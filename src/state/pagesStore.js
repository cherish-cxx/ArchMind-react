import { useSyncExternalStore } from 'react'

/**
 * 画布页面：累积视图 + 最多两个焦点视图。
 *
 * 图数据不在这里（graphStore 是唯一真相）；这里只放「哪一页、这一页的视角」。
 * 焦点页的坐标与 view 都属于页面，写不写回节点由调用方负责 —— 当前实现只读图。
 */

export const CUMULATIVE_PAGE_ID = 'cumulative'
const MAX_FOCUS_PAGES = 2

function makePage(id, kind, centerUid = null) {
  return {
    id,
    kind,
    centerUid,
    hops: 1,
    collapsedPackages: new Set(),
    view: { scale: 1, x: 0, y: 0 },
    selectedUid: null,
    openedSeq: 0
  }
}

function initialState() {
  return {
    pages: [makePage(CUMULATIVE_PAGE_ID, 'cumulative')],
    activeId: CUMULATIVE_PAGE_ID,
    seq: 0
  }
}

let state = initialState()
const listeners = new Set()

function commit(next) {
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

export const getPagesState = () => state

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePagesState() {
  return useSyncExternalStore(subscribe, getPagesState, getPagesState)
}

export function getActivePage() {
  return state.pages.find((p) => p.id === state.activeId) || state.pages[0]
}

export function resetPages() {
  commit(initialState())
}

export function activatePage(id) {
  if (!state.pages.some((p) => p.id === id) || state.activeId === id) return
  commit({ ...state, activeId: id })
}

/** 同类只激活已有页；满了替换最早打开的（不是最久未用）。 */
export function openFocusPage(centerUid) {
  if (!centerUid) return null

  const existing = state.pages.find((p) => p.kind === 'focus' && p.centerUid === centerUid)
  if (existing) {
    if (state.activeId !== existing.id) commit({ ...state, activeId: existing.id })
    return existing
  }

  let pages = state.pages
  const focusPages = pages.filter((p) => p.kind === 'focus')
  if (focusPages.length >= MAX_FOCUS_PAGES) {
    const oldest = focusPages.reduce((a, b) => (a.openedSeq <= b.openedSeq ? a : b))
    pages = pages.filter((p) => p.id !== oldest.id)
  }

  const seq = state.seq + 1
  const page = {
    ...makePage(`focus:${centerUid}`, 'focus', centerUid),
    openedSeq: seq
  }
  commit({ ...state, pages: [...pages, page], activeId: page.id, seq })
  return page
}

export function closeFocusPage(id) {
  const page = state.pages.find((p) => p.id === id && p.kind === 'focus')
  if (!page) return

  const pages = state.pages.filter((p) => p.id !== id)
  let activeId = state.activeId
  if (activeId === id) {
    const next = pages
      .filter((p) => p.kind === 'focus')
      .sort((a, b) => b.openedSeq - a.openedSeq)[0]
    activeId = next ? next.id : CUMULATIVE_PAGE_ID
  }
  commit({ ...state, pages, activeId })
}

export function closeAllFocusPages() {
  const cumulative =
    state.pages.find((p) => p.kind === 'cumulative') ||
    makePage(CUMULATIVE_PAGE_ID, 'cumulative')
  if (state.pages.length === 1 && state.activeId === cumulative.id) return
  commit({ ...state, pages: [cumulative], activeId: cumulative.id })
}

/** updater 既可以是新 view，也可以是 (prev) => next。 */
export function setPageView(id, updater) {
  const page = state.pages.find((p) => p.id === id)
  if (!page) return
  const nextView = typeof updater === 'function' ? updater(page.view) : updater
  if (!nextView || nextView === page.view) return
  commit({
    ...state,
    pages: state.pages.map((p) => (p.id === id ? { ...p, view: nextView } : p))
  })
}

export function setPageSelected(id, uid) {
  const page = state.pages.find((p) => p.id === id)
  if (!page || page.selectedUid === uid) return
  commit({
    ...state,
    pages: state.pages.map((p) => (p.id === id ? { ...p, selectedUid: uid } : p))
  })
}

export function togglePackage(id, name) {
  const page = state.pages.find((p) => p.id === id)
  if (!page) return
  const next = new Set(page.collapsedPackages)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  commit({
    ...state,
    pages: state.pages.map((p) => (p.id === id ? { ...p, collapsedPackages: next } : p))
  })
}

/** 当前所有焦点页的中心：累积页装箱时用来豁免这些源分组。 */
export function focusCenterUids() {
  return new Set(
    state.pages
      .filter((p) => p.kind === 'focus' && p.centerUid)
      .map((p) => p.centerUid)
  )
}
