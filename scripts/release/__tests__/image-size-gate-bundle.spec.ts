import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The committed bundle `scripts/release/dist/image-size-gate.mjs` is what
 * `admin-image.yml` runs. These tests keep it honest.
 *
 * The failure they exist for (run 43205273467): the workflow invoked the
 * TypeScript source through `tsx`, but the image job never installs the
 * repository's dependencies, so the gate died with `ERR_MODULE_NOT_FOUND`
 * before it measured anything. A gate that cannot start protects nothing.
 *
 * The bundle is committed rather than built in CI because building it there
 * would need either a dependency install (the thing that just failed) or a
 * downloaded tool at run time. Committing it makes the CI step one `node`
 * invocation with no network and no install. The cost is that it can drift from
 * its source, which is what the freshness test covers.
 */

// `__tests__` sits one level below `scripts/release`.
const root = path.resolve(import.meta.dirname, '../../..')
const bundlePath = path.join(root, 'scripts/release/dist/image-size-gate.mjs')

describe('the committed image size gate bundle', () => {
  it('exists', () => {
    expect(fs.existsSync(bundlePath)).toBe(true)
  })

  it('imports nothing but node builtins', () => {
    const source = fs.readFileSync(bundlePath, 'utf8')
    const imports = [
      ...source.matchAll(/^import\s[^\n]*?from\s+["']([^"']+)["']/gm),
    ].map(match => match[1]!)
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) {
      expect(specifier.startsWith('node:')).toBe(true)
    }
  })

  it('has no external runtime dependencies in package.json terms', () => {
    // The bundle must run on a bare Node with no node_modules — which is what
    // the image job has. Any `require` of a bare specifier would break that.
    const source = fs.readFileSync(bundlePath, 'utf8')
    const requires = [
      ...source.matchAll(/\brequire\(\s*["']([^"']+)["']/g),
    ].map(match => match[1]!)
    for (const specifier of requires) {
      expect(specifier.startsWith('node:')).toBe(true)
    }
  })

  it('is a CLI that runs when executed directly', () => {
    // A usage error is the expected outcome with no arguments: it proves the
    // entry point ran main() rather than doing nothing.
    let output = ''
    let status = 0
    try {
      execFileSync('node', [bundlePath], { encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      const failure = error as {
        stdout?: string
        stderr?: string
        status?: number
      }
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
      status = failure.status ?? 1
    }
    expect(status).not.toBe(0)
    expect(output).toMatch(/Pass --manifest|Pass --reference/)
  })

  it('does not start a measurement when imported', async () => {
    // `isMain()` guards the entry point, so importing the bundle in a test (or
    // any other tool) must not run a measurement or exit the process.
    const module = await import(bundlePath)
    expect(module).toBeTypeOf('object')
    // Reaching here means the import did not call process.exit.
    expect(true).toBe(true)
  })

  it('matches the current source', () => {
    // Rebuild into a temporary file and compare. A stale bundle means CI would
    // measure with older logic than the tests just validated.
    const temp = fs.mkdtempSync(path.join(root, 'temp/image-gate-bundle-'))
    const rebuilt = path.join(temp, 'bundle.mjs')
    try {
      execFileSync(
        path.join(root, 'node_modules/.bin/rolldown'),
        [
          'scripts/release/image-size-gate-cli.ts',
          '--format',
          'esm',
          '--platform',
          'node',
          '--file',
          rebuilt,
        ],
        { cwd: root, stdio: 'pipe' },
      )
      const committed = fs.readFileSync(bundlePath, 'utf8')
      const fresh = fs.readFileSync(rebuilt, 'utf8')
      expect(fresh).toBe(committed)
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  })
})
