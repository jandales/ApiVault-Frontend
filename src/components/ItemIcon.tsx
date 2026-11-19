import { Icon } from './Icon'
import { typeIcon } from './icon-utils'

const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#4f46e5', '#dc2626', '#0d9488']

// A few well-known providers get their brand-ish colour; everything else is hashed into the palette.
const KNOWN: Record<string, string> = {
  stripe: '#635bff',
  github: '#24292f',
  aws: '#ff9900',
  amazon: '#ff9900',
  google: '#4285f4',
  openai: '#10a37f',
  anthropic: '#d97757',
  azure: '#0078d4',
  microsoft: '#0078d4',
  slack: '#4a154b',
  twilio: '#f22f46',
  sendgrid: '#1a82e2',
  vercel: '#000000',
  cloudflare: '#f38020',
}

function colourFor(seed: string): string {
  const known = KNOWN[seed.toLowerCase().trim()]
  if (known) return known
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

/** Coloured tile with the provider/name initial, like an app favicon. Never fetches remote images. */
export function ItemIcon({ name, provider, type, size = 36 }: { name: string; provider?: string | null; type: string; size?: number }) {
  const seed = provider?.trim() || name.trim() || '?'
  const letter = seed.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase()
  return (
    <span className="item-icon" style={{ width: size, height: size, background: colourFor(seed), fontSize: size * 0.44 }} aria-hidden="true">
      {letter ?? <Icon name={typeIcon(type)} size={size * 0.5} />}
      <span className="item-icon-type"><Icon name={typeIcon(type)} size={Math.max(10, size * 0.28)} /></span>
    </span>
  )
}
