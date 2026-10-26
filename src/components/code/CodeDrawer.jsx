import { useEffect, useRef, useState } from 'react'
import { classSource } from '../../api/project'
import { IconX } from '../../icons'
import { getHighlighter, LANGS } from '../../utils/shiki'
import useFloatingWindow from '../../hooks/useFloatingWindow'

const EXT_LANG = {
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', py: 'python',
  json: 'json', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', sql: 'sql', sh: 'bash', bash: 'bash',
  md: 'markdown', css: 'css', html: 'html', htm: 'html',
  go: 'go', rs: 'rust', cs: 'csharp', properties: 'properties'
}

const THEME_KEY = 'archmind:code-theme'
const SHIKI_THEME = { dark: 'github-dark', light: 'github-light' }

function langOf(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase()
  const lang = EXT_LANG[ext] || 'text'
  return LANGS.includes(lang) ? lang : 'text'
}

/** OrderServiceImpl → OSI；取不到驼峰就退回前两个字母。 */
function initialsOf(name) {
  const text = String(name || '')
  if (!text) return '?'
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.$-]+/)
    .filter(Boolean)
  const letters = words.map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  return letters || text.slice(0, 2).toUpperCase()
}

function fileNameOf(filePath, fallback) {
  const name = String(filePath || '').split(/[\\/]/).pop()
  return name || `${fallback}.java`
}

function ThemeIcon({ dark }) {
  return dark ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

/**
 * 代码浮窗：按类 uid 拉源码切片，Shiki 高亮 + 行号 + 复制。
 *
 * 左侧大纲按 IDE 文件树的方式排：每个方法一个函数图标，字号比正文略小；
 * 点一条 = 滚到那段代码 + 把它锁为提问锚点。
 * 深/浅色是抽屉自己的主题，切在标题栏，记在 localStorage。
 */
export default function CodeDrawer({
  open, projectId, uid, name, onClose, activeMethodUid, onLockMethod
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const seqRef = useRef(0)
  const codeRef = useRef(null)

  const { rect, dragging, maximized, dragProps, resizeProps } = useFloatingWindow({
    storageKey: 'archmind:code-window:v1',
    open,
    minW: 420,
    minH: 320
  })

  useEffect(() => {
    if (!open || !projectId || !uid) return
    const seq = ++seqRef.current
    setLoading(true)
    setError('')
    setData(null)
    setHtml('')
    setCopied(false)

    ;(async () => {
      try {
        const source = await classSource(projectId, uid)
        if (seq !== seqRef.current) return
        setData(source)
      } catch (err) {
        if (seq !== seqRef.current) return
        setError(err?.message || '源码加载失败')
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    })()

    return () => { seqRef.current++ }
  }, [open, projectId, uid])

  // 主题切换只重新高亮，不重新拉源码。
  useEffect(() => {
    if (!data?.content) return
    let alive = true
    ;(async () => {
      try {
        const hl = await getHighlighter()
        if (!alive) return
        setHtml(hl.codeToHtml(data.content, {
          lang: langOf(data.filePath),
          theme: SHIKI_THEME[theme]
        }))
      } catch {
        if (alive) setHtml('')
      }
    })()
    return () => { alive = false }
  }, [data, theme])

  // 锁定的方法变化时：清掉旧标记，只标首行和末行的行号，并滚到方法位置
  useEffect(() => {
    const box = codeRef.current
    if (!box) return
    box.querySelectorAll('.md-method-start, .md-method-end').forEach((el) => {
      el.classList.remove('md-method-start', 'md-method-end')
    })
    if (!activeMethodUid || !data) return

    const sliceStart = data.startLine || 1
    const sliceEnd = data.endLine || sliceStart
    const active = (data.methods || []).find((m) => m.uid === activeMethodUid)
    if (!active || typeof active.startLine !== 'number') return
    if (active.startLine < sliceStart || active.startLine > sliceEnd) return

    const lines = box.querySelectorAll('.line')
    if (lines.length === 0) return   // 高亮失败退回纯文本时没有逐行节点，跳过
    const startIdx = active.startLine - sliceStart
    if (startIdx < 0 || startIdx >= lines.length) return
    const count = Math.max(1, (active.endLine || active.startLine) - active.startLine + 1)
    const endIdx = Math.min(lines.length - 1, startIdx + count - 1)

    lines[startIdx]?.classList.add('md-method-start')
    lines[endIdx]?.classList.add('md-method-end')

    // 不用 scrollIntoView：浮窗背后还有图谱页，它会连带把整个页面滚走
    const first = lines[startIdx]
    if (!first) return
    const top = first.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTop = Math.max(0, top - box.clientHeight / 2 + first.offsetHeight / 2)
  }, [activeMethodUid, data, html])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // 在 Agent 输入框里按 Esc 是取消输入，不该顺手关掉代码窗
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const title = data?.simpleName || name || uid?.split('.').pop() || '源码'
  const fileName = fileNameOf(data?.filePath, title)
  const range = data ? `${data.filePath}:${data.startLine}-${data.endLine}` : ''
  const methods = data?.methods || []
  const sliceStart = data?.startLine || 1
  const sliceEnd = data?.endLine || 0
  const activeMethod = activeMethodUid ? methods.find((m) => m.uid === activeMethodUid) : null
  const jumpable = (m) => typeof m.startLine === 'number'
    && m.startLine >= sliceStart && m.startLine <= sliceEnd

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
      return next
    })
  }

  const copy = async () => {
    if (!data?.content) return
    try {
      await navigator.clipboard.writeText(data.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时保持静默，用户仍可手动选中
    }
  }

  return (
    <aside
      className={`code-window code-drawer is-${theme}${dragging ? ' is-dragging' : ''}${maximized ? ' is-maximized' : ''}`}
      role="dialog"
      aria-label="类源码"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header className="code-drawer-head" {...dragProps}>
        <div className="code-drawer-file">
          <span className="code-file-badge" aria-hidden="true">{initialsOf(title)}</span>
          <div className="code-drawer-title">
            <strong>{fileName}</strong>
            <span className="code-drawer-uid">{data?.uid || uid}</span>
          </div>
        </div>
        <div className="code-drawer-actions">
          <button
            className="icon-btn code-theme"
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
            aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
          >
            <ThemeIcon dark={theme === 'dark'} />
          </button>
          <button className="code-copy" onClick={copy} disabled={!data?.content}>
            {copied ? '已复制' : '复制'}
          </button>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <IconX size={16} />
          </button>
        </div>
      </header>

      {range && (
        <div className="code-drawer-meta">
          <span>{range}</span>
          {activeMethod && (
            <span className="code-drawer-anchor" title={activeMethod.uid}>
              方法 {activeMethod.name || activeMethod.signature}
            </span>
          )}
          {data?.truncated && <span className="code-drawer-warn">内容过长，已截断</span>}
        </div>
      )}

      <div className="code-drawer-body">
        {loading && <p className="code-drawer-note">正在读取源码…</p>}
        {!loading && error && <p className="code-drawer-error">{error}</p>}
        {!loading && !error && data && (
          <div className="code-drawer-split">
            <nav className="code-outline" aria-label="方法大纲">
              <div className="code-outline-head">
                <span>方法</span>
                <span className="code-outline-count">{methods.length}</span>
              </div>
              {methods.map((m) => {
                const jump = jumpable(m)
                return (
                  <button
                    key={m.uid}
                    className={[
                      'code-outline-item',
                      activeMethodUid === m.uid ? 'is-active' : '',
                      jump ? '' : 'is-outside'
                    ].join(' ').trim()}
                    title={jump ? m.uid : `${m.uid}（超出已加载的源码范围）`}
                    onClick={() => onLockMethod?.(m)}
                  >
                    <span className="code-outline-icon" aria-hidden="true">ƒ</span>
                    <span className="code-outline-body">
                      <span className="code-outline-name">{m.name || m.signature || m.uid}</span>
                      <span className="code-outline-meta">
                        {m.returnType ? `${m.returnType} · ` : ''}{m.startLine}
                      </span>
                    </span>
                  </button>
                )
              })}
              {methods.length === 0 && (
                <p className="code-outline-empty">图上没有这个方法类的方法记录</p>
              )}
            </nav>

            <div className="code-drawer-code" ref={codeRef}>
              {html
                ? <div dangerouslySetInnerHTML={{ __html: html }} />
                : <pre className="code-drawer-plain">{data.content}</pre>}
            </div>
          </div>
        )}
      </div>

      {!maximized && (
        <>
          <span className="code-resize code-resize-r" {...resizeProps('r')} />
          <span className="code-resize code-resize-b" {...resizeProps('b')} />
          <span className="code-resize code-resize-br" {...resizeProps('br')} />
        </>
      )}
    </aside>
  )
}
