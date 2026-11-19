import { argon2id } from 'hash-wasm'
import { encodeUtf8 } from './encoding'

/** Versioned KDF configuration stored (as JSON) with the account's vault. */
export interface KdfParams {
  v: number
  /** memory in KiB */
  m: number
  /** iterations */
  t: number
  /** parallelism */
  p: number
}

export const DEFAULT_KDF_PARAMS: KdfParams = { v: 1, m: 65536, t: 3, p: 1 }

export function parseKdfParams(json: string): KdfParams {
  const p = JSON.parse(json) as Partial<KdfParams>
  if (p.v !== 1 || !p.m || !p.t || !p.p) throw new Error('Unsupported KDF parameters.')
  return { v: p.v, m: p.m, t: p.t, p: p.p }
}

/**
 * Argon2id(password, salt) -> 32-byte master key. The caller must wipe the result after use
 * (it is only ever fed into HKDF, see account-crypto.ts).
 */
export async function deriveMasterKey(password: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array<ArrayBuffer>> {
  if (params.v !== 1) throw new Error('Unsupported KDF version.')
  const raw = await argon2id({
    password: encodeUtf8(password),
    salt,
    memorySize: params.m,
    iterations: params.t,
    parallelism: params.p,
    hashLength: 32,
    outputType: 'binary',
  })
  return raw as Uint8Array<ArrayBuffer>
}
