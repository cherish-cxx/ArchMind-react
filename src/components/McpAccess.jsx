import { useCallback, useEffect, useState } from 'react'
import {
  listMcpTokens, createMcpToken, revokeMcpToken, projectBrief
} from '../api/mcp'

const EXPIRY_OPTIONS = [90, 180, 365]

// 后端时间可能是 ISO 或 "yyyy-MM-dd HH:mm:ss"，统一转成本地日期；无值时给占位。
function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString()
}

// 复制优先用 Clipboard API；http 非安全上下文下退回 execCommand。
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走兜底
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function mcpEndpoint() {
  const configured = import.meta.env?.VITE_MCP_URL
  if (configured) return configured
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/mcp`
  }
  return 'http://localhost:8001/mcp'
}

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "archmind": {
      "type": "http",
      "url": "${mcpEndpoint()}",
      "headers": {
        "Authorization": "Bearer \${ARCHMIND_PAT}"
      }
    }
  }
}`

export default function McpAccess({ project }) {
  const [tokens, setTokens] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [name, setName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(90)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  // 明文 token 只存在这个面板状态里：创建成功后展示一次，关闭即丢弃。
  const [createdToken, setCreatedToken] = useState('')
  const [tokenCopied, setTokenCopied] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)

  const [revokingId, setRevokingId] = useState('')
  const [revokeError, setRevokeError] = useState('')
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')

  const loadTokens = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const list = await listMcpTokens()
      setTokens(Array.isArray(list) ? list : [])
    } catch (err) {
      setListError(err?.message || '加载访问令牌失败')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadTokens() }, [loadTokens])

  const onCreate = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('请填写令牌名称')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const created = await createMcpToken(trimmed, expiresInDays)
      setCreatedToken(created?.token || '')
      setTokenCopied(false)
      setName('')
      setExpiresInDays(90)
      await loadTokens()
    } catch (err) {
      setCreateError(err?.message || '创建令牌失败')
    } finally {
      setCreating(false)
    }
  }

  const onCopyToken = async () => {
    if (await copyText(createdToken)) {
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    }
  }

  const onCopySnippet = async () => {
    if (await copyText(CONFIG_SNIPPET)) {
      setSnippetCopied(true)
      setTimeout(() => setSnippetCopied(false), 2000)
    }
  }

  const onRevoke = async (t) => {
    if (!window.confirm(`确定吊销令牌「${t.name}」吗？使用该令牌的客户端会立即失去访问权限。`)) return
    setRevokingId(t.id)
    setRevokeError('')
    try {
      await revokeMcpToken(t.id)
      setRevokeError('')
      await loadTokens()
    } catch (err) {
      setRevokeError(err?.message || '吊销令牌失败')
    } finally {
      setRevokingId('')
    }
  }

  const canExport = project?.analysisStatus === 'COMPLETED'

  const onExport = async (target) => {
    if (!canExport) return
    setExporting(target)
    setExportError('')
    try {
      const brief = await projectBrief(project.id, target)
      const filename = brief?.filename
        || (target === 'claude' ? 'CLAUDE.md' : 'AGENTS.md')
      const content = brief?.content || ''
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err?.message || '导出项目说明失败')
    } finally {
      setExporting('')
    }
  }

  return (
    <section className="pd-section mcp-panel">
      <div className="pd-section-head">
        <h2 className="pd-section-title">MCP 接入</h2>
        <span className="pd-section-note">让 Claude Code 等外部 agent 读取本项目认知</span>
      </div>

      {createdToken && (
        <div className="mcp-reveal">
          <div className="mcp-reveal-head">
            <strong>访问令牌已创建</strong>
            <span className="mcp-reveal-warn">只显示这一次，请立即复制并妥善保存，关闭后无法再次查看</span>
            <div className="mcp-reveal-actions">
              <button className="pd-btn pd-btn-primary" onClick={onCopyToken}>
                {tokenCopied ? '已复制' : '复制令牌'}
              </button>
              <button className="pd-btn" onClick={() => setCreatedToken('')}>关闭</button>
            </div>
          </div>
          <code className="mcp-reveal-value">{createdToken}</code>
        </div>
      )}

      <div className="mcp-block">
        <div className="mcp-block-head">
          <span className="dm-label">创建访问令牌</span>
        </div>
        <form className="mcp-form" onSubmit={onCreate}>
          <input
            className="mcp-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="令牌名称，例如 claude-code"
            maxLength={64}
            required
          />
          <select
            className="mcp-select"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} 天</option>
            ))}
          </select>
          <button
            type="submit"
            className="pd-btn pd-btn-primary"
            disabled={creating || !name.trim()}
          >
            {creating ? '创建中…' : '创建令牌'}
          </button>
        </form>
        {createError && <p className="mcp-error">{createError}</p>}
      </div>

      <div className="mcp-block">
        <div className="mcp-block-head">
          <span className="dm-label">已创建的令牌</span>
        </div>
        {listLoading ? (
          <p className="mcp-note">正在读取令牌…</p>
        ) : listError ? (
          <p className="mcp-error">{listError}</p>
        ) : tokens.length === 0 ? (
          <p className="mcp-note">还没有令牌。创建一个后即可在 Claude Code 中配置 MCP。</p>
        ) : (
          <div className="mcp-token-list">
            {tokens.map((t) => {
              const revoked = Boolean(t.revokedAt)
              return (
                <div key={t.id} className={`mcp-token-row${revoked ? ' is-revoked' : ''}`}>
                  <div className="mcp-token-main">
                    <span className="mcp-token-name">{t.name}</span>
                    <code className="mcp-token-prefix">{t.prefix}…</code>
                  </div>
                  <div className="mcp-token-meta">
                    <span>创建 {fmtDate(t.createTime)}</span>
                    <span>最近使用 {t.lastUsedAt ? fmtDate(t.lastUsedAt) : '从未'}</span>
                    <span>过期 {t.expiresAt ? fmtDate(t.expiresAt) : '永不过期'}</span>
                  </div>
                  {revoked ? (
                    <span className="mcp-revoked">已吊销</span>
                  ) : (
                    <button
                      className="pd-btn danger mcp-revoke"
                      onClick={() => onRevoke(t)}
                      disabled={revokingId === t.id}
                    >
                      {revokingId === t.id ? '吊销中…' : '吊销'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {revokeError && <p className="mcp-error">{revokeError}</p>}
      </div>

      <div className="mcp-block">
        <div className="mcp-block-head">
          <span className="dm-label">Claude Code 配置（.mcp.json）</span>
          <button className="pd-btn mcp-copy" onClick={onCopySnippet}>
            {snippetCopied ? '已复制' : '复制配置'}
          </button>
        </div>
        <pre className="mcp-code"><code>{CONFIG_SNIPPET}</code></pre>
        <p className="mcp-note">
          将 ARCHMIND_PAT 设为环境变量（不要写进配置文件），Claude Code 会以 Bearer 方式鉴权。
        </p>
      </div>

      <div className="mcp-block">
        <div className="mcp-block-head">
          <span className="dm-label">项目说明导出</span>
        </div>
        <div className="mcp-export-row">
          <button
            className="pd-btn"
            onClick={() => onExport('agents')}
            disabled={!canExport || Boolean(exporting)}
          >
            {exporting === 'agents' ? '导出中…' : '导出 AGENTS.md'}
          </button>
          <button
            className="pd-btn"
            onClick={() => onExport('claude')}
            disabled={!canExport || Boolean(exporting)}
          >
            {exporting === 'claude' ? '导出中…' : '导出 CLAUDE.md'}
          </button>
        </div>
        {!canExport && (
          <p className="mcp-note">完成分析后可导出项目说明（含 projectId、技术栈与模块）。</p>
        )}
        {exportError && <p className="mcp-error">{exportError}</p>}
      </div>
    </section>
  )
}
