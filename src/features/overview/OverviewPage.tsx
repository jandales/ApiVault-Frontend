import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ExpiryBadge } from '../../components/Controls'
import { Icon } from '../../components/Icon'
import { ItemIcon } from '../../components/ItemIcon'
import { listSecrets, type SecretSummary } from '../../services/api/secrets'

interface Stats {
  total: number
  apiKeys: number
  passwords: number
  expiring: SecretSummary[]
  expiringTotal: number
  recent: SecretSummary[]
}

/** Counts come from metadata only; nothing is decrypted for the overview. */
function useStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      listSecrets({ pageSize: 6 }),
      listSecrets({ secretType: 'ApiKey', pageSize: 1 }),
      listSecrets({ secretType: 'Password', pageSize: 1 }),
      listSecrets({ expiringWithinDays: 30, pageSize: 6 }),
    ])
      .then(([recent, keys, passwords, expiring]) => {
        if (cancelled) return
        setStats({
          total: recent.totalCount,
          apiKeys: keys.totalCount,
          passwords: passwords.totalCount,
          expiring: expiring.items,
          expiringTotal: expiring.totalCount,
          recent: recent.items,
        })
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [])
  return { stats, error }
}

function MiniList({ items, empty }: { items: SecretSummary[]; empty: string }) {
  if (items.length === 0) return <p className="muted small pad">{empty}</p>
  return (
    <div className="mini-list">
      {items.map((s) => (
        <Link key={s.id} to={`/secrets/${s.id}`} className="item">
          <ItemIcon name={s.name} provider={s.provider} type={s.secretType} size={32} />
          <span className="item-text">
            <span className="item-name">{s.name}</span>
            <span className="item-sub">{[s.provider, s.environment].filter(Boolean).join(' · ') || new Date(s.createdAt).toLocaleDateString()}</span>
          </span>
          <ExpiryBadge expiresAt={s.expiresAt} />
        </Link>
      ))}
    </div>
  )
}

export function OverviewPage() {
  const { stats, error } = useStats()

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Counts and dates come from metadata. Nothing is decrypted here.</p>
        </div>
        <Link to="/secrets/create" className="btn primary"><Icon name="plus" size={16} />New Item</Link>
      </div>
      {error ? <p className="error" role="alert">Could not load your items. Is the API running?</p> : stats?.total === 0 ? (
        <EmptyState icon="key" title="Welcome to API Vault">
          <p className="muted">Store your first API key, password or secure note. It's encrypted in this browser before it's saved.</p>
          <Link to="/secrets/create" className="btn primary"><Icon name="plus" size={16} />Add your first item</Link>
        </EmptyState>
      ) : (
        <>
          <div className="stats">
            <Link to="/secrets" className="stat"><span className="stat-icon blue"><Icon name="grid" /></span><strong>{stats?.total ?? '–'}</strong><span>Items</span></Link>
            <Link to="/secrets?type=ApiKey" className="stat"><span className="stat-icon violet"><Icon name="key" /></span><strong>{stats?.apiKeys ?? '–'}</strong><span>API keys</span></Link>
            <Link to="/secrets?type=Password" className="stat"><span className="stat-icon green"><Icon name="asterisk" /></span><strong>{stats?.passwords ?? '–'}</strong><span>Passwords</span></Link>
            <Link to="/secrets?expiring=30" className="stat"><span className="stat-icon amber"><Icon name="alert" /></span><strong>{stats?.expiringTotal ?? '–'}</strong><span>Expiring in 30 days</span></Link>
          </div>
          <div className="overview-grid">
            <section className="card">
              <div className="card-title"><Icon name="alert" size={14} />Expiring soon</div>
              {stats ? <MiniList items={stats.expiring} empty="Nothing expires in the next 30 days." /> : <div className="skeleton" />}
            </section>
            <section className="card">
              <div className="card-title"><Icon name="clock" size={14} />Recently created</div>
              {stats ? <MiniList items={stats.recent} empty="No items yet." /> : <div className="skeleton" />}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
