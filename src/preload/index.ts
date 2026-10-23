import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, LiveviewInfo } from '../shared/types'

const api = {
  // Liveview switching
  switchLiveview: (liveviewId: string) =>
    ipcRenderer.invoke('unifi:switch-liveview', liveviewId),
  getActiveLiveview: () =>
    ipcRenderer.invoke('unifi:get-active-liveview'),

  // Admin: fetch from API
  fetchViewports: (nvrHost: string, apiKey: string | undefined, skipTls: boolean) =>
    ipcRenderer.invoke('unifi:fetch-viewports', { nvrHost, apiKey, skipTls }),
  fetchLiveviews: (nvrHost: string, apiKey: string | undefined, skipTls: boolean, viewportId: string) =>
    ipcRenderer.invoke('unifi:fetch-liveviews', { nvrHost, apiKey, skipTls, viewportId }),

  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: Partial<AppConfig> & { apiKey?: string }) =>
    ipcRenderer.invoke('config:save', config),

  // Password
  verifyPassword: (password: string) =>
    ipcRenderer.invoke('config:verify-password', password),
  setPassword: (password: string) =>
    ipcRenderer.invoke('config:set-password', password),
  isFirstRun: () => ipcRenderer.invoke('config:is-first-run'),

  // Window
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  openAdmin: () => ipcRenderer.invoke('window:open-admin'),

  // Opacity
  setOpacity: (value: number) => ipcRenderer.invoke('window:set-opacity', value),
  getOpacity: () => ipcRenderer.invoke('window:get-opacity'),

  // Launch at startup
  getLaunchAtStartup: () => ipcRenderer.invoke('window:get-launch-at-startup'),
  setLaunchAtStartup: (enabled: boolean) => ipcRenderer.invoke('window:set-launch-at-startup', enabled),

  // Hotkey modifier (read from config:get — no separate handler needed)
  getHotkeyModifier: () => ipcRenderer.invoke('config:get').then((c: AppConfig) => ({ modifier: c.hotkeyModifier })),

  // Poll interval (read from config:get — no separate handler needed)
  getPollIntervalSec: () => ipcRenderer.invoke('config:get').then((c: AppConfig) => ({ intervalSec: c.pollIntervalSec })),

  // Events from main
  onActiveViewChanged: (cb: (liveviewId: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('unifi:active-view-changed', listener)
    return () => ipcRenderer.off('unifi:active-view-changed', listener)
  },
  onConfigChanged: (cb: (config: AppConfig) => void) => {
    const listener = (_: Electron.IpcRendererEvent, c: AppConfig) => cb(c)
    ipcRenderer.on('config:changed', listener)
    return () => ipcRenderer.off('config:changed', listener)
  },

  refreshHotkeys: () => ipcRenderer.send('hotkeys:refresh'),

  reportCrash: (message: string) => ipcRenderer.send('app:renderer-crash', message),

  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openAbout: () => ipcRenderer.invoke('window:open-about'),
}

export type { LiveviewInfo, AppConfig }
contextBridge.exposeInMainWorld('api', api)
