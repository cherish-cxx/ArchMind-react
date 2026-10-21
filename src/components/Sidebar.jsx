import { useState } from 'react'
import { useSession } from '../auth/sessionStore'
import {
  IconDashboard, IconMap, IconFolder, IconChevronDown, IconPlus
} from '../icons'

const NAV = [
  { page: 'workbench', label: '工作台', icon: IconDashboard },
  { page: 'memory', label: '记忆地图', icon: IconMap },
  { page: 'projects', label: '我的项目', icon: IconFolder }
]

export default function Sidebar({
  page = 'workbench', onNavigate, onOpenLogin, onOpenNewProject, onLogout,
  projects = [], onOpenProject
}) {
  const { user } = useSession()
  const loggedIn = !!user
  const [menuOpen, setMenuOpen] = useState(false)

  const handleCreateClick = () => {
    if (!loggedIn) return onOpenLogin()
    onOpenNewProject()
  }

  return (
    <aside className="sidebar">
      <div className="brand">ArchMind</div>

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
            {projects.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button
                  className="recent-item"
                  onClick={() => onOpenProject(p)}
                  title={p.name}
                >
                  {p.name}
                </button>
              </li>
            ))}
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
                <button className="user-menu-item danger" onClick={() => { setMenuOpen(false); onLogout() }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn-ghost btn-signin" onClick={onOpenLogin}>
            Sign in
          </button>
        )}
      </div>
    </aside>
  )
}
