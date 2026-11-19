import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../app/providers/AuthProvider'
import { Icon } from '../../components/Icon'
import { MIN_PASSWORD_LENGTH, createAccountMaterial, type NewAccountMaterial } from '../../security/account-crypto'
import { ApiError } from '../../services/api/client'
import { getProviders } from '../../services/api/auth'
import { RecoveryKeyStep } from './RecoveryKeyStep'

let providersCache: Promise<{ google: boolean }> | null = null

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * "Continue with Google" is a plain link to the server, which runs the OAuth flow. No Google script is loaded.
 * Hidden when the server has no Google client configured.
 */
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    providersCache ??= getProviders().catch(() => ({ google: false }))
    let cancelled = false
    void providersCache.then((p) => !cancelled && setEnabled(p.google))
    return () => {
      cancelled = true
    }
  }, [])
  if (!enabled) return null
  return (
    <>
      <a className="btn google block" href="/api/v1/auth/google/start">
        <GoogleLogo />
        Continue with Google
      </a>
      <div className="divider"><span>or</span></div>
    </>
  )
}

const MESSAGES: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  unverified: 'Your Google account email address is not verified, so it cannot be used to sign in.',
  error: 'Google sign-in failed or expired. Please try again.',
}

/** Where the server sends the browser back after Google. */
export function GoogleCallbackPage() {
  const [params] = useSearchParams()
  const status = params.get('status') ?? 'error'
  if (status === 'signed-in') return <AdoptGoogleSession />
  if (status === 'setup') return <GoogleAccountSetup />
  return (
    <div>
      <h2>Continue with Google</h2>
      <p className="error" role="alert">{MESSAGES[status] ?? MESSAGES.error}</p>
      <Link to="/login" className="btn primary block">Back to log in</Link>
    </div>
  )
}

function AdoptGoogleSession() {
  const { adoptSession } = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    adoptSession()
      .then(() => !cancelled && navigate('/secrets', { replace: true }))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [adoptSession, navigate])
  if (failed) {
    return (
      <div>
        <h2>Continue with Google</h2>
        <p className="error" role="alert">{MESSAGES.error}</p>
        <Link to="/login" className="btn primary block">Back to log in</Link>
      </div>
    )
  }
  return <p className="muted center-text">Signing you in…</p>
}

/** Reads the one-time ticket from the URL fragment once, then removes it from the address bar and history. */
function readTicket(): { ticket: string; email: string } | null {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const ticket = hash.get('ticket')
  if (!ticket) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return { ticket, email: hash.get('email') ?? '' }
}

function GoogleAccountSetup() {
  const { completeGoogleRegistration } = useAuth()
  const navigate = useNavigate()
  const [handoff] = useState(readTicket)
  const [pending, setPending] = useState<NewAccountMaterial | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!handoff) {
    return (
      <div>
        <h2>Finish signing up</h2>
        <p className="error" role="alert">This sign-up link is incomplete or was already used.</p>
        <Link to="/login" className="btn primary block">Back to log in</Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== String(f.get('confirm'))) return setError('Passwords do not match.')
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
      await completeGoogleRegistration(handoff!.ticket, pending)
      navigate('/secrets', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...err.details].join(' ') : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <RecoveryKeyStep
        recoveryKey={pending.vault.recoveryKey}
        email={handoff.email}
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
      <h2>Set your encryption password</h2>
      <p className="muted">
        Signed in with Google as <strong>{handoff.email}</strong>. Google can't unlock your secrets, so choose a password that encrypts them in
        this browser. You'll enter it after signing in.
      </p>
      <label>
        Encryption password
        <input name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" required autoFocus placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
      </label>
      <label>
        Confirm encryption password
        <input name="confirm" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Creating encryption keys…' : 'Continue'}</button>
      <p className="auth-links"><span className="muted small"><Icon name="lock" size={13} /> You can also log in with this email and password.</span></p>
    </form>
  )
}
