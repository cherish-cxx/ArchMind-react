/**
 * 项目流程：源码 → 分析 → 概况 → 领域 → 记忆。
 *
 * 这不是四个并列的页面，而是一条有前后关系的线。流程轨据此给每个按钮一个坐标：
 * 处于哪个阶段、哪些已经走过、下一步是什么，都由这里算出来，页面不再各自判断。
 */

export const STAGE_KEYS = ['source', 'analysis', 'overview', 'domain', 'memory']

export const STAGE_LABELS = {
  source: '源码',
  analysis: '分析',
  overview: '概况',
  domain: '领域',
  memory: '记忆'
}

// 有对应页面的阶段才能点。源码/分析没有独立页面，它们的动作由流程轨右侧的主按钮承担。
export const STAGE_PAGES = {
  overview: 'detail',
  domain: 'domain',
  memory: 'memory'
}

// 页面 → 阶段：详情页展示的是概况，领域页是领域，记忆页是记忆
const PAGE_STAGE = {
  detail: 'overview',
  domain: 'domain',
  memory: 'memory'
}

/**
 * 每个阶段的状态：done 已可访问 / blocked 还走不到 / error 上次失败。
 * 「你现在在哪」由 currentStage 决定，和这里的状态分开——
 * 同一个阶段可以既是 done 又是 current。
 */
export function stageStates(project) {
  const status = project?.analysisStatus
  const hasSource = Boolean(status) && status !== 'NO_SOURCE'
  const completed = status === 'COMPLETED'
  const failed = status === 'FAILED' || status === 'PARTIAL'

  return {
    source: hasSource ? 'done' : 'blocked',
    analysis: completed ? 'done' : failed ? 'error' : 'blocked',
    overview: completed ? 'done' : 'blocked',
    domain: completed ? 'done' : 'blocked',
    memory: completed ? 'done' : 'blocked'
  }
}

/**
 * 当前所在阶段。
 *
 * 分析没完成时，位置由「卡在哪」决定，而不是由用户碰巧打开的页面决定：
 * 没有源码就是源码阶段，分析没跑完就是分析阶段。
 */
export function currentStage(project, analyzing, page) {
  const status = project?.analysisStatus
  if (!status || status === 'NO_SOURCE') return 'source'
  if (analyzing || status !== 'COMPLETED') return 'analysis'
  return PAGE_STAGE[page] || 'overview'
}

/** 分析进行中的阶段文案；其余阶段返回 null。 */
export function runningNote(project, analyzing, progress) {
  const status = project?.analysisStatus
  if (!analyzing && status !== 'PENDING') return null
  const pct = Number.isFinite(progress) ? `${Math.round(progress)}%` : ''
  return `分析中${pct ? ` ${pct}` : ''}`
}
