import { describe, expect, it } from 'vitest'
import { MASKED_FIELDS, PAYLOAD_FIELDS, cleanPayload, samePayload } from './secret-payload'
import { createAccountMaterial } from './account-crypto'
import { decryptPayload, encryptPayload } from './vault-crypto'

describe('OAuth client items', () => {
  it('keep client ID and client secret, and drop fields that do not belong to the type', () => {
    const cleaned = cleanPayload({ clientId: 'abc.apps.example', clientSecret: 's3cr3t', token: 'stray', notes: '' }, 'OAuthClient')
    expect(cleaned).toEqual({ clientId: 'abc.apps.example', clientSecret: 's3cr3t' })
    expect(PAYLOAD_FIELDS.OAuthClient).toEqual(['clientId', 'clientSecret', 'url', 'notes'])
  })

  it('mask the client secret but not the client ID', () => {
    expect(MASKED_FIELDS).toContain('clientSecret')
    expect(MASKED_FIELDS).not.toContain('clientId')
  })

  it('round-trip through encryption with both values inside the ciphertext', async () => {
    const m = await createAccountMaterial('correct horse battery staple', { v: 1, m: 19456, t: 2, p: 1 })
    const payload = { clientId: '1234-xyz.apps.googleusercontent.com', clientSecret: 'GOCSPX-supersecret' }
    const enc = await encryptPayload(m.vault.vek, m.vault.vaultId, 'oauth-1', payload)
    const raw = new TextDecoder('latin1').decode(enc.ciphertext)
    expect(raw).not.toContain('GOCSPX')
    expect(raw).not.toContain('googleusercontent')
    expect(samePayload(await decryptPayload(m.vault.vek, m.vault.vaultId, 'oauth-1', enc), payload)).toBe(true)
  })

  it('existing item types are unchanged', () => {
    expect(PAYLOAD_FIELDS.ApiKey).toEqual(['token', 'username', 'url', 'notes'])
    expect(PAYLOAD_FIELDS.Password).toEqual(['username', 'password', 'url', 'notes'])
    expect(PAYLOAD_FIELDS.SecureNote).toEqual(['notes'])
  })
})
