import { describe, expect, it } from 'vitest'
import { createAccountMaterial, deriveAccountKeys, rekeyWithRecoveryKey } from './account-crypto'
import { encrypt } from './aes-gcm'
import type { KdfParams } from './argon2'
import { fromBase32, randomBytes, toBase32 } from './encoding'
import {
  VaultUnlockError,
  decryptPayload,
  encryptPayload,
  unlockWithRecoveryKey,
  unwrapWithKek,
  type WrappedKey,
} from './vault-crypto'

// Smallest parameters the API accepts, to keep tests fast.
const FAST: KdfParams = { v: 1, m: 19456, t: 2, p: 1 }
const PW = 'correct horse battery staple'

/** Proves two CryptoKeys are the same vault key: what one encrypts, the other decrypts. */
async function sameVek(a: CryptoKey, b: CryptoKey, vaultId: string) {
  const enc = await encryptPayload(a, vaultId, 'probe', { x: 1 })
  expect(await decryptPayload(b, vaultId, 'probe', enc)).toEqual({ x: 1 })
}

/** What a login does: derive keys from password + stored salt, then unwrap the vault key. */
async function login(password: string, m: Awaited<ReturnType<typeof createAccountMaterial>>, wrapper = m.vault.passwordWrapper, salt = m.vault.kdfSalt) {
  const keys = await deriveAccountKeys(password, salt, FAST)
  return { authKey: keys.authKey, vek: await unwrapWithKek(keys.kek, m.vault.vaultId, wrapper) }
}

describe('single-password account keys', () => {
  it('logging in with the same password reproduces the auth key and unlocks the same vault key', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const { authKey, vek } = await login(PW, m)
    expect(authKey).toBe(m.authKey)
    await sameVek(m.vault.vek, vek, m.vault.vaultId)
  })

  it('the auth key sent to the server is not the password and has the expected size', async () => {
    const m = await createAccountMaterial(PW, FAST)
    expect(m.authKey).not.toContain(PW)
    expect(atob(m.authKey).length).toBe(32)
  })

  it('a wrong password gives a different auth key and cannot unwrap the vault key', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const keys = await deriveAccountKeys('wrong password!!', m.vault.kdfSalt, FAST)
    expect(keys.authKey).not.toBe(m.authKey)
    await expect(unwrapWithKek(keys.kek, m.vault.vaultId, m.vault.passwordWrapper)).rejects.toBeInstanceOf(VaultUnlockError)
  })

  it('the same password with a different salt gives an unrelated auth key', async () => {
    const a = await createAccountMaterial(PW, FAST)
    const b = await createAccountMaterial(PW, FAST)
    expect(a.authKey).not.toBe(b.authKey)
  })

  it('the auth key cannot be used to decrypt the vault key wrapper', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const raw = Uint8Array.from(atob(m.authKey), (c) => c.charCodeAt(0))
    const asKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    await expect(unwrapWithKek(asKey, m.vault.vaultId, m.vault.passwordWrapper)).rejects.toBeInstanceOf(VaultUnlockError)
  })
})

describe('recovery', () => {
  it('recovery key unlocks the same vault key without the password', async () => {
    const m = await createAccountMaterial(PW, FAST)
    await sameVek(m.vault.vek, await unlockWithRecoveryKey(m.vault.vaultId, m.vault.recoveryWrapper, m.vault.recoveryKey), m.vault.vaultId)
  })

  it('recovery key is accepted regardless of case, spacing and dashes', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const messy = m.vault.recoveryKey.toLowerCase().replace(/-/g, '  ')
    await sameVek(m.vault.vek, await unlockWithRecoveryKey(m.vault.vaultId, m.vault.recoveryWrapper, messy), m.vault.vaultId)
  })

  it('wrong or malformed recovery key fails', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const other = (await createAccountMaterial('another password', FAST)).vault.recoveryKey
    await expect(unlockWithRecoveryKey(m.vault.vaultId, m.vault.recoveryWrapper, other)).rejects.toBeInstanceOf(VaultUnlockError)
    await expect(unlockWithRecoveryKey(m.vault.vaultId, m.vault.recoveryWrapper, '!!!not a key!!!')).rejects.toBeInstanceOf(VaultUnlockError)
  })

  it('re-keying with the recovery key: new password unlocks the same vault key, old password does not', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const r = await rekeyWithRecoveryKey('brand new password', m.vault.vaultId, m.vault.recoveryWrapper, m.vault.recoveryKey, FAST)

    const keys = await deriveAccountKeys('brand new password', r.kdfSalt, FAST)
    expect(keys.authKey).toBe(r.authKey)
    await sameVek(m.vault.vek, await unwrapWithKek(keys.kek, m.vault.vaultId, r.passwordWrapper), m.vault.vaultId)
    await sameVek(m.vault.vek, r.vek, m.vault.vaultId)

    const old = await deriveAccountKeys(PW, r.kdfSalt, FAST)
    await expect(unwrapWithKek(old.kek, m.vault.vaultId, r.passwordWrapper)).rejects.toBeInstanceOf(VaultUnlockError)
    // The recovery key keeps working after the reset.
    await sameVek(m.vault.vek, await unlockWithRecoveryKey(m.vault.vaultId, m.vault.recoveryWrapper, m.vault.recoveryKey), m.vault.vaultId)
  })

  it('re-keying with a wrong recovery key fails', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const other = (await createAccountMaterial('x-x-x-x-x-x-x', FAST)).vault.recoveryKey
    await expect(rekeyWithRecoveryKey('new password!!', m.vault.vaultId, m.vault.recoveryWrapper, other, FAST)).rejects.toBeInstanceOf(VaultUnlockError)
  })
})

describe('wrapper integrity', () => {
  it('a wrapper cannot be moved to another vault (AAD binding)', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const keys = await deriveAccountKeys(PW, m.vault.kdfSalt, FAST)
    await expect(unwrapWithKek(keys.kek, crypto.randomUUID(), m.vault.passwordWrapper)).rejects.toBeInstanceOf(VaultUnlockError)
  })

  it('a Password wrapper cannot be presented as a Recovery wrapper', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const relabelled: WrappedKey = { ...m.vault.passwordWrapper, wrapperType: 'Recovery' }
    await expect(unlockWithRecoveryKey(m.vault.vaultId, relabelled, m.vault.recoveryKey)).rejects.toBeInstanceOf(VaultUnlockError)
  })

  it('modified wrapper ciphertext, nonce or tag fails AES-GCM authentication', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const w = m.vault.passwordWrapper
    const flip = (b: Uint8Array<ArrayBuffer>) => {
      const c = b.slice()
      c[0] ^= 1
      return c
    }
    for (const bad of [{ ...w, ciphertext: flip(w.ciphertext) }, { ...w, nonce: flip(w.nonce) }, { ...w, authTag: flip(w.authTag) }]) {
      await expect(login(PW, m, bad)).rejects.toBeInstanceOf(VaultUnlockError)
    }
  })

  it('wrapper has the sizes the API validates (32-byte key, 12-byte nonce, 16-byte tag)', async () => {
    const m = await createAccountMaterial(PW, FAST)
    for (const w of [m.vault.passwordWrapper, m.vault.recoveryWrapper]) {
      expect(w.ciphertext.length).toBe(32)
      expect(w.nonce.length).toBe(12)
      expect(w.authTag.length).toBe(16)
    }
    expect(m.vault.kdfSalt.length).toBeGreaterThanOrEqual(16)
  })

  it('the unlocked vault key is not extractable', async () => {
    const m = await createAccountMaterial(PW, FAST)
    expect(m.vault.vek.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', m.vault.vek)).rejects.toThrow()
  })
})

describe('AES-256-GCM payloads', () => {
  it('never reuses a nonce across many encryptions under one key', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const { nonce } = await encrypt(m.vault.vek, new Uint8Array([i & 255]), new Uint8Array([1]))
      seen.add(Array.from(nonce).join(','))
    }
    expect(seen.size).toBe(500)
  })

  it('payload tampering and AAD mismatch are detected', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const v = m.vault.vaultId
    const enc = await encryptPayload(m.vault.vek, v, 'secret-1', { token: 'sk_live_123' })
    expect(await decryptPayload(m.vault.vek, v, 'secret-1', enc)).toEqual({ token: 'sk_live_123' })

    const tampered = { ...enc, ciphertext: enc.ciphertext.slice() }
    tampered.ciphertext[0] ^= 1
    await expect(decryptPayload(m.vault.vek, v, 'secret-1', tampered)).rejects.toThrow()
    await expect(decryptPayload(m.vault.vek, v, 'secret-2', enc)).rejects.toThrow()
    await expect(decryptPayload(m.vault.vek, crypto.randomUUID(), 'secret-1', enc)).rejects.toThrow()
  })

  it('ciphertext does not contain the plaintext', async () => {
    const m = await createAccountMaterial(PW, FAST)
    const enc = await encryptPayload(m.vault.vek, m.vault.vaultId, 's', { token: 'sk_live_SUPERSECRET' })
    expect(new TextDecoder('latin1').decode(enc.ciphertext)).not.toContain('SUPERSECRET')
  })
})

describe('base32', () => {
  it('round-trips random bytes', () => {
    const b = randomBytes(32)
    expect(fromBase32(toBase32(b))).toEqual(b)
  })
})
