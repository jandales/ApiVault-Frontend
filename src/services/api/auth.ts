import type { NewAccountMaterial, RekeyMaterial } from '../../security/account-crypto'
import { fromBase64, toBase64 } from '../../security/encoding'
import { post } from './client'
import { vaultToWire, wrapperFromWire, wrapperToWire, type WrapperDto } from './vaults'

/** KDF salt and parameters for an email (a stable decoy for unknown emails). */
export async function prelogin(email: string) {
  const r = await post<{ kdfAlgorithm: string; kdfSalt: string; kdfParameters: string }>('/auth/prelogin', { email })
  return { kdfSalt: fromBase64(r.kdfSalt), kdfParameters: r.kdfParameters }
}

/** Registers with the derived auth key (never the password) and the encrypted vault-key wrappers. */
export const registerAccount = (email: string, m: NewAccountMaterial) =>
  post('/auth/register', { email, password: m.authKey, vault: vaultToWire(m.vault) })

export async function getRecoveryMaterial(email: string, token: string) {
  const r = await post<{ vaultId: string; recoveryWrapper: WrapperDto | null }>('/auth/recovery', { email, token })
  return { vaultId: r.vaultId, recoveryWrapper: r.recoveryWrapper ? wrapperFromWire(r.recoveryWrapper) : null }
}

/** Reset that keeps secrets: the same vault key, re-wrapped under the new password. */
export const resetPasswordKeepingSecrets = (email: string, token: string, r: RekeyMaterial) =>
  post('/auth/reset-password', {
    email,
    token,
    newPassword: r.authKey,
    keyUpdate: { kdfSalt: toBase64(r.kdfSalt), kdfParameters: JSON.stringify(r.kdfParams), passwordWrapper: wrapperToWire(r.passwordWrapper) },
  })

/** Reset without the recovery key: the old vault and all its secrets are erased and replaced by a new empty vault. */
export const resetPasswordErasingSecrets = (email: string, token: string, m: NewAccountMaterial) =>
  post('/auth/reset-password', { email, token, newPassword: m.authKey, replacementVault: vaultToWire(m.vault) })
