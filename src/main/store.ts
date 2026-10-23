import Store from 'electron-store'
import type { LiveviewInfo } from '../shared/types'

export type { LiveviewInfo }

export type StoreSchema = {
  nvrHost: string
  viewportId: string
  viewportName: string
  liveviews: LiveviewInfo[]
  alwaysOnTop: boolean
  skipTlsVerify: boolean
  configured: boolean
  windowOpacity: number
  hotkeyModifier: string
  pollIntervalSec: number
}

const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    nvrHost: '',
    viewportId: '',
    viewportName: '',
    liveviews: [],
    alwaysOnTop: true,
    skipTlsVerify: false,
    configured: false,
    windowOpacity: 1.0,
    hotkeyModifier: 'Alt',
    pollIntervalSec: 60
  }
})

export default store
