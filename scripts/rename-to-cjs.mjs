import { rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

for (const file of ['index', 'showFundingModal']) {
  const from = join('dist', 'cjs', `${file}.js`)
  const to = join('dist', 'cjs', `${file}.cjs`)

  try {
    await stat(from)
    await rename(from, to)
    console.log(`[rename-to-cjs] renamed ${file}.js -> ${file}.cjs`)
  } catch {
    console.warn('[rename-to-cjs] nothing to rename.')
  }
}
