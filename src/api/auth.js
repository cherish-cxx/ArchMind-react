import { request } from './request.js'

export const login = (username, password) =>
  request('/api/auth/login', { method: 'POST', auth: false, body: { username, password } })

export const register = (payload) =>
  request('/api/auth/register', { method: 'POST', auth: false, body: payload })

export const logout = () => request('/api/auth/logout', { method: 'POST' })

export const refresh = (refreshToken) =>
  request('/api/auth/refresh', {
    method: 'POST',
    auth: false,
    headers: { Authorization: `Bearer ${refreshToken}` }
  })
