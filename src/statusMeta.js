// 项目分析状态展示元数据，对齐后端 Project.analysis_status 取值
export const STATUS_META = {
  NO_SOURCE: { label: '未上传源码', cls: 'st-none' },
  PENDING: { label: '待分析', cls: 'st-pending' },
  COMPLETED: { label: '已分析', cls: 'st-done' },
  FAILED: { label: '分析失败', cls: 'st-fail' },
  PARTIAL: { label: '部分完成', cls: 'st-pending' }
}

export const statusMeta = (s) => STATUS_META[s] || { label: s || '未知', cls: 'st-none' }

// 后端 AnalysisStage 的中文名
export const STAGE_LABELS = {
  SCAN: '扫描文件',
  AST: '解析代码',
  OVERVIEW: '生成概况',
  DESCRIBE: '生成类描述'
}

export const stageLabel = (s) => STAGE_LABELS[s] || s || ''
