import { randomBytes } from './encoding'

export const NONCE_LENGTH = 12 // 96 bits
export const TAG_LENGTH = 16 // 128 bits

export interface Sealed {
  ciphertext: Uint8Array<ArrayBuffer>
  nonce: Uint8Array<ArrayBuffer>
  authTag: Uint8Array<ArrayBuffer>
}

/** AES-256-GCM encrypt with a fresh random 96-bit nonce on every call. */
export async function encrypt(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const nonce = randomBytes(NONCE_LENGTH)
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LENGTH * 8 }, key, plaintext),
  )
  // Web Crypto returns ciphertext || tag; the API stores them in separate columns.
  return {
    ciphertext: out.slice(0, out.length - TAG_LENGTH),
    nonce,
    authTag: out.slice(out.length - TAG_LENGTH),
  }
}

/** Throws if the key, AAD, ciphertext, nonce or tag are wrong or have been modified. */
export async function decrypt(key: CryptoKey, sealed: Sealed, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const joined = new Uint8Array(sealed.ciphertext.length + sealed.authTag.length)
  joined.set(sealed.ciphertext, 0)
  joined.set(sealed.authTag, sealed.ciphertext.length)
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce, additionalData: aad, tagLength: TAG_LENGTH * 8 }, key, joined),
  )
}
