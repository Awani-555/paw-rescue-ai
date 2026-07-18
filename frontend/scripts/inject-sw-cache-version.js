import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// sw.js is a static file in public/, copied verbatim by Vite - it never
// goes through the bundler, so it can't read import.meta.env like the rest
// of the app. CACHE_NAME was previously a hand-maintained literal
// ('pawrescue-v1') that had to be bumped manually on every release, and a
// deploy that forgot to bump it could serve a stale cached app shell
// pointing at asset filenames a new build had already deleted. This runs
// after every `vite build` and stamps a fresh cache name in, so there's
// nothing left to forget.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const swPath = path.join(__dirname, '..', 'dist', 'sw.js')

const buildId = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12)
const contents = readFileSync(swPath, 'utf8')
const updated = contents.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'pawrescue-${buildId}';`)

if (updated === contents) {
  throw new Error('inject-sw-cache-version: CACHE_NAME line not found in dist/sw.js - check the pattern still matches.')
}

writeFileSync(swPath, updated)
console.log(`dist/sw.js cache name set to pawrescue-${buildId}`)
