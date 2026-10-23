import { getTokens, applyTokens, clearSession } from '../auth/sessionStore.js'

// 与后端对接的请求通道：统一解包 Result{code,message,data}，
// 自动注入 accessToken，401 时用 refreshToken 无感续期并重放一次。

// 用可选链：Node 里跑纯函数/接口测试时 import.meta.env 不存在，不能让它直接抛。
const BASE = import.meta.env?.VITE_API_BASE_URL || ''

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

// 后端 id 均为 Long(int64)：雪花ID 等 16 位以上整数超出 JS Number 安全范围，
// JSON.parse 会丢失末几位精度（如 194327283464311234 -> 194327283464311230），
// 导致上传/分析携带的 projectId 与后端实际值不一致。
// 处理：解析前把这些字段中的超长整数字面量加引号转为字符串。
const LONG_FIELD = /("(?:id|userId|projectId|sourceId|taskId)"\s*:\s*)(-?\d{16,})/g

async function parseJson(res) {
  try {
    const text = await res.text()
    if (!text) return null
    return JSON.parse(text.replace(LONG_FIELD, '$1"$2"'))
  } catch {
    return null
  }
}

let refreshing = null

async function refreshTokens() {
  if (refreshing) return refreshing
  const { refreshToken } = getTokens()
  if (!refreshToken) {
    clearSession()
    return null
  }
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}` }
      })
      const json = await parseJson(res)
      if (res.status === 401 || !json || json.code !== 0) {
        clearSession()
        return null
      }
      applyTokens(json.data)
      return json.data
    } catch {
      clearSession()
      return null
    }
  })().finally(() => { refreshing = null })
  return refreshing
}

export async function request(path, opts = {}) {
  const { method = 'GET', body, headers = {}, auth = true, retry = true, signal } = opts
  const h = { ...headers }
  const tokens = getTokens()
  if (auth && !h.Authorization && tokens?.accessToken) {
    h.Authorization = `Bearer ${tokens.accessToken}`
  }

  let payload = body
  if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
    payload = JSON.stringify(body)
    if (!h['Content-Type']) h['Content-Type'] = 'application/json'
  } else if (typeof body === 'string' && !h['Content-Type']) {
    h['Content-Type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, signal })
  } catch (err) {
    // 取消是用户行为，不是网络故障 —— 上层要能区分，别弹「无法连接服务器」。
    if (err?.name === 'AbortError') {
      throw new ApiError(-1, '请求已取消', 0)
    }
    throw new ApiError(0, '网络错误：无法连接服务器', 0)
  }
  const json = await parseJson(res)
  const code = json?.code ?? (res.ok ? 0 : res.status)
  const message = json?.message ?? (res.ok ? '' : `请求失败(${res.status})`)

  const unauthorized = res.status === 401 || code === 401
  if (unauthorized && auth && retry && path !== '/api/auth/login') {
    const renewed = await refreshTokens()
    if (renewed) return request(path, { ...opts, retry: false })
    throw new ApiError(code, message || '登录已失效，请重新登录', res.status)
  }

  if (code !== 0) throw new ApiError(code, message, res.status)
  return json ? json.data : undefined
}

// 文件上传必须用 XHR：fetch 无法上报上传进度。
// 其余行为与 request 对齐：注入 token、解包 Result、401 刷新后重试一次。
export function uploadRequest(path, formData, opts = {}) {
  const { onProgress, headers = {}, auth = true, retry = true } = opts

  const send = () => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const h = { ...headers }
    const tokens = getTokens()
    if (auth && !h.Authorization && tokens?.accessToken) {
      h.Authorization = `Bearer ${tokens.accessToken}`
    }
    xhr.open('POST', `${BASE}${path}`, true)
    Object.entries(h).forEach(([key, value]) => {
      if (value != null) xhr.setRequestHeader(key, value)
    })
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
        }
      }
    }
    xhr.onload = () => {
      let json = null
      try {
        const text = xhr.responseText
        json = text ? JSON.parse(text.replace(LONG_FIELD, '$1"$2"')) : null
      } catch {
        json = null
      }
      const ok = xhr.status >= 200 && xhr.status < 300
      const code = json?.code ?? (ok ? 0 : xhr.status)
      let message = json?.message ?? (ok ? '' : `请求失败(${xhr.status})`)
      if (xhr.status === 413) {
        message = '文件超过服务器允许的上传上限（500MB），请压缩后重试'
      }
      resolve({ status: xhr.status, json, code, message })
    }
    xhr.onerror = () => reject(new ApiError(0, '网络错误：无法连接服务器', 0))
    xhr.onabort = () => reject(new ApiError(-1, '请求已取消', 0))
    xhr.send(formData)
  })

  return (async () => {
    let r = await send()
    const unauthorized = r.status === 401 || r.code === 401
    if (unauthorized && auth && retry) {
      const renewed = await refreshTokens()
      if (renewed) {
        r = await send()
      } else {
        throw new ApiError(r.code, r.message || '登录已失效，请重新登录', r.status)
      }
    }
    if (r.code !== 0) throw new ApiError(r.code, r.message, r.status)
    return r.json ? r.json.data : undefined
  })()
}

export const getBase = () => BASE
