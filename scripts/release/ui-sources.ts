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
  /**
   * The `integrity` the lockfile resolves for this exact version.
   *
   * This binds the recorded version to the bytes pnpm will install. Without it
   * "registry 0.1.0-beta.34" says what was asked for, not what was fetched.
   * `null` means the lockfile has no entry, which is itself a finding.
   */
  readonly integrity: string | null
  /**
   * The UI commit this package was built from.
   *
   * npm provenance attests *which workflow published it*, not which commit was
   * built, and nothing in this repository ties `0.1.0-beta.34` to a zeus-ui
   * SHA. Recorded as `UNVERIFIED` rather than guessed, and never as the
   * declared pairing commit — that is a different fact.
   */
  readonly sourceCommit: 'UNVERIFIED' | string
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

/**
 * The four questions a single `readsUiRepository` boolean conflated.
 *
 * v1 set `readsUiRepository = sources.length > 0`, which answers "does this
 * build install any `@zeus-web/*` package" — not "does it check out the UI
 * repository". For Admin both happen to be false-ish and true-ish in ways that
 * made the field look right, and for Playground the name was simply wrong: it
 * never reads the repository *and* installs no packages, so one `false` stood
 * for two different facts.
 */
export interface UiRepositoryRelationship {
  /** Installs at least one `@zeus-web/*` package, from any source. */
  readonly usesWebPackages: boolean
  /**
   * Checks out `baicie/zeus-ui` in this build. Neither example does: Admin
   * installs from the registry plus a vendored directory, Playground installs
   * nothing.
   */
  readonly checksOutUiRepository: boolean
  /** Installs at least one `@zeus-web/*` package from the npm registry. */
  readonly consumesRegistryPackages: boolean
  /** Installs at least one `@zeus-web/*` package from `vendor/`. */
  readonly consumesVendoredBuild: boolean
}

export interface UiSources {
  readonly schema: typeof UI_SOURCES_SCHEMA
  /**
   * The pairing commit the release declares. Equal to `build-info.uiCommit`.
   * Naming it here makes explicit that it is a claim, not an observation.
   */
  readonly declaredPairingCommit: string
  /** The four facts the v1 boolean conflated. */
  readonly relationship: UiRepositoryRelationship
  /**
   * @deprecated v1 field, kept so an older reader does not break.
   *
   * It equals `relationship.usesWebPackages`. It never meant "checks out the
   * UI repository" — see `relationship.checksOutUiRepository`, which is false
   * for every product in this repository.
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
/**
 * The `integrity` pnpm records for a package at an exact version.
 *
 * Read from the `packages:` section, which is keyed `name@version`. The
 * importer section names a version but not its bytes; only this section binds
 * them.
 */
export function lockfileIntegrity(
  lockfile: string,
  name: string,
  version: string,
): string | null {
  // Keys may be quoted: `'@zeus-web/button@0.1.0-beta.34':`.
  const key = `${name}@${version}`
  const lines = lockfile.split('\n')
  for (const [index, line] of lines.entries()) {
    const header = /^ {2}'?([^':]+)'?:\s*$/.exec(line)
    if (!header || header[1] !== key) continue
    for (const next of lines.slice(index + 1, index + 6)) {
      const resolution = /^ {4}resolution:\s*\{integrity:\s*(\S+?)\}/.exec(next)
      if (resolution)
        return (resolution[1] ?? '').replace(/^sha512-/, 'sha512-')
      if (/^ {2}\S/.test(next)) break
    }
  }
  return null
}

export function collectUiSources(options: {
  readonly manifestPath: string
  readonly root: string
  readonly declaredPairingCommit: string
  /**
   * Whether this build checks out `baicie/zeus-ui`. Defaults to false; the
   * examples establish it by not cloning the repository.
   */
  readonly checksOutUiRepository?: boolean
  /** Contents of `pnpm-lock.yaml`, used to bind registry versions to bytes. */
  readonly lockfile?: string
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
      sources.push({
        kind: 'registry',
        package: name,
        version,
        integrity: options.lockfile
          ? lockfileIntegrity(options.lockfile, name, version)
          : null,
        // Not knowable from this repository; see the field's comment.
        sourceCommit: 'UNVERIFIED',
      })
    }
  }
  sources.sort((left, right) => (left.package < right.package ? -1 : 1))
  const usesWebPackages = sources.length > 0
  return {
    schema: UI_SOURCES_SCHEMA,
    declaredPairingCommit: options.declaredPairingCommit,
    relationship: {
      usesWebPackages,
      // No build in this repository checks out the UI repository. If one ever
      // does, it must set this from an observed fact, not from a manifest scan.
      checksOutUiRepository: options.checksOutUiRepository ?? false,
      consumesRegistryPackages: sources.some(
        source => source.kind === 'registry',
      ),
      consumesVendoredBuild: sources.some(source => source.kind === 'vendored'),
    },
    // Kept equal to `usesWebPackages` so v1 readers see the same value they
    // always did, with the deprecation note explaining what it never meant.
    readsUiRepository: usesWebPackages,
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
/**
 * How strict a verification is.
 *
 * `legacy-compatible` exists so a build-info written before `integrity` and
 * `relationship` were recorded still verifies — those documents cannot be
 * checked for things they do not contain. It is not a mode a release may use.
 *
 * `release-strict` is what a release gate must pass: the lockfile is required,
 * every registry package must resolve to bytes, and the document must agree
 * with all of it. A gate that can be satisfied by omitting its inputs is not a
 * gate, which is why the level is explicit rather than inferred from whether a
 * lockfile happened to be passed.
 */
export type VerificationLevel = 'legacy-compatible' | 'release-strict'

export function verifyUiSources(options: {
  readonly sources: UiSources
  readonly manifestPath: string
  readonly root: string
  readonly expectedPairingCommit?: string
  /** Contents of `pnpm-lock.yaml`; required for `release-strict`. */
  readonly lockfile?: string
  /**
   * Defaults to `legacy-compatible` so existing callers keep their behaviour.
   * Any release or RC gate must pass `release-strict`.
   */
  readonly level?: VerificationLevel
}): VerifyUiSourcesResult {
  const errors: string[] = []
  const fail = (message: string): void => {
    errors.push(message)
  }
  const level: VerificationLevel = options.level ?? 'legacy-compatible'

  if (level === 'release-strict') {
    /*
     * Each of these is something strict mode cannot check without it. Failing
     * here rather than silently skipping is the whole point of the mode: a
     * strict run that quietly omits a check reports the same green as one that
     * performed it.
     */
    if (!options.lockfile) {
      fail(
        'release-strict requires the lockfile: registry integrity cannot be verified without it',
      )
    }
    if (!options.expectedPairingCommit) {
      fail(
        'release-strict requires the declared pairing commit from build-info.uiCommit',
      )
    }
    if (!options.sources.relationship) {
      fail(
        'release-strict requires a ui-sources v2 document; the v1 boolean does not record relationship',
      )
    }
  }

  const recorded = new Map(
    options.sources.sources.map(source => [source.package, source]),
  )

  const expected = collectUiSources({
    manifestPath: options.manifestPath,
    root: options.root,
    declaredPairingCommit: options.sources.declaredPairingCommit,
    // Without this every `want.integrity` is null and the comparison below
    // rejects a document that is exactly right. The lockfile is the only
    // source of the expected bytes; re-deriving without it is not a check.
    ...(options.lockfile ? { lockfile: options.lockfile } : {}),
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
    if (got.kind === 'registry' && want.kind === 'registry') {
      /*
       * The recorded integrity must be the one the lockfile resolves for this
       * exact version. A registry entry without it says what was asked for,
       * not what was fetched. Skipped when no lockfile was supplied, so a v1
       * document — which has no `integrity` field — still verifies.
       */
      if (options.lockfile) {
        if (want.integrity === null) {
          fail(
            `${name}: the lockfile has no integrity for ${want.version}; the version cannot be bound to bytes`,
          )
        } else if (got.integrity !== want.integrity) {
          fail(
            `${name}: recorded integrity ${String(got.integrity)} does not match the lockfile ${want.integrity}`,
          )
        }
      }
      /*
       * No mechanism ties a published version to a zeus-ui commit. A document
       * that names one is asserting something this repository cannot know.
       */
      if (got.sourceCommit !== 'UNVERIFIED') {
        fail(
          `${name}: sourceCommit ${String(got.sourceCommit)} claims a specific UI commit, but nothing in this repository ties ${want.version} to one; record UNVERIFIED`,
        )
      }
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

  /*
   * v2: the four explicit facts must agree with the source list, and a
   * document that claims to check out the UI repository must say which commit
   * it actually checked out — the declared pairing is not that answer.
   */
  const relationship = options.sources.relationship
  if (relationship) {
    if (relationship.usesWebPackages !== recorded.size > 0) {
      fail(
        `relationship.usesWebPackages is ${String(relationship.usesWebPackages)} but ${recorded.size} sources are recorded`,
      )
    }
    const hasRegistry = [...recorded.values()].some(
      source => source.kind === 'registry',
    )
    const hasVendored = [...recorded.values()].some(
      source => source.kind === 'vendored',
    )
    if (relationship.consumesRegistryPackages !== hasRegistry) {
      fail(
        `relationship.consumesRegistryPackages is ${String(relationship.consumesRegistryPackages)} but ${hasRegistry ? 'registry' : 'no registry'} sources are recorded`,
      )
    }
    if (relationship.consumesVendoredBuild !== hasVendored) {
      fail(
        `relationship.consumesVendoredBuild is ${String(relationship.consumesVendoredBuild)} but ${hasVendored ? 'a vendored' : 'no vendored'} source is recorded`,
      )
    }
    if (relationship.checksOutUiRepository) {
      fail(
        'relationship.checksOutUiRepository is true, but no ui-sources field records the checked-out commit; a build that clones baicie/zeus-ui must record that SHA',
      )
    }
  }

  return { errors }
}
