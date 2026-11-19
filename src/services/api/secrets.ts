import { fromBase64, toBase64 } from '../../security/encoding'
import type { EncryptedPayload } from '../../security/vault-crypto'
import { api, post } from './client'

export interface TagRef {
  id: string
  name: string
}

export interface SecretSummary {
  id: string
  vaultId: string
  name: string
  description: string | null
  secretType: string
  provider: string | null
  environment: string | null
  expiresAt: string | null
  createdAt: string
  modifiedAt: string | null
  isArchived: boolean
  tags: TagRef[]
}

interface WirePayload {
  encryptedPayload: string
  nonce: string
  authTag: string
  encryptionVersion: number
}

export type SecretRecord = SecretSummary & WirePayload

export interface SecretVersionRecord extends WirePayload {
  id: string
  secretId: string
  createdAt: string
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
}

export interface SecretFilters {
  vaultId?: string
  search?: string
  secretType?: string
  tagId?: string
  archived?: boolean
  expiringWithinDays?: number
  page?: number
  pageSize?: number
}

/** Plaintext metadata only. Sensitive values travel inside the encrypted payload. */
export interface SecretMetadata {
  name: string
  description: string | null
  secretType: string
  provider: string | null
  environment: string | null
  expiresAt: string | null
  tagIds: string[]
}

const toWire = (p: EncryptedPayload): WirePayload => ({
  encryptedPayload: toBase64(p.ciphertext),
  nonce: toBase64(p.nonce),
  authTag: toBase64(p.authTag),
  encryptionVersion: p.encryptionVersion,
})

export const fromWire = (p: WirePayload): EncryptedPayload => ({
  ciphertext: fromBase64(p.encryptedPayload),
  nonce: fromBase64(p.nonce),
  authTag: fromBase64(p.authTag),
  encryptionVersion: p.encryptionVersion,
})

export function listSecrets(f: SecretFilters = {}): Promise<Paged<SecretSummary>> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v))
  return api<Paged<SecretSummary>>(`/secrets?${qs.toString()}`)
}

export const getSecret = (id: string) => api<SecretRecord>(`/secrets/${id}`)

export const createSecret = (id: string, vaultId: string, meta: SecretMetadata, payload: EncryptedPayload) =>
  post<SecretRecord>('/secrets', { id, vaultId, ...meta, ...toWire(payload) })

/** Pass `payload` only when the sensitive fields changed; the API then keeps the old ciphertext as a version. */
export const updateSecret = (id: string, meta: SecretMetadata, payload?: EncryptedPayload) =>
  api<SecretRecord>(`/secrets/${id}`, { method: 'PUT', body: JSON.stringify({ ...meta, ...(payload ? toWire(payload) : {}) }) })

export const archiveSecret = (id: string) => post<SecretRecord>(`/secrets/${id}/archive`)
export const restoreSecret = (id: string) => post<SecretRecord>(`/secrets/${id}/restore`)
export const deleteSecret = (id: string) => api(`/secrets/${id}`, { method: 'DELETE' })
export const getSecretVersions = (id: string) => api<SecretVersionRecord[]>(`/secrets/${id}/versions`)

// ---- Tags ----
export const listTags = () => api<TagRef[]>('/tags')
export const createTag = (name: string) => post<TagRef>('/tags', { name })
export const renameTag = (id: string, name: string) => api<TagRef>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
export const deleteTag = (id: string) => api(`/tags/${id}`, { method: 'DELETE' })
