import { useSyncExternalStore } from 'react'

/**
 * 全局深浅色主题。只影响前端：把 data-theme 写到 <html>，
 * 颜色由 styles.css 里的变量覆盖，持久化在 localStorage。
 */

const KEY = 'archmind:theme'
const VALID = new Set(['light', 'dark'])

function read() {
  try {
    const value = localStorage.getItem(KEY)
    if (VALID.has(value)) return value
  } catch {
    // 隐私模式 / 存储不可用：按浅色处理
  }
  return 'light'
}

function apply(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // 主题切换不做 180ms 过渡：整页颜色一起渐变会显得脏，也会被后台标签页的动画时钟卡住。
  root.classList.add('theme-switching')
  root.dataset.theme = theme
  root.style.colorScheme = theme
  void root.offsetWidth
  root.classList.remove('theme-switching')
}

let state = read()
apply(state)
const listeners = new Set()

function commit(next) {
  if (next === state) return
  state = next
  apply(state)
  try {
    localStorage.setItem(KEY, state)
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener())
}

export const getTheme = () => state

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, getTheme)
}

export function setTheme(theme) {
  if (!VALID.has(theme)) return
  commit(theme)
}

export function toggleTheme() {
  commit(state === 'dark' ? 'light' : 'dark')
}

// 多标签页同步：另一个标签页切换后，这一页跟着变
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY || !VALID.has(event.newValue)) return
    state = event.newValue
    apply(state)
    listeners.forEach((listener) => listener())
  })
}
