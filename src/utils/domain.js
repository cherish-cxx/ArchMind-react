// 领域地图的纯函数：uid 解析、领域排序、版图分块。
// 组件只负责渲染，这些逻辑独立可测。

export const ROLE_LABELS = {
  entry: '入口',
  business: '业务',
  'domain-model': '领域模型',
  infrastructure: '基础设施',
  external: '外部依赖',
  other: '其他'
}

export const normalizeRole = (role) => String(role || '').toLowerCase().replace(/_/g, '-')

export const roleLabel = (role) => ROLE_LABELS[normalizeRole(role)] || role || ''

const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ANY'])
const KIND_BADGES = { SCHEDULED: '定时', MQ: '消息', EVENT: '事件', MANUAL: '手动' }

const simpleName = (uid) => String(uid || '').split('.').pop()

/** 方法 uid 形如 owner#signature() → Class.method() */
export function entryMethod(entryUid) {
  if (!entryUid) return ''
  const idx = entryUid.indexOf('#')
  if (idx < 0) return simpleName(entryUid)
  return `${simpleName(entryUid.slice(0, idx))}.${entryUid.slice(idx + 1)}`
}

/**
 * 能力 uid 有两种：HTTP 的 "GET /items"，非 HTTP 的 "SCHEDULED a.J#run()"。
 * name 目前等于 uid；将来若模型起了中文名，优先用 name 显示。
 */
export function parseCapability(uid, name) {
  const text = String(uid || '').trim()
  const space = text.indexOf(' ')
  const head = space >= 0 ? text.slice(0, space) : text

  if (HTTP_VERBS.has(head)) {
    return {
      isHttp: true,
      verb: head,
      path: space >= 0 ? text.slice(space + 1) || '/' : '/',
      kind: null
    }
  }

  const raw = space >= 0 ? text.slice(space + 1) : text
  const display = name && name !== uid ? name : (() => {
    const hash = raw.indexOf('#')
    return hash >= 0 ? `${simpleName(raw.slice(0, hash))}.${raw.slice(hash + 1)}` : raw
  })()

  return {
    isHttp: false,
    verb: KIND_BADGES[head] || '入口',
    path: display,
    kind: KIND_BADGES[head] ? head : 'OTHER'
  }
}

/** 面包屑用的短名：HTTP 用方法 + 路径，非 HTTP 用入口方法名。 */
export function capabilityLabel(capability) {
  if (!capability) return ''
  const parsed = parseCapability(capability.uid, capability.name)
  return parsed.isHttp ? `${parsed.verb} ${parsed.path}` : parsed.path
}

/** 业务领域按能力数降序；基础设施单独返回。 */
export function splitAreas(areas = []) {
  const business = []
  let infrastructure = null
  for (const area of areas) {
    if (area?.kind === 'infrastructure') infrastructure = area
    else business.push(area)
  }
  business.sort((a, b) =>
    (b.capabilities?.length || 0) - (a.capabilities?.length || 0) || String(a.name).localeCompare(String(b.name))
  )
  return { business, infrastructure }
}

export function totals(business = [], infrastructure = null) {
  const capabilities = business.reduce((sum, a) => sum + (a.capabilities?.length || 0), 0)
  const classes = business.reduce((sum, a) => sum + (a.classCount || 0), 0)
    + (infrastructure?.classCount || 0)
  return { areas: business.length, capabilities, classes }
}

/**
 * 按权重把矩形切成版图块：每次在较长边上一分为二。
 * items: [{ key, value, ...rest }]；返回值额外带 x/y/w/h，保证互不重叠、完整覆盖。
 */
export function treemap(items, x, y, w, h) {
  if (!items || items.length === 0) return []
  if (items.length === 1) return [{ ...items[0], x, y, w, h }]

  const weight = (item) => Math.max(1, Number(item.value) || 0)
  const total = items.reduce((sum, item) => sum + weight(item), 0)

  let acc = 0
  let mid = 1
  for (let i = 0; i < items.length; i++) {
    acc += weight(items[i])
    if (acc >= total / 2) {
      mid = i + 1
      break
    }
  }
  if (mid >= items.length) mid = items.length - 1
  if (mid < 1) mid = 1

  const first = items.slice(0, mid)
  const second = items.slice(mid)
  const firstWeight = first.reduce((sum, item) => sum + weight(item), 0)
  const ratio = firstWeight / total

  if (w >= h) {
    const w1 = Math.round(w * ratio)
    return [
      ...treemap(first, x, y, w1, h),
      ...treemap(second, x + w1, y, w - w1, h)
    ]
  }
  const h1 = Math.round(h * ratio)
  return [
    ...treemap(first, x, y, w, h1),
    ...treemap(second, x, y + h1, w, h - h1)
  ]
}

export function cellSizeClass(w, h) {
  if (w >= 300 && h >= 240) return 'is-lg'
  if (w >= 170 && h >= 150) return 'is-md'
  if (w >= 120 && h >= 80) return 'is-sm'
  return 'is-xs'
}

/** 跨领域出口：把每条 AREA_CALLS 的来源类收窄到当前能力成员。 */
export function exitLinks(areaCalls = [], members = []) {
  const memberUids = new Set(members.map((m) => m.uid))
  return areaCalls.map((call) => ({
    ...call,
    sources: (call.fromClassUids || []).filter((uid) => memberUids.has(uid))
  }))
}
