import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../services/api/client'
import { listTags, type TagRef } from '../../services/api/secrets'
import { listVaults, type VaultSummary } from '../../services/api/vaults'

/**
 * Shared app data: the account's single vault (metadata only), tags, and a counter that tells the item list to refresh.
 * `vault` is undefined while loading and null if the account has none.
 */
interface WorkspaceValue {
  vault: VaultSummary | null | undefined
  vaultError: string
  tags: TagRef[]
  listVersion: number
  reloadTags(): Promise<void>
  bumpList(): void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<VaultSummary | null | undefined>(undefined)
  const [vaultError, setVaultError] = useState('')
  const [tags, setTags] = useState<TagRef[]>([])
  const [listVersion, setListVersion] = useState(0)

  const reloadTags = useCallback(async () => {
    try {
      setTags(await listTags())
    } catch {
      /* sidebar just shows no tags */
    }
  }, [])

  const bumpList = useCallback(() => setListVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    listVaults()
      .then((v) => {
        if (cancelled) return
        if (v.length === 0) setVaultError('This account has no encryption keys. It may have been created with an older version of API Vault.')
        else setVault(v[0])
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setVaultError(e instanceof ApiError && e.status === 401
          ? 'Your session has expired. Please log in again.'
          : 'Could not reach the server. Is the API running?')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void reloadTags(), 0)
    return () => clearTimeout(t)
  }, [reloadTags])

  const value = useMemo(
    () => ({ vault, vaultError, tags, listVersion, reloadTags, bumpList }),
    [vault, vaultError, tags, listVersion, reloadTags, bumpList],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
