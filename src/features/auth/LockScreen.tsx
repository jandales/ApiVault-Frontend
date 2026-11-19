import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/providers/AuthProvider'
import { Icon } from '../../components/Icon'
import { VaultUnlockError } from '../../security/vault-crypto'

/**
 * Shown when the session is valid but the encryption key is not in memory (page reload or auto-lock).
 * The key lives only in memory by design, so the password is needed to re-derive it.
 */
export function LockScreen() {
  const { user, unlock, logout } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get('password'))
    setBusy(true)
    setError('')
    try {
      await unlock(password)
    } catch (err) {
      setError(err instanceof VaultUnlockError ? 'Incorrect password.' : 'Could not unlock. Is the API running?')
    } finally {
      setBusy(false)
    }
  }

  const initial = (user?.email[0] ?? '?').toUpperCase()

  return (
    <div className="auth">
      <div className="auth-card">
        <form className="lock" onSubmit={(e) => void onSubmit(e)}>
          <span className="avatar lg">{initial}</span>
          <h2>Welcome back</h2>
          <p className="muted">{user?.email}</p>
          <label className="sr-only" htmlFor="lock-password">Password</label>
          <input id="lock-password" className="input" name="password" type="password" placeholder="Password" autoComplete="current-password" autoFocus required />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
          <div className="auth-links">
            <button type="button" className="link-btn" onClick={() => void logout().then(() => navigate('/forgot-password'))}>Forgot password?</button>
            <button type="button" className="link-btn" onClick={() => void logout().then(() => navigate('/login'))}><Icon name="logout" size={15} />Log out</button>
          </div>
        </form>
      </div>
      <p className="auth-foot">Your secrets lock automatically after inactivity and on reload. The key never leaves this browser.</p>
    </div>
  )
}
