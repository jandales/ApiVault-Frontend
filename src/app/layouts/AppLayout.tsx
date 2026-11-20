import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AurexMark, Brand } from '../../components/Brand'
import { BRAND } from '../../components/brand-copy'
import { EmptyState, Menu } from '../../components/Controls'
import { Icon, type IconName } from '../../components/Icon'
import { LockScreen } from '../../features/auth/LockScreen'
import { useUnlocked } from '../../hooks/useVaultKeys'
import { keyManager } from '../../security/key-manager'
import { post } from '../../services/api/client'
import { useAuth } from '../providers/AuthProvider'
import { WorkspaceProvider, useWorkspace } from '../providers/WorkspaceProvider'

const Splash = () => <div className="splash"><AurexMark size={44} /></div>

export function AppLayout() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  return (
    <WorkspaceProvider>
      <UnlockGate />
    </WorkspaceProvider>
  )
}

/** Signed in but the encryption key isn't in memory (reload or auto-lock) → password screen, not the app. */
function UnlockGate() {
  const { vault, vaultError } = useWorkspace()
  const unlocked = useUnlocked(vault?.id)
  const { logout } = useAuth()
  if (vaultError) {
    return (
      <div className="auth">
        <div className="auth-card">
          <EmptyState icon="alert" title="Can't load your account">
            <p className="muted">{vaultError}</p>
            <button type="button" className="btn" onClick={() => void logout()}>Log out</button>
          </EmptyState>
        </div>
      </div>
    )
  }
  if (vault === undefined) return <Splash />
  if (!unlocked) return <LockScreen />
  return <Shell />
}

/** Identifies which sidebar entry matches the current URL. */
function activeKey(pathname: string, search: string): string {
  if (pathname.startsWith('/dashboard')) return 'overview'
  if (pathname.startsWith('/tags')) return 'tags'
  if (!pathname.startsWith('/secrets')) return ''
  const p = new URLSearchParams(search)
  if (p.get('archived')) return 'archived'
  if (p.get('expiring')) return 'expiring'
  if (p.get('tag')) return `tag:${p.get('tag')}`
  if (p.get('type')) return `type:${p.get('type')}`
  return 'all'
}

function NavItem({ to, icon, label, active }: { to: string; icon: IconName; label: string; active: boolean }) {
  return (
    <Link to={to} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={17} />
      <span className="nav-label">{label}</span>
    </Link>
  )
}

function Shell() {
  const { user, logout } = useAuth()
  const { tags } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const key = activeKey(location.pathname, location.search)

  // Close the mobile drawer whenever the route changes.
  const [lastKey, setLastKey] = useState(location.key)
  if (lastKey !== location.key) {
    setLastKey(location.key)
    if (open) setOpen(false)
  }

  useEffect(() => {
    document.body.classList.toggle('drawer-open', open)
  }, [open])

  const initial = (user?.email[0] ?? '?').toUpperCase()

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation">
        <div className="sidebar-brand"><Brand size={26} /></div>
        <Menu
          label="Account"
          trigger={
            <span className="account">
              <span className="avatar">{initial}</span>
              <span className="account-text">
                <strong>My account</strong>
                <span>{user?.email}</span>
              </span>
              <Icon name="chevronDown" size={16} />
            </span>
          }
          items={[
            { label: 'Lock now', icon: 'lock', onSelect: () => keyManager.lockAll() },
            { label: 'Log out', icon: 'logout', onSelect: () => void logout().then(() => navigate('/login')) },
          ]}
        />

        <nav className="nav-group">
          <NavItem to="/secrets" icon="grid" label="All Items" active={key === 'all'} />
          <NavItem to="/dashboard" icon="shield" label="Overview" active={key === 'overview'} />
          <NavItem to="/secrets?expiring=30" icon="alert" label="Expiring soon" active={key === 'expiring'} />
        </nav>

        <div className="nav-heading">Categories</div>
        <nav className="nav-group">
          <NavItem to="/secrets?type=ApiKey" icon="key" label="API Keys" active={key === 'type:ApiKey'} />
          <NavItem to="/secrets?type=Password" icon="asterisk" label="Passwords" active={key === 'type:Password'} />
          <NavItem to="/secrets?type=SecureNote" icon="note" label="Secure Notes" active={key === 'type:SecureNote'} />
        </nav>

        <div className="nav-heading">
          <Link to="/tags" className="nav-heading-link">Tags</Link>
          <Link to="/tags" className="icon-btn small" title="Manage tags" aria-label="Manage tags"><Icon name="pencil" size={14} /></Link>
        </div>
        <nav className="nav-group">
          {tags.map((t) => (
            <NavItem key={t.id} to={`/secrets?tag=${t.id}`} icon="tag" label={t.name} active={key === `tag:${t.id}`} />
          ))}
          {tags.length === 0 && <Link to="/tags" className="nav-hint">Add a tag</Link>}
        </nav>

        <nav className="nav-group nav-bottom">
          <NavItem to="/secrets?archived=1" icon="archive" label="Archive" active={key === 'archived'} />
          <button type="button" className="nav-item as-button" onClick={() => keyManager.lockAll()}>
            <Icon name="lock" size={17} />
            <span className="nav-label">Lock</span>
          </button>
        </nav>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="mobile-bar">
          <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <span className="brand-sm"><Brand size={24} /></span>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={() => keyManager.lockAll()} aria-label="Lock"><Icon name="lock" /></button>
        </header>
        {user && !user.emailConfirmed && <VerifyEmailBanner email={user.email} />}
        <Outlet />
      </div>
    </div>
  )
}

/** Reminds unverified users to confirm their email, with a rate-limited resend. */
function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'hidden'>('idle')
  if (state === 'hidden') return null

  async function resend() {
    setState('sending')
    try {
      await post('/auth/resend-verification')
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="banner" role="status">
      <Icon name="alert" size={16} />
      <span className="banner-text">
        {state === 'sent'
          ? <>We sent a new verification link to <strong>{email}</strong>.</>
          : state === 'error'
            ? 'Could not send the email. Try again in a minute.'
            : <>Please verify your email address. Check <strong>{email}</strong> for the link.</>}
      </span>
      {state !== 'sent' && (
        <button type="button" className="btn sm" onClick={() => void resend()} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
      <button type="button" className="icon-btn small" aria-label="Dismiss" onClick={() => setState('hidden')}><Icon name="x" size={14} /></button>
    </div>
  )
}

function AuthBrandHeader() {
  return (
    <div className="brand">
      <Brand size={40} />
      <span className="brand-category">{BRAND.category}</span>
      <span className="brand-tagline">{BRAND.tagline}</span>
    </div>
  )
}

function AuthFooter() {
  return (
    <div className="auth-foot">
      <p className="auth-promise">{BRAND.promise}</p>
      <p>Zero-knowledge: credentials are encrypted in your browser before they are stored.</p>
    </div>
  )
}

/** Auth-style card that works whether or not someone is signed in (e.g. the email verification link). */
export function OpenAuthLayout() {
  const { loading } = useAuth()
  if (loading) return <Splash />
  return (
    <div className="auth">
      <div className="auth-card">
        <AuthBrandHeader />
        <Outlet />
      </div>
    </div>
  )
}

export function PublicLayout() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (user) return <Navigate to="/secrets" replace />
  return (
    <div className="auth">
      <div className="auth-card">
        <AuthBrandHeader />
        <Outlet />
      </div>
      <AuthFooter />
    </div>
  )
}
