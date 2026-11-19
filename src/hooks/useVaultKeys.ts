import { useSyncExternalStore } from 'react'
import { keyManager } from '../security/key-manager'

/** Re-renders when a vault is locked or unlocked (including the inactivity auto-lock). */
export const useUnlocked = (vaultId: string | undefined) =>
  useSyncExternalStore(keyManager.subscribe, () => (vaultId ? keyManager.isUnlocked(vaultId) : false))

export function useUnlockedVaultIds(): string[] {
  const snap = useSyncExternalStore(keyManager.subscribe, keyManager.snapshot)
  return snap ? snap.split(',') : []
}
