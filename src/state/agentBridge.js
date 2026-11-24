/**
 * Agent 与画布之间的桥。
 *
 * 对话面板现在常驻在每个页面，但只有记忆地图有画布。回答里带的图 patch 和视图命令
 * 不能丢：画布在就立刻执行，画布不在就先存着，等回到记忆地图再补上。
 * 引用跳转同理——在别的页面点了引用，先记下 uid，回到地图再定位。
 */

let graphHandler = null
let focusHandler = null
let flushHandler = null

let deferred = []
let pendingFocus = null

// 画布不在时最多攒这么多轮，超出就丢最旧的：旧结果对当前图意义已经不大
const MAX_DEFERRED = 6

export function registerGraphHandler(fn) {
  graphHandler = fn
  if (!fn || deferred.length === 0) return
  const queue = deferred
  deferred = []
  for (const response of queue) {
    Promise.resolve(fn(response)).catch(() => {})
  }
}

export function applyGraphResponse(response) {
  if (graphHandler) return graphHandler(response)
  const hasGraph = Boolean(response?.graph)
  const hasCommands = (response?.uiCommands || []).length > 0
  if (hasGraph || hasCommands) {
    deferred.push(response)
    if (deferred.length > MAX_DEFERRED) deferred.shift()
  }
  return Promise.resolve()
}

export function registerFocusHandler(fn) {
  focusHandler = fn
  if (fn && pendingFocus) {
    const uid = pendingFocus
    pendingFocus = null
    fn(uid)
  }
}

export function requestFocus(uid) {
  if (!uid) return
  if (focusHandler) {
    focusHandler(uid)
    return
  }
  pendingFocus = uid
}

export function registerViewportFlush(fn) {
  flushHandler = fn
}

export function flushViewport() {
  try {
    return flushHandler ? flushHandler() : Promise.resolve()
  } catch {
    return Promise.resolve()
  }
}
