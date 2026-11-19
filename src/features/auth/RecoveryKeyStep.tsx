import { useState } from 'react'
import { CopyButton } from '../../components/Controls'
import { Icon } from '../../components/Icon'

/** Shows a new recovery key once and requires the user to confirm they saved it before continuing. */
export function RecoveryKeyStep({
  recoveryKey,
  email,
  busy,
  error,
  confirmLabel,
  onConfirm,
  onBack,
}: {
  recoveryKey: string
  email: string
  busy: boolean
  error: string
  confirmLabel: string
  onConfirm(): void
  onBack(): void
}) {
  const [saved, setSaved] = useState(false)

  function download() {
    const text =
      `API Vault recovery key\nAccount: ${email}\n\n${recoveryKey}\n\n` +
      'If you forget your password, this key is the only way to keep your secrets.\nStore it somewhere safe and offline. Anyone with this key and access to your email can reset your password.\n'
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'api-vault-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack">
      <span className="unlock-icon warn center-self"><Icon name="shield" size={26} /></span>
      <h2 className="center-text">Save your recovery key</h2>
      <p className="muted center-text">
        If you forget your password, this key is the <strong>only</strong> way to keep your secrets. We can't see it or recover it, and it is
        shown only once.
      </p>
      <div className="recovery">
        <code data-testid="recovery-key">{recoveryKey}</code>
        <CopyButton getValue={() => recoveryKey} label="recovery key" />
      </div>
      <button type="button" className="btn ghost block" onClick={download}><Icon name="download" size={16} />Download as text file</button>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved my recovery key somewhere safe
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn primary block" disabled={!saved || busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button>
      <button type="button" className="link-btn center-self" onClick={onBack} disabled={busy}>Back</button>
    </div>
  )
}
