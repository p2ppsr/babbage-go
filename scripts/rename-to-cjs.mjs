import { rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

const from = join('dist', 'cjs', 'index.js')
const to = join('dist', 'cjs', 'index.cjs')

try {
  await stat(from)
  await rename(from, to)
  console.log('[rename-to-cjs] renamed index.js -> index.cjs')
} catch {
  console.warn('[rename-to-cjs] nothing to rename.')
}
