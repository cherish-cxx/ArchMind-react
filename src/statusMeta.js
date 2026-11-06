// 项目分析状态展示元数据，对齐后端 Project.analysis_status 取值
export const STATUS_META = {
  NO_SOURCE: { label: '未上传源码', cls: 'st-none' },
  PENDING: { label: '待分析', cls: 'st-pending' },
  COMPLETED: { label: '已分析', cls: 'st-done' },
  FAILED: { label: '分析失败', cls: 'st-fail' },
  PARTIAL: { label: '部分完成', cls: 'st-pending' }
}

export const statusMeta = (s) => STATUS_META[s] || { label: s || '未知', cls: 'st-none' }

/**
 * 项目状态对应的唯一主动作。
 *
 * 状态不是装饰：每个状态都必须能回答「下一步做什么」。
 * 工作台、项目列表、项目详情共用这一份映射，避免三处各写一套。
 */
export const NEXT_ACTION = {
  UPLOAD: 'upload',
  ANALYZE: 'analyze',
  PROGRESS: 'progress',
  MAP: 'map',
  DETAIL: 'detail'
}

export function nextStep(project) {
  switch (project?.analysisStatus) {
    case 'NO_SOURCE':
      return { action: NEXT_ACTION.UPLOAD, label: '上传源码' }
    case 'PENDING':
      return { action: NEXT_ACTION.PROGRESS, label: '查看进度' }
    case 'COMPLETED':
      return { action: NEXT_ACTION.MAP, label: '继续探索' }
    case 'FAILED':
      return { action: NEXT_ACTION.ANALYZE, label: '重新分析' }
    case 'PARTIAL':
      return { action: NEXT_ACTION.ANALYZE, label: '补全分析' }
    default:
      return { action: NEXT_ACTION.DETAIL, label: '打开项目' }
  }
}

/** 还没完成分析的项目需要出现在待办里。 */
export const needsAttention = (project) =>
  Boolean(project) && project.analysisStatus !== 'COMPLETED'


// 后端 AnalysisStage 的中文名
export const STAGE_LABELS = {
  SCAN: '扫描文件',
  AST: '解析代码',
  OVERVIEW: '生成概况',
  DESCRIBE: '生成类描述'
}

export const stageLabel = (s) => STAGE_LABELS[s] || s || ''
