/**
 * The exact set of packages a Core release publishes, as a file.
 *
 * ## Why this exists
 *
 * A previous report said a `v0.2.0-rc.0` tag would publish 35 packages.
 * `zeusFixedPackages` contains 32, the three first-publish packages are among
 * them rather than additional, and `@zeus-js/vite-plugin` is deliberately
 * outside. The number was wrong because it was assembled by hand from three
 * different lists, and nothing checked the arithmetic.
 *
 * This writes the set down in a form a test can compare against: every entry
 * names the manifest that produced it, whether it is private, and whether it is
 * in the fixed group. A release does not get to publish a package this file
 * does not name.
 *
 * ## What it does not decide
 *
 * It does not choose versions or tags — those come from the tree and the
 * release channel. It reports the tree as it is, so a manifest that is
 * `private: true` or missing shows up as a refusal rather than a surprise
 * during publish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'

export const PUBLISH_MANIFEST_SCHEMA = 'zeus.publish-manifest/v1'

/** The packages whose first publication this release accepts. */
export const KNOWN_FIRST_PUBLISH = [
  '@zeus-js/i18n',
  '@zeus-js/eslint-plugin',
  '@zeus-js/playground-engine',
] as const

/**
 * Packages published from their own tag line, outside the Core version line.
 *
 * Listed so their absence from the Core publish set is a decision recorded in
 * one place rather than something a reader has to infer from a missing entry.
 */
export const INDEPENDENT_PACKAGES = ['@zeus-js/vite-plugin'] as const

export interface PublishManifestEntry {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly private: boolean
  readonly fixedGroup: boolean
  readonly publishable: boolean
  readonly expectedDistTag: string
  readonly firstPublish: boolean
  readonly independentVersionLine: boolean
}

export interface PublishManifest {
  readonly schema: typeof PUBLISH_MANIFEST_SCHEMA
  readonly version: string
  readonly distTag: string
  readonly packages: readonly PublishManifestEntry[]
  /** Names that cannot be published, with the reason. */
  readonly problems: readonly string[]
  readonly counts: {
    readonly total: number
    readonly publishable: number
    readonly firstPublish: number
    readonly independent: number
  }
}

export interface BuildManifestInput {
  readonly root: string
  readonly version: string
  readonly distTag: string
  readonly fixedPackages?: readonly string[]
  readonly firstPublish?: readonly string[]
  readonly independent?: readonly string[]
}

/** Finds the directory holding a workspace package by its manifest name. */
function locate(root: string, name: string): string | undefined {
  const packagesRoot = path.join(root, 'packages')
  const visit = (directory: string): string | undefined => {
    if (!fs.existsSync(directory)) return undefined
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        const found = visit(absolute)
        if (found !== undefined) return found
        continue
      }
      if (entry.name !== 'package.json') continue
      try {
        const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
          name?: unknown
        }
        if (manifest.name === name) return path.dirname(absolute)
      } catch {
        /* An unparsable manifest is the caller's problem, not a match. */
      }
    }
    return undefined
  }
  return visit(packagesRoot)
}

export function buildPublishManifest(
  input: BuildManifestInput,
): PublishManifest {
  const fixedPackages = input.fixedPackages ?? zeusFixedPackages
  const firstPublish = input.firstPublish ?? KNOWN_FIRST_PUBLISH
  const independent = input.independent ?? INDEPENDENT_PACKAGES
  const problems: string[] = []
  const packages: PublishManifestEntry[] = []

  const seen = new Set<string>()
  for (const name of fixedPackages) {
    if (seen.has(name)) {
      problems.push(`${name}: listed twice in the fixed release group`)
      continue
    }
    seen.add(name)

    const directory = locate(input.root, name)
    if (directory === undefined) {
      problems.push(`${name}: listed in the fixed group but not found on disk`)
      packages.push({
        name,
        version: '(missing)',
        path: '(missing)',
        private: false,
        fixedGroup: true,
        publishable: false,
        expectedDistTag: input.distTag,
        firstPublish: firstPublish.includes(name),
        independentVersionLine: false,
      })
      continue
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as { version?: unknown; private?: unknown }
    const version =
      typeof manifest.version === 'string' ? manifest.version : '(missing)'
    const isPrivate = manifest.private === true
    if (isPrivate) {
      problems.push(
        `${name}: listed in the fixed group but its manifest is private: true`,
      )
    }
    if (version !== input.version) {
      problems.push(
        `${name}: version ${version} differs from the release version ${input.version}`,
      )
    }

    packages.push({
      name,
      version,
      path: path.relative(input.root, directory).split(path.sep).join('/'),
      private: isPrivate,
      fixedGroup: true,
      publishable: !isPrivate && version === input.version,
      expectedDistTag: input.distTag,
      firstPublish: firstPublish.includes(name),
      independentVersionLine: false,
    })
  }

  /*
   * A first-publish name outside the fixed group would never be published by
   * this release, so its approval would authorise nothing while looking like it
   * authorised something.
   */
  for (const name of firstPublish) {
    if (!seen.has(name)) {
      problems.push(
        `${name}: listed as a first publication but not part of the fixed release group`,
      )
    }
  }

  /*
   * An independent-version package that leaked into the fixed group would
   * publish `vite-plugin@0.2.0-rc.0` — a version belonging to no tag and no
   * release line.
   */
  for (const name of independent) {
    if (seen.has(name)) {
      problems.push(
        `${name}: published from its own tag line but present in the fixed release group`,
      )
    }
  }

  const independentEntries = independent.map(name => {
    const directory = locate(input.root, name)
    const version =
      directory === undefined
        ? '(missing)'
        : (((
            JSON.parse(
              fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
            ) as { version?: unknown }
          ).version as string | undefined) ?? '(missing)')
    return {
      name,
      version,
      path:
        directory === undefined
          ? '(missing)'
          : path.relative(input.root, directory).split(path.sep).join('/'),
      private: false,
      fixedGroup: false,
      publishable: false,
      expectedDistTag: '(own tag line)',
      firstPublish: false,
      independentVersionLine: true,
    } satisfies PublishManifestEntry
  })

  const all = [...packages, ...independentEntries]
  return {
    schema: PUBLISH_MANIFEST_SCHEMA,
    version: input.version,
    distTag: input.distTag,
    packages: all,
    problems,
    counts: {
      total: all.length,
      publishable: packages.filter(entry => entry.publishable).length,
      firstPublish: packages.filter(entry => entry.firstPublish).length,
      independent: independentEntries.length,
    },
  }
}

/** The npm dist-tag a version publishes under, matching the release channel rule. */
export function distTagForVersion(version: string): string {
  if (!version.includes('-')) return 'latest'
  const channel = version.split('-')[1]?.split('.')[0]
  return channel ?? 'latest'
}

function main(): void {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      version: { type: 'string' },
      'dist-tag': { type: 'string' },
      out: { type: 'string', default: 'temp/release/publish-manifest.json' },
      'pairing-record': { type: 'string' },
    },
  })
  if (!values.version) {
    console.error('usage: publish-manifest --version <v> [--out <file>]')
    process.exitCode = 2
    return
  }

  let firstPublish: readonly string[] = KNOWN_FIRST_PUBLISH
  if (values['pairing-record'] !== undefined) {
    try {
      const record = JSON.parse(
        fs.readFileSync(values['pairing-record'], 'utf8'),
      ) as { firstPublish?: unknown }
      if (Array.isArray(record.firstPublish)) {
        firstPublish = record.firstPublish.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      }
    } catch {
      console.error(
        `  note: ${values['pairing-record']} could not be read; using the built-in first-publish list`,
      )
    }
  }

  const manifest = buildPublishManifest({
    root: path.resolve(values.root!),
    version: values.version,
    distTag: values['dist-tag'] ?? distTagForVersion(values.version),
    firstPublish,
  })

  const out = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(
    `publish manifest: ${manifest.counts.publishable} publishable, ${manifest.counts.firstPublish} first publication(s), ${manifest.counts.independent} on independent lines`,
  )
  for (const entry of manifest.packages) {
    if (entry.independentVersionLine) {
      console.log(
        `  ${entry.name}@${entry.version} (independent tag line, not published here)`,
      )
    }
  }
  if (manifest.problems.length > 0) {
    for (const problem of manifest.problems) console.error(`BLOCKER ${problem}`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
