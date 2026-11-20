/**
 * The sensitive part of a secret. Everything in here is encrypted together in the browser
 * (AES-256-GCM under the vault key) and only ever sent to the API as ciphertext.
 */
export interface SecretPayload {
  username?: string
  password?: string
  token?: string
  url?: string
  notes?: string
  /** OAuth client: the public identifier. Encrypted too, since it reveals which apps you integrate. */
  clientId?: string
  clientSecret?: string
}

export type SecretType = 'ApiKey' | 'Password' | 'SecureNote' | 'OAuthClient'

export const SECRET_TYPES: { value: SecretType; label: string }[] = [
  { value: 'ApiKey', label: 'API Key' },
  { value: 'Password', label: 'Password' },
  { value: 'SecureNote', label: 'Secure Note' },
  { value: 'OAuthClient', label: 'OAuth Client' },
]

export const secretTypeLabel = (t: string) => SECRET_TYPES.find((x) => x.value === t)?.label ?? t

/** Which encrypted fields the form shows for each type. */
export const PAYLOAD_FIELDS: Record<SecretType, (keyof SecretPayload)[]> = {
  ApiKey: ['token', 'username', 'url', 'notes'],
  Password: ['username', 'password', 'url', 'notes'],
  SecureNote: ['notes'],
  OAuthClient: ['clientId', 'clientSecret', 'url', 'notes'],
}

export const PAYLOAD_LABELS: Record<keyof SecretPayload, string> = {
  token: 'API token',
  username: 'Username',
  password: 'Password',
  url: 'URL',
  notes: 'Notes',
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
}

/** Fields shown as dots until revealed (inputs and details). */
export const MASKED_FIELDS: (keyof SecretPayload)[] = ['token', 'password', 'clientSecret']

const ORDER: (keyof SecretPayload)[] = ['token', 'clientId', 'clientSecret', 'username', 'password', 'url', 'notes']

/** Drops empty fields and fixes key order so two payloads can be compared. */
export function cleanPayload(p: SecretPayload, type?: SecretType): SecretPayload {
  const allowed = type ? PAYLOAD_FIELDS[type] : ORDER
  const out: SecretPayload = {}
  for (const k of ORDER) {
    const v = p[k]
    if (allowed.includes(k) && v !== undefined && v !== '') out[k] = v
  }
  return out
}

export const samePayload = (a: SecretPayload, b: SecretPayload) =>
  JSON.stringify(cleanPayload(a)) === JSON.stringify(cleanPayload(b))
