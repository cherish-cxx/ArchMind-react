import { useEffect, useMemo, useState } from 'react'
import { IconChevronDown } from '../../icons'
import { activeProjectId as findActiveProjectId } from '../../utils/conversationGroups'

const STORE_PREFIX = 'archmind:conv-groups:'

function fmtRelative(value) {
  if (!value) return ''
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 48 * 60 * 60 * 1000) return '昨天'
  const d = new Date(t)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readCollapsed(persistKey) {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + persistKey)
    if (!raw) return null
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? new Set(ids.map(String)) : null
  } catch {
    return null
  }
}

function writeCollapsed(persistKey, collapsed) {
  try {
    localStorage.setItem(
      STORE_PREFIX + persistKey,
      JSON.stringify([...collapsed])
    )
  } catch {
    // 存储不可用时只影响“记住展开状态”，不影响交互
  }
}

/**
 * 默认只展开最近活跃的项目与当前会话所在项目；
 * 工作台这种概览面可以全部展开，折叠只是可选项。
 */
function defaultCollapsed(groups, activeId, defaultExpanded) {
  if (defaultExpanded === 'all') return new Set()
  const keep = new Set()
  if (groups[0]) keep.add(groups[0].projectId)
  if (activeId) keep.add(activeId)
  return new Set(groups.filter((g) => !keep.has(g.projectId)).map((g) => g.projectId))
}

/**
 * 按项目分组的会话抽屉。
 *
 * 项目是父级容器，会话是组内条目；当前会话所在项目强制展开，
 * 避免用户折叠后丢失“现在在哪个上下文里”。
 */
export default function ConversationGroups({
  groups = [],
  activeConversationId = null,
  onOpenConversation,
  variant = 'sidebar',
  persistKey = 'sidebar',
  defaultExpanded = 'recent',
  maxGroups = Infinity,
  maxPerGroup = Infinity
}) {
  const activeGroupId = useMemo(
    () => findActiveProjectId(groups, activeConversationId),
    [groups, activeConversationId]
  )
  const [collapsed, setCollapsed] = useState(() => readCollapsed(persistKey))

  const effectiveCollapsed = useMemo(
    () => collapsed ?? defaultCollapsed(groups, activeGroupId, defaultExpanded),
    [collapsed, groups, activeGroupId, defaultExpanded]
  )

  useEffect(() => {
    if (collapsed !== null) writeCollapsed(persistKey, collapsed)
  }, [collapsed, persistKey])

  // 项目被删除后，把它从折叠集合里清掉，避免状态无限增长。
  useEffect(() => {
    if (collapsed === null) return
    const ids = new Set(groups.map((g) => g.projectId))
    let changed = false
    const next = new Set()
    for (const id of collapsed) {
      if (ids.has(id)) next.add(id)
      else changed = true
    }
    if (changed) setCollapsed(next)
  }, [groups, collapsed])

  // 打开某个会话时，它所在的项目必须展开。
  useEffect(() => {
    if (collapsed === null || !activeGroupId || !collapsed.has(activeGroupId)) return
    const next = new Set(collapsed)
    next.delete(activeGroupId)
    setCollapsed(next)
  }, [activeGroupId, collapsed])

  const toggle = (projectId) => {
    const base = collapsed ?? effectiveCollapsed
    const next = new Set(base)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    setCollapsed(next)
  }

  const shownGroups = groups.slice(0, maxGroups)

  return (
    <div className={`conv-groups conv-groups-${variant}`}>
      {shownGroups.map((group) => {
        const isCollapsed = effectiveCollapsed.has(group.projectId)
        const isActive = group.projectId === activeGroupId
        const listId = `conv-group-${variant}-${group.projectId}`
        const visible = group.conversations.slice(0, maxPerGroup)
        const rest = group.conversations.length - visible.length

        return (
          <section
            className={`conv-group${isActive ? ' has-active' : ''}`}
            key={group.projectId}
          >
            <button
              type="button"
              className="conv-group-head"
              aria-expanded={!isCollapsed}
              aria-controls={listId}
              onClick={() => toggle(group.projectId)}
            >
              <IconChevronDown
                size={13}
                className={`conv-chevron${isCollapsed ? ' is-collapsed' : ''}`}
              />
              <span className="conv-group-name" title={group.projectName}>
                {group.projectName}
              </span>
              <span className="conv-group-count">{group.conversations.length}</span>
            </button>

            <ul className="recent-list conv-children" id={listId} hidden={isCollapsed}>
              {visible.map((c) => {
                const active = c.id === activeConversationId
                return (
                  <li key={c.id}>
                    <button
                      className={`recent-item conv-item${active ? ' active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onOpenConversation?.(c)}
                      title={c.title}
                    >
                      <span className="conv-title">{c.title || '新会话'}</span>
                      <span className="conv-meta">
                        {variant === 'workbench' && c.turnCount > 0 ? `${c.turnCount} 轮 · ` : ''}
                        {fmtRelative(c.updatedAt)}
                      </span>
                    </button>
                  </li>
                )
              })}
              {rest > 0 && (
                <li className="conv-more">还有 {rest} 个会话</li>
              )}
            </ul>
          </section>
        )
      })}

      {groups.length > maxGroups && (
        <p className="conv-more">还有 {groups.length - maxGroups} 个项目</p>
      )}
    </div>
  )
}
