import { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain, globalShortcut, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import store from './store'
import { registerIpcHandlers } from './ipc-handlers'
import type { LiveviewInfo } from './store'
import { loadApiKey } from './keychain'
import { getActiveView, setActiveView } from './unifi-api'

log.initialize()
log.info('App starting')
const t0 = Date.now()
app.once('ready', () => log.info(`Electron ready in ${Date.now() - t0}ms`))

function showCrashDialog(): void {
  const logPath = log.transports.file.getFile().path
  dialog.showErrorBox(
    'Something went wrong',
    `An unexpected error occurred. The application may not work correctly.\n\nLog file:\n${logPath}`
  )
}

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err)
  showCrashDialog()
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
  showCrashDialog()
})

if (!app.requestSingleInstanceLock()) {
  log.info('Another instance is already running — quitting')
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
})

let isQuitting = false
let mainWindow: BrowserWindow | null = null
let adminWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null
let activeLiveviewId: string | null = null

export function openAdminWindow(): void {
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.focus()
    return
  }

  adminWindow = new BrowserWindow({
    width: 480,
    height: 620,
    frame: false,
    resizable: true,
    minWidth: 400,
    minHeight: 400,
    show: false,
    parent: mainWindow ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  adminWindow.on('ready-to-show', () => adminWindow?.show())
  adminWindow.on('closed', () => { adminWindow = null })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/index\.html$/, '')
    adminWindow.loadURL(`${base}/admin.html`)
  } else {
    adminWindow.loadFile(join(__dirname, '../renderer/admin.html'))
  }
}

export function openAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus()
    return
  }

  aboutWindow = new BrowserWindow({
    width: 420,
    height: 500,
    frame: false,
    resizable: false,
    show: false,
    parent: adminWindow ?? mainWindow ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  aboutWindow.on('ready-to-show', () => aboutWindow?.show())
  aboutWindow.on('closed', () => { aboutWindow = null })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/index\.html$/, '')
    aboutWindow.loadURL(`${base}/about.html`)
  } else {
    aboutWindow.loadFile(join(__dirname, '../renderer/about.html'))
  }
}

function createWindow(): void {
  const alwaysOnTop = store.get('alwaysOnTop')
  const opacity = store.get('windowOpacity')

  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    frame: false,
    transparent: false,
    resizable: true,
    minWidth: 300,
    minHeight: 420,
    alwaysOnTop,
    skipTaskbar: false,
    show: false,
    opacity,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    log.info(`Window ready-to-show in ${Date.now() - t0}ms`)
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      return
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        mainWindow?.webContents.toggleDevTools()
      }
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getApiOpts(): { nvrHost: string; apiKey: string; skipTlsVerify: boolean } | null {
  const apiKey = loadApiKey()
  if (!apiKey) return null
  return { nvrHost: store.get('nvrHost'), apiKey, skipTlsVerify: store.get('skipTlsVerify') }
}

function rebuildTrayMenu(newActiveLiveviewId: string | null): void {
  if (!tray) return
  if (newActiveLiveviewId !== null) activeLiveviewId = newActiveLiveviewId

  const liveviews = store.get('liveviews').filter((lv: LiveviewInfo) => lv.enabled)
  const activeName = liveviews.find((lv: LiveviewInfo) => lv.id === activeLiveviewId)?.customName
    || liveviews.find((lv: LiveviewInfo) => lv.id === activeLiveviewId)?.name

  tray.setToolTip(activeName ? `Viewport Switcher — ${activeName}` : 'UniFi Viewport Switcher')

  const switchItems = liveviews.map((lv: LiveviewInfo) => ({
    label: (lv.customName || lv.name) + (lv.id === activeLiveviewId ? ' ✓' : ''),
    click: async () => {
      try {
        const opts = getApiOpts()
        if (!opts) return
        await setActiveView(opts, store.get('viewportId'), lv.id)
        activeLiveviewId = lv.id
        mainWindow?.webContents.send('unifi:active-view-changed', lv.id)
        rebuildTrayMenu(lv.id)
      } catch (err) {
        log.error('Tray switch failed:', err)
      }
    }
  }))

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Show',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    }
  ]

  if (switchItems.length > 0) {
    template.push({ type: 'separator' })
    template.push(...switchItems)
  }

  template.push({ type: 'separator' })
  template.push({ label: 'Quit', click: () => { isQuitting = true; app.quit() } })

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray(): void {
  const iconPath = join(__dirname, '../../assets/icon.ico')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  rebuildTrayMenu(null)
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const modifier = store.get('hotkeyModifier')
  if (!modifier) return

  const liveviews = store.get('liveviews').filter((lv: LiveviewInfo) => lv.enabled)
  liveviews.slice(0, 9).forEach((lv: LiveviewInfo, i: number) => {
    const accel = `${modifier}+${i + 1}`
    try {
      globalShortcut.register(accel, async () => {
        try {
          const opts = getApiOpts()
          if (!opts) return
          await setActiveView(opts, store.get('viewportId'), lv.id)
          activeLiveviewId = lv.id
          mainWindow?.webContents.send('unifi:active-view-changed', lv.id)
          rebuildTrayMenu(lv.id)
        } catch (err) {
          log.error(`Hotkey switch failed for ${accel}:`, err)
        }
      })
      log.info(`Registered hotkey ${accel} → ${lv.name}`)
    } catch {
      log.warn(`Could not register hotkey ${accel}`)
    }
  })
}

// Fetch the current active liveview from NVR on startup so tray shows correct state
async function fetchInitialActiveView(): Promise<void> {
  try {
    const opts = getApiOpts()
    if (!opts) return
    const viewportId = store.get('viewportId')
    if (!viewportId) return
    const state = await getActiveView(opts, viewportId)
    if (state.liveviewId) {
      activeLiveviewId = state.liveviewId
      rebuildTrayMenu(state.liveviewId)
    }
  } catch {
    // Not configured yet or NVR unavailable — tray shows generic tooltip
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow, rebuildTrayMenu)

  ipcMain.handle('window:open-admin', () => openAdminWindow())
  ipcMain.handle('window:open-about', () => openAboutWindow())

  createWindow()
  createTray()
  registerHotkeys()
  fetchInitialActiveView()

  // Re-register hotkeys whenever config changes (liveview list or modifier may have changed)
  ipcMain.on('hotkeys:refresh', () => registerHotkeys())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('render-process-gone', (_event, _webContents, details) => {
    if (details.reason === 'clean-exit') return
    log.error('Renderer process gone:', details.reason, details.exitCode)
    showCrashDialog()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray — user quits via tray menu
  }
})
