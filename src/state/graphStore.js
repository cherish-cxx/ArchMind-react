import { useSyncExternalStore } from 'react'
import {
  applyDescriptions,
  applyPatch,
  clearGraph,
  createGraphState,
  deserializeGraph,
  ensureNode,
  serializeGraph,
  setDescriptionsPending,
  setFocus,
  setNodePositions,
  setPath,
  setSelected,
  graphSnapshot
} from '../graph/model.js'

/**
 * graphStore：画布上「有什么」的唯一真相。
 *
 * 和 conversationStore 分开，是这一片最重要的边界：
 *  - 图由 graph patch / class relations 驱动；
 *  - 对话文本、rev、过期状态由 conversationStore 管；
 *  - uiCommands 只改视图状态，不往这里塞数据。
 *
 * 没有第三方状态库，沿用 sessionStore 的 useSyncExternalStore 模式。
 */

let state = createGraphState()
const listeners = new Set()

function commit(next) {
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

export const getGraphState = () => state

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGraphState() {
  return useSyncExternalStore(subscribe, getGraphState, getGraphState)
}

/** 一轮响应里的 graph 合并进来。patch 为 null 时什么都不做。 */
export function applyGraphPatch(patch) {
  commit(applyPatch(state, patch))
}

/** CLEAR_VIEW / 切换项目。 */
export function resetGraph() {
  commit(createGraphState())
}

/** 设置当前锚点（会解析 METHOD → owner 类）。传 null 清空。 */
export function setGraphFocus(uid) {
  commit(setFocus(state, uid))
}

/** 设置选中节点（视觉选中，不一定是锚点）。 */
export function setGraphSelected(uid) {
  commit(setSelected(state, uid))
}

/**
 * 确保节点在图上：FOCUS_NODE / citation 点击时用。
 * 已存在则只合并元数据，不移动坐标。
 */
export function ensureGraphNode(uid, meta) {
  commit(ensureNode(state, uid, meta))
}

/** SHOW_PATH 的高亮路径。传空数组清除。 */
export function setGraphPath(uids) {
  commit(setPath(state, uids))
}

/** 布局层算完坐标后写回。 */
export function applyNodePositions(positions) {
  commit(setNodePositions(state, positions))
}

/** 按需描述返回后合并（不动坐标）。 */
export function applyNodeDescriptions(items) {
  commit(applyDescriptions(state, items))
}

/** 标记 / 清除「描述生成中」。 */
export function setGraphDescriptionsPending(uids, pending) {
  commit(setDescriptionsPending(state, uids, pending))
}

/** 从持久化快照恢复（P3 用）。 */
export function restoreGraph(raw) {
  commit(deserializeGraph(raw))
}

/** 给 viewport 上报用。 */
export function getViewportSnapshot() {
  return graphSnapshot(state)
}

/** 给 localStorage 用。 */
export function getGraphPersistSnapshot() {
  return serializeGraph(state)
}
