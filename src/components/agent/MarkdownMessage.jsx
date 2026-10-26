import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getHighlighter, LANGS } from '../../utils/shiki'
import { useTheme } from '../../state/themeStore'

/**
 * 讲解正文的 Markdown 渲染（R2）。
 *
 * 三条约定：
 *  1. **不放行原始 HTML** —— 讲解里到处是 `List<String>` 这种泛型，一旦当 HTML 解析，
 *     `<String>` 会被整段吞掉。prompt 已要求 LLM 用反引号包代码，这里再兜一层。
 *  2. **代码块用 Shiki 异步高亮**，拿不到高亮就退回纯文本 —— 和 CodeDrawer 同一套路，
 *     高亮失败不该影响阅读。
 *  3. 组件映射和插件数组定义在模块顶层：`AgentPanel` 每敲一个字都会重渲染，
 *     每次新建 plugins 数组会让 ReactMarkdown 白解析一遍。
 */

function CodeBlock({ lang, code }) {
  const theme = useTheme()
  const [html, setHtml] = useState('')

  useEffect(() => {
    let alive = true
    getHighlighter()
      .then((highlighter) => {
        if (!alive) return
        const target = LANGS.includes(lang) ? lang : 'text'
        setHtml(highlighter.codeToHtml(code, {
          lang: target,
          theme: theme === 'dark' ? 'github-dark' : 'github-light'
        }))
      })
      .catch(() => { /* 高亮不是必需品，失败就停在纯文本 */ })
    return () => { alive = false }
  }, [lang, code, theme])

  if (!html) {
    return <pre className="md-plain"><code>{code}</code></pre>
  }
  return <div className="md-highlight" dangerouslySetInnerHTML={{ __html: html }} />
}

const COMPONENTS = {
  // react-markdown 会把行内代码包进 <pre>；这里把 <pre> 让掉，由 CodeBlock 自己出。
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '')
    const match = /language-([\w-]+)/.exec(className || '')
    if (!match && !text.includes('\n')) {
      return <code className="md-inline">{children}</code>
    }
    return <CodeBlock lang={match?.[1] || 'text'} code={text} />
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  )
}

const REMARK_PLUGINS = [remarkGfm]

/** 只渲染 Markdown 正文，不带气泡 —— 逐段渲染时每段各自调用一次。 */
export function MarkdownBody({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={COMPONENTS}
      skipHtml
    >
      {text || ''}
    </ReactMarkdown>
  )
}

function MarkdownMessage({ text }) {
  return (
    <div className="msg-text msg-markdown">
      <MarkdownBody text={text} />
    </div>
  )
}

export default memo(MarkdownMessage)
