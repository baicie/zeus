import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(packageDir, '../../..')
const fixture = mkdtempSync(join(tmpdir(), 'zeus-signal-consumer-'))

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stderr}\n${result.stdout}`,
  )
  return result.stdout
}

try {
  for (const name of ['shared', 'signal']) {
    run(
      'pnpm',
      ['pack', '--pack-destination', fixture],
      join(root, 'packages/core', name),
    )
  }
  const tarballs = readdirSync(fixture).filter(name => name.endsWith('.tgz'))
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'signal-consumer', private: true, type: 'module' }),
  )
  run(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...tarballs.map(name => join(fixture, name)),
    ],
    fixture,
  )
  const duplicateDir = join(fixture, 'nested/node_modules/@zeus-js/signal')
  mkdirSync(join(fixture, 'nested'), { recursive: true })
  writeFileSync(join(fixture, 'nested/package.json'), JSON.stringify({ name: 'nested-consumer', private: true }))
  cpSync(join(fixture, 'node_modules/@zeus-js/signal'), duplicateDir, { recursive: true })
  assert.equal(lstatSync(duplicateDir).isSymbolicLink(), false)
  assert.notEqual(realpathSync(duplicateDir), realpathSync(join(fixture, 'node_modules/@zeus-js/signal')))
  mkdirSync(join(fixture, 'nested-dedup'), { recursive: true })
  writeFileSync(
    join(fixture, 'nested-dedup/package.json'),
    JSON.stringify({ name: 'nested-dedup-consumer', private: true }),
  )
  const source = `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as esm from '@zeus-js/signal'
import * as internal from '@zeus-js/signal/internal'
import * as diagnostics from '@zeus-js/signal/diagnostics'
const require = createRequire(import.meta.url)
const cjs = require('@zeus-js/signal')
const cjsInternal = require('@zeus-js/signal/internal')
const cjsDiagnostics = require('@zeus-js/signal/diagnostics')
const duplicateRequire = createRequire(new URL('./nested/package.json', import.meta.url))
const duplicate = duplicateRequire('@zeus-js/signal')
const dedupRequire = createRequire(new URL('./nested-dedup/package.json', import.meta.url))
const dedup = dedupRequire('@zeus-js/signal')
assert.equal(dedupRequire.resolve('@zeus-js/signal'), require.resolve('@zeus-js/signal'))
assert.equal(dedup.createSignal, cjs.createSignal)
assert.notEqual(duplicate.createSignal, cjs.createSignal)
const [foreignRead, foreignWrite] = esm.createSignal(0)
let crossSeen = -1
let crossError
try {
  duplicate.createRoot(dispose => {
    duplicate.createEffect(() => { crossSeen = foreignRead() })
    foreignWrite(1)
    dispose()
  })
} catch (error) { crossError = error }
if (process.argv.includes('--baseline')) {
  console.log(JSON.stringify({ physicalCopies: 2, crossSeen, expected: 1, error: crossError?.message ?? null }))
} else {
  assert.match(crossError?.message ?? '', /different Zeus signal engine/)
}
if (!process.argv.includes('--baseline')) {
  const duplicateInternal = duplicateRequire('@zeus-js/signal/internal')
  esm.createRoot(dispose => {
    assert.throws(() => duplicate.createEffect(() => {}), /different Zeus signal engine/)
    assert.throws(() => duplicate.onCleanup(() => {}), /different Zeus signal engine/)
    assert.throws(() => duplicateInternal.onScopeDispose(() => {}, true), /different Zeus signal engine/)
    dispose()
  })
  const foreignMemo = duplicate.createMemo(() => foreignRead())
  assert.throws(foreignMemo, /different Zeus signal engine/)
  const foreignProxy = internal.state({ count: 1 })
  assert.throws(() => duplicate.createRoot(() => duplicate.createEffect(() => foreignProxy.count)), /different Zeus signal engine/)
  for (const suffix of ['.js', '.prod.js']) {
    const primaryBrowser = await import('./node_modules/@zeus-js/signal/dist/signal.esm-browser' + suffix)
    const duplicateBrowser = await import('./nested/node_modules/@zeus-js/signal/dist/signal.esm-browser' + suffix)
    const [read] = primaryBrowser.createSignal(0)
    assert.throws(() => duplicateBrowser.createRoot(() => duplicateBrowser.createEffect(read)), /different Zeus signal engine/)
    const [right, writeRight] = duplicateBrowser.createSignal(0)
    let seen = -1
    primaryBrowser.createRoot(disposeLeft => {
      duplicateBrowser.createRoot(disposeRight => {
        duplicateBrowser.createEffect(() => { seen = right() })
        writeRight(1)
        disposeRight()
      })
      disposeLeft()
    })
    assert.equal(seen, 1)
  }
  // A failed foreign read must restore the shared execution context.
  assert.throws(
    () => duplicate.createRoot(() => duplicate.createEffect(() => foreignRead())),
    /different Zeus signal engine/,
  )
  assert.equal(foreignRead(), 0)
}
assert.equal(esm.createSignal, cjs.createSignal)
assert.equal(internal.effect, cjsInternal.effect)
assert.equal(diagnostics.createRuntimeDiagnosticsSession, cjsDiagnostics.createRuntimeDiagnosticsSession)
const [nestedRead, nestedWrite] = esm.createSignal(0)
let nestedSeen = -1
dedup.createRoot(dispose => {
  dedup.createEffect(() => { nestedSeen = nestedRead() })
  nestedWrite(1)
  assert.equal(nestedSeen, 1)
  dispose()
})
for (const [source, owner] of [[esm, cjs], [cjs, esm]]) {
  const [read, write] = source.createSignal(0)
  let seen = -1
  owner.createRoot(dispose => {
    owner.createEffect(() => { seen = read() })
    write(1)
    assert.equal(seen, 1)
    dispose()
  })
  write(2)
  assert.equal(seen, 1)
}
`
  writeFileSync(join(fixture, 'consumer.mjs'), source)
  for (const environment of ['development', 'production']) {
    const result = spawnSync(process.execPath, ['consumer.mjs', ...process.argv.slice(2)], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: environment },
    })
    assert.equal(result.status, 0, `${environment}: ${result.stderr}`)
    if (process.argv.includes('--baseline')) process.stdout.write(result.stdout)
  }
  console.log(
    'Packed signal consumer passed: offline install, mixed ESM/CJS, physical-copy and browser-bundle boundary checks in development/production.',
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
