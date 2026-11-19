import { fromBase64, toBase64 } from '../../security/encoding'
import type { NewVaultMaterial, WrappedKey } from '../../security/vault-crypto'
import { api } from './client'

export interface VaultSummary {
  id: string
  name: string
  description: string | null
  kdfAlgorithm: string
  encryptionAlgorithm: string
  keyVersion: number
  createdAt: string
}

interface VaultDto extends VaultSummary {
  kdfSalt: string
  kdfParameters: string
}

export interface WrapperDto {
  wrapperType: 'Password' | 'Recovery'
  encryptedVaultKey: string
  nonce: string
  authTag: string
  keyVersion: number
}

export const wrapperToWire = (w: WrappedKey): WrapperDto => ({
  wrapperType: w.wrapperType,
  encryptedVaultKey: toBase64(w.ciphertext),
  nonce: toBase64(w.nonce),
  authTag: toBase64(w.authTag),
  keyVersion: w.keyVersion,
})

export const wrapperFromWire = (w: WrapperDto): WrappedKey => ({
  wrapperType: w.wrapperType,
  ciphertext: fromBase64(w.encryptedVaultKey),
  nonce: fromBase64(w.nonce),
  authTag: fromBase64(w.authTag),
  keyVersion: w.keyVersion,
})

/** Request body for the account's vault: KDF metadata plus the *encrypted* vault-key wrappers only. */
export const vaultToWire = (m: NewVaultMaterial, name = 'Personal') => ({
  id: m.vaultId,
  name,
  description: null,
  kdfAlgorithm: 'Argon2id',
  kdfSalt: toBase64(m.kdfSalt),
  kdfParameters: JSON.stringify(m.kdfParams),
  encryptionAlgorithm: 'AES-256-GCM',
  keyVersion: m.passwordWrapper.keyVersion,
  passwordWrapper: wrapperToWire(m.passwordWrapper),
  recoveryWrapper: wrapperToWire(m.recoveryWrapper),
})

export async function listVaults(): Promise<VaultSummary[]> {
  return (await api<{ items: VaultSummary[] }>('/vaults?pageSize=100')).items
}

/** The account's single vault with its KDF salt/params and password wrapper, as needed to unlock it. */
export async function getMyVaultKeys() {
  const vaults = await api<{ items: VaultDto[] }>('/vaults?pageSize=1')
  const vault = vaults.items[0]
  if (!vault) throw new Error('This account has no vault.')
  const wrappers = await api<WrapperDto[]>(`/vaults/${vault.id}/key-wrappers`)
  const password = wrappers.find((w) => w.wrapperType === 'Password')
  if (!password) throw new Error('This account has no password key wrapper.')
  return { vaultId: vault.id, kdfSalt: fromBase64(vault.kdfSalt), kdfParameters: vault.kdfParameters, passwordWrapper: wrapperFromWire(password) }
}
