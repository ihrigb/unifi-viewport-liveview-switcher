import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const mock = spawn(process.execPath, [join(root, 'scripts/mock-server.mjs')], {
  stdio: 'inherit',
  cwd: root,
})

const dev = spawn(
  process.execPath,
  [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev'],
  { stdio: 'inherit', cwd: root }
)

function shutdown() {
  mock.kill()
  dev.kill()
}

process.on('SIGINT',  shutdown)
process.on('SIGTERM', shutdown)
dev.on('exit', (code) => { mock.kill(); process.exit(code ?? 0) })
mock.on('exit', (code) => { if (code !== 0 && code !== null) { dev.kill(); process.exit(code) } })
