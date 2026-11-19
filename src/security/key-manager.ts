/**
 * Holds unlocked vault keys in module memory only. Nothing here is ever written to
 * localStorage, sessionStorage, IndexedDB, or any persisted store.
 */
type Listener = () => void

const DEFAULT_IDLE_MS = 5 * 60 * 1000

const keys = new Map<string, CryptoKey>()
const listeners = new Set<Listener>()
let idleMs = DEFAULT_IDLE_MS
let timer: ReturnType<typeof setTimeout> | undefined
let activityBound = false

function emit() {
  listeners.forEach((l) => l())
}

function armTimer() {
  if (timer) clearTimeout(timer)
  timer = keys.size > 0 ? setTimeout(lockAll, idleMs) : undefined
}

function onActivity() {
  if (keys.size > 0) armTimer()
}

function bindActivity() {
  if (activityBound || typeof window === 'undefined') return
  activityBound = true
  for (const e of ['pointerdown', 'keydown', 'mousemove', 'touchstart']) {
    window.addEventListener(e, onActivity, { passive: true })
  }
}

export const keyManager = {
  setVek(vaultId: string, vek: CryptoKey) {
    keys.set(vaultId, vek)
    bindActivity()
    armTimer()
    emit()
  },
  getVek(vaultId: string): CryptoKey | undefined {
    return keys.get(vaultId)
  },
  isUnlocked(vaultId: string): boolean {
    return keys.has(vaultId)
  },
  /** Stable string of unlocked vault ids, for useSyncExternalStore. Contains ids only, never keys. */
  snapshot(): string {
    return [...keys.keys()].sort().join(',')
  },
  lock(vaultId: string) {
    keys.delete(vaultId)
    armTimer()
    emit()
  },
  lockAll,
  setIdleTimeout(ms: number) {
    idleMs = ms
    armTimer()
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

function lockAll() {
  keys.clear()
  if (timer) clearTimeout(timer)
  timer = undefined
  emit()
}
