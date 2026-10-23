import { request, uploadRequest } from './request.js'

// 项目 id 统一规范为字符串：真实后端为 int64 雪花ID（request 层已保精度转为字符串），
// mock 为小数字，此处拉齐类型，保证全链路比较/拼接一致
const toProject = (p) => (p ? { ...p, id: String(p.id) } : p)

// 新建项目：POST /api/project，返回 {id, name, status: 'CREATED', ...}
export const createProject = async (payload) =>
  toProject(await request('/api/project', { method: 'POST', body: payload }))

// 当前用户项目列表（按创建时间倒序）
export const listProjects = async () => {
  const list = await request('/api/project')
  return (list || []).map(toProject)
}

export const upload = (projectId, file, opts = {}) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadRequest(`/api/project/${projectId}/upload`, fd, opts)
}

// 创建 + 上传一步完成：失败时后端会整体回滚，不会留下空项目。
// idempotencyKey 在同一次提交的重试间复用，避免重复建项目。
export const createProjectWithSource = async (payload, file, opts = {}) => {
  const fd = new FormData()
  fd.append('name', payload.name)
  if (payload.description) fd.append('description', payload.description)
  if (payload.gitUrl) fd.append('gitUrl', payload.gitUrl)
  fd.append('file', file)
  const headers = opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}
  const data = await uploadRequest('/api/project/with-source', fd, { onProgress: opts.onProgress, headers })
  return data?.project ? { ...data, project: toProject(data.project) } : data
}

// 分析项目概况。幂等：非 force 时后端若已有结果直接返回；force=true 强制重新分析
export const analyze = (projectId, force = false) =>
  request(`/api/project/${projectId}/analyze?force=${force}`, { method: 'POST' })

// 读取已存的项目概况（GET，纯读库，不触发分析）；未分析时后端返回非 0 码抛错
export const projectOverview = (projectId) =>
  request(`/api/project/${projectId}/overview`)

// 任务轮询：最近一次分析任务（刷新/换页后找回仍在跑的任务）
export const latestTask = (projectId) =>
  request(`/api/project/${projectId}/tasks/latest`)

export const getTask = (taskId) =>
  request(`/api/task/${taskId}`)

// 删除项目（库表 + 磁盘工作区）
export const deleteProject = (projectId) =>
  request(`/api/project/${projectId}`, { method: 'DELETE' })

// 代码探索：项目全部类清单（分析落图后才有数据）
export const listClasses = (projectId) =>
  request(`/api/project/${projectId}/classes`)

// 点类看关联：uid = 类全限定名（放 query param 避免路径里的点号）
export const classRelations = (projectId, uid) =>
  request(`/api/project/${projectId}/class/relations?uid=${encodeURIComponent(uid)}`)

// 类源码：代码抽屉用，后端按类节点的文件与行区间切片
export const classSource = (projectId, uid, maxLines = 2000) =>
  request(`/api/project/${projectId}/class/source?uid=${encodeURIComponent(uid)}&maxLines=${maxLines}`)

