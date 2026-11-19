import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useMatch, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { CopyButton, EmptyState, ExpiryBadge, Menu } from '../../components/Controls'
import { Icon } from '../../components/Icon'
import { ItemIcon } from '../../components/ItemIcon'
import { useUnlocked } from '../../hooks/useVaultKeys'
import { keyManager } from '../../security/key-manager'
import {
  PAYLOAD_FIELDS,
  PAYLOAD_LABELS,
  SECRET_TYPES,
  samePayload,
  secretTypeLabel,
  type SecretPayload,
  type SecretType,
} from '../../security/secret-payload'
import { decryptPayload, encryptPayload, type EncryptedPayload } from '../../security/vault-crypto'
import { ApiError } from '../../services/api/client'
import {
  archiveSecret,
  createSecret,
  deleteSecret,
  fromWire,
  getSecret,
  getSecretVersions,
  listSecrets,
  restoreSecret,
  updateSecret,
  type SecretRecord,
  type SecretSummary,
  type SecretVersionRecord,
} from '../../services/api/secrets'
import { SecretForm, type SecretFormValues } from './SecretForm'

const REVEAL_MS = 20_000
const MASKED: (keyof SecretPayload)[] = ['token', 'password', 'notes']

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError ? [e.message, ...e.details].join(' ') : fallback

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—')
const formatDateTime = (iso: string) => new Date(iso).toLocaleString()

/** Keeps list filters in the URL so links, back/forward and the sidebar all agree. */
function useListSearch() {
  const [params] = useSearchParams()
  const qs = params.toString()
  return { params, suffix: qs ? `?${qs}` : '' }
}

/** Decrypts with the in-memory VEK. Callers must keep the result in component state only. */
async function decryptWith(vaultId: string, secretId: string, p: EncryptedPayload): Promise<SecretPayload> {
  const vek = keyManager.getVek(vaultId)
  if (!vek) throw new Error('locked')
  return decryptPayload<SecretPayload>(vek, vaultId, secretId, p)
}

/** Only http(s) links are clickable, so a stored "javascript:" URL can never run. */
function SafeLink({ url }: { url: string }) {
  let safe = false
  try {
    const u = new URL(url)
    safe = u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    /* not a URL */
  }
  return safe ? <a href={url} target="_blank" rel="noopener noreferrer">{url}</a> : <span>{url}</span>
}

// ================================================================ Workspace (list pane)

export function SecretsWorkspace() {
  const [params, setParams] = useSearchParams()
  const { tags, listVersion } = useWorkspace()
  const match = useMatch({ path: '/secrets/:id', end: false })
  const selectedId = match?.params.id
  const hasDetail = Boolean(match)

  const q = params.get('q') ?? ''
  const type = params.get('type') ?? ''
  const tagId = params.get('tag') ?? ''
  const archived = params.get('archived') === '1'
  const expiring = params.get('expiring')

  const [result, setResult] = useState<{ items: SecretSummary[]; total: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      listSecrets({
        search: q,
        secretType: type,
        tagId,
        archived,
        expiringWithinDays: expiring ? Number(expiring) : undefined,
        pageSize: 100,
      })
        .then((r) => {
          if (cancelled) return
          setResult({ items: r.items, total: r.totalCount })
          setError('')
        })
        .catch((e: unknown) => !cancelled && setError(errorText(e, 'Could not load items.')))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, type, tagId, archived, expiring, listVersion])

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const title = archived
    ? 'Archive'
    : expiring
      ? 'Expiring soon'
      : tagId
          ? `#${tags.find((t) => t.id === tagId)?.name ?? 'tag'}`
          : type
            ? SECRET_TYPES.find((t) => t.value === type)?.label ?? 'Items'
            : 'All Items'

  const qs = params.toString()
  const suffix = qs ? `?${qs}` : ''

  return (
    <div className={`workspace ${hasDetail ? 'has-detail' : ''}`}>
      <section className="list-pane" aria-label="Items">
        <div className="list-head">
          <div className="search">
            <Icon name="search" size={16} />
            <input type="search" placeholder={`Search ${title}`} value={q} onChange={(e) => setParam('q', e.target.value)} aria-label="Search items" />
          </div>
          <Link to={`/secrets/create${suffix}`} className="btn primary" title="New item">
            <Icon name="plus" size={16} /><span className="hide-sm">New Item</span>
          </Link>
        </div>
        <div className="list-sub">
          <div>
            <h1>{title}</h1>
            <span className="muted small">{result ? `${result.total} item${result.total === 1 ? '' : 's'}` : ' '}</span>
          </div>
          {!type && (
            <select className="select-sm" value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Category">
              <option value="">All Categories</option>
              {SECRET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
        </div>

        <div className="items">
          {error ? <p className="error pad" role="alert">{error}</p> : result === null ? (
            <div className="skeleton-list">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
          ) : result.items.length === 0 ? (
            <EmptyState icon={archived ? 'archive' : q ? 'search' : 'key'} title={q ? 'No matches' : archived ? 'Archive is empty' : 'No items yet'}>
              {!q && !archived && <Link to={`/secrets/create${suffix}`} className="btn primary"><Icon name="plus" size={16} />New Item</Link>}
            </EmptyState>
          ) : (
            result.items.map((s) => (
              <Link key={s.id} to={`/secrets/${s.id}${suffix}`} className={`item ${s.id === selectedId ? 'selected' : ''}`}>
                <ItemIcon name={s.name} provider={s.provider} type={s.secretType} />
                <span className="item-text">
                  <span className="item-name">{s.name}</span>
                  <span className="item-sub">{[s.provider, s.environment].filter(Boolean).join(' · ') || secretTypeLabel(s.secretType)}</span>
                </span>
                <ExpiryBadge expiresAt={s.expiresAt} />
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="detail-pane" aria-label="Item details">
        <Outlet />
      </section>
    </div>
  )
}

export function SecretsEmptyDetail() {
  const { suffix } = useListSearch()
  return (
    <EmptyState icon="vault" title="Select an item">
      <p className="muted">Choose an item from the list, or add a new one.</p>
      <Link to={`/secrets/create${suffix}`} className="btn primary"><Icon name="plus" size={16} />New Item</Link>
    </EmptyState>
  )
}

// ================================================================ Field rows

function FieldRow({ label, children, actions }: { label: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="field-row">
      <div className="field-main">
        <div className="field-label">{label}</div>
        <div className="field-value">{children}</div>
      </div>
      {actions && <div className="field-actions">{actions}</div>}
    </div>
  )
}

/** Decrypted payload, held only in this component. Secret fields stay masked until revealed and re-mask after 20s. */
function PayloadFields({ type, payload }: { type: string; payload: SecretPayload }) {
  const [revealed, setRevealed] = useState<Set<keyof SecretPayload>>(new Set())

  useEffect(() => {
    if (revealed.size === 0) return
    const t = setTimeout(() => setRevealed(new Set()), REVEAL_MS)
    return () => clearTimeout(t)
  }, [revealed])

  const toggle = (k: keyof SecretPayload) =>
    setRevealed((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const fields = (PAYLOAD_FIELDS[type as SecretType] ?? PAYLOAD_FIELDS.ApiKey).filter((k) => payload[k])
  if (fields.length === 0) return <p className="muted small pad">No secret values stored.</p>

  return (
    <>
      {fields.map((k) => {
        const value = payload[k]!
        const masked = MASKED.includes(k) && !revealed.has(k)
        return (
          <FieldRow
            key={k}
            label={PAYLOAD_LABELS[k].toLowerCase()}
            actions={
              <>
                {MASKED.includes(k) && (
                  <button type="button" className="icon-btn" onClick={() => toggle(k)} aria-label={masked ? `Reveal ${PAYLOAD_LABELS[k]}` : `Hide ${PAYLOAD_LABELS[k]}`} title={masked ? 'Reveal' : 'Hide'}>
                    <Icon name={masked ? 'eye' : 'eyeOff'} size={16} />
                  </button>
                )}
                {k !== 'notes' && <CopyButton getValue={() => value} label={PAYLOAD_LABELS[k]} />}
              </>
            }
          >
            {masked ? (
              <span className="dots">••••••••••••</span>
            ) : k === 'url' ? (
              <SafeLink url={value} />
            ) : (
              <span className={k === 'notes' ? 'pre' : k === 'token' || k === 'password' ? 'mono' : ''}>{value}</span>
            )}
          </FieldRow>
        )
      })}
    </>
  )
}

// ================================================================ Detail

/** Loads one item. Results are keyed by id so a slow response for a previous item can never be shown for the current one. */
function useSecret(id: string) {
  const [state, setState] = useState<{ id: string; secret: SecretRecord | null; error: string }>({ id, secret: null, error: '' })

  useEffect(() => {
    let cancelled = false
    getSecret(id)
      .then((secret) => !cancelled && setState({ id, secret, error: '' }))
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ id, secret: null, error: e instanceof ApiError && e.status === 404 ? 'This item no longer exists.' : errorText(e, 'Could not load the item.') })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const setSecret = useCallback((secret: SecretRecord) => setState({ id: secret.id, secret, error: '' }), [])
  const current = state.id === id
  return { secret: current ? state.secret : null, setSecret, error: current ? state.error : '' }
}

function VersionItem({ secret, version }: { secret: SecretRecord; version: SecretVersionRecord }) {
  const [payload, setPayload] = useState<SecretPayload | null>(null)
  const [error, setError] = useState('')
  const unlocked = useUnlocked(secret.vaultId)
  const visible = unlocked ? payload : null

  async function show() {
    try {
      setPayload(await decryptWith(secret.vaultId, secret.id, fromWire(version)))
    } catch {
      setError('Could not decrypt this version.')
    }
  }

  return (
    <div className="version">
      <div className="version-head">
        <Icon name="clock" size={15} />
        <span>Replaced {formatDateTime(version.createdAt)}</span>
        <span className="spacer" />
        {visible
          ? <button type="button" className="btn ghost sm" onClick={() => setPayload(null)}>Hide</button>
          : <button type="button" className="btn ghost sm" onClick={() => void show()} disabled={!unlocked}>Show</button>}
      </div>
      {error && <p className="error small">{error}</p>}
      {visible && <PayloadFields type={secret.secretType} payload={visible} />}
    </div>
  )
}

export function SecretDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { suffix } = useListSearch()
  const { bumpList } = useWorkspace()
  const { secret, setSecret, error } = useSecret(id)
  const unlocked = useUnlocked(secret?.vaultId)
  const [payload, setPayload] = useState<SecretPayload | null>(null)
  const [decryptError, setDecryptError] = useState('')
  const [versions, setVersions] = useState<SecretVersionRecord[] | null>(null)
  const [actionError, setActionError] = useState('')

  // Decrypt locally while the vault is unlocked; drop plaintext on lock, item change or unmount.
  useEffect(() => {
    if (!secret || !unlocked) return
    let cancelled = false
    decryptWith(secret.vaultId, secret.id, fromWire(secret))
      .then((p) => !cancelled && setPayload(p))
      .catch(() => !cancelled && setDecryptError('Could not decrypt this item. The data may have been modified.'))
    return () => {
      cancelled = true
      setPayload(null)
      setDecryptError('')
    }
  }, [secret, unlocked])

  // Reset version history when switching items.
  const [lastId, setLastId] = useState(id)
  if (lastId !== id) {
    setLastId(id)
    setVersions(null)
    setActionError('')
  }

  if (error) return <EmptyState icon="alert" title={error}><Link to={`/secrets${suffix}`} className="btn">Back to list</Link></EmptyState>
  if (!secret) return <div className="detail-body"><div className="skeleton tall" /></div>

  async function toggleArchive() {
    try {
      setSecret(await (secret!.isArchived ? restoreSecret(secret!.id) : archiveSecret(secret!.id)))
      bumpList()
    } catch (e) {
      setActionError(errorText(e, 'Action failed.'))
    }
  }

  async function remove() {
    if (!window.confirm(`Permanently delete "${secret!.name}" and all its versions? This cannot be undone.`)) return
    try {
      await deleteSecret(secret!.id)
      bumpList()
      navigate(`/secrets${suffix}`)
    } catch (e) {
      setActionError(errorText(e, 'Delete failed.'))
    }
  }

  async function loadVersions() {
    try {
      setVersions(await getSecretVersions(secret!.id))
    } catch (e) {
      setActionError(errorText(e, 'Could not load versions.'))
    }
  }

  return (
    <div className="detail">
      <div className="pane-toolbar">
        <Link to={`/secrets${suffix}`} className="icon-btn back-btn" aria-label="Back to list"><Icon name="chevronLeft" /></Link>
        <span className="pane-title hide-sm">{secretTypeLabel(secret.secretType)}</span>
        <span className="spacer" />
        <Link to={`/secrets/${secret.id}/edit${suffix}`} className="btn"><Icon name="pencil" size={15} />Edit</Link>
        <Menu
          items={[
            secret.isArchived
              ? { label: 'Restore', icon: 'restore', onSelect: () => void toggleArchive() }
              : { label: 'Archive', icon: 'archive', onSelect: () => void toggleArchive() },
            { label: 'Delete permanently', icon: 'trash', danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>

      <div className="detail-body">
        <div className="detail-head">
          <ItemIcon name={secret.name} provider={secret.provider} type={secret.secretType} size={56} />
          <div>
            <h2>{secret.name}</h2>
            <div className="muted">
              {secretTypeLabel(secret.secretType)}
              {secret.isArchived && <span className="pill">Archived</span>}
            </div>
          </div>
        </div>

        {actionError && <p className="error" role="alert">{actionError}</p>}

        <section className="card fields">
          {decryptError ? <p className="error pad">{decryptError}</p> : payload ? (
            <PayloadFields type={secret.secretType} payload={payload} />
          ) : <div className="skeleton" />}
        </section>

        <section className="card fields">
          {secret.provider && <FieldRow label="provider">{secret.provider}</FieldRow>}
          {secret.environment && <FieldRow label="environment">{secret.environment}</FieldRow>}
          {secret.description && <FieldRow label="description"><span className="pre">{secret.description}</span></FieldRow>}
          <FieldRow label="expires">{formatDate(secret.expiresAt)} <ExpiryBadge expiresAt={secret.expiresAt} /></FieldRow>
          {secret.tags.length > 0 && (
            <FieldRow label="tags">
              <span className="chips">
                {secret.tags.map((t) => <Link key={t.id} to={`/secrets?tag=${t.id}`} className="chip tag">{t.name}</Link>)}
              </span>
            </FieldRow>
          )}
        </section>

        {unlocked && (
          <section className="history">
            {versions === null ? (
              <button type="button" className="link-btn" onClick={() => void loadVersions()}><Icon name="clock" size={15} />Show version history</button>
            ) : (
              <>
                <h3>Version history</h3>
                {versions.length === 0
                  ? <p className="muted small">No previous versions. One is kept each time the secret values change.</p>
                  : versions.map((v) => <VersionItem key={v.id} secret={secret} version={v} />)}
              </>
            )}
          </section>
        )}

        <div className="meta-foot">
          {secret.modifiedAt && <span>modified {formatDateTime(secret.modifiedAt)}</span>}
          <span>created {formatDateTime(secret.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

// ================================================================ Create

export function SecretCreatePage() {
  const navigate = useNavigate()
  const { suffix } = useListSearch()
  const { vault, bumpList } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit({ meta, payload }: SecretFormValues) {
    const vaultId = vault?.id
    const vek = vaultId ? keyManager.getVek(vaultId) : undefined
    if (!vaultId || !vek) return setError('Your session locked. Unlock and try again.')
    setBusy(true)
    setError('')
    try {
      const id = crypto.randomUUID() // bound into the payload AAD, so generated here
      await createSecret(id, vaultId, meta, await encryptPayload(vek, vaultId, id, payload))
      bumpList()
      navigate(`/secrets/${id}${suffix}`)
    } catch (e) {
      setError(errorText(e, 'Could not save the item.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SecretForm
      title="New Item"
      submitLabel="Save"
      busy={busy}
      error={error}
      cancelTo={`/secrets${suffix}`}
      onSubmit={(v) => void onSubmit(v)}
    />
  )
}

// ================================================================ Edit

export function SecretEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { suffix } = useListSearch()
  const { bumpList } = useWorkspace()
  const { secret, error } = useSecret(id)
  const unlocked = useUnlocked(secret?.vaultId)
  const [initialPayload, setInitialPayload] = useState<SecretPayload | null>(null)
  const [decryptError, setDecryptError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!secret || !unlocked) return
    let cancelled = false
    decryptWith(secret.vaultId, secret.id, fromWire(secret))
      .then((p) => !cancelled && setInitialPayload(p))
      .catch(() => !cancelled && setDecryptError('Could not decrypt this item. The data may have been modified.'))
    return () => {
      cancelled = true
      setInitialPayload(null)
    }
  }, [secret, unlocked])

  if (error) return <EmptyState icon="alert" title={error} />
  if (!secret) return <div className="detail-body"><div className="skeleton tall" /></div>
  const back = `/secrets/${secret.id}${suffix}`

  if (decryptError) return <EmptyState icon="alert" title={decryptError} />
  if (!initialPayload) return <div className="detail-body"><div className="skeleton tall" /></div>

  async function onSubmit({ meta, payload }: SecretFormValues) {
    setBusy(true)
    setSaveError('')
    try {
      let encrypted: EncryptedPayload | undefined
      if (!samePayload(payload, initialPayload!)) {
        const vek = keyManager.getVek(secret!.vaultId)
        if (!vek) throw new Error('locked')
        encrypted = await encryptPayload(vek, secret!.vaultId, secret!.id, payload)
      }
      await updateSecret(secret!.id, meta, encrypted)
      bumpList()
      navigate(back)
    } catch (e) {
      setSaveError(errorText(e, 'Could not save the item.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SecretForm
      title={`Edit ${secret.name}`}
      initialMeta={{
        name: secret.name,
        description: secret.description,
        secretType: secret.secretType,
        provider: secret.provider,
        environment: secret.environment,
        expiresAt: secret.expiresAt,
        tagIds: secret.tags.map((t) => t.id),
      }}
      initialPayload={initialPayload}
      submitLabel="Save"
      busy={busy}
      error={saveError}
      cancelTo={back}
      onSubmit={(v) => void onSubmit(v)}
    />
  )
}
