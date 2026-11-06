/** 把扁平会话列表按项目分组；项目已删除的会话不进入最近会话。 */
const toTime = (value) => {
  const t = new Date(value || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

export function groupConversations(conversations = [], projects = []) {
  const projectById = new Map(projects.map((p) => [String(p.id), p]))
  const groups = new Map()

  for (const c of conversations) {
    const projectId = String(c.projectId ?? '')
    const project = projectById.get(projectId)
    if (!project) continue

    let group = groups.get(projectId)
    if (!group) {
      group = { projectId, projectName: project.name, conversations: [] }
      groups.set(projectId, group)
    }
    group.conversations.push(c)
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.conversations.sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt))
  }
  list.sort(
    (a, b) => toTime(b.conversations[0]?.updatedAt) - toTime(a.conversations[0]?.updatedAt)
  )
  return list
}

export function activeProjectId(groups, conversationId) {
  if (!conversationId) return null
  const group = groups.find((g) => g.conversations.some((c) => c.id === conversationId))
  return group?.projectId ?? null
}
