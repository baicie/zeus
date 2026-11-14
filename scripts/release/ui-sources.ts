/**
 * What a product actually installs from the UI, as opposed to what it claims.
 *
 * `build-info.json` carries one `uiCommit`, copied from the repository variable
 * `ZEUS_UI_COMMIT`. That value names a commit in `baicie/zeus-ui`, but neither
 * image ever checks that commit out:
 *
 * - Admin installs 24 `@zeus-web/*` packages from the npm registry at an exact
 *   version, plus one `@zeus-web/dialog` from `vendor/`, built from a commit
 *   that is not the recorded one;
 * - Playground installs nothing from `@zeus-web/*` — it is Core-only, so its
 *   `uiCommit` names a repository the build never reads.
 *
 * A single commit cannot describe either build. This module records the real
 * inputs as data, so `build-info.json` can carry both the *declared pairing*
 * (what the release intends) and the *actual sources* (what the bytes came
 * from), and a reader can tell them apart.
 *
 * `uiCommit` keeps its meaning — the declared pairing — for compatibility with
 * every consumer that already reads it. It is not redefined as "the source".
 */
import fs from 'node:fs'
import path from 'node:path'

export const UI_SOURCES_SCHEMA = 'zeus.ui-sources/v1'

/** Where a package's bytes came from. */
export type UiSourceKind = 'registry' | 'vendored' | 'workspace'

export interface RegistryUiSource {
  readonly kind: 'registry'
  readonly package: string
  readonly version: string
}

export interface VendoredUiSource {
  readonly kind: 'vendored'
  readonly package: string
  readonly version: string
  /** The commit the vendored build was produced from. */
  readonly commit: string
  /** Digest of the vendored directory's canonical file list. */
  readonly contentDigest: string
}

export interface WorkspaceUiSource {
  readonly kind: 'workspace'
  readonly package: string
  readonly version: string
}

export type UiSource = RegistryUiSource | VendoredUiSource | WorkspaceUiSource

export interface UiSources {
  readonly schema: typeof UI_SOURCES_SCHEMA
  /**
   * The pairing commit the release declares. Equal to `build-info.uiCommit`.
   * Naming it here makes explicit that it is a claim, not an observation.
   */
  readonly declaredPairingCommit: string
  /**
   * True when no `@zeus-web/*` package is installed at all. Then
   * `declaredPairingCommit` describes nothing about the build and consumers
   * must not read it as provenance.
   */
  readonly readsUiRepository: boolean
  readonly sources: readonly UiSource[]
}

function readManifest(file: string): {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
} | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name?: string
      version?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
  } catch {
    return null
  }
}

/**
 * Collects the UI inputs of one example package.
 *
 * `vendoredProvenance` maps a `file:` dependency to the provenance document of
 * the directory it points at. Only the dialog is vendored today; the map keeps
 * the shape honest if a second package ever is.
 */
export function collectUiSources(options: {
  readonly manifestPath: string
  readonly root: string
  readonly declaredPairingCommit: string
  readonly vendoredProvenance?: Readonly<
    Record<string, { commit: string; contentDigest: string; version: string }>
  >
}): UiSources {
  const manifest = readManifest(options.manifestPath)
  if (!manifest) {
    throw new Error(`cannot read ${options.manifestPath}`)
  }
  const sources: UiSource[] = []
  const seen = new Set<string>()
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ] as const) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith('@zeus-web/')) continue
      if (seen.has(name)) continue
      seen.add(name)
      if (version.startsWith('file:')) {
        const target = path
          .resolve(
            path.dirname(options.manifestPath),
            version.slice('file:'.length),
          )
          .replace(/\/+$/, '')
        const provenance = options.vendoredProvenance?.[name]
        const observed = provenance ?? readVendoredProvenance(target)
        if (!observed) {
          throw new Error(
            `${name} is a file: dependency but ${target} has no provenance.json`,
          )
        }
        sources.push({
          kind: 'vendored',
          package: name,
          version: observed.version,
          commit: observed.commit,
          contentDigest: observed.contentDigest,
        })
        continue
      }
      if (version.startsWith('workspace:')) {
        sources.push({ kind: 'workspace', package: name, version })
        continue
      }
      sources.push({ kind: 'registry', package: name, version })
    }
  }
  sources.sort((left, right) => (left.package < right.package ? -1 : 1))
  return {
    schema: UI_SOURCES_SCHEMA,
    declaredPairingCommit: options.declaredPairingCommit,
    readsUiRepository: sources.length > 0,
    sources,
  }
}

function readVendoredProvenance(directory: string): {
  commit: string
  contentDigest: string
  version: string
} | null {
  try {
    const document = JSON.parse(
      fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8'),
    ) as { commit?: string; contentDigest?: string; version?: string }
    if (!document.commit || !document.contentDigest || !document.version) {
      return null
    }
    return {
      commit: document.commit,
      contentDigest: document.contentDigest,
      version: document.version,
    }
  } catch {
    return null
  }
}

export interface VerifyUiSourcesResult {
  readonly errors: readonly string[]
}

/**
 * Checks a recorded `uiSources` against the manifest and the repository.
 *
 * Everything here compares an assertion to an observation. A `uiSources` block
 * that merely repeats what the build wrote is worthless — these rules make the
 * document falsifiable:
 *
 * - every registry package the manifest pins is present at that exact version;
 * - every vendored package's commit and digest match the committed provenance;
 * - nothing is listed that the manifest does not declare;
 * - the declared pairing commit matches the one in `build-info.uiCommit`.
 */
export function verifyUiSources(options: {
  readonly sources: UiSources
  readonly manifestPath: string
  readonly root: string
  readonly expectedPairingCommit?: string
}): VerifyUiSourcesResult {
  const errors: string[] = []
  const fail = (message: string): void => {
    errors.push(message)
  }

  const recorded = new Map(
    options.sources.sources.map(source => [source.package, source]),
  )

  const expected = collectUiSources({
    manifestPath: options.manifestPath,
    root: options.root,
    declaredPairingCommit: options.sources.declaredPairingCommit,
  })
  const declared = new Map(
    expected.sources.map(source => [source.package, source]),
  )

  // The manifest is the source of truth for which packages exist.
  for (const [name, want] of declared) {
    const got = recorded.get(name)
    if (!got) {
      fail(`missing from uiSources: ${name}`)
      continue
    }
    if (got.kind !== want.kind) {
      fail(`${name}: recorded as ${got.kind}, manifest says ${want.kind}`)
      continue
    }
    if (got.version !== want.version) {
      fail(
        `${name}: recorded version ${got.version}, manifest pins ${want.version}`,
      )
    }
    if (got.kind === 'vendored' && want.kind === 'vendored') {
      if (got.commit !== want.commit) {
        fail(
          `${name}: vendored commit ${got.commit} does not match the committed provenance ${want.commit}`,
        )
      }
      if (got.contentDigest !== want.contentDigest) {
        fail(
          `${name}: vendored contentDigest ${got.contentDigest} does not match ${want.contentDigest}`,
        )
      }
    }
  }
  for (const name of recorded.keys()) {
    if (!declared.has(name)) {
      fail(`${name} is recorded but not declared by the manifest`)
    }
  }

  if (
    options.expectedPairingCommit !== undefined &&
    options.sources.declaredPairingCommit !== options.expectedPairingCommit
  ) {
    fail(
      `declared pairing commit ${options.sources.declaredPairingCommit} does not match build-info uiCommit ${options.expectedPairingCommit}`,
    )
  }

  if (options.sources.readsUiRepository !== recorded.size > 0) {
    fail(
      `readsUiRepository is ${String(options.sources.readsUiRepository)} but ${recorded.size} sources are recorded`,
    )
  }

  return { errors }
}
