import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { Icon } from '../../components/Icon'
import { ItemIcon } from '../../components/ItemIcon'
import { typeIcon } from '../../components/icon-utils'
import {
  PAYLOAD_FIELDS,
  PAYLOAD_LABELS,
  SECRET_TYPES,
  cleanPayload,
  type SecretPayload,
  type SecretType,
} from '../../security/secret-payload'
import type { SecretMetadata } from '../../services/api/secrets'

export interface SecretFormValues {
  meta: SecretMetadata
  payload: SecretPayload
}

interface Props {
  title: string
  initialMeta?: SecretMetadata
  initialPayload?: SecretPayload
  submitLabel: string
  busy: boolean
  error: string
  cancelTo: string
  /** Rendered under the name, e.g. the vault picker on create. */
  header?: ReactNode
  onSubmit(values: SecretFormValues): void
}

const EMPTY_META: SecretMetadata = {
  name: '',
  description: null,
  secretType: 'ApiKey',
  provider: null,
  environment: null,
  expiresAt: null,
  tagIds: [],
}

const MASKED: (keyof SecretPayload)[] = ['token', 'password']

/** yyyy-mm-dd from an ISO date, for <input type="date">. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
/** End of the chosen day in UTC, so a credential "expires on" the date picked. */
const fromDateInput = (d: string) => (d ? `${d}T23:59:59Z` : null)

const PLACEHOLDERS: Partial<Record<keyof SecretPayload, string>> = {
  token: 'sk_live_…',
  username: 'name@example.com',
  url: 'https://',
}

export function SecretForm({ title, initialMeta, initialPayload, submitLabel, busy, error, cancelTo, header, onSubmit }: Props) {
  const { tags } = useWorkspace()
  const [meta, setMeta] = useState<SecretMetadata>(initialMeta ?? EMPTY_META)
  const [payload, setPayload] = useState<SecretPayload>(initialPayload ?? {})
  const [shown, setShown] = useState<Set<keyof SecretPayload>>(new Set())

  const type = meta.secretType as SecretType
  const setM = <K extends keyof SecretMetadata>(k: K, v: SecretMetadata[K]) => setMeta((m) => ({ ...m, [k]: v }))
  const setP = (k: keyof SecretPayload, v: string) => setPayload((p) => ({ ...p, [k]: v }))
  const toggleShown = (k: keyof SecretPayload) =>
    setShown((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const toggleTag = (id: string) =>
    setM('tagIds', meta.tagIds.includes(id) ? meta.tagIds.filter((t) => t !== id) : [...meta.tagIds, id])

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      meta: {
        ...meta,
        name: meta.name.trim(),
        description: meta.description?.trim() || null,
        provider: meta.provider?.trim() || null,
        environment: meta.environment?.trim() || null,
      },
      payload: cleanPayload(payload, type),
    })
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="pane-toolbar">
        <Link to={cancelTo} className="icon-btn back-btn" aria-label="Back"><Icon name="chevronLeft" /></Link>
        <span className="pane-title">{title}</span>
        <span className="spacer" />
        <Link to={cancelTo} className="btn ghost">Cancel</Link>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>

      <div className="detail-body">
        <div className="editor-head">
          <ItemIcon name={meta.name || '?'} provider={meta.provider} type={type} size={56} />
          <input
            className="title-input"
            placeholder="Item name"
            aria-label="Name"
            value={meta.name}
            onChange={(e) => setM('name', e.target.value)}
            maxLength={200}
            required
            autoFocus={!initialMeta}
          />
        </div>

        {header}

        <div className="segmented" role="radiogroup" aria-label="Type">
          {SECRET_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              className={type === t.value ? 'on' : ''}
              onClick={() => setM('secretType', t.value)}
            >
              <Icon name={typeIcon(t.value)} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <section className="card">
          <div className="card-title"><Icon name="lock" size={14} />Encrypted in your browser</div>
          {PAYLOAD_FIELDS[type].map((k) => (
            <div className="form-field" key={k}>
              <span className="field-label">{PAYLOAD_LABELS[k].toLowerCase()}</span>
              {k === 'notes' ? (
                <textarea className="input" rows={4} aria-label={PAYLOAD_LABELS[k]} value={payload[k] ?? ''} onChange={(e) => setP(k, e.target.value)} />
              ) : (
                <div className="input-wrap">
                  <input
                    className={`input ${MASKED.includes(k) ? 'mono' : ''}`}
                    aria-label={PAYLOAD_LABELS[k]}
                    type={MASKED.includes(k) && !shown.has(k) ? 'password' : 'text'}
                    value={payload[k] ?? ''}
                    onChange={(e) => setP(k, e.target.value)}
                    placeholder={PLACEHOLDERS[k]}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {MASKED.includes(k) && (
                    <button type="button" className="icon-btn" onClick={() => toggleShown(k)} aria-label={shown.has(k) ? 'Hide' : 'Show'}>
                      <Icon name={shown.has(k) ? 'eyeOff' : 'eye'} size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-title"><Icon name="eye" size={14} />Details · visible to the server</div>
          <div className="grid2">
            <div className="form-field">
              <span className="field-label">provider</span>
              <input className="input" aria-label="Provider" value={meta.provider ?? ''} onChange={(e) => setM('provider', e.target.value)} maxLength={150} placeholder="Stripe, GitHub, AWS…" />
            </div>
            <div className="form-field">
              <span className="field-label">environment</span>
              <input className="input" aria-label="Environment" value={meta.environment ?? ''} onChange={(e) => setM('environment', e.target.value)} maxLength={30} list="env-options" placeholder="Production" />
              <datalist id="env-options">
                <option value="Production" /><option value="Staging" /><option value="Development" /><option value="Test" />
              </datalist>
            </div>
          </div>
          <div className="form-field">
            <span className="field-label">description</span>
            <input className="input" aria-label="Description" value={meta.description ?? ''} onChange={(e) => setM('description', e.target.value)} maxLength={500} />
          </div>
          <div className="form-field">
            <span className="field-label">expires</span>
            <input className="input narrow-input" aria-label="Expiration date" type="date" value={toDateInput(meta.expiresAt)} onChange={(e) => setM('expiresAt', fromDateInput(e.target.value))} />
          </div>
        </section>

        <section className="card">
          <div className="card-title"><Icon name="tag" size={14} />Tags</div>
          {tags.length === 0 ? (
            <p className="muted small">No tags yet. <Link to="/tags">Create tags</Link> to organise items.</p>
          ) : (
            <div className="chips">
              {tags.map((t) => {
                const on = meta.tagIds.includes(t.id)
                return (
                  <button key={t.id} type="button" className={`chip toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleTag(t.id)}>
                    {on && <Icon name="check" size={13} />}{t.name}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </form>
  )
}
