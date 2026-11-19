import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deriveAccountKeysFromJson, type NewAccountMaterial } from '../../security/account-crypto'
import { keyManager } from '../../security/key-manager'
import { unwrapWithKek } from '../../security/vault-crypto'
import { ApiError, api, post, refreshSession, setAccessToken, type AuthResponse } from '../../services/api/client'
import { prelogin, registerAccount } from '../../services/api/auth'
import { getMyVaultKeys } from '../../services/api/vaults'

export interface User {
  id: string
  email: string
  emailConfirmed: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  /** One step: derives keys from the password, signs in with the auth key and unlocks secrets with the other key. */
  login(email: string, password: string): Promise<void>
  /** Creates the account from prepared key material. Returns 'verify-email' if the account must confirm its email first. */
  completeRegistration(email: string, material: NewAccountMaterial): Promise<'ok' | 'verify-email'>
  /** After a reload or auto-lock: re-derive the encryption key from the password (the session is still valid). */
  unlock(password: string): Promise<void>
  logout(): Promise<void>
  /** Re-reads the signed-in user (e.g. after email verification). */
  refreshUser(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function unlockVault(password: string) {
  const v = await getMyVaultKeys()
  const keys = await deriveAccountKeysFromJson(password, v.kdfSalt, v.kdfParameters)
  keyManager.setVek(v.vaultId, await unwrapWithKek(keys.kek, v.vaultId, v.passwordWrapper))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the HttpOnly refresh cookie after a reload. Secrets stay locked until the password is entered.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (await refreshSession()) {
        try {
          const me = await api<User>('/auth/me')
          if (!cancelled) setUser(me)
        } catch {
          /* not signed in */
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const pre = await prelogin(email)
    const keys = await deriveAccountKeysFromJson(password, pre.kdfSalt, pre.kdfParameters)
    const res = await post<AuthResponse>('/auth/login', { email, password: keys.authKey })
    setAccessToken(res.accessToken)
    const v = await getMyVaultKeys()
    keyManager.setVek(v.vaultId, await unwrapWithKek(keys.kek, v.vaultId, v.passwordWrapper))
    setUser(res.user)
  }, [])

  const completeRegistration = useCallback(async (email: string, m: NewAccountMaterial) => {
    await registerAccount(email, m)
    try {
      const res = await post<AuthResponse>('/auth/login', { email, password: m.authKey })
      setAccessToken(res.accessToken)
      keyManager.setVek(m.vault.vaultId, m.vault.vek)
      setUser(res.user)
      return 'ok' as const
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return 'verify-email' as const
      throw e
    }
  }, [])

  const unlock = useCallback((password: string) => unlockVault(password), [])

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api<User>('/auth/me'))
    } catch {
      /* not signed in: nothing to refresh */
    }
  }, [])

  const logout = useCallback(async () => {
    keyManager.lockAll() // wipe decrypted key material first
    try {
      await post('/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, completeRegistration, unlock, logout, refreshUser }),
    [user, loading, login, completeRegistration, unlock, logout, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
