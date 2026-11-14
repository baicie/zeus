/**
 * Every published package declares MIT; the tarball has to carry the text.
 *
 * `package.json` says `"license": "MIT"` for all 32 fixed packages, but npm
 * only bundles a LICENSE it finds in the package directory — a `files` array
 * does not need to list it, and listing it does not create it. Eight package
 * directories never had one, so their tarballs shipped the license field with
 * no license text.
 *
 * `check-release-artifacts` already requires a LICENSE, but only for the five
 * packages derived from Vue, because those have an upstream copyright notice to
 * preserve. That is a stricter, legal requirement; it does not cover the other
 * 27.
 *
 * This test is deliberately about the repository, not the tarball, so it fails
 * before a build is needed.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')

/** Every package the release config publishes, with its directory. */
function fixedPackageDirs(): { name: string; dir: string }[] {
  const config = fs.readFileSync(
    path.join(root, 'scripts/release.config.ts'),
    'utf8',
  )
  const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(config)
  if (!block) throw new Error('zeusFixedPackages not found')
  const names = [...(block[1] ?? '').matchAll(/@(zeus-js\/[a-z0-9-]+)/g)].map(
    match => `@${match[1]}`,
  )
  const found: { name: string; dir: string }[] = []
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
        name?: string
      }
      if (!manifest.name || !names.includes(manifest.name)) continue
      found.push({ name: manifest.name, dir: path.dirname(absolute) })
    }
  }
  walk(path.join(root, 'packages'))
  return found
}

describe('published packages carry their license text', () => {
  const packages = fixedPackageDirs()

  it('finds every fixed package', () => {
    expect(packages.length).toBe(32)
  })

  it.each(packages.map(entry => [entry.name, entry.dir] as const))(
    '%s has a LICENSE beside its package.json',
    (_name, dir) => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      ) as { license?: string }
      if (!manifest.license) return
      expect(
        fs.existsSync(path.join(dir, 'LICENSE')),
        `${dir} declares license ${manifest.license} but ships no LICENSE file`,
      ).toBe(true)
    },
  )
})
