import { useEffect, useRef, useState } from 'react'
import { classSource } from '../../api/project'
import { IconX } from '../../icons'
import { getHighlighter, LANGS } from '../../utils/shiki'
import useFloatingWindow from '../../hooks/useFloatingWindow'

const THEME = 'github-dark'

const EXT_LANG = {
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', py: 'python',
  json: 'json', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', sql: 'sql', sh: 'bash', bash: 'bash',
  md: 'markdown', css: 'css', html: 'html', htm: 'html',
  go: 'go', rs: 'rust', cs: 'csharp', properties: 'properties'
}

function langOf(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase()
  const lang = EXT_LANG[ext] || 'text'
  return LANGS.includes(lang) ? lang : 'text'
}

/**
 * 代码浮窗：按类 uid 拉源码切片，Shiki 高亮 + 行号 + 复制。
 * 高亮失败时退回纯文本，不影响阅读。
 *
 * 非模态：没有遮罩、不锁焦点，右侧 Agent 面板可以照常使用。
 * 标题栏拖动、右/下/右下三个边缘缩放、双击标题栏最大化。
 *
 * **左侧方法大纲**：点一条 = 滚到那段代码 + 把它锁为提问锚点。
 * 大纲里所有方法的 uid 和方法级 evidence / methodUid 是同一个字符串，
 * 所以「看到的」和「问到的」不会错位。
 */
export default function CodeDrawer({
  open, projectId, uid, name, onClose, activeMethodUid, onLockMethod
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
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
        let highlighted = ''
        try {
          const hl = await getHighlighter()
          if (seq !== seqRef.current) return
          highlighted = hl.codeToHtml(source.content || '', {
            lang: langOf(source.filePath),
            theme: THEME
          })
        } catch {
          highlighted = ''
        }
        if (seq !== seqRef.current) return
        setData(source)
        setHtml(highlighted)
      } catch (err) {
        if (seq !== seqRef.current) return
        setError(err?.message || '源码加载失败')
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    })()

    return () => { seqRef.current++ }
  }, [open, projectId, uid])

  // 锁定的方法变化时：清掉旧高亮，标出新方法，并滚到它
  useEffect(() => {
    const box = codeRef.current
    if (!box) return
    box.querySelectorAll('.md-line-mark').forEach((el) => el.classList.remove('md-line-mark'))
    if (!activeMethodUid || !data) return

    const sliceStart = data.startLine || 1
    const sliceEnd = data.endLine || sliceStart
    const active = (data.methods || []).find((m) => m.uid === activeMethodUid)
    if (!active || typeof active.startLine !== 'number') return
    if (active.startLine < sliceStart || active.startLine > sliceEnd) return

    const lines = box.querySelectorAll('.line')
    if (lines.length === 0) return   // 高亮失败退回纯文本时没有逐行节点，跳过
    const startIdx = active.startLine - sliceStart
    const count = Math.max(1, (active.endLine || active.startLine) - active.startLine + 1)
    for (let i = 0; i < count; i += 1) lines[startIdx + i]?.classList.add('md-line-mark')

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
  const range = data ? `${data.filePath}:${data.startLine}-${data.endLine}` : ''
  const methods = data?.methods || []
  const sliceStart = data?.startLine || 1
  const sliceEnd = data?.endLine || 0
  const activeMethod = activeMethodUid ? methods.find((m) => m.uid === activeMethodUid) : null
  const jumpable = (m) => typeof m.startLine === 'number'
    && m.startLine >= sliceStart && m.startLine <= sliceEnd

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
      className={`code-window code-drawer${dragging ? ' is-dragging' : ''}${maximized ? ' is-maximized' : ''}`}
      role="dialog"
      aria-label="类源码"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header className="code-drawer-head" {...dragProps}>
        <div className="code-drawer-title">
          <strong>{title}</strong>
          <span className="code-drawer-uid">{data?.uid || uid}</span>
        </div>
        <div className="code-drawer-actions">
          <button className="btn-ghost code-copy" onClick={copy} disabled={!data?.content}>
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
              <div className="code-outline-head">方法 {methods.length}</div>
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
                    <span className="code-outline-name">{m.name || m.signature || m.uid}</span>
                    <span className="code-outline-meta">
                      {m.returnType ? `${m.returnType} · ` : ''}{m.startLine}
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
