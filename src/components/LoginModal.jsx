import { useEffect, useRef, useState } from 'react'
import { IconX } from '../icons'
import { login as apiLogin, register as apiRegister } from '../api/auth'

const USERNAME_RE = /^.{5,12}$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,12}$/
const PHONE_RE = /^1[3-9]\d{9}$/
const EMAIL_RE = /^\S+@\S+\.\S+$/

function validateRegister({ username, email, phone, password, confirm }) {
  if (!USERNAME_RE.test(username.trim())) return '用户名需为 5-12 位'
  if (!EMAIL_RE.test(email.trim())) return '邮箱格式不正确'
  if (!PHONE_RE.test(phone.trim())) return '手机号格式不正确'
  if (!PASSWORD_RE.test(password)) return '密码需 6-12 位且含大小写字母和数字'
  if (password !== confirm) return '两次输入的密码不一致'
  return ''
}

export default function LoginModal({ open, onClose, onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reg, setReg] = useState({ username: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setError('')
      setNotice('')
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

  const switchMode = (m) => {
    setMode(m)
    setError('')
    setNotice('')
    setSubmitting(false)
  }

  const submitLogin = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setNotice('')
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    try {
      await onLogin(username.trim(), password)
      setPassword('')
      onClose()
    } catch (err) {
      setError(err?.message || '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setNotice('')
    const vErr = validateRegister(reg)
    if (vErr) {
      setError(vErr)
      return
    }
    setSubmitting(true)
    try {
      await apiRegister({
        username: reg.username.trim(),
        password: reg.password,
        phone: reg.phone.trim(),
        email: reg.email.trim()
      })
      // 注册接口只返回用户信息、不派发 token，成功即切回登录页让用户登录
      setUsername(reg.username.trim())
      setPassword('')
      setReg({ username: '', email: '', phone: '', password: '', confirm: '' })
      setMode('login')
      setNotice('注册成功，请登录')
    } catch (err) {
      setError(err?.message || '注册失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const submit = (e) => (mode === 'login' ? submitLogin(e) : submitRegister(e))
  const setField = (k) => (e) => setReg((r) => ({ ...r, [k]: e.target.value }))

  const submittingText = submitting
    ? mode === 'login' ? '登录中…' : '注册中…'
    : mode === 'login' ? '登录' : '注册'

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h3 className="modal-title">{mode === 'login' ? '登录 ArchMind' : '注册 ArchMind'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭">
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={`modal-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            注册
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <label className="field">
              <span className="field-label">用户名</span>
              <input
                ref={inputRef}
                className="modal-input"
                value={username}
                placeholder="chenxi"
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">密码</span>
              <input
                type="password"
                className="modal-input"
                value={password}
                placeholder="••••••"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">用户名</span>
              <input
                className="modal-input"
                value={reg.username}
                placeholder="5-12 位"
                autoComplete="username"
                onChange={setField('username')}
              />
            </label>

            <label className="field">
              <span className="field-label">邮箱</span>
              <input
                className="modal-input"
                value={reg.email}
                placeholder="you@example.com"
                autoComplete="email"
                onChange={setField('email')}
              />
            </label>

            <label className="field">
              <span className="field-label">手机号</span>
              <input
                className="modal-input"
                value={reg.phone}
                placeholder="1[3-9] 开头 11 位"
                autoComplete="tel"
                onChange={setField('phone')}
              />
            </label>

            <label className="field">
              <span className="field-label">密码</span>
              <input
                type="password"
                className="modal-input"
                value={reg.password}
                placeholder="6-12 位，含大小写字母和数字"
                autoComplete="new-password"
                onChange={setField('password')}
              />
            </label>

            <label className="field">
              <span className="field-label">确认密码</span>
              <input
                type="password"
                className="modal-input"
                value={reg.confirm}
                placeholder="再次输入密码"
                autoComplete="new-password"
                onChange={setField('confirm')}
              />
            </label>
          </>
        )}

        {notice && <div className="modal-ok">{notice}</div>}
        {error && <div className="modal-error">{error}</div>}

        <button className="btn-primary modal-submit" type="submit" disabled={submitting}>
          {submittingText}
        </button>

        {mode === 'login' && (
          <p className="modal-hint">
            使用你在当前后端注册的账号登录；没有账号请先点「注册」。
          </p>
        )}
      </form>
    </div>
  )
}
