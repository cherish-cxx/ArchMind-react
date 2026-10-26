import { useState } from 'react'
import { useSession } from '../auth/sessionStore'
import { useTheme, toggleTheme } from '../state/themeStore'
import {
  IconDashboard, IconMap, IconFolder, IconChevronDown, IconPlus,
  IconSun, IconMoon
} from '../icons'

const NAV = [
  { page: 'workbench', label: '工作台', icon: IconDashboard },
  { page: 'memory', label: '记忆地图', icon: IconMap },
  { page: 'projects', label: '我的项目', icon: IconFolder }
]

export default function Sidebar({
  page = 'workbench', onNavigate, onOpenLogin, onOpenNewProject, onLogout,
  projects = [], onOpenProject, activeProjectId = null,
  collapsed = false, floating = false,
  onPeek, onHoverEnd, onToggleCollapse
}) {
  const { user } = useSession()
  const theme = useTheme()
  const loggedIn = !!user
  const [menuOpen, setMenuOpen] = useState(false)

  const handleCreateClick = () => {
    if (!loggedIn) return onOpenLogin()
    onOpenNewProject()
  }

  return (
    <aside
      className={`sidebar${collapsed ? ' is-collapsed' : ''}${floating ? ' is-floating' : ''}`}
      aria-hidden={collapsed && !floating ? 'true' : undefined}
      inert={collapsed && !floating ? '' : undefined}
      onMouseEnter={collapsed ? onPeek : undefined}
      onMouseLeave={collapsed ? onHoverEnd : undefined}
    >
      <div className="side-brand">
        <div className="brand">ArchMind</div>
        <button
          type="button"
          className="side-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          <IconChevronDown size={14} />
        </button>
      </div>

      <div className="side-section">
        <button className="btn-new" onClick={handleCreateClick}>
          <IconPlus size={15} />
          <span>新建项目</span>
        </button>
      </div>

      <nav className="side-nav">
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <button
            key={p}
            className={`nav-item ${page === p ? 'active' : ''}`}
            onClick={() => onNavigate(p)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="side-section recent">
        <div className="side-label">最近项目</div>
        {projects.length > 0 ? (
          <ul className="recent-list">
            {projects.slice(0, 8).map((p) => {
              const active = activeProjectId != null && String(activeProjectId) === String(p.id)
              return (
                <li key={p.id}>
                  <button
                    className={`recent-item${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onOpenProject(p)}
                    title={p.name}
                  >
                    {p.name}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="recent-empty">暂无项目，点击「新建项目」开始</p>
        )}
        {projects.length > 0 && (
          <button className="link-more" onClick={() => onNavigate('projects')}>
            查看全部
          </button>
        )}
      </div>

      <div className="side-footer">
        {loggedIn ? (
          <div className="user-wrap">
            <button className="user-card" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar">{(user.nickname || user.username || '?').slice(0, 1)}</span>
              <span className="user-meta">
                <span className="user-name">{user.nickname || user.username}</span>
                <span className="user-mail">@{user.username}</span>
              </span>
              <IconChevronDown size={14} className={`chev ${menuOpen ? 'open' : ''}`} />
            </button>
            {menuOpen && (
              <div className="user-menu">
                <button
                  className="user-menu-item"
                  onClick={() => { setMenuOpen(false); toggleTheme() }}
                >
                  {theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
                  <span>{theme === 'dark' ? '切换浅色模式' : '切换深色模式'}</span>
                </button>
                <div className="user-menu-sep" />
                <button className="user-menu-item danger" onClick={() => { setMenuOpen(false); onLogout() }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="side-footer-actions">
            <button className="btn-ghost btn-signin" onClick={onOpenLogin}>
              Sign in
            </button>
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
              <span>{theme === 'dark' ? '浅色' : '深色'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
