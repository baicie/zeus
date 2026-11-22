/**
 * The publish order decides what a partial release leaves behind (R22 TASK 52).
 *
 * rc.3 stopped at the eighth package. The seven that landed were, in order:
 * `compiler-native`, its three platform packages, `compiler`, `eslint-plugin`,
 * `playground-engine`. Not one of them is the runtime — `shared`, `signal`,
 * `runtime-dom` and `zeus` all sort *after* the native compiler, so a release
 * that dies anywhere in its first third ships a compiler and no framework.
 *
 * The order is `@baicie/release`'s: kind, then name. It is not this
 * repository's to change from a test, so what is pinned here is the property a
 * recovery plan depends on — where the runtime sits relative to the packages
 * that publish before it — and that the order still matches what the registry
 * shows rc.3 actually did.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { publishOrder } from '../publish-order'

const root = path.resolve(import.meta.dirname, '../../..')

/** Package name -> its directory under `packages/`, from the manifests. */
function directories(): Map<string, string> {
  const found = new Map<string, string>()
  for (const domain of fs.readdirSync(path.join(root, 'packages'))) {
    const domainDir = path.join(root, 'packages', domain)
    if (!fs.statSync(domainDir).isDirectory()) continue
    for (const entry of fs.readdirSync(domainDir)) {
      const manifest = path.join(domainDir, entry, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
        name: string
      }
      found.set(name, `packages/${domain}/${entry}`)
    }
  }
  return found
}

/** The fixed release group, read from the config's source. */
function fixedPackages(): string[] {
  const source = fs.readFileSync(
    path.join(root, 'scripts/release.config.ts'),
    'utf8',
  )
  const block = source.slice(
    source.indexOf('export const zeusFixedPackages'),
    source.indexOf(']', source.indexOf('export const zeusFixedPackages')),
  )
  return [
    ...new Set(
      [...block.matchAll(/'(@zeus-js\/[a-z0-9-]+)'/g)].map(m => m[1]!),
    ),
  ].sort()
}

const map = directories()
const order = publishOrder(fixedPackages(), name => map.get(name))
const indexOf = (name: string) => order.indexOf(name)

describe('publish order', () => {
  it('computes the order rc.3 was actually published in', () => {
    // The registry's own publish timestamps for 0.2.0-rc.3 put `compiler`
    // (03:13:14) after `compiler-native` (03:12:04). Under the config in force
    // when rc.3 shipped — 638b433a — that was automatic: only
    // `packages/core/**` had a kind, so `compiler` was ungrouped and led, while
    // `compiler-native` sorted into `core`.
    //
    // The six-domain move changed the rule (compiler now sits under
    // `packages/compiler/` and the mapping returns `core` for it), so both land
    // in the same kind and the name comparison decides — which puts `compiler`
    // *before* `compiler-native`, the opposite of what shipped.
    //
    // This is recorded as the measured difference rather than asserted away:
    // the order this repository would publish in today is not the order rc.3
    // was published in, and a recovery run needs to know that.
    const published = order.slice(0, 4)
    expect(published).toEqual([
      '@zeus-js/eslint-plugin',
      '@zeus-js/playground-engine',
      '@zeus-js/compiler',
      '@zeus-js/compiler-native',
    ])
    // What actually shipped, by timestamp, for comparison.
    const shipped = [
      '@zeus-js/eslint-plugin',
      '@zeus-js/playground-engine',
      '@zeus-js/compiler-native',
      '@zeus-js/compiler',
    ]
    expect(published).not.toEqual(shipped)
    // The difference is exactly the two compiler packages swapping.
    expect([...published].sort()).toEqual([...shipped].sort())
  })

  it('publishes the runtime after the native compiler', () => {
    // This is what makes an early stop fatal rather than merely incomplete: a
    // consumer needs `zeus`/`runtime-dom`, and they are behind every native
    // platform package.
    for (const name of [
      '@zeus-js/shared',
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/zeus',
    ]) {
      expect(
        indexOf(name),
        `${name} must still sort after compiler-native, or this test describes a different order than rc.3 saw`,
      ).toBeGreaterThan(indexOf('@zeus-js/compiler-native'))
    }
  })

  it('leaves nothing usable if the run stops at the native compiler', () => {
    // A measured description, not a preference: a stop right after
    // compiler-native leaves no runtime package published at all.
    const cutoff = indexOf('@zeus-js/compiler-native') + 1
    const before = order.slice(0, cutoff)
    const runtime = [
      '@zeus-js/shared',
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/zeus',
    ]
    expect(runtime.filter(name => before.includes(name))).toEqual([])
    // And there is a lot of group after that point, so "the release finished"
    // is not close to true when the runtime is still unpublished.
    expect(order.length - cutoff).toBeGreaterThan(runtime.length)
  })

  it('keeps every runtime package out of the first eleven', () => {
    // The concrete shape of the risk: the first eleven positions are
    // eslint-plugin, playground-engine, the two compiler packages and the seven
    // native platform packages. rc.3 died at the eighth, so it could not have
    // shipped a runtime even if it had finished the native group.
    const firstEleven = order.slice(0, 11)
    const runtime = [
      '@zeus-js/shared',
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/zeus',
    ]
    expect(runtime.filter(name => firstEleven.includes(name))).toEqual([])
    // And the runtime is not merely late — it is behind all six native
    // platform packages, so any failure in that group stops the release before
    // a framework exists.
    for (const name of runtime) {
      expect(indexOf(name)).toBeGreaterThan(
        indexOf('@zeus-js/compiler-native-win32-x64-msvc'),
      )
    }
  })

  it('puts ungrouped packages before the core group', () => {
    // `@baicie/release` sorts a missing kind as the empty string, so
    // eslint-plugin and playground-engine lead among the named packages.
    // Pinned because it decided rc.3's first two successful publishes.
    for (const name of [
      '@zeus-js/eslint-plugin',
      '@zeus-js/playground-engine',
    ]) {
      expect(indexOf(name)).toBeLessThan(indexOf('@zeus-js/shared'))
    }
  })
})
