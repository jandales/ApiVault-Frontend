import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../app/providers/AuthProvider'
import { Icon } from '../../components/Icon'
import { MIN_PASSWORD_LENGTH, createAccountMaterial, rekeyWithRecoveryKey, type NewAccountMaterial } from '../../security/account-crypto'
import { VaultUnlockError } from '../../security/vault-crypto'
import { ApiError, post } from '../../services/api/client'
import { getRecoveryMaterial, resetPasswordErasingSecrets, resetPasswordKeepingSecrets } from '../../services/api/auth'
import { GoogleButton } from './GoogleSignIn'
import { RecoveryKeyStep } from './RecoveryKeyStep'

function errorText(e: unknown): string {
  if (e instanceof ApiError) return [e.message, ...e.details].join(' ')
  if (e instanceof VaultUnlockError) return e.message
  return 'Something went wrong.'
}

/** Shared new-password fields with confirmation and a minimum length. */
function NewPasswordFields({ label = 'Password' }: { label?: string }) {
  return (
    <>
      <label>
        {label}
        <input name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" required placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
      </label>
      <label>
        Confirm {label.toLowerCase()}
        <input name="confirm" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" required />
      </label>
    </>
  )
}

function readNewPassword(f: FormData): string | { error: string } {
  const password = String(f.get('password'))
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  if (password !== String(f.get('confirm'))) return { error: 'Passwords do not match.' }
  return password
}

// ---------------------------------------------------------------- Login

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      await login(String(f.get('email')).trim(), String(f.get('password')))
      navigate('/secrets')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Incorrect email or password.' : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <h2>Log in</h2>
      <p className="muted">One password opens your account and decrypts your secrets, in this browser only.</p>
      <GoogleButton />
      <label>Email<input name="email" type="email" autoComplete="username" required autoFocus /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Unlocking…' : 'Log in'}</button>
      <p className="auth-links"><Link to="/register">Create account</Link><Link to="/forgot-password">Forgot password?</Link></p>
    </form>
  )
}

// ---------------------------------------------------------------- Register

export function RegisterPage() {
  const { completeRegistration } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ email: string; material: NewAccountMaterial } | null>(null)
  const [verify, setVerify] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = readNewPassword(f)
    if (typeof password !== 'string') return setError(password.error)
    setError('')
    setBusy(true)
    try {
      // Argon2id + key generation run entirely in this browser.
      setPending({ email: String(f.get('email')).trim(), material: await createAccountMaterial(password) })
    } catch {
      setError('Could not generate encryption keys.')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const result = await completeRegistration(pending.email, pending.material)
      if (result === 'verify-email') setVerify(true)
      else navigate('/secrets')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (verify) {
    return (
      <div>
        <h2>Check your email</h2>
        <p>We sent a verification link to <strong>{pending?.email}</strong>. After verifying, you can <Link to="/login">log in</Link>.</p>
      </div>
    )
  }

  if (pending) {
    return (
      <RecoveryKeyStep
        recoveryKey={pending.material.vault.recoveryKey}
        email={pending.email}
        busy={busy}
        error={error}
        confirmLabel="Create account"
        onConfirm={() => void onConfirm()}
        onBack={() => setPending(null)}
      />
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <h2>Create account</h2>
      <p className="muted">Your password encrypts your secrets. It never leaves this browser, so choose one you will remember.</p>
      <GoogleButton />
      <label>Email<input name="email" type="email" autoComplete="username" required autoFocus /></label>
      <NewPasswordFields />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Creating encryption keys…' : 'Continue'}</button>
      <p className="auth-links"><Link to="/login">Already have an account? Log in</Link></p>
    </form>
  )
}

// ---------------------------------------------------------------- Verify email

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { user, refreshUser } = useAuth()
  const email = params.get('email')
  const token = params.get('token')
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')

  // Confirmation needs a click (a POST), so link scanners that pre-open emails cannot consume it.
  async function verify() {
    setState('busy')
    try {
      await post('/auth/verify-email', { email, token })
      if (user) await refreshUser()
      setState('ok')
    } catch {
      setState('error')
    }
  }

  if (!email || !token) {
    return (
      <div>
        <h2>Verify email</h2>
        <p className="error">This verification link is incomplete. Open the full link from the email, or request a new one after logging in.</p>
      </div>
    )
  }

  return (
    <div>
      <h2>Verify email</h2>
      {state === 'ok' ? (
        <>
          <p className="notice">Your email address <strong>{email}</strong> is verified.</p>
          <Link to={user ? '/secrets' : '/login'} className="btn primary block">{user ? 'Continue to API Vault' : 'Log in'}</Link>
        </>
      ) : (
        <>
          <p className="muted">Confirm that <strong>{email}</strong> belongs to you.</p>
          {state === 'error' && <p className="error" role="alert">This verification link is invalid or has expired. Log in and use “Resend email” to get a new one.</p>}
          <button className="btn primary block" onClick={() => void verify()} disabled={state === 'busy'}>{state === 'busy' ? 'Verifying…' : 'Confirm my email address'}</button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Forgot / reset password

function RequestResetForm() {
  const [sent, setSent] = useState(false)
  async function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await post('/auth/forgot-password', { email: String(new FormData(e.currentTarget).get('email')).trim() })
    setSent(true)
  }
  if (sent) return <p className="notice">If that account exists, we've sent a reset link. <Link to="/login">Back to log in</Link></p>
  return (
    <form onSubmit={(e) => void onRequest(e)}>
      <label>Email<input name="email" type="email" required autoFocus /></label>
      <button className="btn primary block">Send reset link</button>
      <p className="auth-links"><Link to="/login">Back to log in</Link></p>
    </form>
  )
}

function ResetWithRecoveryKey({ email, token, onDone }: { email: string; token: string; onDone(): void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = readNewPassword(f)
    if (typeof password !== 'string') return setError(password.error)
    setBusy(true)
    setError('')
    try {
      const material = await getRecoveryMaterial(email, token)
      if (!material.recoveryWrapper) throw new VaultUnlockError('This account has no recovery key set up.')
      const rekey = await rekeyWithRecoveryKey(password, material.vaultId, material.recoveryWrapper, String(f.get('recovery')))
      await resetPasswordKeepingSecrets(email, token, rekey)
      onDone()
    } catch (err) {
      setError(err instanceof VaultUnlockError && err.message === 'Incorrect password.' ? 'That recovery key is not correct.' : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label>
        Recovery key
        <input name="recovery" type="text" autoComplete="off" spellCheck={false} required placeholder="XXXX-XXXX-XXXX-…" className="mono-input" />
      </label>
      <NewPasswordFields label="New password" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Re-encrypting…' : 'Reset password and keep my secrets'}</button>
    </form>
  )
}

function ResetErasingSecrets({ email, token, onDone }: { email: string; token: string; onDone(): void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [pending, setPending] = useState<NewAccountMaterial | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = readNewPassword(new FormData(e.currentTarget))
    if (typeof password !== 'string') return setError(password.error)
    setBusy(true)
    setError('')
    try {
      setPending(await createAccountMaterial(password))
    } catch {
      setError('Could not generate encryption keys.')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await resetPasswordErasingSecrets(email, token, pending)
      onDone()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <RecoveryKeyStep
        recoveryKey={pending.vault.recoveryKey}
        email={email}
        busy={busy}
        error={error}
        confirmLabel="Erase secrets and reset password"
        onConfirm={() => void onConfirm()}
        onBack={() => setPending(null)}
      />
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <div className="danger-box">
        <Icon name="alert" size={18} />
        <span>Without your recovery key, your stored secrets can't be decrypted by anyone. Resetting <strong>permanently erases them</strong> and gives you an empty account.</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        I understand all my secrets will be erased
      </label>
      <NewPasswordFields label="New password" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn danger-solid block" disabled={!understood || busy}>{busy ? 'Creating encryption keys…' : 'Continue'}</button>
    </form>
  )
}

export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const email = params.get('email') ?? ''
  const [mode, setMode] = useState<'recovery' | 'erase'>('recovery')
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div>
        <h2>Password changed</h2>
        <p className="notice">You can now log in with your new password. Other sessions were signed out.</p>
        <Link to="/login" className="btn primary block">Log in</Link>
      </div>
    )
  }

  return (
    <div>
      <h2>Reset password</h2>
      {!token ? (
        <>
          <p className="muted">We'll email you a reset link. To keep your secrets you'll also need your recovery key.</p>
          <RequestResetForm />
        </>
      ) : (
        <>
          <p className="muted">Resetting the password for <strong>{email}</strong>.</p>
          <div className="segmented full" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'recovery'} className={mode === 'recovery' ? 'on' : ''} onClick={() => setMode('recovery')}>
              <Icon name="key" size={15} />Use recovery key
            </button>
            <button type="button" role="tab" aria-selected={mode === 'erase'} className={mode === 'erase' ? 'on' : ''} onClick={() => setMode('erase')}>
              <Icon name="alert" size={15} />Lost it
            </button>
          </div>
          {mode === 'recovery'
            ? <ResetWithRecoveryKey email={email} token={token} onDone={() => setDone(true)} />
            : <ResetErasingSecrets email={email} token={token} onDone={() => setDone(true)} />}
        </>
      )}
    </div>
  )
}
