import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

for (const file of ['index', 'showSatoshiShopClientFundingModal', 'showExternalFundingModal']) {
  const from = join('dist', 'cjs', `${file}.js`)
  const to = join('dist', 'cjs', `${file}.cjs`)

  try {
    await stat(from)
    const compiled = await readFile(from, 'utf8')
    const rewritten = compiled.replace(
      /require\((["'])(\.\/[^"']+)\.js\1\)/g,
      'require($1$2.cjs$1)',
    )
    await writeFile(from, rewritten)
    await rename(from, to)
    console.log(`[rename-to-cjs] renamed ${file}.js -> ${file}.cjs`)
  } catch {
    console.warn('[rename-to-cjs] nothing to rename.')
  }
}
