/**
 * Single-password model.
 *
 *   password ──Argon2id(salt)──► master key ──HKDF "auth"──► authentication key  → sent to the server as the login secret
 *                                           └─HKDF "kek"───► key-encryption key  → stays in the browser, unwraps the vault key
 *
 * The two outputs are independent: knowing the authentication key (which the server stores only as an
 * ASP.NET Identity hash) reveals nothing about the key-encryption key. The real password never leaves the browser.
 */
import { DEFAULT_KDF_PARAMS, deriveMasterKey, parseKdfParams, type KdfParams } from './argon2'
import { decrypt, encrypt } from './aes-gcm'
import { encodeUtf8, fromBase32, randomBytes, toBase64, zero } from './encoding'
import {
  KDF_SALT_LENGTH,
  KEY_VERSION,
  VaultUnlockError,
  createVaultMaterial,
  deriveRecoveryWrappingKey,
  importVek,
  wrapperAad,
  type NewVaultMaterial,
  type WrappedKey,
} from './vault-crypto'

export const MIN_PASSWORD_LENGTH = 12

export interface AccountKeys {
  /** base64 of 32 bytes; this is what the server sees instead of the password */
  authKey: string
  /** non-extractable AES-256-GCM key that wraps the vault key */
  kek: CryptoKey
}

export async function deriveAccountKeys(password: string, salt: Uint8Array, params: KdfParams): Promise<AccountKeys> {
  const master = await deriveMasterKey(password, salt, params)
  try {
    const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey'])
    const info = (label: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encodeUtf8(label) })
    const authBits = new Uint8Array(await crypto.subtle.deriveBits(info('apivault:auth:v1'), hkdf, 256))
    const kek = await crypto.subtle.deriveKey(info('apivault:kek:v1'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const authKey = toBase64(authBits)
    zero(authBits)
    return { authKey, kek }
  } finally {
    zero(master)
  }
}

export const deriveAccountKeysFromJson = (password: string, salt: Uint8Array, kdfParametersJson: string) =>
  deriveAccountKeys(password, salt, parseKdfParams(kdfParametersJson))

export interface NewAccountMaterial {
  authKey: string
  vault: NewVaultMaterial
}

/** Registration (or "start over" reset): new salt, new vault key, new recovery key. */
export async function createAccountMaterial(password: string, params: KdfParams = DEFAULT_KDF_PARAMS): Promise<NewAccountMaterial> {
  const salt = randomBytes(KDF_SALT_LENGTH)
  const { authKey, kek } = await deriveAccountKeys(password, salt, params)
  return { authKey, vault: await createVaultMaterial(kek, salt, params) }
}

export interface RekeyMaterial {
  authKey: string
  kdfSalt: Uint8Array<ArrayBuffer>
  kdfParams: KdfParams
  passwordWrapper: WrappedKey
  vek: CryptoKey
}

/**
 * Forgot-password with recovery key: unwrap the existing vault key with the recovery key, then wrap the
 * same key under a key derived from the new password. Secrets stay readable; the recovery key stays valid.
 */
export async function rekeyWithRecoveryKey(
  newPassword: string,
  vaultId: string,
  recoveryWrapper: WrappedKey,
  recoveryKey: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<RekeyMaterial> {
  let recoveryBytes: Uint8Array<ArrayBuffer>
  try {
    recoveryBytes = fromBase32(recoveryKey)
  } catch {
    throw new VaultUnlockError()
  }
  let vekRaw: Uint8Array<ArrayBuffer>
  try {
    const wrapKey = await deriveRecoveryWrappingKey(recoveryBytes, vaultId)
    vekRaw = await decrypt(wrapKey, recoveryWrapper, wrapperAad(vaultId, 'Recovery', recoveryWrapper.keyVersion))
  } catch {
    throw new VaultUnlockError()
  } finally {
    zero(recoveryBytes)
  }
  try {
    const kdfSalt = randomBytes(KDF_SALT_LENGTH)
    const { authKey, kek } = await deriveAccountKeys(newPassword, kdfSalt, params)
    const sealed = await encrypt(kek, vekRaw, wrapperAad(vaultId, 'Password', KEY_VERSION))
    return {
      authKey,
      kdfSalt,
      kdfParams: params,
      passwordWrapper: { ...sealed, wrapperType: 'Password', keyVersion: KEY_VERSION },
      vek: await importVek(vekRaw),
    }
  } finally {
    zero(vekRaw)
  }
}
