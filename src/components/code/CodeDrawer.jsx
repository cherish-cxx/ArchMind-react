import { useEffect, useRef, useState } from 'react'
import { classSource } from '../../api/project'
import { IconX } from '../../icons'

const THEME = 'github-dark'
const LANGS = [
  'java', 'javascript', 'typescript', 'tsx', 'jsx', 'python', 'json', 'yaml',
  'xml', 'sql', 'bash', 'markdown', 'css', 'html', 'kotlin', 'go', 'rust',
  'csharp', 'properties'
]

const EXT_LANG = {
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', py: 'python',
  json: 'json', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', sql: 'sql', sh: 'bash', bash: 'bash',
  md: 'markdown', css: 'css', html: 'html', htm: 'html',
  go: 'go', rs: 'rust', cs: 'csharp', properties: 'properties'
}

let highlighterPromise = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki')
      .then(({ createHighlighter }) => createHighlighter({ themes: [THEME], langs: LANGS }))
      .catch((err) => {
        highlighterPromise = null
        throw err
      })
  }
  return highlighterPromise
}

function langOf(filePath) {
  const ext = String(filePath || '').split('.').pop()?.toLowerCase()
  const lang = EXT_LANG[ext] || 'text'
  return LANGS.includes(lang) ? lang : 'text'
}

/**
 * 代码抽屉：按类 uid 拉源码切片，Shiki 高亮 + 行号 + 复制。
 * 高亮失败时退回纯文本，不影响阅读。
 */
export default function CodeDrawer({ open, projectId, uid, name, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const seqRef = useRef(0)

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

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const title = data?.simpleName || name || uid?.split('.').pop() || '源码'
  const range = data ? `${data.filePath}:${data.startLine}-${data.endLine}` : ''

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
    <div className="code-drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <aside className="code-drawer" role="dialog" aria-label="类源码">
        <header className="code-drawer-head">
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
            {data?.truncated && <span className="code-drawer-warn">内容过长，已截断</span>}
          </div>
        )}

        <div className="code-drawer-body">
          {loading && <p className="code-drawer-note">正在读取源码…</p>}
          {!loading && error && <p className="code-drawer-error">{error}</p>}
          {!loading && !error && data && (
            html
              ? <div className="code-drawer-code" dangerouslySetInnerHTML={{ __html: html }} />
              : <pre className="code-drawer-plain">{data.content}</pre>
          )}
        </div>
      </aside>
    </div>
  )
}
