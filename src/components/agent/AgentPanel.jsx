import { useEffect, useRef, useState } from 'react'
import MarkdownMessage, { MarkdownBody } from './MarkdownMessage'
import {
  IconSend,
  IconBot,
  IconPanelHide,
  IconPanelShow,
  IconCompose,
  IconArrowLeft
} from '../../icons'

function shortUid(uid) {
  const [owner, sig] = String(uid || '').split('#')
  const simple = owner.split('.').pop() || owner
  return sig ? `${simple}#${sig}` : simple
}

function StepList({ steps, meta, live }) {
  if (!steps || steps.length === 0) return null
  return (
    <details className="msg-steps" open={live ? true : undefined}>
      <summary>
        {live ? '调查中' : '执行详情'} · {steps.length} 步
        {meta?.latencyMs ? ` · ${meta.latencyMs}ms` : ''}
      </summary>
      <div className="steps-body">
        {steps.map((s) => (
          <div className="step-row" key={`${s.n}-${s.type}`}>
            <span className={`step-type type-${String(s.type).toLowerCase()}`}>{s.type}</span>
            <span className="step-detail">{s.detail}</span>
            <span className="step-ms">{s.ms}ms</span>
          </div>
        ))}
      </div>
    </details>
  )
}

function CitationChip({ uid, kind, onCitation }) {
  return (
    <button
      className="citation-chip"
      title={uid}
      onClick={() => onCitation?.(uid)}
    >
      <span className="citation-kind">{kind === 'METHOD' ? 'M' : 'C'}</span>
      {shortUid(uid)}
    </button>
  )
}

function AgentMessage({
  message, isLast, pending, onSuggestion, onCitation, onRetry, onNewConversation
}) {
  if (message.role === 'system') {
    return <div className="msg-system">{message.text}</div>
  }

  if (message.role === 'user') {
    return (
      <div className="msg user">
        <div className="msg-bubble">{message.text}</div>
      </div>
    )
  }

  const showSuggestions =
    isLast && !pending && !message.error && (message.suggestions || []).length > 0

  // 段落是引用的最小单位：chip 挂在它所在的那一段下面，而不是整条消息底部。
  const sections = message.sections || []
  const hasSections = sections.length > 0
  // 顶层 citations 只有 uid + kind，段落里只有 uid —— 这里补回 kind
  const kinds = new Map((message.citations || []).map((c) => [c.uid, c.kind]))

  return (
    <div className={`msg agent ${message.error ? 'msg-error' : ''}`}>
      <div className="msg-content">
        {hasSections ? (
          <div className="msg-text msg-markdown msg-sections">
            {message.headline && <h2 className="msg-headline">{message.headline}</h2>}
            {sections.map((s, i) => (
              <section className="msg-section" key={`${i}:${s.title || ''}`}>
                {s.title && <h3 className="msg-section-title">{s.title}</h3>}
                <MarkdownBody text={s.body} />
                {(s.citedUids || []).length > 0 && (
                  <div className="msg-section-cites">
                    {s.citedUids.map((uid) => (
                      <CitationChip
                        key={uid}
                        uid={uid}
                        kind={kinds.get(uid)}
                        onCitation={onCitation}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <>
            <MarkdownMessage text={message.text} />

            {(message.citations || []).length > 0 && (
              <div className="msg-citations">
                <span className="msg-label">来源</span>
                {message.citations.map((c) => (
                  <CitationChip
                    key={`${c.kind}:${c.uid}`}
                    uid={c.uid}
                    kind={c.kind}
                    onCitation={onCitation}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {message.pending && (message.steps || []).length === 0 && (
          <div className="msg-investigating">正在调查…</div>
        )}

        <StepList steps={message.steps} meta={message.meta} live={message.pending} />

        {message.meta && (
          <div className="msg-meta">
            {[
              message.meta.intent,
              Number.isFinite(message.meta.confidence) && `把握 ${message.meta.confidence.toFixed(2)}`,
              message.meta.latencyMs !== undefined && `${message.meta.latencyMs}ms`,
            ].filter(Boolean).join(" · ")}
          </div>
        )}

        {message.sessionExpired && (
          <div className="msg-expired">
            这段对话已过期，上下文不再保留。
            <button className="link-action" onClick={onNewConversation}>开始新对话</button>
          </div>
        )}

        {message.error && (
          <div className="msg-error-actions">
            <button className="link-action" onClick={onRetry}>重试</button>
          </div>
        )}

        {showSuggestions && (
          <div className="msg-suggestions">
            {message.suggestions.map((s) => (
              <button
                key={s.label}
                className="suggestion-chip"
                onClick={() => onSuggestion?.(s.message || s.label)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Agent 对话面板（P2）。
 *
 * 定位：**只负责展示与交互**。请求、取消、超时、串行都在 useAgentChat；
 * 图 patch 的合并与布局由 MemoryPage 处理。这样面板不依赖画布实现。
 */
export default function AgentPanel({
  collapsed,
  onToggle,
  width,
  onResize,
  projectId,
  projectName,
  messages = [],
  pending,
  sessionExpired,
  focusLabel,
  onSend,
  onCancel,
  onRetry,
  onNewConversation,
  onBack,
  canBack,
  navigating,
  onCitation,
  onClearFocus,
  methodFocus,
  onClearMethodFocus
}) {
  const [input, setInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, pending])

  // 输入框跟随内容长高，最多 120px，超出后内部滚动
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  useEffect(() => {
    if (!pending) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [pending])

  useEffect(() => {
    const onMove = (e) => {
      if (resizeRef.current) onResize?.(e.clientX)
    }
    const onUp = () => { resizeRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onResize])

  const canSend = !!projectId && !pending && !sessionExpired && input.trim().length > 0

  const send = () => {
    const text = input.trim()
    if (!canSend || !text) return
    setInput('')
    onSend?.(text)
  }

  if (collapsed) {
    return (
      <aside className="ai-panel collapsed">
        <button className="icon-btn" onClick={onToggle} title="展开 ArchMind Agent">
          <IconPanelShow size={16} />
        </button>
      </aside>
    )
  }

  const lastAgentIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent') return i
    }
    return -1
  })()

  return (
    <aside className="ai-panel" style={{ width }}>
      <div
        className="panel-resizer"
        onMouseDown={(e) => { resizeRef.current = true; e.preventDefault() }}
      />

      <div className="ai-header">
        <div className="ai-title">
          <IconBot size={16} />
          <span>ArchMind Agent</span>
          {/* 面板常驻在所有页面，必须写清楚这轮对话属于哪个项目 */}
          {projectName && <span className="ai-project" title={projectName}>{projectName}</span>}
          <span
            className={`status-dot ${projectId ? '' : 'offline'}`}
            title={projectId ? '已连接项目' : '未选择项目'}
          />
        </div>
        <div className="ai-header-actions">
          {projectId && (
            <button
              type="button"
              className="btn-new-chat"
              onClick={onNewConversation}
              title="开始新对话（保留当前图）"
            >
              <IconCompose size={14} />
              <span>新对话</span>
            </button>
          )}
          <button
            className="icon-btn"
            onClick={onBack}
            disabled={!canBack || navigating}
            title="退回去（零 token）"
          >
            <IconArrowLeft size={15} />
          </button>
          <button className="icon-btn" onClick={onToggle} title="隐藏面板">
            <IconPanelHide size={16} />
          </button>
        </div>
      </div>

      {sessionExpired && (
        <div className="ai-banner">
          对话已过期，上下文不再保留。
          <button className="link-action" onClick={onNewConversation}>开始新对话</button>
        </div>
      )}

      <div className="ai-messages" ref={listRef}>
        {messages.map((m, i) => (
          <AgentMessage
            key={m.id || i}
            message={m}
            isLast={i === lastAgentIndex}
            pending={pending}
            onSuggestion={onSend}
            onCitation={onCitation}
            onRetry={onRetry}
            onNewConversation={onNewConversation}
          />
        ))}

        {pending && (
          <div className="msg agent pending-msg">
            <div className="msg-content">
              <div className="msg-text pending-line">
                <span className="pending-dots"><i /><i /><i /></span>
                正在理解问题… 已等待 {elapsed}s
                <button className="link-action" onClick={onCancel}>取消</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ai-input">
        {focusLabel && (
          <div className="anchor-chip">
            <span className="anchor-label">锚点</span>
            <span className="anchor-name" title={focusLabel}>{focusLabel}</span>
            <button className="anchor-clear" onClick={onClearFocus} title="清除锚点">×</button>
          </div>
        )}
        {methodFocus && (
          <div className="anchor-chip method-chip">
            <span className="anchor-label">方法</span>
            <span className="anchor-name" title={methodFocus.uid}>
              {methodFocus.name || shortUid(methodFocus.uid)}
            </span>
            <button className="anchor-clear" onClick={onClearMethodFocus} title="取消方法锁定">×</button>
          </div>
        )}
        <div className={`input-row${!projectId || sessionExpired || pending ? ' is-disabled' : ''}`}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            aria-label="向 ArchMind Agent 提问"
            disabled={!projectId || sessionExpired || pending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="btn-send" onClick={send} disabled={!canSend} title="发送">
            <IconSend size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
