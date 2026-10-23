export type LibraryInfo = {
  name: string
  version: string
  license: string
}

export type AppInfo = {
  productName: string
  version: string
  author: string
  libraries: LibraryInfo[]
}

export type LiveviewInfo = {
  id: string
  name: string
  customName?: string
  enabled: boolean
}

export type AppConfig = {
  nvrHost: string
  viewportId: string
  viewportName: string
  liveviews: LiveviewInfo[]
  alwaysOnTop: boolean
  skipTlsVerify: boolean
  hasPassword: boolean
  configured: boolean
  windowOpacity: number
  hotkeyModifier: string
  launchAtStartup: boolean
  pollIntervalSec: number
  windowBounds?: { x: number; y: number; width: number; height: number }
}

export type UnifiApi = {
  switchLiveview: (id: string) => Promise<{ ok: boolean }>
  getActiveLiveview: () => Promise<{ liveviewId: string | null }>
  getAlwaysOnTop: () => Promise<{ alwaysOnTop: boolean }>
  toggleAlwaysOnTop: () => Promise<{ alwaysOnTop: boolean }>
  isFirstRun: () => Promise<{ firstRun: boolean }>
  verifyPassword: (p: string) => Promise<{ ok: boolean }>
  setPassword: (p: string) => Promise<{ ok: boolean }>
  openAdmin: () => Promise<void>
  onActiveViewChanged: (cb: (id: string) => void) => () => void
  onConfigChanged: (cb: (cfg: AppConfig) => void) => () => void
  fetchViewports: (h: string, k: string | undefined, s: boolean) => Promise<Array<{ id: string; name: string }>>
  fetchLiveviews: (h: string, k: string | undefined, s: boolean, vId: string) => Promise<Array<{ id: string; name: string }>>
  getConfig: () => Promise<AppConfig>
  saveConfig: (c: Partial<AppConfig> & { apiKey?: string }) => Promise<{ ok: boolean }>
  // Window opacity
  setOpacity: (value: number) => Promise<void>
  getOpacity: () => Promise<{ opacity: number }>
  // Launch at startup
  getLaunchAtStartup: () => Promise<{ enabled: boolean }>
  setLaunchAtStartup: (enabled: boolean) => Promise<void>
  // Hotkeys
  getHotkeyModifier: () => Promise<{ modifier: string }>
  refreshHotkeys: () => void
  // About
  getAppInfo: () => Promise<AppInfo>
  openAbout: () => Promise<void>
  // Crash reporter
  reportCrash: (message: string) => void
  // Poll interval
  getPollIntervalSec: () => Promise<{ intervalSec: number }>
}

declare global {
  interface Window {
    api: UnifiApi
  }
}
