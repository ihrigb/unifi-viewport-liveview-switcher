import 'electron-log/renderer'
import { t } from './i18n'

document.title = t.aboutWindowTitle
document.querySelector<HTMLSpanElement>('.admin-titlebar-title')!.textContent = t.aboutWindowTitle
document.getElementById('about-oss-title')!.textContent = t.aboutOssTitle
document.getElementById('about-th-name')!.textContent = t.aboutThName
document.getElementById('about-th-version')!.textContent = t.aboutThVersion
document.getElementById('about-th-license')!.textContent = t.aboutThLicense

document.getElementById('btn-close')!.addEventListener('click', () => window.close())

async function load(): Promise<void> {
  const info = await window.api.getAppInfo()

  document.getElementById('about-app-name')!.textContent = info.productName
  document.getElementById('about-version')!.textContent = `v${info.version}`
  document.getElementById('about-author')!.textContent = info.author

  const tbody = document.getElementById('about-tbody')!
  for (const lib of info.libraries) {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${lib.name}</td><td>${lib.version}</td><td><span class="about-license">${lib.license}</span></td>`
    tbody.appendChild(tr)
  }
}

load()
