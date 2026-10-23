import { safeStorage } from 'electron'
import store from './store'

const API_KEY_KEY = 'encryptedApiKey'
const ADMIN_PASS_KEY = 'encryptedAdminPass'

export function saveApiKey(apiKey: string): void {
  const encrypted = safeStorage.encryptString(apiKey)
  store.set(API_KEY_KEY as never, encrypted.toString('base64'))
}

export function loadApiKey(): string | null {
  const b64 = store.get(API_KEY_KEY as never) as string | undefined
  if (!b64) return null
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function saveAdminPassword(password: string): void {
  const encrypted = safeStorage.encryptString(password)
  store.set(ADMIN_PASS_KEY as never, encrypted.toString('base64'))
}

export function verifyAdminPassword(password: string): boolean {
  const b64 = store.get(ADMIN_PASS_KEY as never) as string | undefined
  if (!b64) return false
  try {
    const stored = safeStorage.decryptString(Buffer.from(b64, 'base64'))
    return stored === password
  } catch {
    return false
  }
}

export function hasAdminPassword(): boolean {
  return !!(store.get(ADMIN_PASS_KEY as never) as string | undefined)
}
