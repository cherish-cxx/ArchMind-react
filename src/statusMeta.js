// 项目分析状态展示元数据，对齐后端 Project.analysis_status 取值
export const STATUS_META = {
  NO_SOURCE: { label: '未上传源码', cls: 'st-none' },
  PENDING: { label: '待分析', cls: 'st-pending' },
  COMPLETED: { label: '已分析', cls: 'st-done' },
  FAILED: { label: '分析失败', cls: 'st-fail' }
}

export const statusMeta = (s) => STATUS_META[s] || { label: s || '未知', cls: 'st-none' }
