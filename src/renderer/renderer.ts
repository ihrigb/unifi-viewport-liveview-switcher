import 'electron-log/renderer'
import log from 'electron-log/renderer'
import { t } from './i18n'
import type { LiveviewInfo } from '../shared/types'

window.onerror = (message, source, lineno, colno, error) => {
  const msg = error?.stack ?? `${message} (${source}:${lineno}:${colno})`
  log.error('Renderer uncaught error:', msg)
  window.api.reportCrash(msg)
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason)
  log.error('Renderer unhandled rejection:', reason)
  window.api.reportCrash(reason)
})

const grid = document.getElementById('liveview-grid') as HTMLDivElement
const setupHint = document.getElementById('setup-hint') as HTMLDivElement
const statusDot = document.getElementById('status-dot') as HTMLSpanElement
const statusLabel = document.getElementById('status-label') as HTMLSpanElement
const retryLink = document.getElementById('retry-link') as HTMLAnchorElement
const btnPin = document.getElementById('btn-pin') as HTMLButtonElement
const btnGear = document.getElementById('btn-gear') as HTMLButtonElement
const btnClose = document.getElementById('btn-close') as HTMLButtonElement

let activeLiveviewId: string | null = null
let liveviews: LiveviewInfo[] = []

btnGear.title = t.settingsTitle
btnClose.title = t.hideToTray
btnClose.addEventListener('click', () => window.close())

function setStatus(state: 'ok' | 'err' | 'busy', label: string, allowRetry = true): void {
  statusDot.className = `status-dot ${state}`
  statusLabel.textContent = label
  retryLink.style.display = state === 'err' && allowRetry ? 'inline' : 'none'
}

let hotkeyModifier = ''

function renderButtons(): void {
  const enabled = liveviews.filter((lv) => lv.enabled)
  log.debug(`renderButtons: activeLiveviewId=${activeLiveviewId} enabled=[${enabled.map(l => l.id).join(',')}]`)
  const activeMatch = enabled.some(lv => lv.id === activeLiveviewId)
  if (activeLiveviewId && !activeMatch) {
    log.warn(`renderButtons: activeLiveviewId=${activeLiveviewId} not found in enabled liveviews`)
  }
  grid.innerHTML = ''

  if (enabled.length === 0) {
    setupHint.style.display = 'block'
    grid.appendChild(setupHint)
    return
  }

  setupHint.style.display = 'none'
  for (let i = 0; i < enabled.length; i++) {
    const lv = enabled[i]
    const btn = document.createElement('button')
    btn.className = 'lv-btn' + (lv.id === activeLiveviewId ? ' active' : '')
    btn.title = lv.name
    btn.dataset.id = lv.id

    const nameSpan = document.createElement('span')
    nameSpan.className = 'lv-btn-name'
    nameSpan.textContent = lv.customName || lv.name
    btn.appendChild(nameSpan)

    if (hotkeyModifier && i < 9) {
      const badge = document.createElement('span')
      badge.className = 'lv-btn-shortcut'
      badge.textContent = `${hotkeyModifier}+${i + 1}`
      btn.appendChild(badge)
    }

    btn.addEventListener('click', () => switchTo(lv.id))
    grid.appendChild(btn)
  }
}

async function switchTo(id: string): Promise<void> {
  setStatus('busy', t.switching)
  const allBtns = grid.querySelectorAll<HTMLButtonElement>('.lv-btn')
  allBtns.forEach((b) => (b.disabled = true))
  try {
    await window.api.switchLiveview(id)
    activeLiveviewId = id
    allBtns.forEach((b) => {
      b.disabled = false
      b.classList.toggle('active', b.dataset.id === id)
    })
    setStatus('ok', t.connected)
  } catch (err) {
    allBtns.forEach((b) => (b.disabled = false))
    setStatus('err', t.switchFailed)
    console.error('switchLiveview failed:', err)
  }
}

// ---- Retry logic with exponential backoff ----

let retryTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
let retryCount = 0

function clearRetry(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

function scheduleRetry(): void {
  clearRetry()
  const BASE = 10
  const delaySec = Math.min(BASE * Math.pow(2, retryCount), 300)
  retryCount++
  let remaining = delaySec
  setStatus('err', t.notConnectedRetry(remaining))
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining > 0) {
      setStatus('err', t.notConnectedRetry(remaining))
    }
  }, 1000)
  retryTimer = setTimeout(() => {
    clearRetry()
    refreshActiveView()
  }, delaySec * 1000)
}

async function refreshActiveView(): Promise<void> {
  try {
    const { liveviewId } = await window.api.getActiveLiveview()
    log.info(`refreshActiveView: liveviewId=${liveviewId} (was ${activeLiveviewId})`)
    clearRetry()
    retryCount = 0
    activeLiveviewId = liveviewId
    renderButtons()
    setStatus('ok', t.connected)
    if (!pollTimer) startPoll()
  } catch (err) {
    log.error('refreshActiveView failed:', err)
    scheduleRetry()
  }
}

retryLink.addEventListener('click', (e) => {
  e.preventDefault()
  clearRetry()
  retryCount = 0
  refreshActiveView()
})

// ---- Background poll ----

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollIntervalSec = 60

function startPoll(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (pollIntervalSec <= 0) return
  pollTimer = setInterval(() => {
    refreshActiveView()
  }, pollIntervalSec * 1000)
}

// ---- Config load ----

async function loadConfig(): Promise<void> {
  const config = await window.api.getConfig()
  liveviews = config.liveviews ?? []
  pollIntervalSec = config.pollIntervalSec ?? 60
  hotkeyModifier = config.hotkeyModifier ?? ''

  if (!config.configured || liveviews.length === 0) {
    grid.innerHTML = ''
    setupHint.style.display = 'block'
    setupHint.textContent = t.setupHint
    grid.appendChild(setupHint)
    setStatus('err', t.setupRequired, false)
    return
  }

  await refreshActiveView()
  startPoll()

  const { alwaysOnTop } = await window.api.getAlwaysOnTop()
  btnPin.classList.toggle('active', alwaysOnTop)
  btnPin.title = alwaysOnTop ? t.pinnedTooltip : t.unpinnedTooltip
}

// ---- Admin button: gear → password gate → open admin window ---

function openPasswordGate(): void {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>${t.settingsTitle}</h2>
      <p id="pw-desc">${t.passwordGateDesc}</p>
      <div class="form-row">
        <input type="password" id="pw-input" placeholder="${t.passwordPlaceholder}" autocomplete="current-password" />
      </div>
      <div id="pw-error" class="msg err" style="display:none"></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="pw-confirm">${t.unlock}</button>
        <button class="btn btn-secondary" id="pw-cancel">${t.cancel}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const input = overlay.querySelector<HTMLInputElement>('#pw-input')!
  const errorEl = overlay.querySelector<HTMLDivElement>('#pw-error')!

  overlay.querySelector('#pw-cancel')!.addEventListener('click', () => overlay.remove())

  async function tryUnlock(): Promise<void> {
    const { ok } = await window.api.verifyPassword(input.value)
    if (ok) {
      overlay.remove()
      openAdminWindow()
    } else {
      errorEl.textContent = t.incorrectPassword
      errorEl.style.display = 'block'
      input.value = ''
      input.focus()
    }
  }

  overlay.querySelector('#pw-confirm')!.addEventListener('click', tryUnlock)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock() })
  setTimeout(() => input.focus(), 50)
}

async function openFirstRunSetup(): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>${t.firstRunTitle}</h2>
      <p>${t.firstRunDesc}</p>
      <div class="form-row">
        <label>${t.newPasswordLabel}</label>
        <input type="password" id="pw1" placeholder="${t.newPasswordPlaceholder}" />
      </div>
      <div class="form-row">
        <label>${t.confirmPasswordLabel}</label>
        <input type="password" id="pw2" placeholder="${t.confirmPasswordPlaceholder}" />
      </div>
      <div id="pw-error" class="msg err" style="display:none"></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="pw-set">${t.setPasswordBtn}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const pw1 = overlay.querySelector<HTMLInputElement>('#pw1')!
  const pw2 = overlay.querySelector<HTMLInputElement>('#pw2')!
  const errorEl = overlay.querySelector<HTMLDivElement>('#pw-error')!

  async function trySet(): Promise<void> {
    if (!pw1.value || pw1.value.length < 4) {
      errorEl.textContent = t.passwordTooShort
      errorEl.style.display = 'block'
      return
    }
    if (pw1.value !== pw2.value) {
      errorEl.textContent = t.passwordMismatch
      errorEl.style.display = 'block'
      return
    }
    await window.api.setPassword(pw1.value)
    overlay.remove()
    openAdminWindow()
  }

  overlay.querySelector('#pw-set')!.addEventListener('click', trySet)
  pw2.addEventListener('keydown', (e) => { if (e.key === 'Enter') trySet() })
  setTimeout(() => pw1.focus(), 50)
}

btnGear.title = t.settingsTitle
btnClose.title = t.hideToTray
btnClose.addEventListener('click', () => window.close())

function openAdminWindow(): void {
  window.api.openAdmin()
}

btnGear.addEventListener('click', async () => {
  const { firstRun } = await window.api.isFirstRun()
  if (firstRun) {
    await openFirstRunSetup()
  } else {
    openPasswordGate()
  }
})

btnPin.addEventListener('click', async () => {
  const { alwaysOnTop } = await window.api.toggleAlwaysOnTop()
  btnPin.classList.toggle('active', alwaysOnTop)
  btnPin.title = alwaysOnTop ? t.pinnedTooltip : t.unpinnedTooltip
})

// React to changes from admin saving
window.api.onConfigChanged((config) => {
  liveviews = config.liveviews ?? []
  pollIntervalSec = config.pollIntervalSec ?? 60
  hotkeyModifier = config.hotkeyModifier ?? ''
  clearRetry()
  retryCount = 0

  if (!config.configured || liveviews.length === 0) {
    grid.innerHTML = ''
    setupHint.style.display = 'block'
    setupHint.textContent = t.setupHint
    grid.appendChild(setupHint)
    setStatus('err', t.setupRequired, false)
    return
  }

  startPoll()
  refreshActiveView()
})

window.api.onActiveViewChanged((id) => {
  activeLiveviewId = id
  renderButtons()
})

loadConfig()
