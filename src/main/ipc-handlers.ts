import { ipcMain, BrowserWindow, app, dialog } from 'electron'
import log from 'electron-log/main'
import store from './store'
import {
  saveApiKey,
  loadApiKey,
  saveAdminPassword,
  verifyAdminPassword,
  hasAdminPassword
} from './keychain'
import type { LiveviewInfo } from './store'
import { getViewports, getLiveviews, getActiveView, setActiveView } from './unifi-api'

function getClientOpts() {
  const apiKey = loadApiKey()
  if (!apiKey) throw new Error('API key not configured')
  return {
    nvrHost: store.get('nvrHost'),
    apiKey,
    skipTlsVerify: store.get('skipTlsVerify')
  }
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  onTrayRebuild?: (activeLiveviewId: string | null) => void
): void {

  // --- Liveview switching ---

  ipcMain.handle('unifi:switch-liveview', async (_event, liveviewId: string) => {
    const opts = getClientOpts()
    const viewportId = store.get('viewportId')
    log.info(`Switching liveview: viewportId=${viewportId} liveviewId=${liveviewId}`)
    try {
      await setActiveView(opts, viewportId, liveviewId)
      getMainWindow()?.webContents.send('unifi:active-view-changed', liveviewId)
      onTrayRebuild?.(liveviewId)
      return { ok: true }
    } catch (err) {
      log.error('unifi:switch-liveview failed:', err)
      throw err
    }
  })

  ipcMain.handle('unifi:get-active-liveview', async () => {
    const opts = getClientOpts()
    const viewportId = store.get('viewportId')
    log.debug(`get-active-liveview: querying viewportId=${viewportId}`)
    const state = await getActiveView(opts, viewportId)
    log.info(`get-active-liveview: liveviewId=${state.liveviewId}`)
    return state
  })

  // --- Admin: fetch from API ---

  ipcMain.handle(
    'unifi:fetch-viewports',
    async (_event, { nvrHost, apiKey, skipTls }: { nvrHost: string; apiKey?: string; skipTls: boolean }) => {
      const key = apiKey || loadApiKey()
      if (!key) throw new Error('API key not configured')
      return getViewports({ nvrHost, apiKey: key, skipTlsVerify: skipTls })
    }
  )

  ipcMain.handle(
    'unifi:fetch-liveviews',
    async (
      _event,
      { nvrHost, apiKey, skipTls, viewportId }: { nvrHost: string; apiKey?: string; skipTls: boolean; viewportId: string }
    ) => {
      const key = apiKey || loadApiKey()
      if (!key) throw new Error('API key not configured')
      void viewportId
      return getLiveviews({ nvrHost, apiKey: key, skipTlsVerify: skipTls })
    }
  )

  // --- Config ---

  ipcMain.handle('config:get', () => {
    return {
      nvrHost: store.get('nvrHost'),
      viewportId: store.get('viewportId'),
      viewportName: store.get('viewportName'),
      liveviews: store.get('liveviews'),
      alwaysOnTop: store.get('alwaysOnTop'),
      skipTlsVerify: store.get('skipTlsVerify'),
      hasPassword: hasAdminPassword(),
      configured: store.get('configured'),
      windowOpacity: store.get('windowOpacity'),
      hotkeyModifier: store.get('hotkeyModifier'),
      launchAtStartup: app.getLoginItemSettings().openAtLogin,
      pollIntervalSec: store.get('pollIntervalSec')
    }
  })

  ipcMain.handle('config:save', (_event, incoming: {
    nvrHost?: string
    viewportId?: string
    viewportName?: string
    liveviews?: LiveviewInfo[]
    alwaysOnTop?: boolean
    skipTlsVerify?: boolean
    apiKey?: string
    windowOpacity?: number
    hotkeyModifier?: string
    launchAtStartup?: boolean
    pollIntervalSec?: number
  }) => {
    if (incoming.nvrHost !== undefined) store.set('nvrHost', incoming.nvrHost)
    if (incoming.viewportId !== undefined) store.set('viewportId', incoming.viewportId)
    if (incoming.viewportName !== undefined) store.set('viewportName', incoming.viewportName)
    if (incoming.liveviews !== undefined) store.set('liveviews', incoming.liveviews)
    if (incoming.alwaysOnTop !== undefined) store.set('alwaysOnTop', incoming.alwaysOnTop)
    if (incoming.skipTlsVerify !== undefined) store.set('skipTlsVerify', incoming.skipTlsVerify)
    if (incoming.apiKey !== undefined) saveApiKey(incoming.apiKey)
    if (incoming.windowOpacity !== undefined) store.set('windowOpacity', incoming.windowOpacity)
    if (incoming.hotkeyModifier !== undefined) store.set('hotkeyModifier', incoming.hotkeyModifier)
    if (incoming.pollIntervalSec !== undefined) store.set('pollIntervalSec', incoming.pollIntervalSec)
    if (incoming.launchAtStartup !== undefined) {
      app.setLoginItemSettings({ openAtLogin: incoming.launchAtStartup })
    }
    if (incoming.viewportId && incoming.nvrHost) store.set('configured', true)

    const config = {
      nvrHost: store.get('nvrHost'),
      viewportId: store.get('viewportId'),
      viewportName: store.get('viewportName'),
      liveviews: store.get('liveviews'),
      alwaysOnTop: store.get('alwaysOnTop'),
      skipTlsVerify: store.get('skipTlsVerify'),
      hasPassword: hasAdminPassword(),
      configured: store.get('configured'),
      windowOpacity: store.get('windowOpacity'),
      hotkeyModifier: store.get('hotkeyModifier'),
      launchAtStartup: app.getLoginItemSettings().openAtLogin,
      pollIntervalSec: store.get('pollIntervalSec')
    }
    getMainWindow()?.webContents.send('config:changed', config)
    onTrayRebuild?.(null)
    return { ok: true }
  })

  // --- Password ---

  ipcMain.handle('config:verify-password', (_event, password: string) => {
    return { ok: verifyAdminPassword(password) }
  })

  ipcMain.handle('config:set-password', (_event, password: string) => {
    saveAdminPassword(password)
    return { ok: true }
  })

  ipcMain.handle('config:is-first-run', () => {
    return { firstRun: !hasAdminPassword() }
  })

  // --- Window ---

  ipcMain.handle('window:toggle-always-on-top', () => {
    const win = getMainWindow()
    if (!win) return
    const current = win.isAlwaysOnTop()
    win.setAlwaysOnTop(!current)
    store.set('alwaysOnTop', !current)
    return { alwaysOnTop: !current }
  })

  ipcMain.handle('window:get-always-on-top', () => {
    const win = getMainWindow()
    return { alwaysOnTop: win?.isAlwaysOnTop() ?? false }
  })

  // --- Opacity ---

  ipcMain.handle('window:set-opacity', (_event, value: number) => {
    const clamped = Math.max(0.4, Math.min(1.0, value))
    const win = getMainWindow()
    win?.setOpacity(clamped)
    store.set('windowOpacity', clamped)
  })

  ipcMain.handle('window:get-opacity', () => {
    return { opacity: store.get('windowOpacity') }
  })

  // --- Launch at startup ---

  ipcMain.handle('window:get-launch-at-startup', () => {
    return { enabled: app.getLoginItemSettings().openAtLogin }
  })

  ipcMain.handle('window:set-launch-at-startup', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })

  // --- App info ---

  ipcMain.handle('app:get-info', () => {
    return {
      productName: 'UniFi Viewport Switcher',
      version: app.getVersion(),
      author: 'ihrigb',
      libraries: [
        { name: 'Electron',            version: process.versions.electron,  license: 'MIT' },
        { name: 'electron-store',      version: '8.2.0',   license: 'MIT' },
        { name: 'electron-log',        version: '5.4.4',   license: 'MIT' },
        { name: 'undici',              version: '6.19.2',  license: 'MIT' },
        { name: '@electron-toolkit/utils', version: '3.0.0', license: 'MIT' },
        { name: 'Vite',                version: '5.3.1',   license: 'MIT' },
        { name: 'electron-vite',       version: '2.3.0',   license: 'MIT' },
        { name: 'electron-builder',    version: '24.13.3', license: 'MIT' },
        { name: 'TypeScript',          version: '5.4.5',   license: 'Apache-2.0' },
      ]
    }
  })

  // --- Crash reporter (renderer → main) ---

  ipcMain.on('app:renderer-crash', (_event, message: string) => {
    log.error('Renderer crash reported:', message)
    const logPath = log.transports.file.getFile().path
    dialog.showErrorBox(
      'Something went wrong',
      `An unexpected error occurred in the application.\n\nLog file:\n${logPath}`
    )
  })
}
