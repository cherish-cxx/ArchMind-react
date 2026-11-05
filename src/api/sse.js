/**
 * SSE 读取：从 fetch 的 `ReadableStream` 里按帧解析。
 *
 * **不用 `EventSource`**：它只能 GET，而问答是带 body 的 POST。
 *
 * 唯一容易写错的是分块边界 —— 一个事件可能被切成两半到达，
 * 所以必须按 `\n` 切行、把最后一段不完整的留在缓冲里等下次。
 */

export async function readSseEvents(stream, onEvent) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let name = null
  let data = []

  const flush = () => {
    if (name === null && data.length === 0) return
    onEvent({ name: name || 'message', data: data.join('\n') })
    name = null
    data = []
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)

        if (line === '') {
          flush()
        } else if (line.startsWith(':')) {
          // 注释 / 心跳，忽略
        } else {
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          let value2 = colon < 0 ? '' : line.slice(colon + 1)
          if (value2.startsWith(' ')) value2 = value2.slice(1)
          if (field === 'event') name = value2
          else if (field === 'data') data.push(value2)
        }
      }
    }
    flush()
  } finally {
    reader.releaseLock()
  }
}

/** 解析一帧的 data。解析不了返回 null —— 一帧坏数据不该让整轮失败。 */
export function parseEventData(data) {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}
