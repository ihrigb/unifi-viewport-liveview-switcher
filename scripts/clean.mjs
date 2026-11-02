import { rmSync, existsSync } from 'fs'

const dirs = ['out', 'dist', 'dist-electron']

for (const dir of dirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`removed ${dir}/`)
  }
}
