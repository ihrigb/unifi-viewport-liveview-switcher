import 'electron-log/renderer'
import { t } from './i18n'
import type { LiveviewInfo, AppConfig } from '../shared/types'

// ---- Apply translations to static HTML ----
document.title = t.settingsWindowTitle
document.querySelector<HTMLSpanElement>('.admin-titlebar-title')!.textContent = t.settingsWindowTitle

document.querySelector<HTMLLabelElement>('label[for="inp-host"]')!.textContent = t.nvrHostLabel
document.querySelector<HTMLInputElement>('#inp-host')!.placeholder = 'NVR IP / Hostname'
document.querySelector<HTMLLabelElement>('label[for="inp-apikey"]')!.textContent = t.apiKeyLabel
document.querySelector<HTMLInputElement>('#inp-apikey')!.placeholder = t.apiKeyPlaceholder
document.querySelector<HTMLLabelElement>('label[for="chk-skiptls"]')!.textContent = t.skipTls
document.querySelector<HTMLButtonElement>('#btn-connect')!.textContent = t.connectBtn

document.querySelector<HTMLLabelElement>('label[for="sel-viewport"]')!.textContent = t.selectViewportLabel
document.querySelector<HTMLOptionElement>('#sel-viewport option')!.textContent = t.selectViewportDefault
document.querySelector<HTMLButtonElement>('#btn-fetch-liveviews')!.textContent = t.loadLiveviewsBtn

document.querySelector<HTMLParagraphElement>('#section-liveviews p')!.textContent = t.liveviewsHint

document.querySelector<HTMLLabelElement>('label[for="chk-ontop"]')!.textContent = t.alwaysOnTop
document.querySelector<HTMLLabelElement>('label[for="chk-startup"]')!.textContent = t.launchAtStartup
document.getElementById('lbl-hotkey-mod')!.textContent = t.hotkeyModLabel
document.getElementById('opt-hotkey-alt')!.textContent = t.hotkeyModAlt
document.getElementById('opt-hotkey-ctrl')!.textContent = t.hotkeyModCtrl
document.getElementById('opt-hotkey-disabled')!.textContent = t.hotkeyModDisabled
document.getElementById('lbl-poll')!.textContent = t.pollIntervalLabel
document.querySelector<HTMLLabelElement>('label[for="inp-newpw"]')!.textContent = t.changePasswordLabel
document.querySelector<HTMLInputElement>('#inp-newpw')!.placeholder = t.newPasswordPlaceholder
document.querySelector<HTMLInputElement>('#inp-newpw2')!.placeholder = t.repeatNewPasswordPlaceholder

document.querySelector<HTMLButtonElement>('#btn-save')!.textContent = t.saveBtn
document.querySelector<HTMLButtonElement>('#btn-cancel')!.textContent = t.cancel
document.querySelector<HTMLButtonElement>('#btn-about')!.textContent = t.aboutBtn

const sectionTitles = document.querySelectorAll<HTMLDivElement>('.form-section-title')
sectionTitles[0].textContent = t.sectionNvrConnection
sectionTitles[1].textContent = t.sectionViewport
sectionTitles[2].textContent = t.sectionLiveviews
sectionTitles[3].textContent = t.sectionAppearance
sectionTitles[4].textContent = t.sectionAdminPassword

// ---- Elements ----
const inpHost = document.getElementById('inp-host') as HTMLInputElement
const inpApiKey = document.getElementById('inp-apikey') as HTMLInputElement
const chkSkipTls = document.getElementById('chk-skiptls') as HTMLInputElement
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement
const connectMsg = document.getElementById('connect-msg') as HTMLDivElement

const sectionViewport = document.getElementById('section-viewport') as HTMLDivElement
const selViewport = document.getElementById('sel-viewport') as HTMLSelectElement
const btnFetchLiveviews = document.getElementById('btn-fetch-liveviews') as HTMLButtonElement
const liveviewsMsg = document.getElementById('liveviews-msg') as HTMLDivElement

const sectionLiveviews = document.getElementById('section-liveviews') as HTMLDivElement
const lvList = document.getElementById('lv-list') as HTMLDivElement

const chkOnTop = document.getElementById('chk-ontop') as HTMLInputElement
const chkStartup = document.getElementById('chk-startup') as HTMLInputElement
const inpOpacity = document.getElementById('inp-opacity') as HTMLInputElement
const lblOpacity = document.getElementById('lbl-opacity') as HTMLLabelElement
const selHotkeyMod = document.getElementById('sel-hotkey-mod') as HTMLSelectElement
const inpPoll = document.getElementById('inp-poll') as HTMLInputElement

const inpNewPw = document.getElementById('inp-newpw') as HTMLInputElement
const inpNewPw2 = document.getElementById('inp-newpw2') as HTMLInputElement

const btnSave = document.getElementById('btn-save') as HTMLButtonElement
const btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement
const saveMsg = document.getElementById('save-msg') as HTMLDivElement

// ---- State ----
let existingLiveviews: LiveviewInfo[] = []
let fetchedLiveviewIds: Array<{ id: string; name: string }> = []
let viewportId = ''
let viewportName = ''
let currentNvrHost = ''

function showMsg(el: HTMLDivElement, text: string, type: 'ok' | 'err'): void {
  el.className = `msg ${type}`
  el.textContent = text
  el.style.display = 'block'
}

function hideMsg(el: HTMLDivElement): void {
  el.style.display = 'none'
}

// ---- Opacity live preview ----
inpOpacity.addEventListener('input', () => {
  const pct = Number(inpOpacity.value)
  lblOpacity.textContent = t.opacityLabel(pct)
  window.api.setOpacity(pct / 100)
})

// ---- Load existing config ----
async function loadConfig(): Promise<void> {
  const config = await window.api.getConfig()
  currentNvrHost = config.nvrHost || ''
  inpHost.value = config.nvrHost || ''
  chkSkipTls.checked = config.skipTlsVerify ?? false
  chkOnTop.checked = config.alwaysOnTop ?? true
  existingLiveviews = config.liveviews ?? []
  viewportId = config.viewportId || ''
  viewportName = config.viewportName || ''

  const opacityPct = Math.round((config.windowOpacity ?? 1.0) * 100)
  inpOpacity.value = String(opacityPct)
  lblOpacity.textContent = t.opacityLabel(opacityPct)

  selHotkeyMod.value = config.hotkeyModifier ?? 'Alt'
  inpPoll.value = String(config.pollIntervalSec ?? 60)

  const { enabled } = await window.api.getLaunchAtStartup()
  chkStartup.checked = enabled

  if (viewportId) {
    sectionViewport.style.display = 'block'
    const opt = document.createElement('option')
    opt.value = viewportId
    opt.textContent = viewportName || viewportId
    opt.selected = true
    selViewport.innerHTML = ''
    selViewport.appendChild(opt)
  }

  if (existingLiveviews.length > 0) {
    sectionLiveviews.style.display = 'block'
    renderLiveviewList(existingLiveviews.map((lv) => ({ id: lv.id, name: lv.name })))
  }
}

// ---- Connect & fetch viewports ----
btnConnect.addEventListener('click', async () => {
  hideMsg(connectMsg)
  const host = inpHost.value.trim()
  const apiKey = inpApiKey.value.trim()
  const skipTls = chkSkipTls.checked

  if (!host) {
    showMsg(connectMsg, t.enterNvrHost, 'err')
    return
  }

  btnConnect.disabled = true
  btnConnect.textContent = t.connecting

  try {
    const viewports = await window.api.fetchViewports(host, apiKey || undefined, skipTls)
    selViewport.innerHTML = `<option value="">${t.selectViewportDefault}</option>`
    for (const vp of viewports) {
      const opt = document.createElement('option')
      opt.value = vp.id
      opt.textContent = vp.name || vp.id
      if (vp.id === viewportId) opt.selected = true
      selViewport.appendChild(opt)
    }
    sectionViewport.style.display = 'block'
    showMsg(connectMsg, t.connectSuccess(viewports.length), 'ok')
  } catch (err) {
    showMsg(connectMsg, t.connectFailed((err as Error).message), 'err')
  } finally {
    btnConnect.disabled = false
    btnConnect.textContent = t.connectBtn
  }
})

// ---- Fetch liveviews ----
btnFetchLiveviews.addEventListener('click', async () => {
  hideMsg(liveviewsMsg)
  const host = inpHost.value.trim()
  const apiKey = inpApiKey.value.trim()
  const skipTls = chkSkipTls.checked
  const selVpId = selViewport.value

  if (!selVpId) {
    showMsg(liveviewsMsg, t.selectViewportFirst, 'err')
    return
  }

  btnFetchLiveviews.disabled = true
  btnFetchLiveviews.textContent = t.connecting

  try {
    const liveviews = await window.api.fetchLiveviews(host, apiKey || undefined, skipTls, selVpId)
    fetchedLiveviewIds = liveviews
    sectionLiveviews.style.display = 'block'
    renderLiveviewList(liveviews)
    showMsg(liveviewsMsg, t.liveviewsFound(liveviews.length), 'ok')
  } catch (err) {
    showMsg(liveviewsMsg, t.liveviewsFailed((err as Error).message), 'err')
  } finally {
    btnFetchLiveviews.disabled = false
    btnFetchLiveviews.textContent = t.loadLiveviewsBtn
  }
})

function renderLiveviewList(apiLiveviews: Array<{ id: string; name: string }>): void {
  lvList.innerHTML = ''
  apiLiveviews.forEach((lv, index) => {
    const existing = existingLiveviews.find((e) => e.id === lv.id)
    const enabled = existing?.enabled ?? false
    const customName = existing?.customName ?? ''

    const row = document.createElement('div')
    row.className = 'lv-item'
    row.dataset.id = lv.id

    const chk = document.createElement('input')
    chk.type = 'checkbox'
    chk.checked = enabled
    chk.dataset.id = lv.id
    chk.title = t.enableInSwitcher

    const nameEl = document.createElement('span')
    nameEl.className = 'lv-api-name'
    nameEl.textContent = lv.name
    nameEl.title = lv.name

    const customInput = document.createElement('input')
    customInput.type = 'text'
    customInput.value = customName
    customInput.placeholder = t.customLabelPlaceholder
    customInput.dataset.id = lv.id

    const reorderWrap = document.createElement('div')
    reorderWrap.className = 'lv-reorder'

    const btnUp = document.createElement('button')
    btnUp.className = 'lv-reorder-btn'
    btnUp.textContent = '▲'
    btnUp.title = t.moveUp
    btnUp.disabled = index === 0
    btnUp.addEventListener('click', () => moveRow(row, -1))

    const btnDown = document.createElement('button')
    btnDown.className = 'lv-reorder-btn'
    btnDown.textContent = '▼'
    btnDown.title = t.moveDown
    btnDown.disabled = index === apiLiveviews.length - 1
    btnDown.addEventListener('click', () => moveRow(row, 1))

    reorderWrap.appendChild(btnUp)
    reorderWrap.appendChild(btnDown)

    row.appendChild(chk)
    row.appendChild(nameEl)
    row.appendChild(customInput)
    row.appendChild(reorderWrap)
    lvList.appendChild(row)
  })
}

function moveRow(row: HTMLDivElement, direction: -1 | 1): void {
  const rows = Array.from(lvList.querySelectorAll<HTMLDivElement>('.lv-item'))
  const idx = rows.indexOf(row)
  const swapIdx = idx + direction
  if (swapIdx < 0 || swapIdx >= rows.length) return

  if (direction === -1) {
    lvList.insertBefore(row, rows[swapIdx])
  } else {
    lvList.insertBefore(rows[swapIdx], row)
  }

  // Refresh disabled state on all reorder buttons
  const updatedRows = Array.from(lvList.querySelectorAll<HTMLDivElement>('.lv-item'))
  updatedRows.forEach((r, i) => {
    const [up, down] = r.querySelectorAll<HTMLButtonElement>('.lv-reorder-btn')
    if (up) up.disabled = i === 0
    if (down) down.disabled = i === updatedRows.length - 1
  })

  // Mirror DOM order into fetchedLiveviewIds / existingLiveviews so collectLiveviews reads correctly
  const source = fetchedLiveviewIds.length > 0 ? fetchedLiveviewIds : existingLiveviews
  const reordered = updatedRows.map((r) => source.find((lv) => lv.id === r.dataset.id)!)
  if (fetchedLiveviewIds.length > 0) {
    fetchedLiveviewIds = reordered as Array<{ id: string; name: string }>
  } else {
    existingLiveviews = reordered as LiveviewInfo[]
  }
}

function collectLiveviews(): LiveviewInfo[] {
  return Array.from(lvList.querySelectorAll<HTMLDivElement>('.lv-item')).map((row) => {
    const id = row.dataset.id!
    const chk = row.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const customInput = row.querySelector<HTMLInputElement>('input[type="text"]')
    const source = fetchedLiveviewIds.length > 0 ? fetchedLiveviewIds : existingLiveviews
    const orig = source.find((lv) => lv.id === id)
    return {
      id,
      name: orig?.name ?? id,
      customName: customInput?.value.trim() || undefined,
      enabled: chk?.checked ?? false
    }
  })
}

// ---- Save ----
btnSave.addEventListener('click', async () => {
  hideMsg(saveMsg)

  const newPw = inpNewPw.value
  if (newPw) {
    if (newPw.length < 4) {
      showMsg(saveMsg, t.newPasswordTooShort, 'err')
      return
    }
    if (newPw !== inpNewPw2.value) {
      showMsg(saveMsg, t.passwordMismatch, 'err')
      return
    }
  }

  const selectedVpId = selViewport.value || viewportId
  const selectedVpName = selViewport.options[selViewport.selectedIndex]?.text || viewportName

  const pollVal = parseInt(inpPoll.value, 10)

  const payload: Partial<AppConfig> & { apiKey?: string } = {
    nvrHost: inpHost.value.trim() || currentNvrHost,
    viewportId: selectedVpId,
    viewportName: selectedVpName,
    liveviews: collectLiveviews(),
    alwaysOnTop: chkOnTop.checked,
    skipTlsVerify: chkSkipTls.checked,
    windowOpacity: Number(inpOpacity.value) / 100,
    hotkeyModifier: selHotkeyMod.value,
    launchAtStartup: chkStartup.checked,
    pollIntervalSec: isNaN(pollVal) ? 60 : Math.max(0, pollVal)
  }

  const rawApiKey = inpApiKey.value.trim()
  if (rawApiKey) payload.apiKey = rawApiKey

  btnSave.disabled = true
  btnSave.textContent = t.saving

  try {
    await window.api.saveConfig(payload)
    if (newPw) await window.api.setPassword(newPw)
    window.api.refreshHotkeys()
    showMsg(saveMsg, t.savedSuccess, 'ok')
    inpApiKey.value = ''
    inpNewPw.value = ''
    inpNewPw2.value = ''
  } catch (err) {
    showMsg(saveMsg, t.saveFailed((err as Error).message), 'err')
  } finally {
    btnSave.disabled = false
    btnSave.textContent = t.saveBtn
  }
})

btnCancel.addEventListener('click', () => window.close())
document.getElementById('btn-close')!.addEventListener('click', () => window.close())
document.getElementById('btn-about')!.addEventListener('click', () => window.api.openAbout())

loadConfig()
