import { request } from './request.js'

// MCP 访问令牌管理（JWT）。token 明文只在创建响应出现一次，列表只返回前缀。
export const listMcpTokens = () => request('/api/mcp/tokens')

export const createMcpToken = (name, expiresInDays) =>
  request('/api/mcp/tokens', { method: 'POST', body: { name, expiresInDays } })

export const revokeMcpToken = (id) =>
  request(`/api/mcp/tokens/${id}`, { method: 'DELETE' })

// 项目说明导出（AGENTS.md / CLAUDE.md）。target: 'claude' | 'agents'
export const projectBrief = (projectId, target) =>
  request(`/api/project/${projectId}/brief?target=${encodeURIComponent(target)}`)
