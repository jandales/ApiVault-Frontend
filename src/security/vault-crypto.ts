import type { KdfParams } from './argon2'
import { decrypt, encrypt, type Sealed } from './aes-gcm'
import { decodeUtf8, encodeUtf8, fromBase32, randomBytes, toBase32, zero } from './encoding'

export const KEY_VERSION = 1
export const PAYLOAD_VERSION = 1
export const KDF_SALT_LENGTH = 16
const VEK_LENGTH = 32
const RECOVERY_KEY_BYTES = 32

export type WrapperType = 'Password' | 'Recovery'

export interface WrappedKey extends Sealed {
  wrapperType: WrapperType
  keyVersion: number
}

export class VaultUnlockError extends Error {
  constructor(message = 'Incorrect password.') {
    // Deliberately generic: never reveal which part failed.
    super(message)
    this.name = 'VaultUnlockError'
  }
}

/** Binds a key wrapper to its vault, type and key version so it cannot be swapped between vaults. */
export function wrapperAad(vaultId: string, type: WrapperType, keyVersion: number) {
  return encodeUtf8(`apivault:wrapper:v${keyVersion}:${vaultId}:${type}`)
}

/** Binds a secret payload to its vault, secret and payload format version. */
export function payloadAad(vaultId: string, secretId: string, encryptionVersion: number) {
  return encodeUtf8(`apivault:payload:v${encryptionVersion}:${vaultId}:${secretId}`)
}

/** The in-memory vault key is non-extractable: it can encrypt/decrypt but never be read back by script. */
export async function importVek(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Recovery key -> AES-GCM wrapping key via HKDF-SHA256 (the recovery key is already high-entropy, so no slow KDF is needed). */
export async function deriveRecoveryWrappingKey(recoveryKey: Uint8Array<ArrayBuffer>, vaultId: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', recoveryKey, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encodeUtf8(vaultId), info: encodeUtf8('apivault:recovery-wrap:v1') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  return (toBase32(bytes).match(/.{1,4}/g) ?? []).join('-')
}

export interface NewVaultMaterial {
  vaultId: string
  kdfSalt: Uint8Array<ArrayBuffer>
  kdfParams: KdfParams
  passwordWrapper: WrappedKey
  recoveryWrapper: WrappedKey
  /** Show to the user exactly once; never send to the server. */
  recoveryKey: string
  /** The unlocked vault key, so the account is usable immediately. */
  vek: CryptoKey
}

/**
 * Generates a random vault key and wraps it twice: under the password-derived KEK and under a new random
 * recovery key. Only the wrappers (and the KDF salt/params used for the KEK) leave the browser.
 */
export async function createVaultMaterial(kek: CryptoKey, kdfSalt: Uint8Array<ArrayBuffer>, kdfParams: KdfParams): Promise<NewVaultMaterial> {
  const vaultId = crypto.randomUUID()
  const vekRaw = randomBytes(VEK_LENGTH)
  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES)
  try {
    const passwordSealed = await encrypt(kek, vekRaw, wrapperAad(vaultId, 'Password', KEY_VERSION))
    const recoveryWrapKey = await deriveRecoveryWrappingKey(recoveryBytes, vaultId)
    const recoverySealed = await encrypt(recoveryWrapKey, vekRaw, wrapperAad(vaultId, 'Recovery', KEY_VERSION))
    return {
      vaultId,
      kdfSalt,
      kdfParams,
      passwordWrapper: { ...passwordSealed, wrapperType: 'Password', keyVersion: KEY_VERSION },
      recoveryWrapper: { ...recoverySealed, wrapperType: 'Recovery', keyVersion: KEY_VERSION },
      recoveryKey: formatRecoveryKey(recoveryBytes),
      vek: await importVek(vekRaw),
    }
  } finally {
    zero(vekRaw)
    zero(recoveryBytes)
  }
}

async function unwrap(wrappingKey: CryptoKey, w: WrappedKey, vaultId: string): Promise<CryptoKey> {
  try {
    const raw = await decrypt(wrappingKey, w, wrapperAad(vaultId, w.wrapperType, w.keyVersion))
    try {
      if (raw.length !== VEK_LENGTH) throw new Error('bad length')
      return await importVek(raw)
    } finally {
      zero(raw)
    }
  } catch {
    throw new VaultUnlockError()
  }
}

/** Unwraps the vault key with the password-derived KEK. Fails (AES-GCM auth) if the password was wrong. */
export function unwrapWithKek(kek: CryptoKey, vaultId: string, wrapper: WrappedKey): Promise<CryptoKey> {
  return unwrap(kek, wrapper, vaultId)
}

/** Recovery path: works without the password. */
export async function unlockWithRecoveryKey(vaultId: string, wrapper: WrappedKey, recoveryKey: string): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = fromBase32(recoveryKey)
  } catch {
    throw new VaultUnlockError('Invalid recovery key.')
  }
  try {
    return await unwrap(await deriveRecoveryWrappingKey(bytes, vaultId), wrapper, vaultId).catch(() => {
      throw new VaultUnlockError('Invalid recovery key.')
    })
  } finally {
    zero(bytes)
  }
}

// ---- Secret payloads ----

export interface EncryptedPayload extends Sealed {
  encryptionVersion: number
}

export async function encryptPayload(vek: CryptoKey, vaultId: string, secretId: string, payload: unknown): Promise<EncryptedPayload> {
  const sealed = await encrypt(vek, encodeUtf8(JSON.stringify(payload)), payloadAad(vaultId, secretId, PAYLOAD_VERSION))
  return { ...sealed, encryptionVersion: PAYLOAD_VERSION }
}

export async function decryptPayload<T>(vek: CryptoKey, vaultId: string, secretId: string, p: EncryptedPayload): Promise<T> {
  const plain = await decrypt(vek, p, payloadAad(vaultId, secretId, p.encryptionVersion))
  try {
    return JSON.parse(decodeUtf8(plain)) as T
  } finally {
    zero(plain)
  }
}
