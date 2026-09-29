/* ------------------------------------------------------------------ *
 * Test runner.
 *
 * The app source uses extensionless imports, which Node's native ESM
 * resolver does not accept. So we bundle the test file with esbuild
 * (already a dependency via Vite) and hand the single output to
 * `node --test`.
 *
 *   node scripts/run-tests.mjs
 * ------------------------------------------------------------------ */

import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'node_modules/.cache/medstime-tests')
const OUT_FILE = resolve(OUT_DIR, 'tests.mjs')

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await build({
  entryPoints: [resolve(ROOT, 'tests/domain.test.ts')],
  outfile: OUT_FILE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  logLevel: 'warning',
  // Node built-ins must stay external.
  external: ['node:*'],
})

const child = spawn(process.execPath, ['--test', OUT_FILE], {
  stdio: 'inherit',
  cwd: ROOT,
})

child.on('exit', (code) => {
  rmSync(OUT_DIR, { recursive: true, force: true })
  process.exit(code ?? 1)
})
