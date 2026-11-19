import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Copies a value produced on demand (e.g. decrypted at click time) and shows a brief check mark. */
export function CopyButton({ getValue, label }: { getValue: () => string | undefined | Promise<string | undefined>; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1500)
    return () => clearTimeout(t)
  }, [state])

  async function copy() {
    try {
      const v = await getValue()
      if (!v) return
      await navigator.clipboard.writeText(v)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <button type="button" className={`icon-btn ${state === 'done' ? 'ok' : ''}`} onClick={() => void copy()} title={`Copy ${label}`} aria-label={`Copy ${label}`}>
      <Icon name={state === 'done' ? 'check' : state === 'error' ? 'x' : 'copy'} size={16} />
    </button>
  )
}

export interface MenuItem {
  label: string
  icon: IconName
  onSelect(): void
  danger?: boolean
}

/** Small dropdown menu that closes on outside click or Escape. */
export function Menu({ items, label = 'More actions', trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button type="button" className={trigger ? 'menu-trigger' : 'icon-btn'} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger ?? <Icon name="more" />}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
            >
              <Icon name={it.icon} size={16} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const [now] = useState(() => Date.now())
  if (!expiresAt) return null
  const days = (new Date(expiresAt).getTime() - now) / 86_400_000
  if (days < 0) return <span className="pill danger">Expired</span>
  if (days <= 30) return <span className="pill warn">{Math.ceil(days)}d left</span>
  return null
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {children}
    </div>
  )
}
