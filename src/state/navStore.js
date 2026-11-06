/**
 * 导航快照：刷新后回到原来的页面和项目，而不是掉回工作台。
 *
 * 只存「当前在哪」，不存图/对话 —— 那些按 projectId 单独存。
 * 页面值域与 App 里的 page 状态一致。
 */
const KEY = 'archmind:nav'
const PAGES = new Set(['workbench', 'projects', 'detail', 'memory'])

export function readNav() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const nav = JSON.parse(raw)
    if (!nav || typeof nav !== 'object' || !PAGES.has(nav.page)) return null
    return {
      page: nav.page,
      projectId: nav.projectId == null ? null : String(nav.projectId)
    }
  } catch {
    return null
  }
}

export function writeNav({ page, projectId } = {}) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        page: PAGES.has(page) ? page : 'workbench',
        projectId: projectId == null ? null : String(projectId)
      })
    )
  } catch {
    // 配额满 / 隐私模式：写不进去不影响使用
  }
}

export const NAV_KEY = KEY
