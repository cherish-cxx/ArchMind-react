import { useEffect, useRef, useState } from 'react'
import { statusMeta } from '../statusMeta'
import { IconMore, IconTrash, IconRefresh, IconUpload, IconFolder } from '../icons'

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 我的项目：真实列表 + 状态徽标 + 行尾三点菜单（详情/上传/重新分析/删除）
export default function ProjectList({ projects = [], onOpenProject, onUpload, onAnalyze, onDelete }) {
  const [menuId, setMenuId] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const items = (p) => {
    setMenuId((cur) => (cur === p.id ? null : p.id))
  }

  return (
    <div className="page page-scroll plist">
      <div className="wb-section-head">
        <h1 className="page-title">我的项目</h1>
        <span className="page-title-note">{projects.length} 个项目</span>
      </div>

      {projects.length === 0 ? (
        <div className="wb-empty">
          <p className="wb-empty-title">还没有项目</p>
          <p className="wb-empty-sub">点击左侧「新建项目」创建你的第一个项目</p>
        </div>
      ) : (
        <ul className="plist-list">
          {projects.map((p) => {
            const st = statusMeta(p.analysisStatus)
            return (
              <li key={p.id} className="plist-row">
                <button className="plist-main" onClick={() => onOpenProject(p)}>
                  <span className="plist-icon"><IconFolder size={16} /></span>
                  <span className="plist-body">
                    <span className="plist-name">{p.name}</span>
                    <span className="plist-desc">{p.description || '暂无项目描述'}</span>
                  </span>
                </button>
                <span className={`status-pill ${st.cls}`}>{st.label}</span>
                <span className="plist-date">{fmtDate(p.createTime)}</span>
                <div className="plist-menu-wrap" ref={menuId === p.id ? menuRef : undefined}>
                  <button
                    className="icon-btn plist-more"
                    onClick={(e) => { e.stopPropagation(); items(p) }}
                    title="更多操作"
                  >
                    <IconMore size={16} />
                  </button>
                  {menuId === p.id && (
                    <div className="row-menu" onClick={(e) => e.stopPropagation()}>
                      <button className="row-menu-item" onClick={() => { setMenuId(null); onOpenProject(p) }}>
                        打开详情
                      </button>
                      <button className="row-menu-item" onClick={() => { setMenuId(null); onUpload(p) }}>
                        <IconUpload size={14} /> 上传 / 更新源码
                      </button>
                      <button
                        className="row-menu-item"
                        disabled={p.analysisStatus !== 'COMPLETED' && p.analysisStatus !== 'FAILED'}
                        title={p.analysisStatus === 'NO_SOURCE' || p.analysisStatus === 'PENDING' ? '需先上传源码' : ''}
                        onClick={() => { setMenuId(null); onAnalyze(p) }}
                      >
                        <IconRefresh size={14} /> 重新分析
                      </button>
                      <button className="row-menu-item danger" onClick={() => { setMenuId(null); onDelete(p) }}>
                        <IconTrash size={14} /> 删除项目
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
