import { useState } from 'react'
import Button from '../ui/Button'
import { loginResponder, registerResponder, saveToken } from '../../utils/api'

export default function LoginForm({ onSuccess }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', organization: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: reqError } = mode === 'login' ? await loginResponder(form) : await registerResponder(form)

    setLoading(false)

    if (reqError) {
      setError(reqError.message)
      return
    }

    saveToken(data.token)
    onSuccess(data.responder)
  }

  return (
    <div className="responder-login-wrap">
      <h2>{mode === 'login' ? 'Responder Login' : 'Register your organization'}</h2>
      <p>Access the live case feed for your area.</p>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <>
            <div className="form-field">
              <label>Name</label>
              <input type="text" value={form.name} onChange={update('name')} required />
            </div>
            <div className="form-field">
              <label>Organization</label>
              <input type="text" value={form.organization} onChange={update('organization')} required />
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={update('phone')} required />
            </div>
          </>
        )}

        <div className="form-field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={update('email')} required />
        </div>
        <div className="form-field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </div>

        <Button type="submit" variant="primary" className="btn-full" loading={loading}>
          {mode === 'login' ? 'Log in' : 'Register'}
        </Button>
      </form>

      <button className="form-toggle-link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? "Don't have an account? Register" : 'Already registered? Log in'}
      </button>
    </div>
  )
}
