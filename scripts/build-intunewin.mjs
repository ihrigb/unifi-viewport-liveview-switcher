#!/usr/bin/env node
/**
 * Wraps the NSIS installer into a .intunewin package for Intune deployment.
 * Downloads IntuneWinAppUtil.exe from GitHub if not present in tools/.
 */

import { createWriteStream, existsSync, mkdirSync, copyFileSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { get } from 'https'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version

const TOOL_URL = 'https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe'
const TOOL_DIR = join(root, 'tools')
const TOOL_PATH = join(TOOL_DIR, 'IntuneWinAppUtil.exe')
const DIST_DIR = join(root, 'dist')
const STAGE_DIR = join(root, 'dist', 'intune-stage')

const nsisFilename = `UniFi Viewport Switcher Setup ${version}.exe`
const nsisExe = join(DIST_DIR, nsisFilename)

if (!existsSync(nsisExe)) {
  console.error(`NSIS installer not found: ${nsisExe}`)
  console.error('Run npm run build:win first.')
  process.exit(1)
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const request = (u) => get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        request(res.headers.location)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading ${u}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
    request(url)
  })
}

if (!existsSync(TOOL_PATH)) {
  console.log('Downloading IntuneWinAppUtil.exe...')
  mkdirSync(TOOL_DIR, { recursive: true })
  await download(TOOL_URL, TOOL_PATH)
  console.log('Downloaded.')
} else {
  console.log('IntuneWinAppUtil.exe already present.')
}

// Stage only the NSIS installer in a clean folder
rmSync(STAGE_DIR, { recursive: true, force: true })
mkdirSync(STAGE_DIR, { recursive: true })
copyFileSync(nsisExe, join(STAGE_DIR, nsisFilename))

console.log(`Packaging ${nsisFilename} into .intunewin...`)
execSync(
  `"${TOOL_PATH}" -c "${STAGE_DIR}" -s "${nsisFilename}" -o "${DIST_DIR}" -q`,
  { stdio: 'inherit' }
)

rmSync(STAGE_DIR, { recursive: true, force: true })

console.log(`Done. Output: ${join(DIST_DIR, `UniFi Viewport Switcher Setup ${version}.intunewin`)}`)
