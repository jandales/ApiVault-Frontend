import type { IconName } from './Icon'

export function typeIcon(type: string): IconName {
  return type === 'Password' ? 'asterisk' : type === 'SecureNote' ? 'note' : type === 'OAuthClient' ? 'idcard' : 'key'
}
