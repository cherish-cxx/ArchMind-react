import { useSyncExternalStore } from 'react'

// 最小会话 store：无第三方状态库。
// 用 useSyncExternalStore(React18 内置) 做订阅；token/user 持久化到 localStorage。

const KEY_ACCESS = 'am_access'
const KEY_REFRESH = 'am_refresh'
const KEY_USER = 'am_user'

function load() {
  let tokens = { accessToken: null, refreshToken: null }
  let user = null
  try {
    tokens.accessToken = localStorage.getItem(KEY_ACCESS)
    tokens.refreshToken = localStorage.getItem(KEY_REFRESH)
    const raw = localStorage.getItem(KEY_USER)
    user = raw ? JSON.parse(raw) : null
  } catch {
    // 忽略存储异常，按未登录处理
  }
  return { tokens, user }
}

let state = load()
const listeners = new Set()

function saveTokens() {
  try {
    if (state.tokens.accessToken) localStorage.setItem(KEY_ACCESS, state.tokens.accessToken)
    else localStorage.removeItem(KEY_ACCESS)
    if (state.tokens.refreshToken) localStorage.setItem(KEY_REFRESH, state.tokens.refreshToken)
    else localStorage.removeItem(KEY_REFRESH)
  } catch {
    // ignore
  }
}

function saveUser() {
  try {
    if (state.user) localStorage.setItem(KEY_USER, JSON.stringify(state.user))
    else localStorage.removeItem(KEY_USER)
  } catch {
    // ignore
  }
}

function emit() {
  listeners.forEach((l) => l())
}

// 登录成功：写入 tokens 与用户信息
export function setLogin(data) {
  state = {
    tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken },
    user: data.user ?? state.user
  }
  saveTokens()
  saveUser()
  emit()
}

// 续期：只更新 tokens，保留用户
export function applyTokens(tokens) {
  if (!tokens) return
  state = { ...state, tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } }
  saveTokens()
  emit()
}

export function clearSession() {
  state = { tokens: { accessToken: null, refreshToken: null }, user: null }
  saveTokens()
  saveUser()
  emit()
}

export const getTokens = () => state.tokens
export const getUser = () => state.user
export const getSnapshot = () => state

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
