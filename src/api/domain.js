import { request } from './request.js'

// 领域地图：全部业务领域与其能力（基础设施领域没有能力）
export const domainMap = (projectId) =>
  request(`/api/project/${projectId}/domain-map`)

// 能力详情：成员类、成员之间的调用边、跨领域调用。uid 带空格与斜杠，必须编码
export const capability = (projectId, uid) =>
  request(`/api/project/${projectId}/capability?uid=${encodeURIComponent(uid)}`)

// 系统架构分层：按类角色聚合成六层与跨层调用边
export const architectureLayers = (projectId) =>
  request(`/api/project/${projectId}/architecture-layers`)
