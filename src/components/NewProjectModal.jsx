import { useEffect, useRef, useState } from 'react'
import { IconX, IconUpload } from '../icons'

const GITURL_RE = /^https?:\/\/\S+$/
const MAX_UPLOAD_MB = 500
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`
const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`

// 新建项目弹窗：POST /api/project/with-source（有源码）或 /api/project（无源码）
export default function NewProjectModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [file, setFile] = useState(null)
  const [autoAnalyze, setAutoAnalyze] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const idemRef = useRef('')

  useEffect(() => {
    if (open) {
      setError('')
      setProgress(0)
      idemRef.current = newIdempotencyKey()
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError('仅支持 .zip 压缩包')
      setFile(null)
      return
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`压缩包不能超过 ${MAX_UPLOAD_MB}MB（当前 ${formatSize(f.size)}）`)
      setFile(null)
      return
    }
    setError('')
    setFile(f)
  }

  const clearFile = () => setFile(null)

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    const n = name.trim()
    if (!n) return setError('请输入项目名称')
    if (n.length > 50) return setError('项目名称长度需在 1-50 之间')
    if (description.length > 200) return setError('项目描述不能超过 200 字')
    if (gitUrl.trim() && !GITURL_RE.test(gitUrl.trim())) return setError('Git 地址需以 http(s):// 开头')
    setSubmitting(true)
    setProgress(0)
    try {
      await onCreate({
        name: n,
        description: description.trim(),
        gitUrl: gitUrl.trim(),
        file,
        autoAnalyze: autoAnalyze && !!file,
        idempotencyKey: idemRef.current
      }, setProgress)
      setName('')
      setDescription('')
      setGitUrl('')
      setFile(null)
      setProgress(0)
      idemRef.current = newIdempotencyKey()
      onClose()
    } catch (err) {
      // 失败保留 idemRef：重试复用同一个幂等键，服务端不会重复建项目
      setError(err?.message || '新建项目失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal modal-new" onSubmit={submit}>
        <div className="modal-header">
          <h3 className="modal-title">新建项目</h3>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭">
            <IconX size={16} />
          </button>
        </div>

        <label className="field">
          <span className="field-label">项目名称 *</span>
          <input
            ref={inputRef}
            className="modal-input"
            value={name}
            placeholder="1-50 个字符"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">项目描述</span>
          <textarea
            className="modal-textarea"
            value={description}
            placeholder="不超过 200 字（可选）"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Git 仓库地址</span>
          <input
            className="modal-input"
            value={gitUrl}
            placeholder="https://github.com/example/repo.git（可选）"
            onChange={(e) => setGitUrl(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">项目源码（ZIP，可选）</span>
          {!file ? (
            <button type="button" className="btn-ghost file-choose" onClick={() => fileRef.current?.click()}>
              <IconUpload size={15} />
              选择 ZIP 压缩包上传
            </button>
          ) : (
            <div className="file-picked">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
              <button type="button" className="file-clear" onClick={clearFile}>移除</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".zip" hidden onChange={pickFile} />
          <span className="field-hint">不选择也创建项目，之后可在项目详情里补传；单个 ZIP 不超过 {MAX_UPLOAD_MB}MB</span>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoAnalyze}
            disabled={!file}
            onChange={(e) => setAutoAnalyze(e.target.checked)}
          />
          <span>创建并上传后立即分析项目概况</span>
        </label>

        {error && <div className="modal-error">{error}</div>}

        {submitting && file && (
          <div className="upload-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        <button className="btn-primary modal-submit" type="submit" disabled={submitting}>
          {submitting ? (file ? `上传中 ${progress}%` : '创建中…') : '创建项目'}
        </button>
      </form>
    </div>
  )
}
