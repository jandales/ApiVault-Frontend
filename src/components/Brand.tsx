import { BRAND } from './brand-copy'

/** Minimal monogram: an "A" drawn as a keyway, gold on deep ink. */
export function AurexMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="aurex-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="aurex-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d27a" />
          <stop offset="1" stopColor="#c99a2e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#111522" />
      <path d="M32 13 L49 51 H41.5 L32 29 L22.5 51 H15 Z" fill="url(#aurex-gold)" />
      <rect x="27" y="38" width="10" height="5" rx="1.5" fill="#111522" />
    </svg>
  )
}

/** Mark + wordmark. `size` controls the mark; the wordmark scales with surrounding font size. */
export function Brand({ size = 36, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <span className="brand-lockup">
      <AurexMark size={size} />
      {showName && <span className="wordmark">{BRAND.name}</span>}
    </span>
  )
}
